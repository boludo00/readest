import { streamText } from 'ai';
import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { getAIProvider } from '../providers';
import { hybridSearch, isBookIndexed } from '../ragService';
import { aiLogger } from '../logger';
import { buildSystemPrompt } from '../prompts';
import type { AISettings, ScoredChunk } from '../types';

let lastSources: ScoredChunk[] = [];

export function getLastSources(): ScoredChunk[] {
  return lastSources;
}

export function clearLastSources(): void {
  lastSources = [];
}

export interface TauriAdapterOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName: string;
  currentPage: number;
  totalPages?: number;
  currentChapter?: string;
}

/**
 * Detect if a query is a broad recap/summary request that needs more context.
 * These queries benefit from fetching more chunks across the entire read portion.
 */
function isRecapQuery(query: string): boolean {
  const recapPatterns = [
    /\brecap\b/i,
    /\bsummar(y|ize|ise)\b/i,
    /\bwhat('s| has| have)?\s+(happened|going on)\b/i,
    /\bso far\b/i,
    /\beverything\s+(that|we)\b/i,
    /\bx[- ]?ray\b/i,
    /\bcharacter(s)?\s+(list|breakdown|overview)\b/i,
    /\bquiz\s+me\b/i,
    /\bbreak(down| it down)\b/i,
    /\bwhat just happened\b/i,
  ];
  return recapPatterns.some((p) => p.test(query));
}

async function* streamViaApiRoute(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  settings: AISettings,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      system: systemPrompt,
      apiKey: settings.aiGatewayApiKey,
      model: settings.aiGatewayModel || 'google/gemini-2.5-flash-lite',
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Chat failed: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export function createTauriAdapter(getOptions: () => TauriAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
      const options = getOptions();
      const {
        settings,
        bookHash,
        bookTitle,
        authorName,
        currentPage,
        totalPages,
        currentChapter,
      } = options;
      const provider = getAIProvider(settings);
      let chunks: ScoredChunk[] = [];

      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const query =
        lastUserMessage?.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join(' ') || '';

      aiLogger.chat.send(query.length, false);

      if (await isBookIndexed(bookHash)) {
        try {
          // For recap/summary queries, fetch more chunks to provide broader coverage
          const baseChunkCount = settings.maxContextChunks || 5;
          const chunkCount = isRecapQuery(query)
            ? Math.min(baseChunkCount * 3, 30)
            : baseChunkCount;

          chunks = await hybridSearch(
            bookHash,
            query,
            settings,
            chunkCount,
            settings.spoilerProtection ? currentPage : undefined,
          );
          aiLogger.chat.context(chunks.length, chunks.map((c) => c.text).join('').length);
          lastSources = chunks;
        } catch (e) {
          aiLogger.chat.error(`RAG failed: ${(e as Error).message}`);
          lastSources = [];
        }
      } else {
        lastSources = [];
      }

      const systemPrompt = buildSystemPrompt(
        bookTitle,
        authorName,
        chunks,
        currentPage,
        totalPages,
        currentChapter,
      );

      const aiMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      }));

      try {
        const useApiRoute = typeof window !== 'undefined' && settings.provider === 'ai-gateway';

        let text = '';

        if (useApiRoute) {
          for await (const chunk of streamViaApiRoute(
            aiMessages,
            systemPrompt,
            settings,
            abortSignal,
          )) {
            text += chunk;
            yield { content: [{ type: 'text', text }] };
          }
        } else {
          const result = streamText({
            model: provider.getModel(),
            system: systemPrompt,
            messages: aiMessages,
            abortSignal,
          });

          for await (const chunk of result.textStream) {
            text += chunk;
            yield { content: [{ type: 'text', text }] };
          }
        }

        aiLogger.chat.complete(text.length);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          aiLogger.chat.error((error as Error).message);
          throw error;
        }
      }
    },
  };
}
