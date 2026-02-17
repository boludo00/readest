import type { LanguageModel, EmbeddingModel } from 'ai';

export type AIProviderName =
  | 'ollama'
  | 'ai-gateway'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible';

export interface AIProvider {
  id: AIProviderName;
  name: string;
  requiresAuth: boolean;

  getModel(): LanguageModel;
  getEmbeddingModel(): EmbeddingModel;
  supportsEmbeddings(): boolean;

  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface AISettings {
  enabled: boolean;
  provider: AIProviderName;

  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEmbeddingModel: string;

  aiGatewayApiKey?: string;
  aiGatewayModel?: string;
  aiGatewayCustomModel?: string;
  aiGatewayEmbeddingModel?: string;

  // OpenAI
  openaiApiKey?: string;
  openaiModel?: string;
  openaiEmbeddingModel?: string;

  // Anthropic
  anthropicApiKey?: string;
  anthropicModel?: string;

  // Google Gemini
  googleApiKey?: string;
  googleModel?: string;

  // OpenAI-Compatible (OpenRouter, Together, Groq, etc.)
  openaiCompatibleApiKey?: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleModel?: string;
  openaiCompatibleName?: string;

  spoilerProtection: boolean;
  maxContextChunks: number;
  indexingMode: 'on-demand' | 'background';

  xrayEnabled: boolean;
  recapEnabled: boolean;
  recapMaxChapters: number; // 0 = all chapters, N = last N chapters
  recapDetailLevel: 'brief' | 'normal' | 'detailed';

  // Per-feature model overrides (empty string = use main model)
  perFeatureModels?: boolean;
  xrayModelOverride?: string;
  recapModelOverride?: string;
  chatModelOverride?: string;
}

export type AIFeature = 'xray' | 'recap' | 'chat';

// --- X-Ray Entity Types ---

export type EntityType = 'character' | 'location' | 'theme' | 'term' | 'event';

export interface DescriptionFragment {
  text: string;
  maxSection: number;
}

export interface BookEntity {
  id: string;
  bookHash: string;
  name: string;
  type: EntityType;
  aliases: string[];
  role: string;
  description: string;
  descriptionFragments: DescriptionFragment[];
  connections: string[];
  importance: 'major' | 'minor';
  firstMentionSection: number;
  firstMentionPage: number;
  sectionAppearances: number[];
}

export interface BookEntityIndex {
  bookHash: string;
  extractionModel: string;
  lastUpdated: number;
  version: number;
  processedSections: number[];
  totalSections: number;
  complete: boolean;
  progressPercent: number;
  maxExtractedSection?: number;
  /** @deprecated Use maxExtractedSection instead */
  maxExtractedPage?: number;
}

export interface EntityProfile {
  entity: BookEntity;
  scopedDescription: string;
  visibleConnections: string[];
  chaptersAppearing: string[];
}

export interface EntityExtractionProgress {
  current: number;
  total: number;
  phase: 'extracting' | 'storing';
}

// --- Recap Types ---

export interface BookRecap {
  id: string;
  bookHash: string;
  progressPercent: number;
  recap: string;
  model: string;
  createdAt: number;
  detailLevel?: 'brief' | 'normal' | 'detailed';
}

export interface TextChunk {
  id: string;
  bookHash: string;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  embedding?: number[];
  pageNumber: number; // page number using Readest's 1500 chars/page formula
}

export interface ScoredChunk extends TextChunk {
  score: number;
  searchMethod: 'bm25' | 'vector' | 'hybrid';
}

export interface BookIndexMeta {
  bookHash: string;
  bookTitle: string;
  authorName: string;
  totalSections: number;
  totalChunks: number;
  embeddingModel: string;
  lastUpdated: number;
}

export interface IndexingState {
  bookHash: string;
  status: 'idle' | 'indexing' | 'complete' | 'error';
  progress: number;
  chunksProcessed: number;
  totalChunks: number;
  error?: string;
}

export interface EmbeddingProgress {
  current: number;
  total: number;
  phase: 'chunking' | 'embedding' | 'indexing';
}

// stored AI conversation for a book
export interface AIConversation {
  id: string;
  bookHash: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// single message in an AI conversation
export interface AIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}
