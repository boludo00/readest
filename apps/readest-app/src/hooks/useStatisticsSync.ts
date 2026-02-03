import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSyncContext } from '@/context/SyncContext';
import { useStatisticsStore } from '@/store/statisticsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { transformSessionFromDB, transformGoalFromDB } from '@/utils/transform';
import { DBReadingSession, DBReadingGoal } from '@/types/records';
import { ReadingSession, ReadingGoal } from '@/types/statistics';
import { BookDataRecord } from '@/types/book';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const computeMaxTimestamp = (records: BookDataRecord[]): number => {
  let maxTime = 0;
  for (const rec of records) {
    if (rec.updated_at) {
      const updatedTime = new Date(rec.updated_at).getTime();
      maxTime = Math.max(maxTime, updatedTime);
    }
    if (rec.deleted_at) {
      const deletedTime = new Date(rec.deleted_at).getTime();
      maxTime = Math.max(maxTime, deletedTime);
    }
  }
  return maxTime;
};

export function useStatisticsSync() {
  const { user } = useAuth();
  const { syncClient } = useSyncContext();
  const { settings } = useSettingsStore();

  const {
    config,
    pendingSyncSessions,
    lastSyncedAtSessions,
    lastSyncedAtGoals,
    addPendingSyncSession,
    clearPendingSyncSessions,
    mergeSyncedSessions,
    mergeSyncedGoals,
    setLastSyncedAtSessions,
    setLastSyncedAtGoals,
  } = useStatisticsStore();

  const [syncingSessions, setSyncingSessions] = useState(false);
  const [syncingGoals, setSyncingGoals] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAtInited, setLastSyncedAtInited] = useState(false);

  // Initialize last synced timestamps from settings
  useEffect(() => {
    if (!settings.version) return;
    if (lastSyncedAtInited) return;

    const lastSyncedSessionsAt = settings.lastSyncedAtSessions ?? 0;
    const lastSyncedGoalsAt = settings.lastSyncedAtGoals ?? 0;
    const now = Date.now();

    // Reset to 0 if last sync was more than 3 days ago
    setLastSyncedAtSessions(
      now - lastSyncedSessionsAt > 3 * ONE_DAY_IN_MS ? 0 : lastSyncedSessionsAt - ONE_DAY_IN_MS,
    );
    setLastSyncedAtGoals(
      now - lastSyncedGoalsAt > 3 * ONE_DAY_IN_MS ? 0 : lastSyncedGoalsAt - ONE_DAY_IN_MS,
    );
    setLastSyncedAtInited(true);
  }, [settings, lastSyncedAtInited, setLastSyncedAtSessions, setLastSyncedAtGoals]);

  // Pull sessions from cloud
  const pullSessions = useCallback(async () => {
    if (!user || syncingSessions) return;

    setSyncingSessions(true);
    setSyncError(null);

    try {
      const result = await syncClient.pullChanges(lastSyncedAtSessions + 1, 'sessions');
      const dbSessions = result.sessions;

      if (dbSessions && dbSessions.length > 0) {
        const syncedSessions = dbSessions
          .filter((s) => !s.deleted_at)
          .map((s) => transformSessionFromDB(s as unknown as DBReadingSession));
        mergeSyncedSessions(syncedSessions);

        const maxTime = computeMaxTimestamp(dbSessions);
        setLastSyncedAtSessions(maxTime);

        // Persist to settings
        const currentSettings = useSettingsStore.getState().settings;
        currentSettings.lastSyncedAtSessions = maxTime;
        useSettingsStore.getState().setSettings(currentSettings);

        console.log('[StatisticsSync] Pulled', syncedSessions.length, 'sessions from cloud');
      }
    } catch (err: unknown) {
      console.error('[StatisticsSync] Error pulling sessions:', err);
      if (err instanceof Error) {
        setSyncError(err.message);
      }
    } finally {
      setSyncingSessions(false);
    }
  }, [user, syncingSessions, lastSyncedAtSessions, syncClient, mergeSyncedSessions, setLastSyncedAtSessions]);

  // Push sessions to cloud
  const pushSessions = useCallback(
    async (sessionsToSync?: ReadingSession[]) => {
      if (!user) return;

      const sessionsPayload = sessionsToSync || pendingSyncSessions;
      if (sessionsPayload.length === 0) return;

      setSyncingSessions(true);
      setSyncError(null);

      try {
        await syncClient.pushChanges({ sessions: sessionsPayload });
        clearPendingSyncSessions();
        console.log('[StatisticsSync] Pushed', sessionsPayload.length, 'sessions to cloud');
      } catch (err: unknown) {
        console.error('[StatisticsSync] Error pushing sessions:', err);
        if (err instanceof Error) {
          setSyncError(err.message);
        }
      } finally {
        setSyncingSessions(false);
      }
    },
    [user, pendingSyncSessions, syncClient, clearPendingSyncSessions],
  );

  // Pull goals from cloud
  const pullGoals = useCallback(async () => {
    if (!user || syncingGoals) return;

    setSyncingGoals(true);
    setSyncError(null);

    try {
      const result = await syncClient.pullChanges(lastSyncedAtGoals + 1, 'goals');
      const dbGoals = result.goals;

      if (dbGoals && dbGoals.length > 0) {
        const syncedGoals = dbGoals
          .filter((g) => !g.deleted_at)
          .map((g) => transformGoalFromDB(g as unknown as DBReadingGoal));
        mergeSyncedGoals(syncedGoals);

        const maxTime = computeMaxTimestamp(dbGoals);
        setLastSyncedAtGoals(maxTime);

        // Persist to settings
        const currentSettings = useSettingsStore.getState().settings;
        currentSettings.lastSyncedAtGoals = maxTime;
        useSettingsStore.getState().setSettings(currentSettings);

        console.log('[StatisticsSync] Pulled', syncedGoals.length, 'goals from cloud');
      }
    } catch (err: unknown) {
      console.error('[StatisticsSync] Error pulling goals:', err);
      if (err instanceof Error) {
        setSyncError(err.message);
      }
    } finally {
      setSyncingGoals(false);
    }
  }, [user, syncingGoals, lastSyncedAtGoals, syncClient, mergeSyncedGoals, setLastSyncedAtGoals]);

  // Push goals to cloud
  const pushGoals = useCallback(
    async (goalsToSync?: ReadingGoal[]) => {
      if (!user) return;

      const goalsPayload = goalsToSync || config.goals;
      if (goalsPayload.length === 0) return;

      setSyncingGoals(true);
      setSyncError(null);

      try {
        await syncClient.pushChanges({ goals: goalsPayload });
        console.log('[StatisticsSync] Pushed', goalsPayload.length, 'goals to cloud');
      } catch (err: unknown) {
        console.error('[StatisticsSync] Error pushing goals:', err);
        if (err instanceof Error) {
          setSyncError(err.message);
        }
      } finally {
        setSyncingGoals(false);
      }
    },
    [user, config.goals, syncClient],
  );

  // Full sync - pull then push
  const syncAll = useCallback(async () => {
    if (!user) return;

    // Pull first to get latest from cloud
    await pullSessions();
    await pullGoals();

    // Push any pending sessions
    if (pendingSyncSessions.length > 0) {
      await pushSessions();
    }
  }, [user, pullSessions, pullGoals, pushSessions, pendingSyncSessions.length]);

  // Queue a session for sync
  const queueSessionForSync = useCallback(
    (session: ReadingSession) => {
      if (!user) return;
      addPendingSyncSession(session);
    },
    [user, addPendingSyncSession],
  );

  return {
    syncing: syncingSessions || syncingGoals,
    syncingSessions,
    syncingGoals,
    syncError,
    lastSyncedAtSessions,
    lastSyncedAtGoals,
    isAuthenticated: !!user,
    pullSessions,
    pushSessions,
    pullGoals,
    pushGoals,
    syncAll,
    queueSessionForSync,
  };
}
