import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { LanguageModel, EmbeddingModel } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { aiLogger } from '../logger';
import { AI_TIMEOUTS } from '../utils/retry';

export class OpenAICompatibleProvider implements AIProvider {
  id: AIProviderName = 'openai-compatible';
  name = 'OpenAI Compatible';
  requiresAuth = true;

  private settings: AISettings;
  private provider: ReturnType<typeof createOpenAI>;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (!settings.openaiCompatibleApiKey) {
      throw new Error('API key required for OpenAI-compatible endpoint');
    }
    if (!settings.openaiCompatibleBaseUrl) {
      throw new Error('Base URL required for OpenAI-compatible endpoint');
    }
    this.provider = createOpenAI({
      apiKey: settings.openaiCompatibleApiKey,
      baseURL: settings.openaiCompatibleBaseUrl,
      ...(isTauriAppPlatform() ? { fetch: tauriFetch as typeof globalThis.fetch } : {}),
    });
    aiLogger.provider.init('openai-compatible', settings.openaiCompatibleModel || 'custom-model');
  }

  getModel(): LanguageModel {
    const modelId = this.settings.openaiCompatibleModel;
    if (!modelId) {
      throw new Error('Model ID required for OpenAI-compatible endpoint');
    }
    return this.provider(modelId);
  }

  getEmbeddingModel(): EmbeddingModel {
    throw new Error('Embedding models are not supported for OpenAI-compatible endpoints');
  }

  supportsEmbeddings(): boolean {
    return false;
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.settings.openaiCompatibleApiKey && this.settings.openaiCompatibleBaseUrl);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.settings.openaiCompatibleApiKey || !this.settings.openaiCompatibleBaseUrl) {
      return false;
    }

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
            apiKey: this.settings.openaiCompatibleApiKey,
            model: this.settings.openaiCompatibleModel,
            provider: 'openai-compatible',
            baseUrl: this.settings.openaiCompatibleBaseUrl,
          }),
          signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `Health check failed: ${response.status}`);
        }
      }

      aiLogger.provider.init('openai-compatible', 'healthCheck success');
      return true;
    } catch (e) {
      aiLogger.provider.error('openai-compatible', `healthCheck failed: ${(e as Error).message}`);
      return false;
    }
  }
}
