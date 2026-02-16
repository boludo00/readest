import type { AISettings } from './types';

// cheapest popular models as of 2025
export const GATEWAY_MODELS = {
  GEMINI_FLASH_LITE: 'google/gemini-2.5-flash-lite',
  GPT_5_NANO: 'openai/gpt-5-nano',
  LLAMA_4_SCOUT: 'meta/llama-4-scout',
  GROK_4_1_FAST: 'xai/grok-4.1-fast-reasoning',
  DEEPSEEK_V3_2: 'deepseek/deepseek-v3.2',
  QWEN_3_235B: 'alibaba/qwen-3-235b',
} as const;

export const MODEL_PRICING: Record<string, { input: string; output: string }> = {
  [GATEWAY_MODELS.GEMINI_FLASH_LITE]: { input: '0.1', output: '0.4' },
  [GATEWAY_MODELS.GPT_5_NANO]: { input: '0.05', output: '0.4' },
  [GATEWAY_MODELS.LLAMA_4_SCOUT]: { input: '0.08', output: '0.3' },
  [GATEWAY_MODELS.GROK_4_1_FAST]: { input: '0.2', output: '0.5' },
  [GATEWAY_MODELS.DEEPSEEK_V3_2]: { input: '0.27', output: '0.4' },
  [GATEWAY_MODELS.QWEN_3_235B]: { input: '0.07', output: '0.46' },
};

export const OPENAI_MODELS = [
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o4-mini', label: 'o4-mini' },
] as const;

export const OPENAI_EMBEDDING_MODELS = [
  { id: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { id: 'text-embedding-3-large', label: 'text-embedding-3-large' },
] as const;

export const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
] as const;

export const GOOGLE_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  provider: 'ollama',

  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
  ollamaEmbeddingModel: 'nomic-embed-text',

  aiGatewayModel: 'google/gemini-2.5-flash-lite',
  aiGatewayEmbeddingModel: 'openai/text-embedding-3-small',

  openaiModel: 'gpt-4.1-nano',
  openaiEmbeddingModel: 'text-embedding-3-small',
  anthropicModel: 'claude-sonnet-4-5-20250929',
  googleModel: 'gemini-2.5-flash',
  openaiCompatibleBaseUrl: '',
  openaiCompatibleModel: '',

  spoilerProtection: true,
  maxContextChunks: 10,
  indexingMode: 'on-demand',

  xrayEnabled: true,
  recapEnabled: true,
  recapMaxChapters: 0, // 0 = all chapters
  recapDetailLevel: 'normal',
};
