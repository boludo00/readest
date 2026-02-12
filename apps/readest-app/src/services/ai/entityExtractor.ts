import { streamText } from 'ai';
import { isTauriAppPlatform } from '@/services/environment';
import { aiStore } from './storage/aiStore';
import { getAIProvider } from './providers';
import { aiLogger } from './logger';
import { buildEntityExtractionPrompt } from './prompts';
import { getApiKeyForProvider, getModelForProvider } from './utils/providerHelpers';
import type {
  AISettings,
  BookEntity,
  BookEntityIndex,
  EntityExtractionProgress,
  EntityProfile,
  EntityType,
  TextChunk,
} from './types';

const MAX_PASS_CHARS = 25_000;
const PASS_COUNT = 5;

interface TextPass {
  text: string;
  label: string;
  sectionIndices: number[];
}

interface RawEntity {
  name: string;
  type: EntityType;
  aliases: string[];
  role: string;
  description: string;
  connections: string[];
  importance: 'major' | 'minor';
}

function buildTextPasses(chunks: TextChunk[]): TextPass[] {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort(
    (a, b) => a.sectionIndex - b.sectionIndex || a.pageNumber - b.pageNumber,
  );
  const totalChars = sorted.reduce((sum, c) => sum + c.text.length, 0);

  if (totalChars <= MAX_PASS_CHARS) {
    return [
      {
        text: sorted.map((c) => c.text).join('\n\n'),
        label: 'full text',
        sectionIndices: [...new Set(sorted.map((c) => c.sectionIndex))],
      },
    ];
  }

  const passes: TextPass[] = [];
  const chunkCount = sorted.length;
  const passSize = Math.ceil(chunkCount / PASS_COUNT);

  const labels = ['beginning', 'early-middle', 'middle', 'late-middle', 'end'];
  for (let i = 0; i < PASS_COUNT; i++) {
    const start = i * passSize;
    const end = Math.min(start + passSize, chunkCount);
    const passChunks = sorted.slice(start, end);

    let text = '';
    const sectionIndices: number[] = [];
    for (const chunk of passChunks) {
      if (text.length + chunk.text.length > MAX_PASS_CHARS) break;
      text += (text ? '\n\n' : '') + chunk.text;
      if (!sectionIndices.includes(chunk.sectionIndex)) {
        sectionIndices.push(chunk.sectionIndex);
      }
    }

    if (text.length > 0) {
      passes.push({ text, label: labels[i] || `pass ${i + 1}`, sectionIndices });
    }
  }

  return passes;
}

function parseExtractionResult(text: string): RawEntity[] {
  // Strip markdown fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    const entities: RawEntity[] = parsed.entities || parsed;
    if (!Array.isArray(entities)) return [];
    return entities.filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);
  } catch {
    // Try to find JSON within the text
    const match = cleaned.match(/\{[\s\S]*"entities"[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed.entities) ? parsed.entities : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function mergeRawEntities(
  newEntities: RawEntity[],
  sectionIndices: number[],
  existingMap: Map<string, BookEntity>,
  bookHash: string,
  pageEstimate: number,
): void {
  const validTypes: EntityType[] = ['character', 'location', 'theme', 'term', 'event'];

  for (const raw of newEntities) {
    const normalizedName = raw.name.trim();
    const key = normalizedName.toLowerCase();

    // Collect all names/aliases from the incoming entity to match against
    const incomingNames = new Set([key]);
    for (const alias of raw.aliases || []) {
      const a = alias.trim().toLowerCase();
      if (a) incomingNames.add(a);
    }

    // Check if this entity or any of its aliases already exists
    let existing: BookEntity | undefined;
    for (const [, entity] of existingMap) {
      const existingNames = [
        entity.name.toLowerCase(),
        ...entity.aliases.map((a) => a.toLowerCase()),
      ];
      // Match if any incoming name/alias overlaps with any existing name/alias
      if (existingNames.some((n) => incomingNames.has(n))) {
        existing = entity;
        break;
      }
    }

    if (existing) {
      // Merge: store description fragment tagged with section range
      if (raw.description && raw.description.trim()) {
        const newDesc = raw.description.trim();
        const maxSection = sectionIndices.length > 0 ? Math.max(...sectionIndices) : 0;
        const existingTexts = existing.descriptionFragments.map((f) => f.text.toLowerCase());
        // Only add if not a near-duplicate of existing fragments
        if (!existingTexts.some((t) => t.includes(newDesc.toLowerCase().slice(0, 40)))) {
          existing.descriptionFragments.push({ text: newDesc, maxSection });
        }
        // Keep full description as concatenation of all fragments
        existing.description = existing.descriptionFragments.map((f) => f.text).join(' ');
      }
      for (const alias of raw.aliases || []) {
        if (!existing.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
          existing.aliases.push(alias);
        }
      }
      for (const conn of raw.connections || []) {
        if (!existing.connections.some((c) => c.toLowerCase() === conn.toLowerCase())) {
          existing.connections.push(conn);
        }
      }
      for (const si of sectionIndices) {
        if (!existing.sectionAppearances.includes(si)) {
          existing.sectionAppearances.push(si);
        }
      }
      if (raw.importance === 'major') {
        existing.importance = 'major';
      }
    } else {
      const entityType = validTypes.includes(raw.type as EntityType)
        ? (raw.type as EntityType)
        : 'term';

      const descText = raw.description || '';
      const maxSection = sectionIndices.length > 0 ? Math.max(...sectionIndices) : 0;
      const entity: BookEntity = {
        id: `${bookHash}-${key.replace(/\s+/g, '-')}-${Date.now()}`,
        bookHash,
        name: normalizedName,
        type: entityType,
        aliases: (raw.aliases || []).filter((a) => a.trim().length > 0),
        role: raw.role || '',
        description: descText,
        descriptionFragments: descText ? [{ text: descText, maxSection }] : [],
        connections: (raw.connections || []).filter((c) => c.trim().length > 0),
        importance: raw.importance === 'major' ? 'major' : 'minor',
        firstMentionSection: sectionIndices[0] ?? 0,
        firstMentionPage: pageEstimate,
        sectionAppearances: [...sectionIndices],
      };
      existingMap.set(key, entity);
    }
  }
}

async function callLLM(
  prompt: string,
  settings: AISettings,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Tauri or Ollama: use SDK directly (providers handle tauriFetch internally)
  if (isTauriAppPlatform() || settings.provider === 'ollama') {
    const provider = getAIProvider(settings);
    const result = streamText({
      model: provider.getModel(),
      prompt,
      abortSignal,
    });
    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    return text;
  }

  // Web + any cloud provider: use API route proxy with streaming
  const controller = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), 120_000);

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a precise entity extraction assistant. Return only valid JSON.',
      apiKey: getApiKeyForProvider(settings),
      model: getModelForProvider(settings),
      provider: settings.provider,
      ...(settings.provider === 'openai-compatible'
        ? { baseUrl: settings.openaiCompatibleBaseUrl }
        : {}),
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `LLM call failed: ${response.status}`);
  }

  // Collect streamed text response
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

export async function extractEntities(
  bookHash: string,
  settings: AISettings,
  onProgress?: (progress: EntityExtractionProgress) => void,
  abortSignal?: AbortSignal,
  currentPage?: number,
): Promise<BookEntity[]> {
  const startTime = Date.now();

  // Get all chunks for this book
  const allChunks = await aiStore.getChunks(bookHash);
  if (allChunks.length === 0) {
    throw new Error('Book must be indexed before entity extraction');
  }

  // Check for existing index — determine if we can skip or need incremental extraction
  const existingIndex = await aiStore.getEntityIndex(bookHash);
  if (existingIndex?.complete) {
    const prevMax = existingIndex.maxExtractedPage ?? Infinity;
    // If no currentPage given, or we've already extracted up to this point, use cache
    if (currentPage === undefined || prevMax >= currentPage) {
      const entities = await aiStore.getEntities(bookHash);
      aiLogger.entity.cached(bookHash, entities.length);
      return entities;
    }
    // Otherwise, fall through to do incremental extraction for new sections
  }

  // Filter chunks to only include pages up to the user's current reading position
  const chunks =
    currentPage !== undefined
      ? allChunks
          .filter((c) => c.pageNumber <= currentPage)
          .sort((a, b) => a.sectionIndex - b.sectionIndex || a.pageNumber - b.pageNumber)
      : allChunks;

  if (chunks.length === 0) {
    return [];
  }

  // Load existing entities for merge (both partial and incremental cases)
  const entityMap = new Map<string, BookEntity>();
  const previousMaxPage = existingIndex?.maxExtractedPage ?? 0;

  if (existingIndex) {
    const existing = await aiStore.getEntities(bookHash);
    for (const e of existing) {
      // Backfill descriptionFragments for entities from older extractions
      if (!e.descriptionFragments) {
        e.descriptionFragments = e.description
          ? [{ text: e.description, maxSection: e.firstMentionSection }]
          : [];
      }
      entityMap.set(e.name.toLowerCase(), e);
    }
  }

  // For incremental extraction, only build passes from NEW chunks (beyond previous extraction)
  const chunksToProcess =
    existingIndex?.complete && previousMaxPage > 0
      ? chunks.filter((c) => c.pageNumber > previousMaxPage)
      : chunks;

  if (chunksToProcess.length === 0) {
    // No new content to process
    return [...entityMap.values()];
  }

  const passes = buildTextPasses(chunksToProcess);
  aiLogger.entity.extractStart(bookHash, passes.length);

  for (let i = 0; i < passes.length; i++) {
    if (abortSignal?.aborted) throw new Error('Extraction cancelled');

    const pass = passes[i]!;
    aiLogger.entity.extractPass(pass.label, pass.text.length);
    onProgress?.({ current: i, total: passes.length, phase: 'extracting' });

    const existingNames = [...entityMap.values()].map((e) => e.name);
    const prompt = buildEntityExtractionPrompt(pass.text, pass.label, existingNames);

    try {
      const result = await callLLM(prompt, settings, abortSignal);
      const rawEntities = parseExtractionResult(result);
      aiLogger.entity.extractResult(pass.label, rawEntities.length);

      const avgPage = pass.sectionIndices.length > 0 ? pass.sectionIndices[0]! * 10 : 0;
      mergeRawEntities(rawEntities, pass.sectionIndices, entityMap, bookHash, avgPage);
    } catch (e) {
      if ((e as Error).message === 'Extraction cancelled') throw e;
      aiLogger.entity.extractError(bookHash, (e as Error).message);
      // Continue with next pass on non-fatal errors
    }
  }

  const entities = [...entityMap.values()];

  // Save entities and index
  onProgress?.({ current: passes.length, total: passes.length, phase: 'storing' });

  if (entities.length > 0) {
    await aiStore.saveEntities(entities);
  }

  const maxPage = currentPage ?? Math.max(...chunks.map((c) => c.pageNumber), 0);
  const entityIndex: BookEntityIndex = {
    bookHash,
    entities,
    extractionModel: getModelForProvider(settings),
    lastUpdated: Date.now(),
    version: 1,
    processedSections: [
      ...new Set([
        ...(existingIndex?.processedSections ?? []),
        ...passes.flatMap((p) => p.sectionIndices),
      ]),
    ],
    totalSections: new Set(allChunks.map((c) => c.sectionIndex)).size,
    complete: true,
    progressPercent: 100,
    maxExtractedPage: maxPage,
  };
  await aiStore.saveEntityIndex(entityIndex);

  aiLogger.entity.extractComplete(bookHash, entities.length, Date.now() - startTime);
  return entities;
}

export function getEntityProfile(
  entity: BookEntity,
  maxPage: number | undefined,
  chapterTitles: Map<number, string>,
  allEntities?: BookEntity[],
): EntityProfile {
  const visibleAppearances =
    maxPage !== undefined
      ? entity.sectionAppearances.filter((s) => {
          // Approximate page filtering based on section index
          return s * 10 <= maxPage;
        })
      : entity.sectionAppearances;

  const chaptersAppearing = visibleAppearances
    .map((s) => chapterTitles.get(s) || `Section ${s + 1}`)
    .filter((v, i, a) => a.indexOf(v) === i);

  // Scope description to only show fragments from sections the user has reached
  const fragments = entity.descriptionFragments || [];
  let scopedDescription: string;
  if (maxPage !== undefined && fragments.length > 0) {
    const maxSection = maxPage / 10;
    scopedDescription = fragments
      .filter((f) => f.maxSection <= maxSection)
      .map((f) => f.text)
      .join(' ');
    // Fallback to first fragment if nothing is visible yet (entity was mentioned before current page)
    if (!scopedDescription && fragments.length > 0) {
      scopedDescription = fragments[0]!.text;
    }
  } else {
    scopedDescription = entity.description;
  }

  // Scope connections: only show connections to entities the user has encountered
  let visibleConnections = entity.connections;
  if (maxPage !== undefined && allEntities) {
    const encounteredNames = new Set<string>();
    for (const e of allEntities) {
      if (e.firstMentionPage <= maxPage) {
        encounteredNames.add(e.name.toLowerCase());
        for (const alias of e.aliases) {
          encounteredNames.add(alias.toLowerCase());
        }
      }
    }
    visibleConnections = entity.connections.filter((c) => encounteredNames.has(c.toLowerCase()));
  }

  return {
    entity,
    scopedDescription,
    visibleConnections,
    chaptersAppearing,
  };
}

export function searchEntities(
  entities: BookEntity[],
  query: string,
  maxPage?: number,
  type?: EntityType | 'all',
): BookEntity[] {
  const q = query.toLowerCase().trim();
  let filtered = entities;

  if (type && type !== 'all') {
    filtered = filtered.filter((e) => e.type === type);
  }

  if (maxPage !== undefined) {
    filtered = filtered.filter((e) => e.firstMentionPage <= maxPage);
  }

  if (q.length > 0) {
    filtered = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)) ||
        e.description.toLowerCase().includes(q),
    );
  }

  // Sort: major first, then alphabetical
  return filtered.sort((a, b) => {
    if (a.importance !== b.importance) {
      return a.importance === 'major' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function getExtractedPage(bookHash: string): Promise<number | null> {
  const index = await aiStore.getEntityIndex(bookHash);
  if (!index?.complete) return null;
  return index.maxExtractedPage ?? null;
}

export async function clearEntityIndex(bookHash: string): Promise<void> {
  await aiStore.clearEntityData(bookHash);
}
