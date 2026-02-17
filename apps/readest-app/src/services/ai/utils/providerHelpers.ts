import type { AISettings, AIProviderName, AIFeature } from '../types';

const PROVIDER_LABELS: Record<AIProviderName, string> = {
  ollama: 'Ollama',
  'ai-gateway': 'AI Gateway',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  'openai-compatible': 'OpenAI Compatible',
};

export interface AIConfigIssue {
  field: string;
  message: string;
}

/**
 * Validates that the current AI provider has all required configuration.
 * Returns an array of issues (empty if everything is OK).
 */
export function validateAIConfig(settings: AISettings): AIConfigIssue[] {
  const issues: AIConfigIssue[] = [];
  const label = PROVIDER_LABELS[settings.provider] || settings.provider;

  switch (settings.provider) {
    case 'ollama':
      if (!settings.ollamaBaseUrl) {
        issues.push({ field: 'ollamaBaseUrl', message: `${label} server URL is not configured` });
      }
      if (!settings.ollamaModel) {
        issues.push({ field: 'ollamaModel', message: `${label} model is not selected` });
      }
      break;
    case 'ai-gateway':
      if (!settings.aiGatewayApiKey) {
        issues.push({ field: 'aiGatewayApiKey', message: `${label} API key is missing` });
      }
      if (!settings.aiGatewayModel) {
        issues.push({ field: 'aiGatewayModel', message: `${label} model is not selected` });
      }
      break;
    case 'openai':
      if (!settings.openaiApiKey) {
        issues.push({ field: 'openaiApiKey', message: 'OpenAI API key is missing' });
      }
      break;
    case 'anthropic':
      if (!settings.anthropicApiKey) {
        issues.push({ field: 'anthropicApiKey', message: 'Anthropic API key is missing' });
      }
      break;
    case 'google':
      if (!settings.googleApiKey) {
        issues.push({ field: 'googleApiKey', message: 'Google Gemini API key is missing' });
      }
      break;
    case 'openai-compatible':
      if (!settings.openaiCompatibleApiKey) {
        issues.push({
          field: 'openaiCompatibleApiKey',
          message: `${label} API key is missing`,
        });
      }
      if (!settings.openaiCompatibleBaseUrl) {
        issues.push({
          field: 'openaiCompatibleBaseUrl',
          message: `${label} endpoint URL is not configured`,
        });
      }
      if (!settings.openaiCompatibleModel) {
        issues.push({
          field: 'openaiCompatibleModel',
          message: `${label} model is not specified`,
        });
      }
      break;
  }

  return issues;
}

/**
 * Returns a single human-readable message if the config is invalid, or null if OK.
 */
export function getAIConfigError(settings: AISettings): string | null {
  const issues = validateAIConfig(settings);
  if (issues.length === 0) return null;
  return issues.map((i) => i.message).join('. ');
}

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

/**
 * Returns a copy of `settings` with the model overridden for the given feature.
 * If per-feature models are disabled or no override is set, returns settings as-is.
 */
export function getSettingsForFeature(settings: AISettings, feature: AIFeature): AISettings {
  if (!settings.perFeatureModels) return settings;

  const overrideMap: Record<AIFeature, string | undefined> = {
    xray: settings.xrayModelOverride,
    recap: settings.recapModelOverride,
    chat: settings.chatModelOverride,
  };

  const override = overrideMap[feature];
  if (!override) return settings;

  return applyModelOverride(settings, override);
}

function applyModelOverride(settings: AISettings, model: string): AISettings {
  switch (settings.provider) {
    case 'ollama':
      return { ...settings, ollamaModel: model };
    case 'ai-gateway':
      return { ...settings, aiGatewayModel: model };
    case 'openai':
      return { ...settings, openaiModel: model };
    case 'anthropic':
      return { ...settings, anthropicModel: model };
    case 'google':
      return { ...settings, googleModel: model };
    case 'openai-compatible':
      return { ...settings, openaiCompatibleModel: model };
    default:
      return settings;
  }
}
