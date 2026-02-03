/**
 * Statistics Simulator
 *
 * Utility for generating realistic reading session data for testing
 * statistics calculations over extended periods (months/years).
 *
 * Usage in tests:
 *   import { StatisticsSimulator } from '@/__tests__/helpers/statisticsSimulator';
 *
 *   const simulator = new StatisticsSimulator();
 *   const sessions = simulator.generateYear(2024, { ... });
 *   // Apply sessions to store for testing
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ReadingSession,
  DailyReadingSummary,
  BookStatistics,
  UserStatistics,
  ReadingGoal,
  StatisticsData,
  DEFAULT_STATISTICS_CONFIG,
  DEFAULT_USER_STATISTICS,
} from '@/types/statistics';

// Helper to get date string in YYYY-MM-DD format
const getDateString = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]!;
};

// Helper to get hour from timestamp (0-23)
const getHour = (timestamp: number): number => {
  return new Date(timestamp).getHours();
};

// Helper to get day of week from timestamp (0=Sunday)
const getDayOfWeek = (timestamp: number): number => {
  return new Date(timestamp).getDay();
};

export interface BookProfile {
  bookHash: string;
  metaHash?: string;
  totalPages: number;
  /** Probability 0-1 that this book gets read on any given day */
  readProbability: number;
  /** Average session duration in minutes */
  avgSessionMinutes: number;
  /** Variance in session duration (0-1, where 0.5 = +/- 50%) */
  sessionVariance: number;
  /** Average pages read per session */
  avgPagesPerSession: number;
}

export interface ReaderProfile {
  /** Days of week most likely to read (0=Sun) */
  preferredDays: number[];
  /** Hours most likely to read (0-23) */
  preferredHours: number[];
  /** Probability of reading on any given day (0-1) */
  dailyReadProbability: number;
  /** Average sessions per reading day */
  avgSessionsPerDay: number;
  /** Probability of missing a day in a streak */
  streakBreakProbability: number;
}

export interface SimulationConfig {
  books: BookProfile[];
  readerProfile: ReaderProfile;
  /** Seed for reproducible random generation */
  seed?: number;
}

/** Seeded random number generator for reproducible tests */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)]!;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}

/** Default casual reader profile */
export const CASUAL_READER: ReaderProfile = {
  preferredDays: [0, 6], // Weekends
  preferredHours: [20, 21, 22], // Evening
  dailyReadProbability: 0.4,
  avgSessionsPerDay: 1.2,
  streakBreakProbability: 0.3,
};

/** Avid reader profile */
export const AVID_READER: ReaderProfile = {
  preferredDays: [0, 1, 2, 3, 4, 5, 6], // Any day
  preferredHours: [7, 8, 12, 13, 20, 21, 22, 23], // Morning, lunch, evening
  dailyReadProbability: 0.85,
  avgSessionsPerDay: 2.5,
  streakBreakProbability: 0.05,
};

/** Commuter reader profile */
export const COMMUTER_READER: ReaderProfile = {
  preferredDays: [1, 2, 3, 4, 5], // Weekdays
  preferredHours: [7, 8, 17, 18], // Commute times
  dailyReadProbability: 0.7,
  avgSessionsPerDay: 2,
  streakBreakProbability: 0.15,
};

/** Sample book profiles */
export const SAMPLE_BOOKS: BookProfile[] = [
  {
    bookHash: 'novel-fiction-001',
    metaHash: 'meta-fiction-001',
    totalPages: 350,
    readProbability: 0.6,
    avgSessionMinutes: 45,
    sessionVariance: 0.3,
    avgPagesPerSession: 30,
  },
  {
    bookHash: 'novel-fiction-002',
    metaHash: 'meta-fiction-002',
    totalPages: 280,
    readProbability: 0.4,
    avgSessionMinutes: 35,
    sessionVariance: 0.4,
    avgPagesPerSession: 25,
  },
  {
    bookHash: 'tech-book-001',
    metaHash: 'meta-tech-001',
    totalPages: 450,
    readProbability: 0.3,
    avgSessionMinutes: 25,
    sessionVariance: 0.2,
    avgPagesPerSession: 15,
  },
  {
    bookHash: 'short-stories-001',
    metaHash: 'meta-stories-001',
    totalPages: 200,
    readProbability: 0.5,
    avgSessionMinutes: 20,
    sessionVariance: 0.5,
    avgPagesPerSession: 20,
  },
];

export class StatisticsSimulator {
  private random: SeededRandom;
  private config: SimulationConfig;

  constructor(config?: Partial<SimulationConfig>) {
    this.config = {
      books: config?.books || SAMPLE_BOOKS,
      readerProfile: config?.readerProfile || CASUAL_READER,
      seed: config?.seed,
    };
    this.random = new SeededRandom(this.config.seed);
  }

  /**
   * Generate reading sessions for a specific date range
   */
  generateSessions(startDate: Date, endDate: Date): ReadingSession[] {
    const sessions: ReadingSession[] = [];
    const bookProgress: Record<string, { currentPage: number; progress: number }> = {};

    // Initialize book progress
    this.config.books.forEach((book) => {
      bookProgress[book.bookHash] = { currentPage: 1, progress: 0 };
    });

    // Iterate through each day
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const { readerProfile } = this.config;

      // Determine if we read today
      let readToday = this.random.chance(readerProfile.dailyReadProbability);

      // Boost probability on preferred days
      if (readerProfile.preferredDays.includes(dayOfWeek)) {
        readToday = readToday || this.random.chance(0.3);
      }

      if (readToday) {
        // How many sessions today?
        const sessionsToday = Math.max(
          1,
          Math.round(readerProfile.avgSessionsPerDay + this.random.nextFloat(-0.5, 0.5)),
        );

        for (let i = 0; i < sessionsToday; i++) {
          // Pick a book - prioritize books with higher readProbability
          const availableBooks = this.config.books.filter(
            (book) => bookProgress[book.bookHash]!.progress < 1,
          );

          if (availableBooks.length === 0) continue;

          // Weight selection by readProbability
          const weighted = availableBooks.filter((book) =>
            this.random.chance(book.readProbability),
          );
          const booksToChooseFrom = weighted.length > 0 ? weighted : availableBooks;

          const book = this.random.pick(booksToChooseFrom);
          const progress = bookProgress[book.bookHash]!;

          // Pick a preferred hour, with some variance
          const baseHour = this.random.pick(readerProfile.preferredHours);
          const hour = Math.max(0, Math.min(23, baseHour + this.random.nextInt(-1, 1)));

          // Calculate session duration with variance
          const variance = book.sessionVariance;
          const durationMinutes = Math.max(
            2, // Minimum 2 minutes
            Math.round(book.avgSessionMinutes * (1 + this.random.nextFloat(-variance, variance))),
          );

          // Calculate pages read
          const pagesRead = Math.min(
            book.totalPages - progress.currentPage,
            Math.max(
              1,
              Math.round(book.avgPagesPerSession * (1 + this.random.nextFloat(-0.3, 0.3))),
            ),
          );

          // Create session timestamps
          const sessionStart = new Date(currentDate);
          sessionStart.setHours(hour, this.random.nextInt(0, 59), 0, 0);
          const sessionEnd = new Date(sessionStart.getTime() + durationMinutes * 60 * 1000);

          // Calculate progress values
          const startProgress = progress.currentPage / book.totalPages;
          const endPage = Math.min(book.totalPages, progress.currentPage + pagesRead);
          const endProgress = endPage / book.totalPages;

          // Create session
          const session: ReadingSession = {
            id: uuidv4(),
            bookHash: book.bookHash,
            metaHash: book.metaHash,
            startTime: sessionStart.getTime(),
            endTime: sessionEnd.getTime(),
            duration: durationMinutes * 60, // seconds
            startProgress,
            endProgress,
            startPage: progress.currentPage,
            endPage,
            pagesRead,
            createdAt: sessionEnd.getTime(),
            updatedAt: sessionEnd.getTime(),
          };

          sessions.push(session);

          // Update book progress
          progress.currentPage = endPage;
          progress.progress = endProgress;
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return sessions;
  }

  /**
   * Generate sessions for an entire year
   */
  generateYear(year: number): ReadingSession[] {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    return this.generateSessions(startDate, endDate);
  }

  /**
   * Generate sessions for a month
   */
  generateMonth(year: number, month: number): ReadingSession[] {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of month
    return this.generateSessions(startDate, endDate);
  }

  /**
   * Generate sessions for the last N days
   */
  generateLastNDays(days: number): ReadingSession[] {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    return this.generateSessions(startDate, endDate);
  }

  /**
   * Compute all derived statistics from sessions
   */
  computeStatistics(sessions: ReadingSession[]): {
    dailySummaries: Record<string, DailyReadingSummary>;
    bookStats: Record<string, BookStatistics>;
    userStats: UserStatistics;
  } {
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

    // Compute streaks
    const dates = Object.keys(dailySummaries).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    let lastReadDate = '';

    if (dates.length === 0) {
      // No data - both streaks are 0
      currentStreak = 0;
      longestStreak = 0;
    } else {
      const today = getDateString(Date.now());
      const yesterday = getDateString(Date.now() - 24 * 60 * 60 * 1000);
      lastReadDate = dates[dates.length - 1]!;

      if (lastReadDate === today || lastReadDate === yesterday) {
        currentStreak = 1;
        for (let i = dates.length - 2; i >= 0; i--) {
          const current = new Date(dates[i]!);
          const next = new Date(dates[i + 1]!);
          const diffDays = Math.floor((next.getTime() - current.getTime()) / (24 * 60 * 60 * 1000));
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      for (let i = 1; i < dates.length; i++) {
        const current = new Date(dates[i]!);
        const prev = new Date(dates[i - 1]!);
        const diffDays = Math.floor((current.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak, currentStreak);
    }

    const uniqueBooks = new Set(sessions.map((s) => s.bookHash));
    const completedBooks = Object.values(bookStats).filter((bs) => bs.completedAt).length;
    const totalSessions = sessions.length;
    const daysWithReading = Object.keys(dailySummaries).length;

    const userStats: UserStatistics = {
      totalReadingTime,
      totalBooksStarted: uniqueBooks.size,
      totalBooksCompleted: completedBooks,
      totalPagesRead,
      totalSessions,
      currentStreak,
      longestStreak,
      lastReadDate: lastReadDate || '',
      averageSessionDuration: totalSessions > 0 ? totalReadingTime / totalSessions : 0,
      averageDailyReadingTime: daysWithReading > 0 ? totalReadingTime / daysWithReading : 0,
      readingByHour,
      readingByDayOfWeek,
    };

    return { dailySummaries, bookStats, userStats };
  }

  /**
   * Generate complete StatisticsData object
   */
  generateStatisticsData(sessions: ReadingSession[]): StatisticsData {
    const { dailySummaries, bookStats, userStats } = this.computeStatistics(sessions);

    return {
      version: 1,
      sessions,
      dailySummaries,
      bookStats,
      userStats,
      config: DEFAULT_STATISTICS_CONFIG,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Generate reading goals with current progress
   */
  generateGoals(stats: { dailySummaries: Record<string, DailyReadingSummary> }): ReadingGoal[] {
    const now = Date.now();
    const todayStr = getDateString(now);

    // Daily goal - 30 minutes
    const dailyGoal: ReadingGoal = {
      id: 'daily-30min',
      type: 'daily',
      target: 30,
      unit: 'minutes',
      progress: (stats.dailySummaries[todayStr]?.totalDuration || 0) / 60,
      startDate: todayStr,
      active: true,
      createdAt: now,
    };

    // Weekly goal - 100 pages
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = getDateString(weekStart.getTime());
    let weeklyPages = 0;
    Object.entries(stats.dailySummaries).forEach(([date, summary]) => {
      if (date >= weekStartStr) {
        weeklyPages += summary.totalPages;
      }
    });
    const weeklyGoal: ReadingGoal = {
      id: 'weekly-100pages',
      type: 'weekly',
      target: 100,
      unit: 'pages',
      progress: weeklyPages,
      startDate: weekStartStr,
      active: true,
      createdAt: now,
    };

    // Monthly goal - 4 hours
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = getDateString(monthStart.getTime());
    let monthlyMinutes = 0;
    Object.entries(stats.dailySummaries).forEach(([date, summary]) => {
      if (date >= monthStartStr) {
        monthlyMinutes += summary.totalDuration / 60;
      }
    });
    const monthlyGoal: ReadingGoal = {
      id: 'monthly-4hours',
      type: 'monthly',
      target: 240, // 4 hours in minutes
      unit: 'minutes',
      progress: monthlyMinutes,
      startDate: monthStartStr,
      active: true,
      createdAt: now,
    };

    return [dailyGoal, weeklyGoal, monthlyGoal];
  }
}

/**
 * Assertion helpers for verifying statistics accuracy
 */
export const statisticsAssertions = {
  /**
   * Verify daily summary matches sessions
   */
  verifyDailySummary(
    sessions: ReadingSession[],
    summary: DailyReadingSummary,
    date: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const daySessions = sessions.filter((s) => getDateString(s.startTime) === date);

    const expectedDuration = daySessions.reduce((sum, s) => sum + s.duration, 0);
    if (summary.totalDuration !== expectedDuration) {
      errors.push(`Duration mismatch: expected ${expectedDuration}, got ${summary.totalDuration}`);
    }

    const expectedPages = daySessions.reduce((sum, s) => sum + s.pagesRead, 0);
    if (summary.totalPages !== expectedPages) {
      errors.push(`Pages mismatch: expected ${expectedPages}, got ${summary.totalPages}`);
    }

    if (summary.sessionsCount !== daySessions.length) {
      errors.push(
        `Sessions count mismatch: expected ${daySessions.length}, got ${summary.sessionsCount}`,
      );
    }

    const expectedBooks = [...new Set(daySessions.map((s) => s.bookHash))];
    const missingBooks = expectedBooks.filter((b) => !summary.booksRead.includes(b));
    if (missingBooks.length > 0) {
      errors.push(`Missing books: ${missingBooks.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Verify book statistics match sessions
   */
  verifyBookStats(
    sessions: ReadingSession[],
    stats: BookStatistics,
    bookHash: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const bookSessions = sessions.filter((s) => s.bookHash === bookHash);

    const expectedTime = bookSessions.reduce((sum, s) => sum + s.duration, 0);
    if (stats.totalReadingTime !== expectedTime) {
      errors.push(`Reading time mismatch: expected ${expectedTime}, got ${stats.totalReadingTime}`);
    }

    if (stats.totalSessions !== bookSessions.length) {
      errors.push(
        `Sessions mismatch: expected ${bookSessions.length}, got ${stats.totalSessions}`,
      );
    }

    const expectedPages = bookSessions.reduce((sum, s) => sum + s.pagesRead, 0);
    if (stats.totalPagesRead !== expectedPages) {
      errors.push(`Pages mismatch: expected ${expectedPages}, got ${stats.totalPagesRead}`);
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Verify user statistics totals
   */
  verifyUserStats(
    sessions: ReadingSession[],
    stats: UserStatistics,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const expectedTime = sessions.reduce((sum, s) => sum + s.duration, 0);
    if (stats.totalReadingTime !== expectedTime) {
      errors.push(`Total time mismatch: expected ${expectedTime}, got ${stats.totalReadingTime}`);
    }

    if (stats.totalSessions !== sessions.length) {
      errors.push(`Sessions mismatch: expected ${sessions.length}, got ${stats.totalSessions}`);
    }

    const expectedPages = sessions.reduce((sum, s) => sum + s.pagesRead, 0);
    if (stats.totalPagesRead !== expectedPages) {
      errors.push(`Pages mismatch: expected ${expectedPages}, got ${stats.totalPagesRead}`);
    }

    const uniqueBooks = new Set(sessions.map((s) => s.bookHash));
    if (stats.totalBooksStarted !== uniqueBooks.size) {
      errors.push(
        `Books started mismatch: expected ${uniqueBooks.size}, got ${stats.totalBooksStarted}`,
      );
    }

    return { valid: errors.length === 0, errors };
  },
};

export default StatisticsSimulator;
