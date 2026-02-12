import type { AISettings } from '../types';

export function getApiKeyForProvider(settings: AISettings): string | undefined {
  switch (settings.provider) {
    case 'ollama':
      return undefined;
    case 'ai-gateway':
      return settings.aiGatewayApiKey;
    case 'openai':
      return settings.openaiApiKey;
    case 'anthropic':
      return settings.anthropicApiKey;
    case 'google':
      return settings.googleApiKey;
    case 'openai-compatible':
      return settings.openaiCompatibleApiKey;
    default:
      return undefined;
  }
}

export function getModelForProvider(settings: AISettings): string {
  switch (settings.provider) {
    case 'ollama':
      return settings.ollamaModel || 'llama3.2';
    case 'ai-gateway':
      return settings.aiGatewayModel || 'google/gemini-2.5-flash-lite';
    case 'openai':
      return settings.openaiModel || 'gpt-4.1-nano';
    case 'anthropic':
      return settings.anthropicModel || 'claude-sonnet-4-5-20250929';
    case 'google':
      return settings.googleModel || 'gemini-2.5-flash';
    case 'openai-compatible':
      return settings.openaiCompatibleModel || '';
    default:
      return '';
  }
}
