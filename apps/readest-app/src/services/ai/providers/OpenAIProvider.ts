import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { LanguageModel, EmbeddingModel } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { aiLogger } from '../logger';
import { AI_TIMEOUTS } from '../utils/retry';

export class OpenAIProvider implements AIProvider {
  id: AIProviderName = 'openai';
  name = 'OpenAI';
  requiresAuth = true;

  private settings: AISettings;
  private openai: ReturnType<typeof createOpenAI>;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (!settings.openaiApiKey) {
      throw new Error('OpenAI API key required');
    }
    this.openai = createOpenAI({
      apiKey: settings.openaiApiKey,
      ...(isTauriAppPlatform() ? { fetch: tauriFetch as typeof globalThis.fetch } : {}),
    });
    aiLogger.provider.init('openai', settings.openaiModel || 'gpt-4.1-nano');
  }

  getModel(): LanguageModel {
    return this.openai(this.settings.openaiModel || 'gpt-4.1-nano');
  }

  getEmbeddingModel(): EmbeddingModel {
    return this.openai.embeddingModel(
      this.settings.openaiEmbeddingModel || 'text-embedding-3-small',
    );
  }

  supportsEmbeddings(): boolean {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.settings.openaiApiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.settings.openaiApiKey) return false;

    try {
      if (isTauriAppPlatform()) {
        // Tauri: use SDK directly (tauriFetch bypasses CORS)
        const result = streamText({
          model: this.getModel(),
          messages: [{ role: 'user', content: 'hi' }],
          abortSignal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        });

        for await (const _ of result.textStream) {
          break;
        }
      } else {
        // Web: proxy through API route to avoid CORS
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'hi' }],
            apiKey: this.settings.openaiApiKey,
            model: this.settings.openaiModel || 'gpt-4.1-nano',
            provider: 'openai',
          }),
          signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `Health check failed: ${response.status}`);
        }
      }

      aiLogger.provider.init('openai', 'healthCheck success');
      return true;
    } catch (e) {
      aiLogger.provider.error('openai', `healthCheck failed: ${(e as Error).message}`);
      return false;
    }
  }
}
