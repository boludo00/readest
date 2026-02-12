import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import type { LanguageModel, EmbeddingModel } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { aiLogger } from '../logger';
import { AI_TIMEOUTS } from '../utils/retry';

export class AnthropicProvider implements AIProvider {
  id: AIProviderName = 'anthropic';
  name = 'Anthropic';
  requiresAuth = true;

  private settings: AISettings;
  private anthropic: ReturnType<typeof createAnthropic>;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (!settings.anthropicApiKey) {
      throw new Error('Anthropic API key required');
    }
    this.anthropic = createAnthropic({
      apiKey: settings.anthropicApiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      ...(isTauriAppPlatform() ? { fetch: tauriFetch as typeof globalThis.fetch } : {}),
    });
    aiLogger.provider.init('anthropic', settings.anthropicModel || 'claude-sonnet-4-5-20250929');
  }

  getModel(): LanguageModel {
    return this.anthropic(this.settings.anthropicModel || 'claude-sonnet-4-5-20250929');
  }

  getEmbeddingModel(): EmbeddingModel {
    throw new Error('Anthropic does not support embedding models');
  }

  supportsEmbeddings(): boolean {
    return false;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.settings.anthropicApiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.settings.anthropicApiKey) return false;

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
            apiKey: this.settings.anthropicApiKey,
            model: this.settings.anthropicModel || 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
          }),
          signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `Health check failed: ${response.status}`);
        }
      }

      aiLogger.provider.init('anthropic', 'healthCheck success');
      return true;
    } catch (e) {
      aiLogger.provider.error('anthropic', `healthCheck failed: ${(e as Error).message}`);
      return false;
    }
  }
}
