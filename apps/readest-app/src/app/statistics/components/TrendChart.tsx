'use client';

import { useId, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors, withOpacity } from '@/hooks/useThemeColors';
import { DailyReadingSummary } from '@/types/statistics';
import { getLocalDateString } from '@/utils/format';
import { cn } from '@/utils/tailwind';

interface TrendChartProps {
  dailySummaries: Record<string, DailyReadingSummary>;
  dateRange: 'week' | 'month' | 'year';
  onDateRangeChange?: (range: 'week' | 'month' | 'year') => void;
}

interface DataPoint {
  date: string;
  label: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const getDateRangeData = (
  dailySummaries: Record<string, DailyReadingSummary>,
  range: 'week' | 'month' | 'year',
): DataPoint[] => {
  const data: DataPoint[] = [];
  const today = new Date();

  if (range === 'week') {
    // Daily view: Last 7 days, one point per day
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getLocalDateString(date);
      const summary = dailySummaries[dateStr];

      data.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        value: summary?.totalDuration || 0,
      });
    }
  } else if (range === 'month') {
    // Weekly view: Last 5 weeks, one point per week
    for (let i = 4; i >= 0; i--) {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);

      let totalDuration = 0;
      for (let j = 0; j < 7; j++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + j);
        const dateStr = getLocalDateString(date);
        const summary = dailySummaries[dateStr];
        totalDuration += summary?.totalDuration || 0;
      }

      data.push({
        date: getLocalDateString(weekStart),
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
        value: totalDuration,
      });
    }
  } else {
    // Monthly view: Last 12 months, one point per month
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      let totalDuration = 0;
      const currentDate = new Date(monthDate);
      while (currentDate <= monthEnd) {
        const dateStr = getLocalDateString(currentDate);
        const summary = dailySummaries[dateStr];
        totalDuration += summary?.totalDuration || 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      data.push({
        date: getLocalDateString(monthDate),
        label: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        value: totalDuration,
      });
    }
  }

  return data;
};

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className='bg-base-300 text-base-content border-base-content/10 rounded-lg border px-3 py-2 shadow-lg'>
      <p className='mb-1 text-sm font-semibold'>{data.label}</p>
      <p className='text-primary text-lg font-bold'>{formatDuration(data.value)}</p>
    </div>
  );
};

const TrendChart: React.FC<TrendChartProps> = ({
  dailySummaries,
  dateRange,
  onDateRangeChange,
}) => {
  const _ = useTranslation();
  const themeColors = useThemeColors();
  const gradientId = useId();

  const data = useMemo(
    () => getDateRangeData(dailySummaries, dateRange),
    [dailySummaries, dateRange],
  );

  const { totalDuration, maxValue } = useMemo(
    () => ({
      totalDuration: data.reduce((sum, d) => sum + d.value, 0),
      maxValue: Math.max(...data.map((d) => d.value), 1),
    }),
    [data],
  );

  return (
    <div className='bg-base-200 rounded-xl p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <h3 className='text-base-content font-semibold'>{_('Reading Trend')}</h3>
          <p className='text-base-content/60 text-sm'>
            {_('Total: {{duration}}', { duration: formatDuration(totalDuration) })}
          </p>
        </div>
        <div className='flex gap-1'>
          {(['week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              className={cn('btn btn-xs', dateRange === range ? 'btn-primary' : 'btn-ghost')}
              onClick={() => onDateRangeChange?.(range)}
            >
              {range === 'week' ? _('Daily') : range === 'month' ? _('Weekly') : _('Monthly')}
            </button>
          ))}
        </div>
      </div>

      <div className='relative h-48'>
        <ResponsiveContainer width='100%' height='100%'>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${gradientId}`} x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor={themeColors.primary} stopOpacity={0.4} />
                <stop offset='95%' stopColor={themeColors.primary} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey='label'
              tick={{ fill: withOpacity(themeColors.baseContent, 0.6), fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: withOpacity(themeColors.baseContent, 0.2) }}
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
              dataKey='value'
              stroke={themeColors.primary}
              strokeWidth={3}
              fill={`url(#gradient-${gradientId})`}
              animationDuration={1000}
              animationEasing='ease-in-out'
              dot={{
                fill: themeColors.primary,
                stroke: themeColors.base100,
                strokeWidth: 2,
                r: 4,
              }}
              activeDot={{
                fill: themeColors.primary,
                stroke: themeColors.base100,
                strokeWidth: 2,
                r: 6,
                style: { cursor: 'pointer' },
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
