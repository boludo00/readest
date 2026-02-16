'use client';

import React from 'react';
import { AlertTriangleIcon, SettingsIcon } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import type { AISettings } from '@/services/ai/types';
import { getAIConfigError } from '@/services/ai/utils/providerHelpers';

interface AIConfigBannerProps {
  settings: AISettings;
}

/**
 * Displays a warning banner when the AI provider is missing required configuration
 * (e.g. API key, endpoint URL). Shows a user-friendly message and a link to Settings.
 */
const AIConfigBanner: React.FC<AIConfigBannerProps> = ({ settings }) => {
  const _ = useTranslation();
  const { setSettingsDialogOpen, setActiveSettingsItemId } = useSettingsStore();
  const error = getAIConfigError(settings);

  if (!error) return null;

  const handleOpenSettings = () => {
    setActiveSettingsItemId('settings.ai');
    setSettingsDialogOpen(true);
  };

  return (
    <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
      <div className='rounded-full bg-amber-500/10 p-3'>
        <AlertTriangleIcon className='size-6 text-amber-500' />
      </div>
      <div>
        <h3 className='text-foreground mb-1 text-sm font-medium'>
          {_('AI Configuration Required')}
        </h3>
        <p className='text-muted-foreground text-xs'>{error}</p>
      </div>
      <button
        type='button'
        onClick={handleOpenSettings}
        className='text-primary hover:text-primary/80 flex items-center gap-1.5 text-xs font-medium transition-colors'
      >
        <SettingsIcon className='size-3.5' />
        {_('Open AI Settings')}
      </button>
    </div>
  );
};

export default AIConfigBanner;
