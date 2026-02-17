'use client';

import { cn } from '@/utils/tailwind';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useStatisticsStore } from '@/store/statisticsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSync } from '@/hooks/useSync';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTranslation } from '@/hooks/useTranslation';
import { navigateToLibrary } from '@/utils/nav';

import BottomNav from '@/components/BottomNav';
import StatisticsHeader, { SyncStatus } from './components/StatisticsHeader';
import StatsOverview from './components/StatsOverview';
import StreakDisplay from './components/StreakDisplay';
import ReadingCalendar from './components/ReadingCalendar';
import TrendChart from './components/TrendChart';
import ReadingTimeline from './components/ReadingTimeline';
import AverageByHour from './components/AverageByHour';
import BookStats from './components/BookStats';

const StatisticsPage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { envConfig, appService } = useEnv();
  const { isAuthReady } = useAuth();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();
  const {
    loadStatistics,
    saveStatistics,
    mergeFromCloud,
    loaded,
    sessions,
    userStats,
    dailySummaries,
    bookStats,
  } = useStatisticsStore();
  const { settings, setSettings } = useSettingsStore();
  const {
    syncingStatistics,
    syncStatistics,
    syncedStatistics,
    syncError,
    useSyncInited,
    lastSyncedAtStatistics,
  } = useSync();

  const osRef = useRef<OverlayScrollbarsComponentRef>(null);
  const containerRef: React.MutableRefObject<HTMLDivElement | null> = useRef(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Initialize to 'synced' immediately if we have a previous sync timestamp
  useEffect(() => {
    if (useSyncInited && lastSyncedAtStatistics > 0) {
      setSyncStatus((prev) => (prev === 'idle' ? 'synced' : prev));
    }
  }, [useSyncInited, lastSyncedAtStatistics]);

  // State machine: idle → syncing → synced | error
  useEffect(() => {
    if (syncingStatistics) {
      setSyncStatus('syncing');
      return;
    }
    setSyncStatus((prev) => {
      if (prev === 'syncing') {
        return syncError ? 'error' : 'synced';
      }
      return prev;
    });
  }, [syncingStatistics, syncError]);

  const handleSync = useCallback(async () => {
    await syncStatistics(undefined, 'both');
  }, [syncStatistics]);

  usePullToRefresh(containerRef, handleSync);

  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [trendRange, setTrendRange] = useState<'week' | 'month' | 'year'>('week');

  useTheme({ systemUIVisible: false });

  // Bootstrap settings into Zustand if the user landed here without visiting the library page.
  // useSync's init guard requires settings.version to be set before it marks itself ready.
  useEffect(() => {
    if (settings.version) return;
    envConfig.getAppService().then((svc) => svc.loadSettings().then(setSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig, settings.version]);

  // Always reload from file when statistics page mounts
  // This ensures we get fresh data even if store was cached (hot reload)
  useEffect(() => {
    loadStatistics(envConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig]);

  // Pull cloud statistics when the page opens (after local file is loaded and auth is ready)
  useEffect(() => {
    if (!loaded || !useSyncInited || !isAuthReady) return;
    syncStatistics(undefined, 'pull');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, useSyncInited, isAuthReady]);

  // Merge cloud statistics when they arrive
  useEffect(() => {
    if (!syncedStatistics?.length) return;
    mergeFromCloud(syncedStatistics);
    saveStatistics(envConfig);
  }, [syncedStatistics, mergeFromCloud, saveStatistics, envConfig]);

  // Save statistics periodically when the page is active
  useEffect(() => {
    if (!loaded) return;

    const saveInterval = setInterval(() => {
      saveStatistics(envConfig);
    }, 60000); // Save every minute

    return () => clearInterval(saveInterval);
  }, [loaded, saveStatistics, envConfig]);

  const handleGoBack = () => {
    saveStatistics(envConfig);
    navigateToLibrary(router);
  };

  if (!appService) {
    return <div className='bg-base-100 full-height' />;
  }

  const isMobile = appService.isMobile;

  return (
    <div
      className={cn(
        'statistics-page bg-base-100 full-height inset-0 flex select-none flex-col overflow-hidden',
        appService.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <StatisticsHeader
        onGoBack={handleGoBack}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAtStatistics}
        onSync={handleSync}
      />

      <OverlayScrollbarsComponent
        defer
        ref={osRef}
        className='flex-1'
        options={{ scrollbars: { autoHide: 'scroll' } }}
        events={{
          initialized: (instance) => {
            const { content } = instance.elements();
            if (content) {
              containerRef.current = content as HTMLDivElement;
            }
          },
        }}
      >
        <div
          className='transform-wrapper mx-auto max-w-4xl space-y-6 px-4 pb-24 pt-16'
          style={{
            paddingTop: `calc(56px + ${safeAreaInsets?.top || 0}px + ${appService.hasTrafficLight ? 24 : 0}px)`,
            paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom))' : '24px',
          }}
        >
          {/* Overview Cards */}
          <StatsOverview stats={userStats} dailySummaries={dailySummaries} />

          {/* Streak Display */}
          <StreakDisplay
            currentStreak={userStats.currentStreak}
            longestStreak={userStats.longestStreak}
            lastReadDate={userStats.lastReadDate}
          />

          {/* Reading Calendar (Heat Map) */}
          <ReadingCalendar
            year={calendarYear}
            dailySummaries={dailySummaries}
            onYearChange={setCalendarYear}
          />

          {/* Reading Timeline */}
          <ReadingTimeline sessions={sessions} />

          {/* Reading Trend Chart */}
          <TrendChart
            dailySummaries={dailySummaries}
            dateRange={trendRange}
            onDateRangeChange={setTrendRange}
          />

          {/* Average Reading by Hour */}
          <AverageByHour readingByHour={userStats.readingByHour} dailySummaries={dailySummaries} />

          {/* Book Statistics */}
          <BookStats bookStats={bookStats} />

          {/* Empty state */}
          {userStats.totalSessions === 0 && (
            <div className='bg-base-200 rounded-xl p-8 text-center'>
              <h3 className='text-base-content mb-2 text-lg font-semibold'>
                {_('No reading data yet')}
              </h3>
              <p className='text-base-content/60 mb-4'>
                {_('Start reading a book to see your statistics here')}
              </p>
              <button className='btn btn-primary' onClick={handleGoBack}>
                {_('Go to Library')}
              </button>
            </div>
          )}
        </div>
      </OverlayScrollbarsComponent>

      {/* Bottom navigation for mobile */}
      {isMobile && <BottomNav />}
    </div>
  );
};

export default StatisticsPage;
