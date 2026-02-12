import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import type { LanguageModel, EmbeddingModel } from 'ai';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { aiLogger } from '../logger';
import { AI_TIMEOUTS } from '../utils/retry';

export class GoogleProvider implements AIProvider {
  id: AIProviderName = 'google';
  name = 'Google Gemini';
  requiresAuth = true;

  private settings: AISettings;
  private google: ReturnType<typeof createGoogleGenerativeAI>;

  constructor(settings: AISettings) {
    this.settings = settings;
    if (!settings.googleApiKey) {
      throw new Error('Google API key required');
    }
    this.google = createGoogleGenerativeAI({
      apiKey: settings.googleApiKey,
      ...(isTauriAppPlatform() ? { fetch: tauriFetch as typeof globalThis.fetch } : {}),
    });
    aiLogger.provider.init('google', settings.googleModel || 'gemini-2.5-flash');
  }

  getModel(): LanguageModel {
    return this.google(this.settings.googleModel || 'gemini-2.5-flash');
  }

  getEmbeddingModel(): EmbeddingModel {
    throw new Error('Google Gemini does not support embedding models via this provider');
  }

  supportsEmbeddings(): boolean {
    return false;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.settings.googleApiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.settings.googleApiKey) return false;

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
            apiKey: this.settings.googleApiKey,
            model: this.settings.googleModel || 'gemini-2.5-flash',
            provider: 'google',
          }),
          signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `Health check failed: ${response.status}`);
        }
      }

      aiLogger.provider.init('google', 'healthCheck success');
      return true;
    } catch (e) {
      aiLogger.provider.error('google', `healthCheck failed: ${(e as Error).message}`);
      return false;
    }
  }
}
