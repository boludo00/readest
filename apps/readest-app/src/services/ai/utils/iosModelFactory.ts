import type { LanguageModel } from 'ai';
import { getAIProvider } from '../providers';
import type { AISettings } from '../types';

/**
 * Returns an AI SDK LanguageModel for the current platform.
 *
 * All Tauri platforms (including iOS) use tauriFetch via the provider to bypass
 * CORS restrictions — the browser's native fetch cannot reach external APIs like
 * api.openai.com from the tauri:// origin.
 *
 * To mitigate iOS WKWebView IPC instability under sustained HTTP load (multiple
 * sequential LLM calls), callers should add delays between sequential requests
 * (see entityExtractor.ts).
 */
export async function getModelForPlatform(settings: AISettings): Promise<LanguageModel> {
  return getAIProvider(settings).getModel();
}
