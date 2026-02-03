import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

import {
  ReadingSession,
  DailyReadingSummary,
  BookStatistics,
  UserStatistics,
  StatisticsConfig,
  ActiveSession,
  ReadingGoal,
  StatisticsData,
  DEFAULT_STATISTICS_CONFIG,
  DEFAULT_USER_STATISTICS,
  DEFAULT_STATISTICS_DATA,
  CURRENT_STATISTICS_VERSION,
} from '@/types/statistics';
import { EnvConfigType } from '@/services/environment';

const STATISTICS_FILENAME = 'statistics.json';

// Helper to get date string in YYYY-MM-DD format (local timezone)
const getDateString = (timestamp: number = Date.now()): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get hour from timestamp (0-23)
const getHour = (timestamp: number): number => {
  return new Date(timestamp).getHours();
};

// Helper to get day of week from timestamp (0=Sunday)
const getDayOfWeek = (timestamp: number): number => {
  return new Date(timestamp).getDay();
};

interface StatisticsStore {
  // State
  sessions: ReadingSession[];
  dailySummaries: Record<string, DailyReadingSummary>;
  bookStats: Record<string, BookStatistics>;
  userStats: UserStatistics;
  config: StatisticsConfig;
  activeSessions: Record<string, ActiveSession>;
  loaded: boolean;

  // Sync state
  lastSyncedAtSessions: number;
  lastSyncedAtGoals: number;
  pendingSyncSessions: ReadingSession[];

  // Session lifecycle
  startSession: (
    bookKey: string,
    bookHash: string,
    metaHash: string | undefined,
    progress: number,
    page: number,
    totalPages: number,
  ) => void;
  updateSessionActivity: (bookKey: string, progress: number, page: number) => void;
  endSession: (bookKey: string, reason: 'closed' | 'idle' | 'switched') => ReadingSession | null;
  endAllSessions: () => void;

  // Data access
  getBookStatistics: (bookHash: string) => BookStatistics | null;
  getDailySummary: (date: string) => DailyReadingSummary | null;
  getSessionsForBook: (bookHash: string, limit?: number) => ReadingSession[];
  getCalendarData: (year: number) => Record<string, number>;
  getRecentSessions: (limit?: number) => ReadingSession[];

  // Statistics computation
  recomputeAllStats: () => void;
  computeStreaks: () => { current: number; longest: number };

  // Goals
  setGoal: (goal: ReadingGoal) => void;
  removeGoal: (goalId: string) => void;
  getGoalProgress: (goal: ReadingGoal) => number;

  // Persistence
  loadStatistics: (envConfig: EnvConfigType) => Promise<void>;
  saveStatistics: (envConfig: EnvConfigType) => Promise<void>;

  // Sync
  addPendingSyncSession: (session: ReadingSession) => void;
  clearPendingSyncSessions: () => void;
  mergeSyncedSessions: (syncedSessions: ReadingSession[]) => void;
  mergeSyncedGoals: (syncedGoals: ReadingGoal[]) => void;
  setLastSyncedAtSessions: (timestamp: number) => void;
  setLastSyncedAtGoals: (timestamp: number) => void;

  // Config
  setConfig: (config: Partial<StatisticsConfig>) => void;
}

export const useStatisticsStore = create<StatisticsStore>((set, get) => ({
  sessions: [],
  dailySummaries: {},
  bookStats: {},
  userStats: DEFAULT_USER_STATISTICS,
  config: DEFAULT_STATISTICS_CONFIG,
  activeSessions: {},
  loaded: false,

  // Sync state
  lastSyncedAtSessions: 0,
  lastSyncedAtGoals: 0,
  pendingSyncSessions: [],

  startSession: (bookKey, bookHash, metaHash, progress, page, totalPages) => {
    const { config, activeSessions } = get();
    if (!config.trackingEnabled) return;

    // If there's already an active session for this book key, don't start a new one
    if (activeSessions[bookKey]) {
      return;
    }

    const now = Date.now();
    const session: ActiveSession = {
      bookKey,
      bookHash,
      metaHash,
      startTime: now,
      startProgress: progress,
      startPage: page,
      lastActivityTime: now,
      lastProgress: progress,
      lastPage: page,
      totalPages,
    };

    set((state) => ({
      activeSessions: {
        ...state.activeSessions,
        [bookKey]: session,
      },
    }));

    console.log('[Statistics] Started session for', bookKey, 'at page', page);
  },

  updateSessionActivity: (bookKey, progress, page) => {
    const { activeSessions, config } = get();
    if (!config.trackingEnabled) return;

    const session = activeSessions[bookKey];
    if (!session) return;

    set((state) => ({
      activeSessions: {
        ...state.activeSessions,
        [bookKey]: {
          ...session,
          lastActivityTime: Date.now(),
          lastProgress: progress,
          lastPage: page,
        },
      },
    }));
  },

  endSession: (bookKey, _reason) => {
    const { activeSessions, config, dailySummaries, bookStats } = get();
    if (!config.trackingEnabled) return null;

    const activeSession = activeSessions[bookKey];
    if (!activeSession) return null;

    const now = Date.now();
    const duration = Math.floor((now - activeSession.startTime) / 1000);

    // Don't record sessions shorter than minimum
    if (duration < config.minimumSessionSeconds) {
      set((state) => {
        const newActiveSessions = { ...state.activeSessions };
        delete newActiveSessions[bookKey];
        return { activeSessions: newActiveSessions };
      });
      console.log('[Statistics] Session too short, discarding', duration, 'seconds');
      return null;
    }

    const pagesRead = Math.max(0, activeSession.lastPage - activeSession.startPage);

    const session: ReadingSession = {
      id: uuidv4(),
      bookHash: activeSession.bookHash,
      metaHash: activeSession.metaHash,
      startTime: activeSession.startTime,
      endTime: now,
      duration,
      startProgress: activeSession.startProgress,
      endProgress: activeSession.lastProgress,
      startPage: activeSession.startPage,
      endPage: activeSession.lastPage,
      pagesRead,
      createdAt: now,
      updatedAt: now,
    };

    // Update daily summary
    const dateStr = getDateString(activeSession.startTime);
    const existingSummary = dailySummaries[dateStr];
    const updatedSummary: DailyReadingSummary = existingSummary
      ? {
          ...existingSummary,
          totalDuration: existingSummary.totalDuration + duration,
          totalPages: existingSummary.totalPages + pagesRead,
          sessionsCount: existingSummary.sessionsCount + 1,
          booksRead: existingSummary.booksRead.includes(session.bookHash)
            ? existingSummary.booksRead
            : [...existingSummary.booksRead, session.bookHash],
        }
      : {
          date: dateStr,
          totalDuration: duration,
          totalPages: pagesRead,
          sessionsCount: 1,
          booksRead: [session.bookHash],
        };

    // Update book statistics
    const existingBookStats = bookStats[session.bookHash];
    const updatedBookStats: BookStatistics = existingBookStats
      ? {
          ...existingBookStats,
          totalReadingTime: existingBookStats.totalReadingTime + duration,
          totalSessions: existingBookStats.totalSessions + 1,
          totalPagesRead: existingBookStats.totalPagesRead + pagesRead,
          averageSessionDuration:
            (existingBookStats.totalReadingTime + duration) /
            (existingBookStats.totalSessions + 1),
          averageReadingSpeed:
            (existingBookStats.totalPagesRead + pagesRead) /
            ((existingBookStats.totalReadingTime + duration) / 3600),
          lastReadAt: now,
          completedAt:
            session.endProgress >= 0.99 ? now : existingBookStats.completedAt,
        }
      : {
          bookHash: session.bookHash,
          metaHash: session.metaHash,
          totalReadingTime: duration,
          totalSessions: 1,
          totalPagesRead: pagesRead,
          averageSessionDuration: duration,
          averageReadingSpeed: pagesRead / (duration / 3600) || 0,
          firstReadAt: now,
          lastReadAt: now,
          completedAt: session.endProgress >= 0.99 ? now : undefined,
        };

    set((state) => {
      const newActiveSessions = { ...state.activeSessions };
      delete newActiveSessions[bookKey];

      // Update user stats
      const hour = getHour(activeSession.startTime);
      const dayOfWeek = getDayOfWeek(activeSession.startTime);
      const newReadingByHour = [...state.userStats.readingByHour];
      const newReadingByDayOfWeek = [...state.userStats.readingByDayOfWeek];
      newReadingByHour[hour] = (newReadingByHour[hour] || 0) + duration;
      newReadingByDayOfWeek[dayOfWeek] = (newReadingByDayOfWeek[dayOfWeek] || 0) + duration;

      const newTotalReadingTime = state.userStats.totalReadingTime + duration;
      const newTotalSessions = state.userStats.totalSessions + 1;
      const newTotalPagesRead = state.userStats.totalPagesRead + pagesRead;

      // Count unique books started
      const uniqueBooks = new Set(state.sessions.map((s) => s.bookHash));
      uniqueBooks.add(session.bookHash);

      // Count completed books
      const completedBooks = Object.values({
        ...state.bookStats,
        [session.bookHash]: updatedBookStats,
      }).filter((bs) => bs.completedAt).length;

      return {
        activeSessions: newActiveSessions,
        sessions: [...state.sessions, session],
        dailySummaries: {
          ...state.dailySummaries,
          [dateStr]: updatedSummary,
        },
        bookStats: {
          ...state.bookStats,
          [session.bookHash]: updatedBookStats,
        },
        userStats: {
          ...state.userStats,
          totalReadingTime: newTotalReadingTime,
          totalSessions: newTotalSessions,
          totalPagesRead: newTotalPagesRead,
          totalBooksStarted: uniqueBooks.size,
          totalBooksCompleted: completedBooks,
          averageSessionDuration: newTotalReadingTime / newTotalSessions,
          lastReadDate: dateStr,
          readingByHour: newReadingByHour,
          readingByDayOfWeek: newReadingByDayOfWeek,
        },
      };
    });

    console.log('[Statistics] Ended session for', bookKey, 'duration:', duration, 'seconds');
    return session;
  },

  endAllSessions: () => {
    const { activeSessions, endSession } = get();
    Object.keys(activeSessions).forEach((bookKey) => {
      endSession(bookKey, 'closed');
    });
  },

  getBookStatistics: (bookHash) => {
    return get().bookStats[bookHash] || null;
  },

  getDailySummary: (date) => {
    return get().dailySummaries[date] || null;
  },

  getSessionsForBook: (bookHash, limit = 100) => {
    return get()
      .sessions.filter((s) => s.bookHash === bookHash)
      .slice(-limit);
  },

  getCalendarData: (year) => {
    const { dailySummaries } = get();
    const result: Record<string, number> = {};

    Object.entries(dailySummaries).forEach(([date, summary]) => {
      if (date.startsWith(String(year))) {
        result[date] = summary.totalDuration;
      }
    });

    return result;
  },

  getRecentSessions: (limit = 10) => {
    return get().sessions.slice(-limit).reverse();
  },

  recomputeAllStats: () => {
    const { sessions, config } = get();

    // Reset and recompute everything from sessions
    const dailySummaries: Record<string, DailyReadingSummary> = {};
    const bookStats: Record<string, BookStatistics> = {};
    const readingByHour = new Array(24).fill(0);
    const readingByDayOfWeek = new Array(7).fill(0);
    let totalReadingTime = 0;
    let totalPagesRead = 0;

    sessions.forEach((session) => {
      const dateStr = getDateString(session.startTime);

      // Update daily summary
      if (!dailySummaries[dateStr]) {
        dailySummaries[dateStr] = {
          date: dateStr,
          totalDuration: 0,
          totalPages: 0,
          sessionsCount: 0,
          booksRead: [],
        };
      }
      const summary = dailySummaries[dateStr]!;
      summary.totalDuration += session.duration;
      summary.totalPages += session.pagesRead;
      summary.sessionsCount += 1;
      if (!summary.booksRead.includes(session.bookHash)) {
        summary.booksRead.push(session.bookHash);
      }

      // Update book stats
      if (!bookStats[session.bookHash]) {
        bookStats[session.bookHash] = {
          bookHash: session.bookHash,
          metaHash: session.metaHash,
          totalReadingTime: 0,
          totalSessions: 0,
          totalPagesRead: 0,
          averageSessionDuration: 0,
          averageReadingSpeed: 0,
          firstReadAt: session.startTime,
          lastReadAt: session.endTime,
        };
      }
      const bs = bookStats[session.bookHash]!;
      bs.totalReadingTime += session.duration;
      bs.totalSessions += 1;
      bs.totalPagesRead += session.pagesRead;
      bs.averageSessionDuration = bs.totalReadingTime / bs.totalSessions;
      bs.averageReadingSpeed = bs.totalPagesRead / (bs.totalReadingTime / 3600) || 0;
      bs.lastReadAt = Math.max(bs.lastReadAt, session.endTime);
      bs.firstReadAt = Math.min(bs.firstReadAt, session.startTime);
      if (session.endProgress >= 0.99 && !bs.completedAt) {
        bs.completedAt = session.endTime;
      }

      // Update time distribution
      const hour = getHour(session.startTime);
      const dayOfWeek = getDayOfWeek(session.startTime);
      readingByHour[hour] += session.duration;
      readingByDayOfWeek[dayOfWeek] += session.duration;

      totalReadingTime += session.duration;
      totalPagesRead += session.pagesRead;
    });

    const totalSessions = sessions.length;
    const uniqueBooks = new Set(sessions.map((s) => s.bookHash));
    const completedBooks = Object.values(bookStats).filter((bs) => bs.completedAt).length;

    // Compute streaks
    const { current: currentStreak, longest: longestStreak } = get().computeStreaks();

    // Get last read date
    const sortedDates = Object.keys(dailySummaries).sort();
    const lastReadDate = sortedDates[sortedDates.length - 1] || '';

    // Calculate average daily reading time
    const daysWithReading = Object.keys(dailySummaries).length;
    const averageDailyReadingTime = daysWithReading > 0 ? totalReadingTime / daysWithReading : 0;

    set({
      dailySummaries,
      bookStats,
      userStats: {
        totalReadingTime,
        totalBooksStarted: uniqueBooks.size,
        totalBooksCompleted: completedBooks,
        totalPagesRead,
        totalSessions,
        currentStreak,
        longestStreak,
        lastReadDate,
        averageSessionDuration: totalSessions > 0 ? totalReadingTime / totalSessions : 0,
        averageDailyReadingTime,
        readingByHour,
        readingByDayOfWeek,
      },
      config,
    });
  },

  computeStreaks: () => {
    const { dailySummaries } = get();
    const dates = Object.keys(dailySummaries).sort();

    if (dates.length === 0) {
      return { current: 0, longest: 0 };
    }

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    const today = getDateString();
    const yesterday = getDateString(Date.now() - 24 * 60 * 60 * 1000);

    // Check if user read today or yesterday for current streak
    const lastReadDate = dates[dates.length - 1];
    if (lastReadDate === today || lastReadDate === yesterday) {
      currentStreak = 1;

      // Count backwards from last read date
      for (let i = dates.length - 2; i >= 0; i--) {
        const currentDate = new Date(dates[i]!);
        const nextDate = new Date(dates[i + 1]!);
        const diffDays = Math.floor(
          (nextDate.getTime() - currentDate.getTime()) / (24 * 60 * 60 * 1000),
        );

        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < dates.length; i++) {
      const currentDate = new Date(dates[i]!);
      const prevDate = new Date(dates[i - 1]!);
      const diffDays = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    return { current: currentStreak, longest: longestStreak };
  },

  setGoal: (goal) => {
    set((state) => ({
      config: {
        ...state.config,
        goals: [
          ...state.config.goals.filter((g) => g.id !== goal.id),
          goal,
        ],
      },
    }));
  },

  removeGoal: (goalId) => {
    set((state) => ({
      config: {
        ...state.config,
        goals: state.config.goals.filter((g) => g.id !== goalId),
      },
    }));
  },

  getGoalProgress: (goal) => {
    const { dailySummaries, bookStats } = get();
    const now = new Date();
    let startDate: Date;

    switch (goal.type) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const startDateStr = getDateString(startDate.getTime());

    switch (goal.unit) {
      case 'minutes': {
        let totalMinutes = 0;
        Object.entries(dailySummaries).forEach(([date, summary]) => {
          if (date >= startDateStr) {
            totalMinutes += summary.totalDuration / 60;
          }
        });
        return totalMinutes;
      }
      case 'pages': {
        let totalPages = 0;
        Object.entries(dailySummaries).forEach(([date, summary]) => {
          if (date >= startDateStr) {
            totalPages += summary.totalPages;
          }
        });
        return totalPages;
      }
      case 'books': {
        const booksCompletedInPeriod = Object.values(bookStats).filter(
          (bs) => bs.completedAt && bs.completedAt >= startDate.getTime(),
        ).length;
        return booksCompletedInPeriod;
      }
    }
  },

  loadStatistics: async (envConfig) => {
    // Check if we already have sessions in memory that would be lost
    const currentSessions = get().sessions;
    if (currentSessions.length > 0) {
      console.warn('[Statistics] WARNING: loadStatistics called with', currentSessions.length, 'sessions in memory!');
    }

    try {
      const appService = await envConfig.getAppService();
      let data: StatisticsData;

      if (await appService.exists(STATISTICS_FILENAME, 'Settings')) {
        const content = await appService.readFile(STATISTICS_FILENAME, 'Settings', 'text');
        data = JSON.parse(content as string) as StatisticsData;
        console.log('[Statistics] Loaded from file:', data.sessions?.length || 0, 'sessions');
      } else {
        data = DEFAULT_STATISTICS_DATA;
        console.log('[Statistics] No file found, using defaults');
      }

      set({
        sessions: data.sessions || [],
        dailySummaries: data.dailySummaries || {},
        bookStats: data.bookStats || {},
        userStats: { ...DEFAULT_USER_STATISTICS, ...data.userStats },
        config: { ...DEFAULT_STATISTICS_CONFIG, ...data.config },
        loaded: true,
      });

      // Migration: recompute all stats if version is outdated
      // Version 2 fixed timezone bug - aggregated data needs recalculation
      const dataVersion = data.version || 1;
      if (dataVersion < CURRENT_STATISTICS_VERSION && get().sessions.length > 0) {
        console.log('[Statistics] Migrating from version', dataVersion, 'to', CURRENT_STATISTICS_VERSION);
        get().recomputeAllStats();
        // Save immediately to persist the migration
        get().saveStatistics(envConfig);
        console.log('[Statistics] Migration complete');
      }

      // Recompute streaks on load
      const { current, longest } = get().computeStreaks();
      set((state) => ({
        userStats: {
          ...state.userStats,
          currentStreak: current,
          longestStreak: longest,
        },
      }));

      console.log('[Statistics] Loaded statistics data, now have', get().sessions.length, 'sessions');
    } catch (error) {
      console.error('[Statistics] Failed to load statistics:', error);
      set({
        ...DEFAULT_STATISTICS_DATA,
        loaded: true,
      });
    }
  },

  saveStatistics: async (envConfig) => {
    try {
      const appService = await envConfig.getAppService();
      const { sessions, dailySummaries, bookStats, userStats, config } = get();

      // Safeguard: don't overwrite existing sessions with empty data
      if (sessions.length === 0 && await appService.exists(STATISTICS_FILENAME, 'Settings')) {
        const existingContent = await appService.readFile(STATISTICS_FILENAME, 'Settings', 'text');
        const existingData = JSON.parse(existingContent as string) as StatisticsData;
        if (existingData.sessions && existingData.sessions.length > 0) {
          console.error('[Statistics] ABORT: Refusing to overwrite', existingData.sessions.length, 'sessions with empty data!');
          return;
        }
      }

      console.log('[Statistics] Saving with', sessions.length, 'sessions:',
        sessions.map(s => `${s.bookHash.slice(0,8)}:${s.duration}s`).join(', '));

      const data: StatisticsData = {
        version: CURRENT_STATISTICS_VERSION,
        sessions,
        dailySummaries,
        bookStats,
        userStats,
        config,
        lastUpdated: Date.now(),
      };

      const jsonContent = JSON.stringify(data, null, 2);
      console.log('[Statistics] Writing', jsonContent.length, 'bytes to', STATISTICS_FILENAME);

      await appService.writeFile(
        STATISTICS_FILENAME,
        'Settings',
        jsonContent,
      );

      // Verify the write by reading it back
      if (await appService.exists(STATISTICS_FILENAME, 'Settings')) {
        const verifyContent = await appService.readFile(STATISTICS_FILENAME, 'Settings', 'text');
        const verifyData = JSON.parse(verifyContent as string) as StatisticsData;
        console.log('[Statistics] Verified save:', verifyData.sessions?.length || 0, 'sessions in file');
        if (verifyData.sessions?.length !== sessions.length) {
          console.error('[Statistics] MISMATCH! Saved', sessions.length, 'but file has', verifyData.sessions?.length);
        }
      }

      console.log('[Statistics] Saved statistics data successfully');
    } catch (error) {
      console.error('[Statistics] Failed to save statistics:', error);
    }
  },

  setConfig: (configUpdate) => {
    set((state) => ({
      config: {
        ...state.config,
        ...configUpdate,
      },
    }));
  },

  addPendingSyncSession: (session) => {
    set((state) => ({
      pendingSyncSessions: [...state.pendingSyncSessions, session],
    }));
  },

  clearPendingSyncSessions: () => {
    set({ pendingSyncSessions: [] });
  },

  mergeSyncedSessions: (syncedSessions) => {
    const { sessions } = get();
    const sessionIds = new Set(sessions.map((s) => s.id));

    // Only add sessions that don't already exist locally
    const newSessions = syncedSessions.filter((s) => !sessionIds.has(s.id));

    if (newSessions.length > 0) {
      console.log('[Statistics] Merging', newSessions.length, 'new sessions from cloud');
      set((state) => ({
        sessions: [...state.sessions, ...newSessions].sort((a, b) => a.startTime - b.startTime),
      }));

      // Recompute stats after merge
      get().recomputeAllStats();
    }
  },

  mergeSyncedGoals: (syncedGoals) => {
    const { config } = get();

    // Merge goals: update existing, add new
    const updatedGoals = [...config.goals];
    for (const syncedGoal of syncedGoals) {
      const existingIndex = updatedGoals.findIndex((g) => g.id === syncedGoal.id);
      if (existingIndex >= 0) {
        // Update existing goal if synced is newer
        const existing = updatedGoals[existingIndex]!;
        if (syncedGoal.createdAt > existing.createdAt) {
          updatedGoals[existingIndex] = syncedGoal;
        }
      } else {
        // Add new goal
        updatedGoals.push(syncedGoal);
      }
    }

    if (updatedGoals.length !== config.goals.length || syncedGoals.length > 0) {
      console.log('[Statistics] Merged goals, now have', updatedGoals.length, 'goals');
      set((state) => ({
        config: {
          ...state.config,
          goals: updatedGoals,
        },
      }));
    }
  },

  setLastSyncedAtSessions: (timestamp) => {
    set({ lastSyncedAtSessions: timestamp });
  },

  setLastSyncedAtGoals: (timestamp) => {
    set({ lastSyncedAtGoals: timestamp });
  },
}));
