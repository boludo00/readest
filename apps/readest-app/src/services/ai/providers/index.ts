import { OllamaProvider } from './OllamaProvider';
import { AIGatewayProvider } from './AIGatewayProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GoogleProvider } from './GoogleProvider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import type { AIProvider, AISettings } from '../types';

export {
  OllamaProvider,
  AIGatewayProvider,
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  OpenAICompatibleProvider,
};

export function getAIProvider(settings: AISettings): AIProvider {
  switch (settings.provider) {
    case 'ollama':
      return new OllamaProvider(settings);
    case 'ai-gateway':
      if (!settings.aiGatewayApiKey) {
        throw new Error('API key required for AI Gateway');
      }
      return new AIGatewayProvider(settings);
    case 'openai':
      return new OpenAIProvider(settings);
    case 'anthropic':
      return new AnthropicProvider(settings);
    case 'google':
      return new GoogleProvider(settings);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(settings);
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
