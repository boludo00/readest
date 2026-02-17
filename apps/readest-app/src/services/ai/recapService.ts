import { generateText } from 'ai';
import { isTauriAppPlatform } from '@/services/environment';
import { aiStore } from './storage/aiStore';
import { aiLogger } from './logger';
import { buildRecapPrompt } from './prompts';
import {
  getApiKeyForProvider,
  getModelForProvider,
  getAIConfigError,
  getSettingsForFeature,
} from './utils/providerHelpers';
import { getModelForPlatform } from './utils/iosModelFactory';
import type { AISettings, BookRecap, TextChunk } from './types';

async function callLLMForRecap(
  prompt: string,
  settings: AISettings,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Tauri or Ollama: use SDK directly
  if (isTauriAppPlatform() || settings.provider === 'ollama') {
    const model = await getModelForPlatform(settings);
    const result = await generateText({ model, prompt, abortSignal });
    return result.text;
  }

  // Web + any cloud provider: use API route proxy
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are Readest, a warm reading companion helping readers recap their progress.',
      apiKey: getApiKeyForProvider(settings),
      model: getModelForProvider(settings),
      provider: settings.provider,
      ...(settings.provider === 'openai-compatible'
        ? { baseUrl: settings.openaiCompatibleBaseUrl }
        : {}),
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Recap generation failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function getChunksUpToPage(chunks: TextChunk[], maxPage: number): TextChunk[] {
  return chunks
    .filter((c) => c.pageNumber <= maxPage)
    .sort((a, b) => a.sectionIndex - b.sectionIndex || a.pageNumber - b.pageNumber);
}

interface ChapterContext {
  title: string;
  sectionIndex: number;
  chunks: TextChunk[];
}

function groupChunksByChapter(chunks: TextChunk[]): ChapterContext[] {
  // Group by chapterTitle to merge sections belonging to the same chapter
  const chapterMap = new Map<string, ChapterContext>();
  for (const chunk of chunks) {
    const title = chunk.chapterTitle || `Section ${chunk.sectionIndex + 1}`;
    let chapter = chapterMap.get(title);
    if (!chapter) {
      chapter = {
        title,
        sectionIndex: chunk.sectionIndex,
        chunks: [],
      };
      chapterMap.set(title, chapter);
    }
    chapter.chunks.push(chunk);
  }
  return Array.from(chapterMap.values()).sort((a, b) => a.sectionIndex - b.sectionIndex);
}

function buildContextText(chunks: TextChunk[], maxChars: number = 60_000): string {
  const chapters = groupChunksByChapter(chunks);
  if (chapters.length === 0) return '';

  // Budget chars per chapter, with a minimum of 3000 per chapter
  const perChapter = Math.max(3000, Math.floor(maxChars / chapters.length));

  let text = '';
  for (const chapter of chapters) {
    const chapterChunks = chapter.chunks;
    if (chapterChunks.length === 0) continue;

    // Sample from beginning, middle, and end of the chapter
    // to catch key events that occur throughout
    const totalChunkChars = chapterChunks.reduce((sum, c) => sum + c.text.length, 0);

    let chapterText = '';
    if (totalChunkChars <= perChapter) {
      // Entire chapter fits in budget
      chapterText = chapterChunks.map((c) => c.text).join('\n');
    } else {
      // Split budget: 40% beginning, 20% middle, 40% end
      const beginBudget = Math.floor(perChapter * 0.4);
      const midBudget = Math.floor(perChapter * 0.2);
      const endBudget = perChapter - beginBudget - midBudget;

      // Beginning chunks
      let beginText = '';
      for (const chunk of chapterChunks) {
        if (beginText.length + chunk.text.length > beginBudget) break;
        beginText += chunk.text + '\n';
      }

      // Middle chunks (from the center of the chapter)
      const midIdx = Math.floor(chapterChunks.length / 2);
      let midText = '';
      for (let i = midIdx; i < chapterChunks.length; i++) {
        if (midText.length + chapterChunks[i]!.text.length > midBudget) break;
        midText += chapterChunks[i]!.text + '\n';
      }

      // End chunks (from the end of the chapter, reversed then re-reversed)
      let endText = '';
      const endChunks: string[] = [];
      for (let i = chapterChunks.length - 1; i >= 0; i--) {
        if (endText.length + chapterChunks[i]!.text.length > endBudget) break;
        endChunks.unshift(chapterChunks[i]!.text);
        endText += chapterChunks[i]!.text;
      }

      chapterText = [beginText.trim(), midText.trim(), endChunks.join('\n').trim()]
        .filter(Boolean)
        .join('\n[...]\n');
    }

    if (chapterText) {
      text += `[${chapter.title}]\n${chapterText.trim()}\n\n`;
    }
  }
  return text;
}

export async function generateRecap(
  bookHash: string,
  bookTitle: string,
  authorName: string,
  currentPage: number,
  totalPages: number,
  rawSettings: AISettings,
  highlights?: string[],
  abortSignal?: AbortSignal,
  forceRefresh?: boolean,
): Promise<BookRecap> {
  const settings = getSettingsForFeature(rawSettings, 'recap');
  // Validate provider configuration before making any API calls
  const configError = getAIConfigError(settings);
  if (configError) {
    throw new Error(`AI provider is not configured: ${configError}`);
  }

  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  aiLogger.recap.generateStart(bookHash, progressPercent);

  // Check for cached recap near current progress (skip if force refreshing)
  if (!forceRefresh) {
    const cached = await aiStore.getRecapNearProgress(bookHash, progressPercent);
    if (cached) {
      aiLogger.recap.cached(bookHash, cached.progressPercent);
      return cached;
    }
  }

  // Get book chunks up to current page
  const allChunks = await aiStore.getChunks(bookHash);
  if (allChunks.length === 0) {
    throw new Error('Book must be indexed before generating a recap');
  }

  // Get previous recap for incremental updates.
  // Skip incremental path when the detail level has changed so the
  // entire recap is regenerated at the new verbosity level.
  const detailLevel = settings.recapDetailLevel ?? 'normal';
  aiLogger.recap.generateStart(bookHash + `:detail=${detailLevel}`, progressPercent);
  const latestRecap = await aiStore.getLatestRecap(bookHash);
  const previousRecap =
    latestRecap && (latestRecap.detailLevel ?? 'normal') === detailLevel ? latestRecap : undefined;

  // Incremental: when a previous recap exists, only send NEW chunks
  // beyond the previous recap's progress to save tokens/resources.
  const previousPage =
    previousRecap && totalPages > 0
      ? Math.round((previousRecap.progressPercent / 100) * totalPages)
      : 0;

  let relevantChunks =
    previousRecap && previousPage > 0
      ? allChunks
          .filter((c) => c.pageNumber > previousPage && c.pageNumber <= currentPage)
          .sort((a, b) => a.sectionIndex - b.sectionIndex || a.pageNumber - b.pageNumber)
      : getChunksUpToPage(allChunks, currentPage);

  let chapters = groupChunksByChapter(relevantChunks);

  // Limit to the last N chapters on the first recap only. Incremental recaps already
  // scope to new-since-last chapters, so applying the limit there would create gaps
  // (e.g. old recap covers ch 1-14, limit skips 15-22, new recap covers 23-27).
  const maxChapters = settings.recapMaxChapters ?? 0;
  if (!previousRecap && maxChapters > 0 && chapters.length > maxChapters) {
    chapters = chapters.slice(-maxChapters);
    const limitedTitles = new Set(chapters.map((c) => c.title));
    relevantChunks = relevantChunks.filter((c) =>
      limitedTitles.has(c.chapterTitle || `Section ${c.sectionIndex + 1}`),
    );
  }

  const chapterTitles = chapters.map((c) => c.title);
  const maxCharsMap = { brief: 30_000, normal: 60_000, detailed: 100_000 } as const;
  const contextText = buildContextText(relevantChunks, maxCharsMap[detailLevel]);

  const prompt = buildRecapPrompt(
    bookTitle,
    authorName,
    progressPercent,
    contextText,
    chapterTitles,
    highlights,
    previousRecap?.recap,
    detailLevel,
  );

  try {
    const recapText = await callLLMForRecap(prompt, settings, abortSignal);

    const createdAt = Date.now();
    const recap: BookRecap = {
      id: `${bookHash}-recap-${createdAt}`,
      bookHash,
      progressPercent,
      recap: recapText,
      model: getModelForProvider(settings),
      createdAt,
      detailLevel,
    };

    await aiStore.saveRecap(recap);
    aiLogger.recap.generateComplete(bookHash, recapText.length);

    return recap;
  } catch (e) {
    aiLogger.recap.generateError(bookHash, (e as Error).message);
    throw e;
  }
}
