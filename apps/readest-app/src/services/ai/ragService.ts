import { embed, embedMany } from 'ai';
import { aiStore } from './storage/aiStore';
import { chunkSection, extractTextFromDocument } from './utils/chunker';
import { withRetryAndTimeout, AI_TIMEOUTS, AI_RETRY_CONFIGS } from './utils/retry';
import { getAIProvider } from './providers';
import { aiLogger } from './logger';
import type { AISettings, TextChunk, ScoredChunk, EmbeddingProgress, BookIndexMeta } from './types';

interface SectionItem {
  id: string;
  size: number;
  linear: string;
  createDocument: () => Promise<Document>;
}

interface TOCItem {
  id: number;
  label: string;
  href?: string;
  subitems?: TOCItem[];
}

export interface BookDocType {
  sections?: SectionItem[];
  toc?: TOCItem[];
  metadata?: { title?: string | { [key: string]: string }; author?: string | { name?: string } };
}

const indexingStates = new Map<string, IndexingState>();

export async function isBookIndexed(bookHash: string): Promise<boolean> {
  const indexed = await aiStore.isIndexed(bookHash);
  aiLogger.rag.isIndexed(bookHash, indexed);
  return indexed;
}

function extractTitle(metadata?: BookDocType['metadata']): string {
  if (!metadata?.title) return 'Unknown Book';
  if (typeof metadata.title === 'string') return metadata.title;
  return (
    metadata.title['en'] ||
    metadata.title['default'] ||
    Object.values(metadata.title)[0] ||
    'Unknown Book'
  );
}

function extractAuthor(metadata?: BookDocType['metadata']): string {
  if (!metadata?.author) return 'Unknown Author';
  if (typeof metadata.author === 'string') return metadata.author;
  return metadata.author.name || 'Unknown Author';
}

/**
 * Build a map from spine section index → chapter title by matching TOC hrefs
 * to section hrefs. TOCItem.id is a sequential UI counter and does NOT
 * correspond to the spine index, so we match on href instead.
 */
function buildChapterMap(sections: SectionItem[], toc: TOCItem[]): Map<number, string> {
  // Map section href → spine index (sections[i].id is the XHTML file href)
  const hrefToIndex = new Map<string, number>();
  for (let i = 0; i < sections.length; i++) {
    hrefToIndex.set(sections[i]!.id, i);
  }

  const chapterMap = new Map<number, string>();

  // Recursively walk TOC tree and match hrefs to section indices
  const walkToc = (items: TOCItem[]) => {
    for (const item of items) {
      if (item.href && item.label) {
        const hrefBase = item.href.split('#')[0]!; // strip fragment identifier
        const sectionIdx = hrefToIndex.get(item.href) ?? hrefToIndex.get(hrefBase);
        if (sectionIdx !== undefined && !chapterMap.has(sectionIdx)) {
          chapterMap.set(sectionIdx, item.label);
        }
      }
      if (item.subitems) walkToc(item.subitems);
    }
  };
  walkToc(toc);

  return chapterMap;
}

function getChapterTitle(chapterMap: Map<number, string>, sectionIndex: number): string {
  // Direct match
  if (chapterMap.has(sectionIndex)) return chapterMap.get(sectionIndex)!;
  // Fallback: nearest prior section with a chapter title
  for (let i = sectionIndex - 1; i >= 0; i--) {
    if (chapterMap.has(i)) return chapterMap.get(i)!;
  }
  return `Section ${sectionIndex + 1}`;
}

export async function indexBook(
  bookDoc: BookDocType,
  bookHash: string,
  settings: AISettings,
  onProgress?: (progress: EmbeddingProgress) => void,
): Promise<void> {
  const startTime = Date.now();
  const title = extractTitle(bookDoc.metadata);

  if (await aiStore.isIndexed(bookHash)) {
    aiLogger.rag.isIndexed(bookHash, true);
    return;
  }

  aiLogger.rag.indexStart(bookHash, title);
  const provider = getAIProvider(settings);
  const sections = bookDoc.sections || [];
  const toc = bookDoc.toc || [];

  // build href-based section → chapter title mapping
  const chapterMap = buildChapterMap(sections, toc);

  // calculate cumulative character sizes like toc.ts does
  const sizes = sections.map((s) => (s.linear !== 'no' && s.size > 0 ? s.size : 0));
  let cumulative = 0;
  const cumulativeSizes = sizes.map((size) => {
    const current = cumulative;
    cumulative += size;
    return current;
  });

  const state: IndexingState = {
    bookHash,
    status: 'indexing',
    progress: 0,
    chunksProcessed: 0,
    totalChunks: 0,
  };
  indexingStates.set(bookHash, state);

  try {
    onProgress?.({ current: 0, total: 1, phase: 'chunking' });
    aiLogger.rag.indexProgress('chunking', 0, sections.length);
    const allChunks: TextChunk[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      try {
        const doc = await section.createDocument();
        const text = extractTextFromDocument(doc);
        if (text.length < 100) {
          aiLogger.chunker.section(i, text.length, 0);
          continue;
        }
        const sectionChunks = chunkSection(
          doc,
          i,
          getChapterTitle(chapterMap, i),
          bookHash,
          cumulativeSizes[i] ?? 0,
        );
        aiLogger.chunker.section(i, text.length, sectionChunks.length);
        allChunks.push(...sectionChunks);
      } catch (e) {
        aiLogger.chunker.error(i, (e as Error).message);
      }
    }

    aiLogger.chunker.complete(bookHash, allChunks.length);
    state.totalChunks = allChunks.length;

    if (allChunks.length === 0) {
      state.status = 'complete';
      state.progress = 100;
      aiLogger.rag.indexComplete(bookHash, 0, Date.now() - startTime);
      return;
    }

    const hasEmbeddings = provider.supportsEmbeddings();
    let embeddingModelName: string;

    if (hasEmbeddings) {
      onProgress?.({ current: 0, total: allChunks.length, phase: 'embedding' });
      embeddingModelName =
        settings.provider === 'ollama'
          ? settings.ollamaEmbeddingModel
          : settings.provider === 'openai'
            ? settings.openaiEmbeddingModel || 'text-embedding-3-small'
            : settings.aiGatewayEmbeddingModel || 'text-embedding-3-small';
      aiLogger.embedding.start(embeddingModelName, allChunks.length);

      const texts = allChunks.map((c) => c.text);
      try {
        const { embeddings } = await withRetryAndTimeout(
          () =>
            embedMany({
              model: provider.getEmbeddingModel(),
              values: texts,
            }),
          AI_TIMEOUTS.EMBEDDING_BATCH,
          AI_RETRY_CONFIGS.EMBEDDING,
        );

        for (let i = 0; i < allChunks.length; i++) {
          allChunks[i]!.embedding = embeddings[i];
          state.chunksProcessed = i + 1;
          state.progress = Math.round(((i + 1) / allChunks.length) * 100);
        }
        onProgress?.({ current: allChunks.length, total: allChunks.length, phase: 'embedding' });
        aiLogger.embedding.complete(
          embeddings.length,
          allChunks.length,
          embeddings[0]?.length || 0,
        );
      } catch (e) {
        aiLogger.embedding.error('batch', (e as Error).message);
        throw e;
      }
    } else {
      // No embeddings support — BM25-only indexing
      embeddingModelName = 'bm25-only';
      aiLogger.embedding.start('bm25-only', allChunks.length);
      state.chunksProcessed = allChunks.length;
      state.progress = 100;
    }

    onProgress?.({ current: 0, total: 2, phase: 'indexing' });
    aiLogger.store.saveChunks(bookHash, allChunks.length);
    await aiStore.saveChunks(allChunks);

    onProgress?.({ current: 1, total: 2, phase: 'indexing' });
    aiLogger.store.saveBM25(bookHash);
    await aiStore.saveBM25Index(bookHash, allChunks);

    const meta: BookIndexMeta = {
      bookHash,
      bookTitle: title,
      authorName: extractAuthor(bookDoc.metadata),
      totalSections: sections.length,
      totalChunks: allChunks.length,
      embeddingModel: embeddingModelName,
      lastUpdated: Date.now(),
    };
    aiLogger.store.saveMeta(meta);
    await aiStore.saveMeta(meta);

    onProgress?.({ current: 2, total: 2, phase: 'indexing' });
    state.status = 'complete';
    state.progress = 100;
    aiLogger.rag.indexComplete(bookHash, allChunks.length, Date.now() - startTime);
  } catch (error) {
    state.status = 'error';
    state.error = (error as Error).message;
    aiLogger.rag.indexError(bookHash, (error as Error).message);
    throw error;
  }
}

export async function hybridSearch(
  bookHash: string,
  query: string,
  settings: AISettings,
  topK = 10,
  maxPage?: number,
): Promise<ScoredChunk[]> {
  aiLogger.search.query(query, maxPage);
  const provider = getAIProvider(settings);
  let queryEmbedding: number[] | null = null;

  if (provider.supportsEmbeddings()) {
    try {
      // use AI SDK embed with provider's embedding model
      const { embedding } = await withRetryAndTimeout(
        () =>
          embed({
            model: provider.getEmbeddingModel(),
            value: query,
          }),
        AI_TIMEOUTS.EMBEDDING_SINGLE,
        AI_RETRY_CONFIGS.EMBEDDING,
      );
      queryEmbedding = embedding;
    } catch {
      // bm25 only fallback
    }
  }

  const results = await aiStore.hybridSearch(bookHash, queryEmbedding, query, topK, maxPage);
  aiLogger.search.hybridResults(results.length, [...new Set(results.map((r) => r.searchMethod))]);
  return results;
}

export async function clearBookIndex(bookHash: string): Promise<void> {
  aiLogger.store.clear(bookHash);
  await aiStore.clearBook(bookHash);
  indexingStates.delete(bookHash);
}

export interface ChapterIndexInfo {
  title: string;
  sectionIndex: number;
  chunkCount: number;
  totalChars: number;
  pageRange: [number, number];
}

export interface IndexDiagnostics {
  bookHash: string;
  totalChunks: number;
  totalSections: number;
  chapters: ChapterIndexInfo[];
  embeddingModel: string;
  lastUpdated: number;
}

export async function getIndexDiagnostics(bookHash: string): Promise<IndexDiagnostics | null> {
  const meta = await aiStore.getMeta(bookHash);
  if (!meta) return null;

  const chunks = await aiStore.getChunks(bookHash);
  if (chunks.length === 0) return null;

  // Group by chapterTitle to match recap behavior
  const chapterMap = new Map<string, ChapterIndexInfo>();
  for (const chunk of chunks) {
    const title = chunk.chapterTitle || `Section ${chunk.sectionIndex + 1}`;
    let info = chapterMap.get(title);
    if (!info) {
      info = {
        title,
        sectionIndex: chunk.sectionIndex,
        chunkCount: 0,
        totalChars: 0,
        pageRange: [chunk.pageNumber, chunk.pageNumber],
      };
      chapterMap.set(title, info);
    }
    info.chunkCount++;
    info.totalChars += chunk.text.length;
    info.pageRange[0] = Math.min(info.pageRange[0], chunk.pageNumber);
    info.pageRange[1] = Math.max(info.pageRange[1], chunk.pageNumber);
  }

  return {
    bookHash,
    totalChunks: chunks.length,
    totalSections: meta.totalSections,
    chapters: Array.from(chapterMap.values()).sort((a, b) => a.sectionIndex - b.sectionIndex),
    embeddingModel: meta.embeddingModel,
    lastUpdated: meta.lastUpdated,
  };
}

// internal type for indexing state tracking
interface IndexingState {
  bookHash: string;
  status: 'idle' | 'indexing' | 'complete' | 'error';
  progress: number;
  chunksProcessed: number;
  totalChunks: number;
  error?: string;
}
