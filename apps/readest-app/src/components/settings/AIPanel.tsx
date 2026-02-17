import clsx from 'clsx';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PiCheckCircle, PiWarningCircle, PiArrowsClockwise, PiSpinner } from 'react-icons/pi';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { getAIProvider } from '@/services/ai/providers';
import {
  DEFAULT_AI_SETTINGS,
  GATEWAY_MODELS,
  MODEL_PRICING,
  OPENAI_MODELS,
  OPENAI_EMBEDDING_MODELS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
} from '@/services/ai/constants';
import type { AISettings, AIProviderName } from '@/services/ai/types';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';
type CustomModelStatus = 'idle' | 'validating' | 'valid' | 'invalid';

const CUSTOM_MODEL_VALUE = '__custom__';

interface ModelOption {
  id: string;
  label: string;
  inputCost: string;
  outputCost: string;
}

const PROVIDER_OPTIONS: { id: AIProviderName; label: string }[] = [
  { id: 'ollama', label: 'Ollama (Local)' },
  { id: 'ai-gateway', label: 'AI Gateway (Cloud)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openai-compatible', label: 'OpenAI Compatible' },
];

const getGatewayModelOptions = (): ModelOption[] => [
  {
    id: GATEWAY_MODELS.GEMINI_FLASH_LITE,
    label: 'Gemini 2.5 Flash Lite',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GEMINI_FLASH_LITE]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GEMINI_FLASH_LITE]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.GPT_5_NANO,
    label: 'GPT-5 Nano',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GPT_5_NANO]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GPT_5_NANO]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.LLAMA_4_SCOUT,
    label: 'Llama 4 Scout',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.LLAMA_4_SCOUT]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.LLAMA_4_SCOUT]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.GROK_4_1_FAST,
    label: 'Grok 4.1 Fast',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GROK_4_1_FAST]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GROK_4_1_FAST]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.DEEPSEEK_V3_2,
    label: 'DeepSeek V3.2',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.DEEPSEEK_V3_2]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.DEEPSEEK_V3_2]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.QWEN_3_235B,
    label: 'Qwen 3 235B',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.QWEN_3_235B]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.QWEN_3_235B]?.output ?? '?',
  },
];

const AIPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  const aiSettings: AISettings = settings?.aiSettings ?? DEFAULT_AI_SETTINGS;

  const [enabled, setEnabled] = useState(aiSettings.enabled);
  const [provider, setProvider] = useState<AIProviderName>(aiSettings.provider);

  // Ollama state
  const [ollamaUrl, setOllamaUrl] = useState(aiSettings.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(aiSettings.ollamaModel);
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState(aiSettings.ollamaEmbeddingModel);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  // AI Gateway state
  const [gatewayKey, setGatewayKey] = useState(aiSettings.aiGatewayApiKey ?? '');
  const savedCustomModel = aiSettings.aiGatewayCustomModel ?? '';
  const savedModel = aiSettings.aiGatewayModel ?? DEFAULT_AI_SETTINGS.aiGatewayModel ?? '';
  const isCustomModelSaved = savedCustomModel.length > 0;
  const [selectedGatewayModel, setSelectedGatewayModel] = useState(
    isCustomModelSaved ? CUSTOM_MODEL_VALUE : savedModel,
  );
  const [customModelInput, setCustomModelInput] = useState(savedCustomModel);
  const [customModelStatus, setCustomModelStatus] = useState<CustomModelStatus>(
    isCustomModelSaved ? 'valid' : 'idle',
  );
  const [customModelPricing, setCustomModelPricing] = useState<{
    input: string;
    output: string;
  } | null>(isCustomModelSaved ? { input: '?', output: '?' } : null);
  const [customModelError, setCustomModelError] = useState('');

  // OpenAI state
  const [openaiKey, setOpenaiKey] = useState(aiSettings.openaiApiKey ?? '');
  const [openaiModel, setOpenaiModel] = useState(
    aiSettings.openaiModel ?? DEFAULT_AI_SETTINGS.openaiModel ?? 'gpt-4.1-nano',
  );
  const [openaiEmbeddingModel, setOpenaiEmbeddingModel] = useState(
    aiSettings.openaiEmbeddingModel ??
      DEFAULT_AI_SETTINGS.openaiEmbeddingModel ??
      'text-embedding-3-small',
  );

  // Anthropic state
  const [anthropicKey, setAnthropicKey] = useState(aiSettings.anthropicApiKey ?? '');
  const [anthropicModel, setAnthropicModel] = useState(
    aiSettings.anthropicModel ?? DEFAULT_AI_SETTINGS.anthropicModel ?? 'claude-sonnet-4-5-20250929',
  );

  // Google state
  const [googleKey, setGoogleKey] = useState(aiSettings.googleApiKey ?? '');
  const [googleModel, setGoogleModel] = useState(
    aiSettings.googleModel ?? DEFAULT_AI_SETTINGS.googleModel ?? 'gemini-2.5-flash',
  );

  // OpenAI Compatible state
  const [compatKey, setCompatKey] = useState(aiSettings.openaiCompatibleApiKey ?? '');
  const [compatBaseUrl, setCompatBaseUrl] = useState(aiSettings.openaiCompatibleBaseUrl ?? '');
  const [compatModel, setCompatModel] = useState(aiSettings.openaiCompatibleModel ?? '');
  const [compatName, setCompatName] = useState(aiSettings.openaiCompatibleName ?? '');

  // Features state
  const [xrayEnabled, setXrayEnabled] = useState(aiSettings.xrayEnabled ?? true);
  const [recapEnabled, setRecapEnabled] = useState(aiSettings.recapEnabled ?? true);
  const [recapMaxChapters, setRecapMaxChapters] = useState(aiSettings.recapMaxChapters ?? 0);
  const [recapDetailLevel, setRecapDetailLevel] = useState<'brief' | 'normal' | 'detailed'>(
    aiSettings.recapDetailLevel ?? 'normal',
  );

  // Per-feature model overrides
  const [perFeatureModels, setPerFeatureModels] = useState(aiSettings.perFeatureModels ?? false);
  const [xrayModelOverride, setXrayModelOverride] = useState(aiSettings.xrayModelOverride ?? '');
  const [recapModelOverride, setRecapModelOverride] = useState(aiSettings.recapModelOverride ?? '');
  const [chatModelOverride, setChatModelOverride] = useState(aiSettings.chatModelOverride ?? '');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isMounted = useRef(false);
  const gatewayModelOptions = getGatewayModelOptions();

  const localChangeRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAiSetting = useCallback(
    (key: keyof AISettings, value: AISettings[keyof AISettings]) => {
      const currentSettings = useSettingsStore.getState().settings;
      if (!currentSettings) return;
      const currentAiSettings: AISettings = currentSettings.aiSettings ?? DEFAULT_AI_SETTINGS;
      const newAiSettings: AISettings = { ...currentAiSettings, [key]: value };
      const newSettings = { ...currentSettings, aiSettings: newAiSettings };

      localChangeRef.current = true;
      setSettings(newSettings);

      // Debounce disk writes — prevents race when multiple fields change quickly
      // (e.g. switching provider then typing an API key fires two concurrent writes;
      // whichever finishes last wins and may overwrite the other's change)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const latest = useSettingsStore.getState().settings;
        saveSettings(envConfig, latest);
      }, 300);
    },
    [envConfig, setSettings, saveSettings],
  );

  // Flush any pending debounced save on unmount so settings are never lost
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        saveSettings(envConfig, useSettingsStore.getState().settings);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig, saveSettings]);

  const fetchOllamaModels = useCallback(async () => {
    if (!ollamaUrl || !enabled) return;

    setFetchingModels(true);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];

      setOllamaModels(models);
      if (models.length > 0 && !models.includes(ollamaModel)) {
        setOllamaModel(models[0]!);
      }
    } catch (_err) {
      setOllamaModels([]);
    } finally {
      setFetchingModels(false);
    }
  }, [ollamaUrl, ollamaModel, enabled]);

  useEffect(() => {
    if (provider === 'ollama' && enabled) {
      fetchOllamaModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, enabled, ollamaUrl]);

  useEffect(() => {
    isMounted.current = true;
  }, []);

  // Sync local state when store changes externally (e.g. loadSettings, sync)
  useEffect(() => {
    if (!isMounted.current) return;
    if (localChangeRef.current) {
      localChangeRef.current = false;
      return;
    }
    setEnabled(aiSettings.enabled);
    setProvider(aiSettings.provider);
    setOllamaUrl(aiSettings.ollamaBaseUrl);
    setOllamaModel(aiSettings.ollamaModel);
    setOllamaEmbeddingModel(aiSettings.ollamaEmbeddingModel);
    setGatewayKey(aiSettings.aiGatewayApiKey ?? '');
    setOpenaiKey(aiSettings.openaiApiKey ?? '');
    setOpenaiModel(aiSettings.openaiModel ?? DEFAULT_AI_SETTINGS.openaiModel ?? '');
    setOpenaiEmbeddingModel(
      aiSettings.openaiEmbeddingModel ?? DEFAULT_AI_SETTINGS.openaiEmbeddingModel ?? '',
    );
    setAnthropicKey(aiSettings.anthropicApiKey ?? '');
    setAnthropicModel(aiSettings.anthropicModel ?? DEFAULT_AI_SETTINGS.anthropicModel ?? '');
    setGoogleKey(aiSettings.googleApiKey ?? '');
    setGoogleModel(aiSettings.googleModel ?? DEFAULT_AI_SETTINGS.googleModel ?? '');
    setCompatKey(aiSettings.openaiCompatibleApiKey ?? '');
    setCompatBaseUrl(aiSettings.openaiCompatibleBaseUrl ?? '');
    setCompatModel(aiSettings.openaiCompatibleModel ?? '');
    setCompatName(aiSettings.openaiCompatibleName ?? '');
    setXrayEnabled(aiSettings.xrayEnabled ?? true);
    setRecapEnabled(aiSettings.recapEnabled ?? true);
    setRecapMaxChapters(aiSettings.recapMaxChapters ?? 0);
    setRecapDetailLevel(aiSettings.recapDetailLevel ?? 'normal');
    setPerFeatureModels(aiSettings.perFeatureModels ?? false);
    setXrayModelOverride(aiSettings.xrayModelOverride ?? '');
    setRecapModelOverride(aiSettings.recapModelOverride ?? '');
    setChatModelOverride(aiSettings.chatModelOverride ?? '');
    const newSavedCustom = aiSettings.aiGatewayCustomModel ?? '';
    const newIsCustom = newSavedCustom.length > 0;
    setSelectedGatewayModel(
      newIsCustom
        ? CUSTOM_MODEL_VALUE
        : (aiSettings.aiGatewayModel ?? DEFAULT_AI_SETTINGS.aiGatewayModel ?? ''),
    );
    setCustomModelInput(newSavedCustom);
    if (newIsCustom) setCustomModelStatus('valid');
  }, [aiSettings]);

  // Auto-save effects
  useEffect(() => {
    if (!isMounted.current) return;
    if (enabled !== aiSettings.enabled) saveAiSetting('enabled', enabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (provider !== aiSettings.provider) saveAiSetting('provider', provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // Ollama auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaUrl !== aiSettings.ollamaBaseUrl) saveAiSetting('ollamaBaseUrl', ollamaUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaUrl]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaModel !== aiSettings.ollamaModel) saveAiSetting('ollamaModel', ollamaModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaEmbeddingModel !== aiSettings.ollamaEmbeddingModel)
      saveAiSetting('ollamaEmbeddingModel', ollamaEmbeddingModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaEmbeddingModel]);

  // AI Gateway auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (gatewayKey !== (aiSettings.aiGatewayApiKey ?? ''))
      saveAiSetting('aiGatewayApiKey', gatewayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayKey]);

  // OpenAI auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (openaiKey !== (aiSettings.openaiApiKey ?? '')) saveAiSetting('openaiApiKey', openaiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openaiKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (openaiModel !== (aiSettings.openaiModel ?? '')) saveAiSetting('openaiModel', openaiModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openaiModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (openaiEmbeddingModel !== (aiSettings.openaiEmbeddingModel ?? ''))
      saveAiSetting('openaiEmbeddingModel', openaiEmbeddingModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openaiEmbeddingModel]);

  // Anthropic auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (anthropicKey !== (aiSettings.anthropicApiKey ?? ''))
      saveAiSetting('anthropicApiKey', anthropicKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (anthropicModel !== (aiSettings.anthropicModel ?? ''))
      saveAiSetting('anthropicModel', anthropicModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anthropicModel]);

  // Google auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (googleKey !== (aiSettings.googleApiKey ?? '')) saveAiSetting('googleApiKey', googleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (googleModel !== (aiSettings.googleModel ?? '')) saveAiSetting('googleModel', googleModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleModel]);

  // OpenAI Compatible auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (compatKey !== (aiSettings.openaiCompatibleApiKey ?? ''))
      saveAiSetting('openaiCompatibleApiKey', compatKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (compatBaseUrl !== (aiSettings.openaiCompatibleBaseUrl ?? ''))
      saveAiSetting('openaiCompatibleBaseUrl', compatBaseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatBaseUrl]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (compatModel !== (aiSettings.openaiCompatibleModel ?? ''))
      saveAiSetting('openaiCompatibleModel', compatModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (compatName !== (aiSettings.openaiCompatibleName ?? ''))
      saveAiSetting('openaiCompatibleName', compatName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatName]);

  // Features auto-save
  useEffect(() => {
    if (!isMounted.current) return;
    if (xrayEnabled !== (aiSettings.xrayEnabled ?? true)) saveAiSetting('xrayEnabled', xrayEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrayEnabled]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (recapEnabled !== (aiSettings.recapEnabled ?? true))
      saveAiSetting('recapEnabled', recapEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapEnabled]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (recapMaxChapters !== (aiSettings.recapMaxChapters ?? 0))
      saveAiSetting('recapMaxChapters', recapMaxChapters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapMaxChapters]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (recapDetailLevel !== (aiSettings.recapDetailLevel ?? 'normal'))
      saveAiSetting('recapDetailLevel', recapDetailLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapDetailLevel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (perFeatureModels !== (aiSettings.perFeatureModels ?? false))
      saveAiSetting('perFeatureModels', perFeatureModels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perFeatureModels]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (xrayModelOverride !== (aiSettings.xrayModelOverride ?? ''))
      saveAiSetting('xrayModelOverride', xrayModelOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrayModelOverride]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (recapModelOverride !== (aiSettings.recapModelOverride ?? ''))
      saveAiSetting('recapModelOverride', recapModelOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapModelOverride]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (chatModelOverride !== (aiSettings.chatModelOverride ?? ''))
      saveAiSetting('chatModelOverride', chatModelOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatModelOverride]);

  // Gateway model selection
  const getEffectiveGatewayModelId = useCallback(() => {
    if (selectedGatewayModel === CUSTOM_MODEL_VALUE && customModelStatus === 'valid') {
      return customModelInput;
    }
    return selectedGatewayModel;
  }, [selectedGatewayModel, customModelStatus, customModelInput]);

  useEffect(() => {
    if (!isMounted.current) return;
    const effectiveModel = getEffectiveGatewayModelId();
    if (effectiveModel !== aiSettings.aiGatewayModel) {
      saveAiSetting('aiGatewayModel', effectiveModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGatewayModel, customModelStatus, customModelInput]);

  useEffect(() => {
    if (!isMounted.current) return;
    const customToSave =
      selectedGatewayModel === CUSTOM_MODEL_VALUE && customModelStatus === 'valid'
        ? customModelInput
        : '';
    if (customToSave !== (aiSettings.aiGatewayCustomModel ?? '')) {
      saveAiSetting('aiGatewayCustomModel', customToSave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGatewayModel, customModelStatus, customModelInput]);

  const handleGatewayModelChange = (value: string) => {
    setSelectedGatewayModel(value);
    if (value !== CUSTOM_MODEL_VALUE) {
      setCustomModelStatus('idle');
      setCustomModelError('');
      setCustomModelPricing(null);
    }
  };

  const validateCustomModel = async () => {
    if (!customModelInput.trim()) {
      setCustomModelError(_('Please enter a model ID'));
      setCustomModelStatus('invalid');
      return;
    }

    setCustomModelStatus('validating');
    setCustomModelError('');

    try {
      const testSettings: AISettings = {
        ...aiSettings,
        provider: 'ai-gateway',
        aiGatewayApiKey: gatewayKey,
        aiGatewayModel: customModelInput.trim(),
      };

      const aiProvider = getAIProvider(testSettings);
      const isAvailable = await aiProvider.isAvailable();

      if (isAvailable) {
        setCustomModelStatus('valid');
        setCustomModelPricing({ input: '?', output: '?' });
      } else {
        setCustomModelStatus('invalid');
        setCustomModelError(_('Model not available or invalid'));
      }
    } catch (_err) {
      setCustomModelStatus('invalid');
      setCustomModelError(_('Failed to validate model'));
    }
  };

  const buildTestSettings = (): AISettings => {
    const base = { ...aiSettings, provider };

    switch (provider) {
      case 'ollama':
        return { ...base, ollamaBaseUrl: ollamaUrl, ollamaModel, ollamaEmbeddingModel };
      case 'ai-gateway':
        return {
          ...base,
          aiGatewayApiKey: gatewayKey,
          aiGatewayModel: getEffectiveGatewayModelId(),
        };
      case 'openai':
        return { ...base, openaiApiKey: openaiKey, openaiModel, openaiEmbeddingModel };
      case 'anthropic':
        return { ...base, anthropicApiKey: anthropicKey, anthropicModel };
      case 'google':
        return { ...base, googleApiKey: googleKey, googleModel };
      case 'openai-compatible':
        return {
          ...base,
          openaiCompatibleApiKey: compatKey,
          openaiCompatibleBaseUrl: compatBaseUrl,
          openaiCompatibleModel: compatModel,
          openaiCompatibleName: compatName,
        };
      default:
        return base;
    }
  };

  const handleTestConnection = async () => {
    if (!enabled) return;
    setConnectionStatus('testing');
    setErrorMessage('');

    try {
      const testSettings = buildTestSettings();
      const aiProvider = getAIProvider(testSettings);
      const isHealthy = await aiProvider.healthCheck();
      if (isHealthy) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setErrorMessage(
          provider === 'ollama'
            ? _("Couldn't connect to Ollama. Is it running?")
            : _('Invalid API key or connection failed'),
        );
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage((error as Error).message || _('Connection failed'));
    }
  };

  const disabledSection = !enabled ? 'opacity-50 pointer-events-none select-none' : '';

  // Build model options for current provider (used by per-feature overrides)
  const getModelOptionsForProvider = useCallback((): { id: string; label: string }[] => {
    switch (provider) {
      case 'ollama':
        return ollamaModels.map((m) => ({ id: m, label: m }));
      case 'ai-gateway':
        return gatewayModelOptions.map((m) => ({ id: m.id, label: m.label }));
      case 'openai':
        return OPENAI_MODELS.map((m) => ({ id: m.id, label: m.label }));
      case 'anthropic':
        return ANTHROPIC_MODELS.map((m) => ({ id: m.id, label: m.label }));
      case 'google':
        return GOOGLE_MODELS.map((m) => ({ id: m.id, label: m.label }));
      case 'openai-compatible':
        return compatModel ? [{ id: compatModel, label: compatModel }] : [];
      default:
        return [];
    }
  }, [provider, ollamaModels, gatewayModelOptions, compatModel]);

  const renderNoEmbeddingsNote = () => (
    <div className='config-item !h-auto py-3'>
      <span className='text-base-content/60 text-xs'>
        {_('Embeddings not available — BM25 keyword search will be used for RAG')}
      </span>
    </div>
  );

  return (
    <div className='my-4 w-full space-y-6'>
      <div className='w-full'>
        <h2 className='mb-2 font-medium'>{_('AI Assistant')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <span>{_('Enable AI Assistant')}</span>
              <input
                type='checkbox'
                className='toggle'
                checked={enabled}
                onChange={() => setEnabled(!enabled)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Provider')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
              <span>{_('AI Provider')}</span>
              <select
                className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                value={provider}
                onChange={(e) => setProvider(e.target.value as AIProviderName)}
                disabled={!enabled}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {provider === 'ollama' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('Ollama Configuration')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <div className='flex w-full items-center justify-between'>
                  <span>{_('Server URL')}</span>
                  <button
                    className='btn btn-ghost btn-xs'
                    onClick={fetchOllamaModels}
                    disabled={!enabled || fetchingModels}
                    title={_('Refresh Models')}
                  >
                    <PiArrowsClockwise className='size-4' />
                  </button>
                </div>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder='http://127.0.0.1:11434'
                  disabled={!enabled}
                />
              </div>
              {ollamaModels.length > 0 ? (
                <>
                  <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                    <span>{_('AI Model')}</span>
                    <select
                      className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      disabled={!enabled}
                    >
                      {ollamaModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                    <span>{_('Embedding Model')}</span>
                    <select
                      className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                      value={ollamaEmbeddingModel}
                      onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                      disabled={!enabled}
                    >
                      {ollamaModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : !fetchingModels ? (
                <div className='config-item'>
                  <span className='text-warning text-sm'>{_('No models detected')}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {provider === 'ai-gateway' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('AI Gateway Configuration')}</h2>
          <p className='text-base-content/70 mb-3 text-sm'>
            {_(
              'Choose from a selection of high-quality, economical AI models. You can also bring your own model by selecting "Custom Model" below.',
            )}
          </p>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <div className='flex w-full items-center justify-between'>
                  <span>{_('API Key')}</span>
                  <a
                    href='https://vercel.com/docs/ai/ai-gateway'
                    target='_blank'
                    rel='noopener noreferrer'
                    className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                  >
                    {_('Get Key')}
                  </a>
                </div>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={gatewayKey}
                  onChange={(e) => setGatewayKey(e.target.value)}
                  placeholder='vck_...'
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Model')}</span>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={selectedGatewayModel}
                  onChange={(e) => handleGatewayModelChange(e.target.value)}
                  disabled={!enabled}
                >
                  {gatewayModelOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} — ${opt.inputCost}/M in, ${opt.outputCost}/M out
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>{_('Custom Model...')}</option>
                </select>
              </div>

              {selectedGatewayModel === CUSTOM_MODEL_VALUE && (
                <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                  <span>{_('Custom Model ID')}</span>
                  <div className='flex w-full gap-2'>
                    <input
                      type='text'
                      className='input input-bordered input-sm flex-1'
                      value={customModelInput}
                      onChange={(e) => {
                        setCustomModelInput(e.target.value);
                        setCustomModelStatus('idle');
                        setCustomModelError('');
                      }}
                      placeholder='provider/model-name'
                      disabled={!enabled}
                    />
                    <button
                      className='btn btn-outline btn-sm'
                      onClick={validateCustomModel}
                      disabled={!enabled || customModelStatus === 'validating'}
                    >
                      {customModelStatus === 'validating' ? (
                        <PiSpinner className='size-4 animate-spin' />
                      ) : (
                        _('Validate')
                      )}
                    </button>
                  </div>
                  {customModelStatus === 'valid' && customModelPricing && (
                    <span className='text-success flex items-center gap-1 text-sm'>
                      <PiCheckCircle />
                      {_('Model available')} — ${customModelPricing.input}/M in, $
                      {customModelPricing.output}/M out
                    </span>
                  )}
                  {customModelStatus === 'invalid' && (
                    <span className='text-error text-sm'>{customModelError}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {provider === 'openai' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('OpenAI Configuration')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <div className='flex w-full items-center justify-between'>
                  <span>{_('API Key')}</span>
                  <a
                    href='https://platform.openai.com/api-keys'
                    target='_blank'
                    rel='noopener noreferrer'
                    className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                  >
                    {_('Get Key')}
                  </a>
                </div>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder='sk-...'
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Chat Model')}</span>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  disabled={!enabled}
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Embedding Model')}</span>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={openaiEmbeddingModel}
                  onChange={(e) => setOpenaiEmbeddingModel(e.target.value)}
                  disabled={!enabled}
                >
                  {OPENAI_EMBEDDING_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {provider === 'anthropic' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('Anthropic Configuration')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <div className='flex w-full items-center justify-between'>
                  <span>{_('API Key')}</span>
                  <a
                    href='https://console.anthropic.com/settings/keys'
                    target='_blank'
                    rel='noopener noreferrer'
                    className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                  >
                    {_('Get Key')}
                  </a>
                </div>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder='sk-ant-...'
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Chat Model')}</span>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                  disabled={!enabled}
                >
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {renderNoEmbeddingsNote()}
            </div>
          </div>
        </div>
      )}

      {provider === 'google' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('Google Gemini Configuration')}</h2>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <div className='flex w-full items-center justify-between'>
                  <span>{_('API Key')}</span>
                  <a
                    href='https://aistudio.google.com/apikey'
                    target='_blank'
                    rel='noopener noreferrer'
                    className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                  >
                    {_('Get Key')}
                  </a>
                </div>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={googleKey}
                  onChange={(e) => setGoogleKey(e.target.value)}
                  placeholder={_('API key')}
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Chat Model')}</span>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={googleModel}
                  onChange={(e) => setGoogleModel(e.target.value)}
                  disabled={!enabled}
                >
                  {GOOGLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {renderNoEmbeddingsNote()}
            </div>
          </div>
        </div>
      )}

      {provider === 'openai-compatible' && (
        <div className={clsx('w-full', disabledSection)}>
          <h2 className='mb-2 font-medium'>{_('OpenAI Compatible Configuration')}</h2>
          <p className='text-base-content/70 mb-3 text-sm'>
            {_('Use any OpenAI-compatible endpoint such as OpenRouter, Together AI, or Groq.')}
          </p>
          <div className='card border-base-200 bg-base-100 border shadow'>
            <div className='divide-base-200 divide-y'>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Endpoint URL')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={compatBaseUrl}
                  onChange={(e) => setCompatBaseUrl(e.target.value)}
                  placeholder='https://openrouter.ai/api/v1'
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('API Key')}</span>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={compatKey}
                  onChange={(e) => setCompatKey(e.target.value)}
                  placeholder={_('API key')}
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Model ID')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={compatModel}
                  onChange={(e) => setCompatModel(e.target.value)}
                  placeholder='meta-llama/llama-4-scout'
                  disabled={!enabled}
                />
              </div>
              <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                <span>{_('Display Name (optional)')}</span>
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={compatName}
                  onChange={(e) => setCompatName(e.target.value)}
                  placeholder='OpenRouter'
                  disabled={!enabled}
                />
              </div>
              {renderNoEmbeddingsNote()}
            </div>
          </div>
        </div>
      )}

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Features')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <div>
                <span>{_('X-Ray')}</span>
                <p className='text-base-content/60 text-xs'>
                  {_('Extract and browse characters, locations, and themes')}
                </p>
              </div>
              <input
                type='checkbox'
                className='toggle'
                checked={xrayEnabled}
                onChange={() => setXrayEnabled(!xrayEnabled)}
                disabled={!enabled}
              />
            </div>
            <div className='config-item'>
              <div>
                <span>{_('Recap')}</span>
                <p className='text-base-content/60 text-xs'>
                  {_('Generate reading summaries to get back into the book')}
                </p>
              </div>
              <input
                type='checkbox'
                className='toggle'
                checked={recapEnabled}
                onChange={() => setRecapEnabled(!recapEnabled)}
                disabled={!enabled}
              />
            </div>
            {recapEnabled && (
              <>
                <div className='config-item'>
                  <div>
                    <span>{_('Recap Chapters')}</span>
                    <p className='text-base-content/60 text-xs'>
                      {_('Limit recap to the last N chapters (0 = all)')}
                    </p>
                  </div>
                  <select
                    className='select select-bordered select-sm w-24'
                    value={recapMaxChapters}
                    onChange={(e) => setRecapMaxChapters(Number(e.target.value))}
                    disabled={!enabled}
                  >
                    <option value={0}>{_('All')}</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className='config-item'>
                  <div>
                    <span>{_('Recap Detail')}</span>
                    <p className='text-base-content/60 text-xs'>
                      {_('Control the verbosity of generated recaps')}
                    </p>
                  </div>
                  <select
                    className='select select-bordered select-sm w-24'
                    value={recapDetailLevel}
                    onChange={(e) =>
                      setRecapDetailLevel(e.target.value as 'brief' | 'normal' | 'detailed')
                    }
                    disabled={!enabled}
                  >
                    <option value='brief'>{_('Brief')}</option>
                    <option value='normal'>{_('Normal')}</option>
                    <option value='detailed'>{_('Detailed')}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Model Routing')}</h2>
        <p className='text-base-content/70 mb-3 text-sm'>
          {_(
            'Assign different models to each feature. Use a faster model for chat and a stronger model for entity extraction.',
          )}
        </p>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <div>
                <span>{_('Per-feature models')}</span>
                <p className='text-base-content/60 text-xs'>
                  {_('Use different models for X-Ray, Recap, and Chat')}
                </p>
              </div>
              <input
                type='checkbox'
                className='toggle'
                checked={perFeatureModels}
                onChange={() => setPerFeatureModels(!perFeatureModels)}
                disabled={!enabled}
              />
            </div>
            {perFeatureModels && (
              <>
                <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                  <div>
                    <span>{_('X-Ray Model')}</span>
                    <p className='text-base-content/60 text-xs'>
                      {_(
                        'Entity extraction needs strong reasoning. Recommended: Sonnet, GPT-4.1, Gemini Pro.',
                      )}
                    </p>
                  </div>
                  <select
                    className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                    value={xrayModelOverride}
                    onChange={(e) => setXrayModelOverride(e.target.value)}
                    disabled={!enabled}
                  >
                    <option value=''>{_('Same as main model')}</option>
                    {getModelOptionsForProvider().map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                  <div>
                    <span>{_('Recap Model')}</span>
                    <p className='text-base-content/60 text-xs'>
                      {_(
                        'Summarization benefits from a balanced model. Recommended: Sonnet, GPT-4.1 Mini, Flash.',
                      )}
                    </p>
                  </div>
                  <select
                    className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                    value={recapModelOverride}
                    onChange={(e) => setRecapModelOverride(e.target.value)}
                    disabled={!enabled}
                  >
                    <option value=''>{_('Same as main model')}</option>
                    {getModelOptionsForProvider().map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='config-item !h-auto flex-col !items-start gap-2 py-3'>
                  <div>
                    <span>{_('Chat Model')}</span>
                    <p className='text-base-content/60 text-xs'>
                      {_(
                        'Conversational Q&A works well with fast, cheap models. Recommended: Haiku, Nano, Flash Lite.',
                      )}
                    </p>
                  </div>
                  <select
                    className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                    value={chatModelOverride}
                    onChange={(e) => setChatModelOverride(e.target.value)}
                    disabled={!enabled}
                  >
                    <option value=''>{_('Same as main model')}</option>
                    {getModelOptionsForProvider().map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={clsx('w-full', disabledSection)}>
        <h2 className='mb-2 font-medium'>{_('Connection')}</h2>
        <div className='card border-base-200 bg-base-100 border shadow'>
          <div className='divide-base-200 divide-y'>
            <div className='config-item'>
              <button
                className='btn btn-outline btn-sm'
                onClick={handleTestConnection}
                disabled={!enabled || connectionStatus === 'testing'}
              >
                {_('Test Connection')}
              </button>
              <div>
                {connectionStatus === 'success' && (
                  <span className='text-success flex items-center gap-1 text-sm'>
                    <PiCheckCircle className='size-4 shrink-0' />
                    {_('Connected')}
                  </span>
                )}
                {connectionStatus === 'error' && (
                  <span className='text-error flex items-center gap-1 text-sm'>
                    <PiWarningCircle className='size-4 shrink-0' />
                    {errorMessage || _('Failed')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIPanel;
