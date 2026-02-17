'use client';

import { useId, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PiSunHorizon } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors, withOpacity } from '@/hooks/useThemeColors';
import { DailyReadingSummary } from '@/types/statistics';

interface AverageByHourProps {
  readingByHour: number[]; // 24 elements with total seconds per hour
  dailySummaries: Record<string, DailyReadingSummary>;
}

interface HourData {
  hour: number;
  label: string;
  shortLabel: string;
  average: number;
  isPeak: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: HourData }>;
}

const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return '< 1m';
};

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className='bg-base-300 text-base-content border-base-content/10 rounded-lg border px-3 py-2 shadow-lg'>
      <p className='mb-1 text-sm font-semibold'>{data.label}</p>
      <p className='text-primary text-lg font-bold'>{formatDuration(data.average)}</p>
      <p className='text-base-content/60 text-xs'>avg per day</p>
      {data.isPeak && <p className='text-primary mt-1 text-xs'>Peak hour</p>}
    </div>
  );
};

const AverageByHour: React.FC<AverageByHourProps> = ({ readingByHour, dailySummaries }) => {
  const _ = useTranslation();
  const themeColors = useThemeColors();
  const gradientId = useId();

  // Calculate average reading time per hour
  const chartData = useMemo(() => {
    // Count how many days have any reading data
    const daysWithReading = Math.max(Object.keys(dailySummaries).length, 1);

    // Calculate averages by dividing total by days
    const averages = readingByHour.map((total) => total / daysWithReading);
    const maxAverage = Math.max(...averages);
    const peakHour = maxAverage > 0 ? averages.indexOf(maxAverage) : -1;

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: formatHour(hour),
      shortLabel: hour % 3 === 0 ? formatHour(hour) : '',
      average: averages[hour] ?? 0,
      isPeak: hour === peakHour && (averages[hour] ?? 0) > 0,
    }));
  }, [readingByHour, dailySummaries]);

  const peakData = useMemo(() => chartData.find((d) => d.isPeak), [chartData]);
  const maxValue = Math.max(...chartData.map((d) => d.average), 1);
  const hasData = chartData.some((d) => d.average > 0);

  return (
    <div className='bg-base-200 rounded-xl p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <PiSunHorizon className='text-primary' size={20} />
          <div>
            <h3 className='text-base-content font-semibold'>{_('Reading by Hour')}</h3>
            <p className='text-base-content/60 text-sm'>
              {peakData
                ? _('Peak: {{time}}', { time: peakData.label })
                : _('Average reading time per hour')}
            </p>
          </div>
        </div>
      </div>

      <div className='relative h-48'>
        {!hasData ? (
          <div className='text-base-content/50 flex h-full items-center justify-center text-sm'>
            {_('No reading data yet')}
          </div>
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${gradientId}`} x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor={themeColors.primary} stopOpacity={0.4} />
                  <stop offset='95%' stopColor={themeColors.primary} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey='hour'
                tick={{ fill: withOpacity(themeColors.baseContent, 0.6), fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: withOpacity(themeColors.baseContent, 0.2) }}
                ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
                tickFormatter={(hour: number) => formatHour(hour)}
              />
              <YAxis
                tick={{ fill: withOpacity(themeColors.baseContent, 0.6), fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => {
                  const hours = Math.floor(value / 3600);
                  if (hours > 0) return `${hours}h`;
                  const mins = Math.floor(value / 60);
                  return mins > 0 ? `${mins}m` : '';
                }}
                domain={[0, maxValue * 1.1]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Area
                type='monotone'
                dataKey='average'
                stroke={themeColors.primary}
                strokeWidth={3}
                fill={`url(#gradient-${gradientId})`}
                animationDuration={1000}
                animationEasing='ease-in-out'
                dot={{
                  fill: themeColors.primary,
                  stroke: themeColors.base100,
                  strokeWidth: 2,
                  r: 3,
                }}
                activeDot={{
                  fill: themeColors.primary,
                  stroke: themeColors.base100,
                  strokeWidth: 2,
                  r: 5,
                  style: { cursor: 'pointer' },
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AverageByHour;
