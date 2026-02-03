import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useStatisticsStore } from '@/store/statisticsStore';
import {
  DEFAULT_STATISTICS_CONFIG,
  DEFAULT_USER_STATISTICS,
  ReadingSession,
  ReadingGoal,
} from '@/types/statistics';

// Helper to get date string in YYYY-MM-DD format
const getDateString = (timestamp: number = Date.now()): string => {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]!;
};

// Helper to create a date N days ago
const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0); // Normalize to noon to avoid timezone issues
  return date;
};

// Helper to create a date N days in the future
const daysFromNow = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
};

// Helper to set specific hour
const atHour = (date: Date, hour: number): Date => {
  const newDate = new Date(date);
  newDate.setHours(hour, 0, 0, 0);
  return newDate;
};

describe('statisticsStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStatisticsStore.setState({
      sessions: [],
      dailySummaries: {},
      bookStats: {},
      userStats: DEFAULT_USER_STATISTICS,
      config: DEFAULT_STATISTICS_CONFIG,
      activeSessions: {},
      loaded: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session Lifecycle', () => {
    it('should start a new session', () => {
      const store = useStatisticsStore.getState();

      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);

      const state = useStatisticsStore.getState();
      expect(state.activeSessions['book1-123']).toBeDefined();
      expect(state.activeSessions['book1-123']?.bookHash).toBe('book1');
      expect(state.activeSessions['book1-123']?.startPage).toBe(10);
    });

    it('should not start duplicate session for same book', () => {
      const store = useStatisticsStore.getState();

      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      store.startSession('book1-123', 'book1', 'meta1', 0.2, 20, 100);

      const state = useStatisticsStore.getState();
      expect(state.activeSessions['book1-123']?.startPage).toBe(10);
    });

    it('should update session activity', () => {
      const store = useStatisticsStore.getState();

      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(60000); // 1 minute
      store.updateSessionActivity('book1-123', 0.15, 15);

      const state = useStatisticsStore.getState();
      expect(state.activeSessions['book1-123']?.lastPage).toBe(15);
      expect(state.activeSessions['book1-123']?.lastProgress).toBe(0.15);
    });

    it('should end session and record statistics', () => {
      const now = new Date('2024-06-15T14:00:00Z');
      vi.setSystemTime(now);

      const store = useStatisticsStore.getState();
      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);

      vi.advanceTimersByTime(120000); // 2 minutes
      useStatisticsStore.getState().updateSessionActivity('book1-123', 0.2, 20);

      const session = useStatisticsStore.getState().endSession('book1-123', 'closed');

      expect(session).not.toBeNull();
      expect(session?.duration).toBe(120);
      expect(session?.pagesRead).toBe(10);

      const state = useStatisticsStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.activeSessions['book1-123']).toBeUndefined();
    });

    it('should discard sessions shorter than minimum duration', () => {
      const store = useStatisticsStore.getState();

      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(15000); // 15 seconds (below 30s minimum)

      const session = useStatisticsStore.getState().endSession('book1-123', 'closed');

      expect(session).toBeNull();
      const state = useStatisticsStore.getState();
      expect(state.sessions).toHaveLength(0);
    });

    it('should not track when tracking is disabled', () => {
      useStatisticsStore.setState((state) => ({
        config: { ...state.config, trackingEnabled: false },
      }));

      const store = useStatisticsStore.getState();
      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);

      const state = useStatisticsStore.getState();
      expect(state.activeSessions['book1-123']).toBeUndefined();
    });
  });

  describe('Daily Summaries', () => {
    it('should aggregate multiple sessions on the same day', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const store = useStatisticsStore.getState();

      // First session
      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(300000); // 5 minutes
      useStatisticsStore.getState().updateSessionActivity('book1-123', 0.2, 20);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      // Second session
      vi.advanceTimersByTime(3600000); // 1 hour later
      useStatisticsStore.getState().startSession('book1-123', 'book1', 'meta1', 0.2, 20, 100);
      vi.advanceTimersByTime(600000); // 10 minutes
      useStatisticsStore.getState().updateSessionActivity('book1-123', 0.35, 35);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      const state = useStatisticsStore.getState();
      const dateStr = getDateString(today.getTime());
      const summary = state.dailySummaries[dateStr];

      expect(summary).toBeDefined();
      expect(summary?.sessionsCount).toBe(2);
      expect(summary?.totalDuration).toBe(900); // 15 minutes total
      expect(summary?.totalPages).toBe(25); // 10 + 15 pages
    });

    it('should track unique books read per day', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const store = useStatisticsStore.getState();

      // Session for book1
      store.startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      // Session for book2
      useStatisticsStore.getState().startSession('book2-456', 'book2', 'meta2', 0.0, 1, 200);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book2-456', 'closed');

      // Another session for book1 (should not duplicate)
      useStatisticsStore.getState().startSession('book1-123', 'book1', 'meta1', 0.2, 20, 100);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      const state = useStatisticsStore.getState();
      const dateStr = getDateString(today.getTime());
      const summary = state.dailySummaries[dateStr];

      expect(summary?.booksRead).toHaveLength(2);
      expect(summary?.booksRead).toContain('book1');
      expect(summary?.booksRead).toContain('book2');
    });
  });

  describe('Book Statistics', () => {
    it('should accumulate statistics per book', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const store = useStatisticsStore.getState();

      // Multiple sessions for the same book
      for (let i = 0; i < 3; i++) {
        store.startSession('book1-123', 'book1', 'meta1', i * 0.1, i * 10 + 1, 100);
        vi.advanceTimersByTime(300000); // 5 minutes each
        useStatisticsStore.getState().updateSessionActivity('book1-123', (i + 1) * 0.1, (i + 1) * 10);
        useStatisticsStore.getState().endSession('book1-123', 'closed');
        vi.advanceTimersByTime(60000); // Gap between sessions
      }

      const state = useStatisticsStore.getState();
      const bookStats = state.bookStats['book1'];

      expect(bookStats).toBeDefined();
      expect(bookStats?.totalSessions).toBe(3);
      expect(bookStats?.totalReadingTime).toBe(900); // 15 minutes
      expect(bookStats?.averageSessionDuration).toBe(300); // 5 minutes average
    });

    it('should mark book as completed when progress reaches 99%', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const store = useStatisticsStore.getState();

      store.startSession('book1-123', 'book1', 'meta1', 0.95, 95, 100);
      vi.advanceTimersByTime(120000);
      useStatisticsStore.getState().updateSessionActivity('book1-123', 0.99, 99);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      const state = useStatisticsStore.getState();
      expect(state.bookStats['book1']?.completedAt).toBeDefined();
    });
  });

  describe('Streak Calculation', () => {
    it('should calculate current streak correctly', () => {
      // Use fixed dates for reproducibility
      const baseDate = new Date('2024-06-15T12:00:00Z');

      // Simulate reading for 5 consecutive days ending on baseDate
      for (let i = 4; i >= 0; i--) {
        const sessionDate = new Date(baseDate);
        sessionDate.setDate(baseDate.getDate() - i);
        vi.setSystemTime(sessionDate);

        const store = useStatisticsStore.getState();
        store.startSession(`book1-${i}`, 'book1', 'meta1', 0.1, 10, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().endSession(`book1-${i}`, 'closed');
      }

      // Set system time to "today" for streak calculation
      vi.setSystemTime(baseDate);
      const { current, longest } = useStatisticsStore.getState().computeStreaks();
      expect(current).toBe(5);
      expect(longest).toBe(5);
    });

    it('should break streak if a day is missed', () => {
      // Use fixed dates
      const baseDate = new Date('2024-06-15T12:00:00Z');

      // Read 3 days ago, 2 days ago, today (skipped yesterday)
      [3, 2, 0].forEach((daysBack, index) => {
        const sessionDate = new Date(baseDate);
        sessionDate.setDate(baseDate.getDate() - daysBack);
        vi.setSystemTime(sessionDate);

        const store = useStatisticsStore.getState();
        store.startSession(`book1-${index}`, 'book1', 'meta1', 0.1, 10, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().endSession(`book1-${index}`, 'closed');
      });

      vi.setSystemTime(baseDate);
      const { current, longest } = useStatisticsStore.getState().computeStreaks();
      expect(current).toBe(1); // Only today
      expect(longest).toBe(2); // 3 days ago + 2 days ago
    });

    it('should maintain current streak if read yesterday but not today', () => {
      const baseDate = new Date('2024-06-15T12:00:00Z');
      const yesterday = new Date(baseDate);
      yesterday.setDate(baseDate.getDate() - 1);
      const twoDaysAgo = new Date(baseDate);
      twoDaysAgo.setDate(baseDate.getDate() - 2);

      // Read two days ago and yesterday (not today)
      [twoDaysAgo, yesterday].forEach((date, index) => {
        vi.setSystemTime(date);
        const store = useStatisticsStore.getState();
        store.startSession(`book1-${index}`, 'book1', 'meta1', 0.1, 10, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().endSession(`book1-${index}`, 'closed');
      });

      vi.setSystemTime(baseDate);
      const { current } = useStatisticsStore.getState().computeStreaks();
      expect(current).toBe(2); // Yesterday + 2 days ago still counts
    });
  });

  describe('User Statistics', () => {
    it('should track reading by hour of day', () => {
      const today = new Date('2024-06-15T00:00:00Z');

      // Session at 10 AM
      vi.setSystemTime(atHour(today, 10));
      useStatisticsStore.getState().startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(300000);
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      // Session at 10 PM
      vi.setSystemTime(atHour(today, 22));
      useStatisticsStore.getState().startSession('book1-456', 'book1', 'meta1', 0.2, 20, 100);
      vi.advanceTimersByTime(600000);
      useStatisticsStore.getState().endSession('book1-456', 'closed');

      const state = useStatisticsStore.getState();
      expect(state.userStats.readingByHour[10]).toBe(300); // 5 minutes at 10 AM
      expect(state.userStats.readingByHour[22]).toBe(600); // 10 minutes at 10 PM
    });

    it('should track reading by day of week', () => {
      // Find next Monday and Tuesday
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() + ((1 - today.getDay() + 7) % 7 || 7));
      monday.setHours(12, 0, 0, 0);

      const tuesday = new Date(monday);
      tuesday.setDate(monday.getDate() + 1);

      // Session on Monday
      vi.setSystemTime(monday);
      useStatisticsStore.getState().startSession('book1-mon', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(300000);
      useStatisticsStore.getState().endSession('book1-mon', 'closed');

      // Session on Tuesday
      vi.setSystemTime(tuesday);
      useStatisticsStore.getState().startSession('book1-tue', 'book1', 'meta1', 0.2, 20, 100);
      vi.advanceTimersByTime(600000);
      useStatisticsStore.getState().endSession('book1-tue', 'closed');

      const state = useStatisticsStore.getState();
      expect(state.userStats.readingByDayOfWeek[1]).toBe(300); // Monday
      expect(state.userStats.readingByDayOfWeek[2]).toBe(600); // Tuesday
    });

    it('should count unique books started', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const store = useStatisticsStore.getState();

      // Start 3 different books
      ['book1', 'book2', 'book3'].forEach((bookHash, i) => {
        store.startSession(`${bookHash}-${i}`, bookHash, `meta${i}`, 0.1, 10, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().endSession(`${bookHash}-${i}`, 'closed');
      });

      // Read book1 again
      useStatisticsStore.getState().startSession('book1-again', 'book1', 'meta1', 0.2, 20, 100);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book1-again', 'closed');

      const state = useStatisticsStore.getState();
      expect(state.userStats.totalBooksStarted).toBe(3);
    });
  });

  describe('Goals', () => {
    it('should set and track daily reading goal', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const goal: ReadingGoal = {
        id: 'goal1',
        type: 'daily',
        target: 30, // 30 minutes
        unit: 'minutes',
        progress: 0,
        startDate: getDateString(today.getTime()),
        active: true,
        createdAt: today.getTime(),
      };

      useStatisticsStore.getState().setGoal(goal);

      // Read for 20 minutes
      useStatisticsStore.getState().startSession('book1-123', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(1200000); // 20 minutes
      useStatisticsStore.getState().endSession('book1-123', 'closed');

      const progress = useStatisticsStore.getState().getGoalProgress(goal);
      expect(progress).toBe(20); // 20 minutes of 30 minute goal
    });

    it('should track weekly page goal', () => {
      const today = new Date('2024-06-15T10:00:00Z'); // Saturday
      vi.setSystemTime(today);

      const goal: ReadingGoal = {
        id: 'goal2',
        type: 'weekly',
        target: 100, // 100 pages
        unit: 'pages',
        progress: 0,
        startDate: getDateString(today.getTime()),
        active: true,
        createdAt: today.getTime(),
      };

      useStatisticsStore.getState().setGoal(goal);

      // Read 25 pages across multiple sessions
      [1, 2, 3, 4].forEach((session) => {
        useStatisticsStore.getState().startSession(`book1-${session}`, 'book1', 'meta1', 0, session * 6, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().updateSessionActivity(`book1-${session}`, 0.1, session * 6 + 6);
        useStatisticsStore.getState().endSession(`book1-${session}`, 'closed');
      });

      const progress = useStatisticsStore.getState().getGoalProgress(goal);
      expect(progress).toBe(24); // 6 pages * 4 sessions
    });

    it('should track monthly books goal', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      const goal: ReadingGoal = {
        id: 'goal3',
        type: 'monthly',
        target: 4, // 4 books
        unit: 'books',
        progress: 0,
        startDate: getDateString(today.getTime()),
        active: true,
        createdAt: today.getTime(),
      };

      useStatisticsStore.getState().setGoal(goal);

      // Complete 2 books
      ['book1', 'book2'].forEach((bookHash) => {
        useStatisticsStore.getState().startSession(`${bookHash}-final`, bookHash, `meta`, 0.9, 90, 100);
        vi.advanceTimersByTime(60000);
        useStatisticsStore.getState().updateSessionActivity(`${bookHash}-final`, 0.99, 99);
        useStatisticsStore.getState().endSession(`${bookHash}-final`, 'closed');
      });

      const progress = useStatisticsStore.getState().getGoalProgress(goal);
      expect(progress).toBe(2); // 2 books completed
    });

    it('should remove goal', () => {
      const goal: ReadingGoal = {
        id: 'goal-to-remove',
        type: 'daily',
        target: 30,
        unit: 'minutes',
        progress: 0,
        startDate: '2024-06-15',
        active: true,
        createdAt: Date.now(),
      };

      useStatisticsStore.getState().setGoal(goal);
      expect(useStatisticsStore.getState().config.goals).toHaveLength(1);

      useStatisticsStore.getState().removeGoal('goal-to-remove');
      expect(useStatisticsStore.getState().config.goals).toHaveLength(0);
    });
  });

  describe('Recompute Statistics', () => {
    it('should recompute all stats from sessions', () => {
      const today = new Date('2024-06-15T10:00:00Z');
      vi.setSystemTime(today);

      // Create some sessions
      useStatisticsStore.getState().startSession('book1-1', 'book1', 'meta1', 0.0, 1, 100);
      vi.advanceTimersByTime(600000); // 10 minutes
      useStatisticsStore.getState().updateSessionActivity('book1-1', 0.5, 50);
      useStatisticsStore.getState().endSession('book1-1', 'closed');

      // Manually corrupt user stats
      useStatisticsStore.setState((state) => ({
        userStats: { ...state.userStats, totalReadingTime: 0, totalSessions: 0 },
      }));

      // Recompute
      useStatisticsStore.getState().recomputeAllStats();

      const state = useStatisticsStore.getState();
      expect(state.userStats.totalReadingTime).toBe(600);
      expect(state.userStats.totalSessions).toBe(1);
      expect(state.userStats.totalPagesRead).toBe(49);
    });
  });

  describe('Calendar Data', () => {
    it('should return calendar data for a specific year', () => {
      // Create sessions across multiple days in 2024
      ['2024-06-01', '2024-06-15', '2024-06-30'].forEach((dateStr, index) => {
        const date = new Date(`${dateStr}T12:00:00Z`);
        vi.setSystemTime(date);

        useStatisticsStore.getState().startSession(`book1-${index}`, 'book1', 'meta1', 0.1, 10, 100);
        vi.advanceTimersByTime((index + 1) * 60000); // Variable duration
        useStatisticsStore.getState().endSession(`book1-${index}`, 'closed');
      });

      const calendarData = useStatisticsStore.getState().getCalendarData(2024);

      expect(Object.keys(calendarData)).toHaveLength(3);
      expect(calendarData['2024-06-01']).toBe(60);
      expect(calendarData['2024-06-15']).toBe(120);
      expect(calendarData['2024-06-30']).toBe(180);
    });

    it('should not include data from other years', () => {
      // Session in 2024
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
      useStatisticsStore.getState().startSession('book1-2024', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book1-2024', 'closed');

      // Session in 2023
      vi.setSystemTime(new Date('2023-06-15T12:00:00Z'));
      useStatisticsStore.getState().startSession('book1-2023', 'book1', 'meta1', 0.1, 10, 100);
      vi.advanceTimersByTime(60000);
      useStatisticsStore.getState().endSession('book1-2023', 'closed');

      const data2024 = useStatisticsStore.getState().getCalendarData(2024);
      const data2023 = useStatisticsStore.getState().getCalendarData(2023);

      expect(Object.keys(data2024)).toHaveLength(1);
      expect(Object.keys(data2023)).toHaveLength(1);
    });
  });
});
