import { generateText } from 'ai';
import { isIOSTauriApp, isTauriAppPlatform } from '@/services/environment';
import { aiStore } from './storage/aiStore';
import { aiLogger } from './logger';
import { buildEntityExtractionPrompt } from './prompts';
import {
  getApiKeyForProvider,
  getModelForProvider,
  getAIConfigError,
  getSettingsForFeature,
} from './utils/providerHelpers';
import { getModelForPlatform } from './utils/iosModelFactory';
import { getAccessToken } from '@/utils/access';
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

/**
 * Get relevant entities for a text pass based on section proximity.
 * Filters to only entities appearing near the current pass to reduce prompt size.
 */
function getRelevantEntitiesForPass(
  pass: TextPass,
  allEntities: BookEntity[],
  options: {
    sectionWindow?: number;
    maxEntities?: number;
  } = {},
): BookEntity[] {
  const { sectionWindow = 3, maxEntities = 25 } = options;

  if (allEntities.length === 0) return [];

  const passSections = new Set(pass.sectionIndices);

  // Filter by proximity: entity appears within N sections of this pass
  const nearbyEntities = allEntities.filter((entity) => {
    return entity.sectionAppearances.some((entitySection) =>
      pass.sectionIndices.some(
        (passSection) => Math.abs(entitySection - passSection) <= sectionWindow,
      ),
    );
  });

  // Score by relevance
  const scored = nearbyEntities.map((entity) => {
    let score = 0;

    // Major entities get boost
    if (entity.importance === 'major') score += 10;

    // Count appearances in nearby sections
    for (const section of entity.sectionAppearances) {
      if (passSections.has(section)) score += 5; // Exact match
      if (passSections.has(section - 1) || passSections.has(section + 1)) {
        score += 3; // Adjacent section
      }
    }

    // Entities with many connections are more important
    score += Math.min(entity.connections.length * 0.5, 5);

    return { entity, score };
  });

  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxEntities).map((s) => s.entity);
}

/**
 * Build a reverse lookup map from all entity names/aliases to their entity.
 * This enables O(1) entity lookups instead of O(n) scans.
 */
function buildEntityNameLookup(entities: Map<string, BookEntity>): Map<string, BookEntity> {
  const lookup = new Map<string, BookEntity>();
  for (const entity of entities.values()) {
    const primaryKey = entity.name.toLowerCase();
    lookup.set(primaryKey, entity);
    for (const alias of entity.aliases) {
      const aliasKey = alias.toLowerCase();
      lookup.set(aliasKey, entity);
    }
  }
  return lookup;
}

/**
 * Update the name lookup when adding new aliases to an entity.
 */
function updateEntityNameLookup(
  lookup: Map<string, BookEntity>,
  entity: BookEntity,
  newAliases: string[],
): void {
  for (const alias of newAliases) {
    const key = alias.toLowerCase();
    if (!lookup.has(key)) {
      lookup.set(key, entity);
    }
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

  // Build reverse lookup once: O(n) upfront, but enables O(1) lookups for all merges
  const nameLookup = buildEntityNameLookup(existingMap);

  for (const raw of newEntities) {
    const normalizedName = raw.name.trim();
    const key = normalizedName.toLowerCase();

    // Check if this entity or any of its aliases already exists: O(1) per name
    let existing: BookEntity | undefined;
    existing = nameLookup.get(key);
    if (!existing) {
      for (const alias of raw.aliases || []) {
        const aliasKey = alias.trim().toLowerCase();
        if (aliasKey) {
          existing = nameLookup.get(aliasKey);
          if (existing) break;
        }
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

      // Add new aliases and update lookup
      const newAliases: string[] = [];
      for (const alias of raw.aliases || []) {
        if (!existing.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
          existing.aliases.push(alias);
          newAliases.push(alias);
        }
      }
      if (newAliases.length > 0) {
        updateEntityNameLookup(nameLookup, existing, newAliases);
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

      // Add new entity to lookup
      nameLookup.set(key, entity);
      for (const alias of entity.aliases) {
        nameLookup.set(alias.toLowerCase(), entity);
      }
    }
  }
}

async function callLLM(
  prompt: string,
  settings: AISettings,
  abortSignal?: AbortSignal,
): Promise<string> {
  // Tauri or Ollama: use generateText (non-streaming)
  if (isTauriAppPlatform() || settings.provider === 'ollama') {
    const model = await getModelForPlatform(settings);
    const result = await generateText({
      model,
      prompt,
      abortSignal,
    });
    return result.text;
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
  rawSettings: AISettings,
  onProgress?: (progress: EntityExtractionProgress) => void,
  abortSignal?: AbortSignal,
  currentSectionIndex?: number,
): Promise<BookEntity[]> {
  const settings = getSettingsForFeature(rawSettings, 'xray');
  const startTime = Date.now();

  // Validate provider configuration before making any API calls
  const configError = getAIConfigError(settings);
  if (configError) {
    throw new Error(`AI provider is not configured: ${configError}`);
  }

  // Get all chunks for this book, stripping embeddings to reduce memory.
  // Embeddings can be ~12KB each (1536 floats); for 924 chunks that's ~11MB
  // which pushes iOS WKWebView over its memory limit during extraction.
  const rawChunks = await aiStore.getChunks(bookHash);
  if (rawChunks.length === 0) {
    throw new Error('Book must be indexed before entity extraction');
  }
  const allChunks = rawChunks.map(({ embedding: _, ...c }) => c);

  // Filter chunks to only include sections up to the user's current reading position.
  // sectionIndex maps directly to spine items (chapters), giving clean chapter boundaries.
  const chunks =
    currentSectionIndex !== undefined
      ? allChunks
          .filter((c) => c.sectionIndex <= currentSectionIndex)
          .sort((a, b) => a.sectionIndex - b.sectionIndex || a.pageNumber - b.pageNumber)
      : allChunks;

  if (chunks.length === 0) {
    return [];
  }

  // Check for existing index — determine if we can skip or need incremental extraction.
  const existingIndex = await aiStore.getEntityIndex(bookHash);
  const currentMaxSection = Math.max(...chunks.map((c) => c.sectionIndex), -1);

  if (existingIndex?.complete) {
    // Derive previous max section — prefer stored value, fall back to max of processedSections
    // for backward compat with indexes saved before maxExtractedSection was introduced.
    const prevMaxSection =
      existingIndex.maxExtractedSection ??
      (existingIndex.processedSections.length > 0
        ? Math.max(...existingIndex.processedSections)
        : -1);
    if (prevMaxSection >= currentMaxSection) {
      const entities = await aiStore.getEntities(bookHash);
      aiLogger.entity.cached(bookHash, entities.length);
      return entities;
    }
    // Otherwise, fall through to do incremental extraction for new chunks
  }

  // Load existing entities for merge (both partial and incremental cases)
  const entityMap = new Map<string, BookEntity>();
  const previousMaxSection =
    existingIndex?.maxExtractedSection ??
    (existingIndex?.processedSections && existingIndex.processedSections.length > 0
      ? Math.max(...existingIndex.processedSections)
      : -1);

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

  // For incremental extraction, only build passes from NEW chunks.
  // - Complete index: filter by sectionIndex (incremental update after reading more chapters).
  // - Partial index (crash recovery): skip already-processed sections so we don't
  //   redo passes that completed before the crash.
  let chunksToProcess;
  if (existingIndex?.complete && previousMaxSection >= 0) {
    chunksToProcess = chunks.filter((c) => c.sectionIndex > previousMaxSection);
  } else if (
    existingIndex &&
    !existingIndex.complete &&
    existingIndex.processedSections.length > 0
  ) {
    const processed = new Set(existingIndex.processedSections);
    chunksToProcess = chunks.filter((c) => !processed.has(c.sectionIndex));
  } else {
    chunksToProcess = chunks;
  }

  if (chunksToProcess.length === 0) {
    // No new content to process
    return [...entityMap.values()];
  }

  const passes = buildTextPasses(chunksToProcess);
  aiLogger.entity.extractStart(bookHash, passes.length);

  const saveWithRetry = async <T>(fn: () => Promise<T>, label: string, retries = 2): Promise<T> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        aiLogger.entity.extractError(
          bookHash,
          `${label} attempt ${attempt + 1} failed: ${(e as Error).message}`,
        );
        if (attempt === retries) throw e;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    throw new Error(`${label} failed after retries`);
  };

  const maxSection = Math.max(...chunks.map((c) => c.sectionIndex), -1);
  const completedSections = new Set(existingIndex?.processedSections ?? []);

  for (let i = 0; i < passes.length; i++) {
    if (abortSignal?.aborted) throw new Error('Extraction cancelled');

    // Yield to the main thread between passes so iOS WKWebView health checks
    // (which evaluate JS) don't time out and trigger a WebView reload.
    // On iOS, use a longer delay to reduce IPC pressure on Tauri's custom URL
    // scheme protocol handler, which can become unstable under sustained load.
    if (i > 0) {
      const delay = isIOSTauriApp() ? 500 : 50;
      await new Promise((r) => setTimeout(r, delay));
    }

    const pass = passes[i]!;
    aiLogger.entity.extractPass(pass.label, pass.text.length);
    onProgress?.({ current: i, total: passes.length, phase: 'extracting' });

    // Get only relevant entities near this pass to reduce prompt size (75% token savings)
    const allEntities = [...entityMap.values()];
    const relevantEntities = getRelevantEntitiesForPass(pass, allEntities);
    const existingNames = relevantEntities.map((e) => e.name);
    const prompt = buildEntityExtractionPrompt(pass.text, pass.label, existingNames);

    try {
      const result = await callLLM(prompt, settings, abortSignal);
      const rawEntities = parseExtractionResult(result);
      aiLogger.entity.extractResult(pass.label, rawEntities.length);

      const avgPage = pass.sectionIndices.length > 0 ? pass.sectionIndices[0]! * 10 : 0;
      mergeRawEntities(rawEntities, pass.sectionIndices, entityMap, bookHash, avgPage);

      // Save intermediate results after each pass so progress survives
      // iOS WKWebView process termination (which causes a full page reload).
      for (const si of pass.sectionIndices) completedSections.add(si);
      const intermediateEntities = [...entityMap.values()];
      if (intermediateEntities.length > 0) {
        await saveWithRetry(
          () => aiStore.saveEntities(intermediateEntities),
          `saveEntities-pass${i}`,
        );
        await saveWithRetry(
          () =>
            aiStore.saveEntityIndex({
              bookHash,
              extractionModel: getModelForProvider(settings),
              lastUpdated: Date.now(),
              version: 1,
              processedSections: [...completedSections],
              totalSections: new Set(allChunks.map((c) => c.sectionIndex)).size,
              complete: false,
              progressPercent: Math.round(((i + 1) / passes.length) * 100),
              maxExtractedSection: maxSection,
            }),
          `saveEntityIndex-pass${i}`,
        );
      }
    } catch (e) {
      if ((e as Error).message === 'Extraction cancelled') throw e;
      aiLogger.entity.extractError(bookHash, (e as Error).message);
      // Continue with next pass on non-fatal errors
    }
  }

  const entities = [...entityMap.values()];

  // Yield before final save
  await new Promise((r) => setTimeout(r, 0));

  // Save final complete entity index
  onProgress?.({ current: passes.length, total: passes.length, phase: 'storing' });

  const entityIndex: BookEntityIndex = {
    bookHash,
    extractionModel: getModelForProvider(settings),
    lastUpdated: Date.now(),
    version: 1,
    processedSections: [...completedSections],
    totalSections: new Set(allChunks.map((c) => c.sectionIndex)).size,
    complete: true,
    progressPercent: 100,
    maxExtractedSection: maxSection,
  };
  await saveWithRetry(() => aiStore.saveEntityIndex(entityIndex), 'saveEntityIndex');

  // Upload to cloud for sync across devices
  try {
    const token = await getAccessToken();
    if (token) {
      await aiStore.uploadEntities(bookHash, token);
    }
  } catch (error) {
    aiLogger.entity.extractError(bookHash, `Cloud sync failed: ${(error as Error).message}`);
    // Don't fail extraction if cloud sync fails
  }

  aiLogger.entity.extractComplete(bookHash, entities.length, Date.now() - startTime);

  return entities;
}

export function getEntityProfile(
  entity: BookEntity,
  maxSection: number | undefined,
  chapterTitles: Map<number, string>,
  allEntities?: BookEntity[],
): EntityProfile {
  const visibleAppearances =
    maxSection !== undefined
      ? entity.sectionAppearances.filter((s) => s <= maxSection)
      : entity.sectionAppearances;

  const chaptersAppearing = visibleAppearances
    .map((s) => chapterTitles.get(s) || `Section ${s + 1}`)
    .filter((v, i, a) => a.indexOf(v) === i);

  // Scope description to only show fragments from sections the user has reached
  const fragments = entity.descriptionFragments || [];
  let scopedDescription: string;
  if (maxSection !== undefined && fragments.length > 0) {
    scopedDescription = fragments
      .filter((f) => f.maxSection <= maxSection)
      .map((f) => f.text)
      .join(' ');
    // Fallback to first fragment if nothing is visible yet
    if (!scopedDescription && fragments.length > 0) {
      scopedDescription = fragments[0]!.text;
    }
  } else {
    scopedDescription = entity.description;
  }

  // Scope connections: only show connections to entities the user has encountered
  let visibleConnections = entity.connections;
  if (maxSection !== undefined && allEntities) {
    const encounteredNames = new Set<string>();
    for (const e of allEntities) {
      if (e.firstMentionSection <= maxSection) {
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
  maxSection?: number,
  type?: EntityType | 'all',
): BookEntity[] {
  const q = query.toLowerCase().trim();
  let filtered = entities;

  if (type && type !== 'all') {
    filtered = filtered.filter((e) => e.type === type);
  }

  if (maxSection !== undefined) {
    filtered = filtered.filter((e) => e.firstMentionSection <= maxSection);
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

export async function getExtractedSection(bookHash: string): Promise<number | null> {
  const index = await aiStore.getEntityIndex(bookHash);
  if (!index?.complete) return null;
  return (
    index.maxExtractedSection ??
    (index.processedSections.length > 0 ? Math.max(...index.processedSections) : null)
  );
}

export async function clearEntityIndex(bookHash: string): Promise<void> {
  await aiStore.clearEntityData(bookHash);
}
