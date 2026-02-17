'use client';

import { useMemo, useState } from 'react';
import { PiClock } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ReadingSession } from '@/types/statistics';
import { cn } from '@/utils/tailwind';

interface ReadingTimelineProps {
  sessions: ReadingSession[];
}

interface WeekInfo {
  weekNumber: number;
  year: number;
  startDate: Date;
  endDate: Date;
}

interface TimelineSession {
  id: string;
  dayIndex: number; // 0 = Monday, 6 = Sunday
  startHour: number; // 0-24 (fractional)
  endHour: number; // 0-24 (fractional)
  duration: number; // seconds
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const MERGE_GAP_MINUTES = 15; // Merge sessions within 15 minutes of each other

const formatHour = (hour: number): string => {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

// Format fractional hour to exact time (e.g., 14.5 -> "2:30 PM")
const formatExactTime = (fractionalHour: number): string => {
  const hours = Math.floor(fractionalHour);
  const minutes = Math.round((fractionalHour - hours) * 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  }
  return `${minutes}m`;
};

// Get ISO week number
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

// Get the Monday of a given week
const getWeekStart = (year: number, week: number): Date => {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const dayOfWeek = jan1.getDay();
  const mondayOffset = dayOfWeek <= 4 ? 1 - dayOfWeek : 8 - dayOfWeek;
  const result = new Date(year, 0, 1 + mondayOffset + days);
  return result;
};

const getCurrentWeek = (): WeekInfo => {
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  const year = now.getFullYear();
  const startDate = getWeekStart(year, weekNumber);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  return { weekNumber, year, startDate, endDate };
};

const formatDateRange = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
};

const ReadingTimeline: React.FC<ReadingTimelineProps> = ({ sessions }) => {
  const _ = useTranslation();
  const themeColors = useThemeColors();
  const [currentWeek, setCurrentWeek] = useState<WeekInfo>(getCurrentWeek);
  const [hoveredSession, setHoveredSession] = useState<TimelineSession | null>(null);

  // Filter, transform, and merge nearby sessions for the current week
  const timelineSessions = useMemo(() => {
    const weekStart = currentWeek.startDate.getTime();
    const weekEnd = currentWeek.endDate.getTime() + 24 * 60 * 60 * 1000; // End of Sunday

    // First, transform all sessions
    const rawSessions = sessions
      .filter((s) => s.startTime >= weekStart && s.startTime < weekEnd)
      .map((s) => {
        const startDate = new Date(s.startTime);
        const endDate = new Date(s.endTime);

        // Get day of week (0 = Monday in our display)
        const dayOfWeek = startDate.getDay();
        const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday=0 to Sunday=6

        // Get fractional hours
        const startHour = startDate.getHours() + startDate.getMinutes() / 60;
        let endHour = endDate.getHours() + endDate.getMinutes() / 60;

        // If session spans midnight, cap at 24 for this day
        if (endDate.getDate() !== startDate.getDate()) {
          endHour = 24;
        }

        return {
          id: s.id,
          dayIndex,
          startHour,
          endHour,
          duration: s.duration,
        };
      })
      .sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour);

    // Merge nearby sessions on the same day
    const merged: TimelineSession[] = [];
    const gapHours = MERGE_GAP_MINUTES / 60;

    for (const session of rawSessions) {
      const lastMerged = merged[merged.length - 1];

      // Check if we can merge with the previous session
      if (
        lastMerged &&
        lastMerged.dayIndex === session.dayIndex &&
        session.startHour - lastMerged.endHour <= gapHours
      ) {
        // Merge: extend the end time and add durations
        lastMerged.endHour = Math.max(lastMerged.endHour, session.endHour);
        lastMerged.duration += session.duration;
        lastMerged.id = `${lastMerged.id}-${session.id}`; // Combine IDs
      } else {
        // Start a new merged session
        merged.push({ ...session });
      }
    }

    // Apply minimum visible width after merging
    return merged.map((s) => {
      if (s.endHour - s.startHour < 0.25) {
        return { ...s, endHour: s.startHour + 0.25 };
      }
      return s;
    });
  }, [sessions, currentWeek]);

  // Calculate total reading time for the week
  const weeklyTotal = useMemo(() => {
    return timelineSessions.reduce((sum, s) => sum + s.duration, 0);
  }, [timelineSessions]);

  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeek.startDate);
    newStart.setDate(newStart.getDate() - 7);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + 6);
    setCurrentWeek({
      weekNumber: getWeekNumber(newStart),
      year: newStart.getFullYear(),
      startDate: newStart,
      endDate: newEnd,
    });
  };

  const goToNextWeek = () => {
    const now = new Date();
    const nextStart = new Date(currentWeek.startDate);
    nextStart.setDate(nextStart.getDate() + 7);

    // Don't go beyond current week
    if (nextStart > now) return;

    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + 6);
    setCurrentWeek({
      weekNumber: getWeekNumber(nextStart),
      year: nextStart.getFullYear(),
      startDate: nextStart,
      endDate: nextEnd,
    });
  };

  const isCurrentWeekNow = useMemo(() => {
    const thisWeek = getCurrentWeek();
    return currentWeek.weekNumber === thisWeek.weekNumber && currentWeek.year === thisWeek.year;
  }, [currentWeek]);

  return (
    <div className='bg-base-200 rounded-xl p-4'>
      {/* Header */}
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <PiClock className='text-primary' size={20} />
          <div>
            <h3 className='text-base-content font-semibold'>{_('Reading Timeline')}</h3>
            <p className='text-base-content/60 text-sm'>
              {weeklyTotal > 0
                ? _('Total: {{duration}}', { duration: formatDuration(weeklyTotal) })
                : _('No reading this week')}
            </p>
          </div>
        </div>

        {/* Week Navigation */}
        <div className='flex items-center gap-2'>
          <button className='btn btn-ghost btn-sm btn-circle' onClick={goToPreviousWeek}>
            ←
          </button>
          <div className='min-w-[120px] text-center'>
            <div className='text-base-content text-sm font-medium'>
              {_('Week {{week}}', { week: currentWeek.weekNumber })}
            </div>
            <div className='text-base-content/60 text-xs'>
              {formatDateRange(currentWeek.startDate, currentWeek.endDate)}
            </div>
          </div>
          <button
            className={cn(
              'btn btn-ghost btn-sm btn-circle',
              isCurrentWeekNow && 'btn-disabled opacity-30',
            )}
            onClick={goToNextWeek}
            disabled={isCurrentWeekNow}
          >
            →
          </button>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className='relative'>
        {/* Hour labels */}
        <div className='mb-1 ml-12 flex'>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className='text-base-content/50 text-[10px]'
              style={{ width: `${(3 / 24) * 100}%` }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* Days and sessions */}
        <div className='space-y-1'>
          {DAYS.map((day, dayIndex) => (
            <div key={day} className='flex items-center gap-2'>
              {/* Day label */}
              <div className='w-10 text-right'>
                <span className='text-base-content/70 text-xs font-medium'>{day}</span>
              </div>

              {/* Timeline row */}
              <div className='bg-base-300/30 relative h-8 flex-1 overflow-hidden rounded'>
                {/* Hour grid lines */}
                {HOURS.slice(1).map((hour) => (
                  <div
                    key={hour}
                    className='bg-base-content/5 absolute bottom-0 top-0 w-px'
                    style={{ left: `${(hour / 24) * 100}%` }}
                  />
                ))}

                {/* Sessions */}
                {timelineSessions
                  .filter((s) => s.dayIndex === dayIndex)
                  .map((session) => {
                    const left = (session.startHour / 24) * 100;
                    const width = ((session.endHour - session.startHour) / 24) * 100;
                    const isHovered = hoveredSession?.id === session.id;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          'absolute bottom-1 top-1 cursor-pointer rounded transition-all',
                          isHovered ? 'scale-y-110 brightness-110' : '',
                        )}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 1)}%`,
                          backgroundColor: themeColors.primary,
                          minWidth: '4px',
                        }}
                        onMouseEnter={() => setHoveredSession(session)}
                        onMouseLeave={() => setHoveredSession(null)}
                      >
                        {/* Show duration label for longer sessions */}
                        {width > 8 && (
                          <span className='text-primary-content absolute inset-0 flex items-center justify-center truncate px-1 text-[9px] font-medium'>
                            {formatDuration(session.duration)}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* Tooltip */}
        {hoveredSession && (
          <div className='bg-base-300 text-base-content border-base-content/10 absolute right-0 top-0 z-10 rounded-lg border px-3 py-2 text-sm shadow-lg'>
            <div className='font-medium'>{DAYS[hoveredSession.dayIndex]}</div>
            <div className='text-base-content/70 text-xs'>
              {formatExactTime(hoveredSession.startHour)} -{' '}
              {formatExactTime(hoveredSession.endHour)}
            </div>
            <div className='text-primary font-bold'>{formatDuration(hoveredSession.duration)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingTimeline;
