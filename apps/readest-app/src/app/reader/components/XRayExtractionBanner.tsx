'use client';

import React from 'react';
import { Loader2Icon, XIcon } from 'lucide-react';
import { useXRayStore } from '@/store/xrayStore';
import { useTranslation } from '@/hooks/useTranslation';

interface XRayExtractionBannerProps {
  onCancel?: () => void;
}

const XRayExtractionBanner: React.FC<XRayExtractionBannerProps> = ({ onCancel }) => {
  const _ = useTranslation();
  const { isBackgroundExtracting, extractionProgress } = useXRayStore();
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Reset expanded state when a new extraction starts
  React.useEffect(() => {
    if (isBackgroundExtracting) {
      setIsExpanded(false);
    }
  }, [isBackgroundExtracting]);

  if (!isBackgroundExtracting) return null;

  const progressPercent =
    extractionProgress && extractionProgress.total > 0
      ? Math.round((extractionProgress.current / extractionProgress.total) * 100)
      : 0;

  const phase = extractionProgress?.phase || 'extracting';
  const current = extractionProgress?.current ?? 0;
  const total = extractionProgress?.total ?? 0;

  return (
    <div className='fixed bottom-16 right-4 z-50 flex flex-col items-end gap-1'>
      {/* Expanded detail panel — shown above the pill when clicked */}
      {isExpanded && (
        <div className='bg-base-200 border-base-content/10 mb-1 flex min-w-48 flex-col gap-2 rounded-xl border p-3 shadow-lg'>
          <div className='flex items-center justify-between gap-3'>
            <span className='text-base-content text-xs font-medium'>{_('X-Ray Extraction')}</span>
            <button
              type='button'
              onClick={() => setIsExpanded(false)}
              className='text-base-content/50 hover:text-base-content rounded p-0.5 transition-colors'
            >
              <XIcon className='size-3.5' />
            </button>
          </div>

          <div className='text-base-content/60 text-xs'>
            {phase === 'extracting'
              ? _('Pass {{current}} of {{total}}', { current: current + 1, total })
              : _('Saving...')}
          </div>

          {/* Progress bar */}
          <div className='bg-base-300 h-1.5 w-full overflow-hidden rounded-full'>
            <div
              className='bg-primary h-full transition-all duration-300'
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {onCancel && (
            <button
              type='button'
              onClick={onCancel}
              className='text-error hover:text-error/80 mt-0.5 self-start text-xs transition-colors'
            >
              {_('Cancel extraction')}
            </button>
          )}
        </div>
      )}

      {/* Compact pill — always visible while extracting */}
      <button
        type='button'
        onClick={() => setIsExpanded((v) => !v)}
        className='bg-base-200/90 border-base-content/10 hover:bg-base-200 flex items-center gap-1.5 rounded-full border px-3 py-1.5 shadow-md backdrop-blur-sm transition-colors'
        title={_('X-Ray extraction in progress — click for details')}
      >
        <Loader2Icon className='text-primary size-3.5 animate-spin' />
        <span className='text-base-content text-xs font-medium'>X-Ray</span>
        <span className='text-base-content/60 text-xs'>{progressPercent}%</span>
      </button>
    </div>
  );
};

export default XRayExtractionBanner;
