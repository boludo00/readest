import clsx from 'clsx';
import { useRef } from 'react';
import { IoArrowBack } from 'react-icons/io5';
import { PiCloud, PiCloudArrowDown, PiCloudCheck, PiCloudWarning } from 'react-icons/pi';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import WindowButtons from '@/components/WindowButtons';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface StatisticsHeaderProps {
  onGoBack: () => void;
  syncStatus?: SyncStatus;
  lastSyncedAt?: number;
  onSync?: () => void;
}

const formatTimeSince = (timestamp: number): string => {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Synced just now';
  if (diffMin < 60) return `Synced ${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Synced ${diffHr}h ago`;
  return `Synced ${Math.floor(diffHr / 24)}d ago`;
};

const StatisticsHeader: React.FC<StatisticsHeaderProps> = ({
  onGoBack,
  syncStatus = 'idle',
  lastSyncedAt,
  onSync,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { user } = useAuth();
  const { safeAreaInsets } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLightStore();
  const headerRef = useRef<HTMLDivElement>(null);

  const paddingTop = appService?.hasTrafficLight
    ? '44px'
    : `calc(8px + ${safeAreaInsets?.top || 0}px)`;

  const syncLabel =
    syncStatus === 'syncing'
      ? _('Syncing statistics...')
      : syncStatus === 'synced'
        ? lastSyncedAt
          ? formatTimeSince(lastSyncedAt)
          : _('Statistics synced')
        : syncStatus === 'error'
          ? _('Sync failed — tap to retry')
          : _('Sync statistics');

  return (
    <div
      ref={headerRef}
      className='titlebar bg-base-100/80 fixed z-30 flex w-full items-center justify-between py-2 pe-6 ps-4 backdrop-blur-sm'
      style={{ paddingTop }}
    >
      <div className='flex items-center gap-4'>
        <button
          aria-label={_('Go Back')}
          onClick={onGoBack}
          className={clsx('btn btn-ghost h-12 min-h-12 w-12 p-0 sm:h-8 sm:min-h-8 sm:w-8')}
        >
          <IoArrowBack className='text-base-content' />
        </button>
        <h1 className='text-base-content text-lg font-semibold'>{_('Reading Statistics')}</h1>
      </div>

      <div className='flex items-center gap-2'>
        {user && (
          <button
            aria-label={syncLabel}
            title={syncLabel}
            disabled={syncStatus === 'syncing'}
            onClick={onSync}
            className={clsx(
              'flex size-8 items-center justify-center rounded-full transition-colors',
              syncStatus === 'syncing' && 'text-primary cursor-not-allowed',
              syncStatus === 'synced' && 'text-success hover:bg-success/10',
              syncStatus === 'error' && 'text-error hover:bg-error/10',
              syncStatus === 'idle' &&
                'text-base-content/30 hover:bg-base-content/10 hover:text-base-content',
            )}
          >
            {syncStatus === 'syncing' ? (
              <PiCloudArrowDown className='size-5 animate-bounce' />
            ) : syncStatus === 'synced' ? (
              <PiCloudCheck className='size-5' />
            ) : syncStatus === 'error' ? (
              <PiCloudWarning className='size-5' />
            ) : (
              <PiCloud className='size-5' />
            )}
          </button>
        )}
        {appService?.hasWindowBar && (
          <WindowButtons
            headerRef={headerRef}
            showMinimize={!isTrafficLightVisible}
            showMaximize={!isTrafficLightVisible}
            showClose={!isTrafficLightVisible}
            onClose={onGoBack}
          />
        )}
      </div>
    </div>
  );
};

export default StatisticsHeader;
