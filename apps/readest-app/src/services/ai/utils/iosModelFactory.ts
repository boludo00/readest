import type { LanguageModel } from 'ai';
import { isIOSTauriApp } from '@/services/environment';
import { getAIProvider } from '../providers';
import type { AISettings } from '../types';

/**
 * Returns an AI SDK LanguageModel, bypassing Tauri's IPC-based tauriFetch on iOS.
 *
 * On iOS, Tauri's custom URL scheme protocol handler crashes under sustained
 * HTTP load (multiple sequential LLM calls). This creates the provider with the
 * browser's native fetch instead, which goes directly through WKWebView's
 * URLSession without touching Tauri IPC.
 *
 * On all other platforms, delegates to getAIProvider() which uses tauriFetch.
 */
export async function getModelForPlatform(settings: AISettings): Promise<LanguageModel> {
  if (isIOSTauriApp()) {
    switch (settings.provider) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey: settings.openaiApiKey })(
          settings.openaiModel || 'gpt-4.1-nano',
        );
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          apiKey: settings.anthropicApiKey,
          headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        })(settings.anthropicModel || 'claude-sonnet-4-5-20250929');
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({ apiKey: settings.googleApiKey })(
          settings.googleModel || 'gemini-2.5-flash',
        );
      }
      case 'openai-compatible': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({
          apiKey: settings.openaiCompatibleApiKey,
          baseURL: settings.openaiCompatibleBaseUrl,
        })(settings.openaiCompatibleModel || 'custom-model');
      }
      default:
        break;
    }
  }
  return getAIProvider(settings).getModel();
}
