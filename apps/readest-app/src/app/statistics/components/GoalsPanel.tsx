'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';
import { PiPlus, PiTrash, PiTarget } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import { useStatisticsStore } from '@/store/statisticsStore';
import { ReadingGoal } from '@/types/statistics';

const GoalsPanel: React.FC = () => {
  const _ = useTranslation();
  const { config, setGoal, removeGoal, getGoalProgress } = useStatisticsStore();
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<ReadingGoal>>({
    type: 'daily',
    target: 30,
    unit: 'minutes',
  });

  const activeGoals = config.goals.filter((g) => g.active);

  const handleAddGoal = () => {
    if (!newGoal.type || !newGoal.target || !newGoal.unit) return;

    const goal: ReadingGoal = {
      id: uuidv4(),
      type: newGoal.type!,
      target: newGoal.target!,
      unit: newGoal.unit!,
      progress: 0,
      startDate: new Date().toISOString().split('T')[0]!,
      active: true,
      createdAt: Date.now(),
    };

    setGoal(goal);
    setShowAddGoal(false);
    setNewGoal({ type: 'daily', target: 30, unit: 'minutes' });
  };

  const handleRemoveGoal = (goalId: string) => {
    removeGoal(goalId);
  };

  const formatGoalDescription = (goal: ReadingGoal): string => {
    const typeLabel = {
      daily: _('Daily'),
      weekly: _('Weekly'),
      monthly: _('Monthly'),
      yearly: _('Yearly'),
    }[goal.type];

    const unitLabel = {
      minutes: goal.target === 1 ? _('minute') : _('minutes'),
      pages: goal.target === 1 ? _('page') : _('pages'),
      books: goal.target === 1 ? _('book') : _('books'),
    }[goal.unit];

    return `${typeLabel}: ${goal.target} ${unitLabel}`;
  };

  const getProgressPercentage = (goal: ReadingGoal): number => {
    const progress = getGoalProgress(goal);
    return Math.min(100, (progress / goal.target) * 100);
  };

  const formatProgress = (goal: ReadingGoal): string => {
    const progress = getGoalProgress(goal);

    if (goal.unit === 'minutes') {
      const hours = Math.floor(progress / 60);
      const minutes = Math.round(progress % 60);
      if (hours > 0) {
        return `${hours}h ${minutes}m / ${Math.floor(goal.target / 60)}h ${goal.target % 60}m`;
      }
      return `${Math.round(progress)}m / ${goal.target}m`;
    }

    return `${Math.round(progress)} / ${goal.target}`;
  };

  return (
    <div className='bg-base-200 rounded-xl p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <h3 className='text-base-content font-semibold'>{_('Reading Goals')}</h3>
        {!showAddGoal && (
          <button
            className='btn btn-ghost btn-xs gap-1'
            onClick={() => setShowAddGoal(true)}
          >
            <PiPlus size={14} />
            {_('Add Goal')}
          </button>
        )}
      </div>

      {/* Add goal form */}
      {showAddGoal && (
        <div className='bg-base-100 mb-4 rounded-lg p-3'>
          <div className='mb-3 grid grid-cols-3 gap-2'>
            <select
              className='select select-bordered select-sm w-full'
              value={newGoal.type}
              onChange={(e) =>
                setNewGoal({ ...newGoal, type: e.target.value as ReadingGoal['type'] })
              }
            >
              <option value='daily'>{_('Daily')}</option>
              <option value='weekly'>{_('Weekly')}</option>
              <option value='monthly'>{_('Monthly')}</option>
              <option value='yearly'>{_('Yearly')}</option>
            </select>

            <input
              type='number'
              className='input input-bordered input-sm w-full'
              placeholder={_('Target')}
              value={newGoal.target || ''}
              onChange={(e) =>
                setNewGoal({ ...newGoal, target: parseInt(e.target.value) || 0 })
              }
              min={1}
            />

            <select
              className='select select-bordered select-sm w-full'
              value={newGoal.unit}
              onChange={(e) =>
                setNewGoal({ ...newGoal, unit: e.target.value as ReadingGoal['unit'] })
              }
            >
              <option value='minutes'>{_('Minutes')}</option>
              <option value='pages'>{_('Pages')}</option>
              <option value='books'>{_('Books')}</option>
            </select>
          </div>

          <div className='flex justify-end gap-2'>
            <button className='btn btn-ghost btn-sm' onClick={() => setShowAddGoal(false)}>
              {_('Cancel')}
            </button>
            <button
              className='btn btn-primary btn-sm'
              onClick={handleAddGoal}
              disabled={!newGoal.target || newGoal.target <= 0}
            >
              {_('Add')}
            </button>
          </div>
        </div>
      )}

      {/* Goals list */}
      {activeGoals.length === 0 ? (
        <div className='py-6 text-center'>
          <PiTarget size={40} className='text-base-content/20 mx-auto mb-2' />
          <p className='text-base-content/50 text-sm'>{_('No goals set')}</p>
          <p className='text-base-content/40 text-xs'>
            {_('Add a goal to track your reading progress')}
          </p>
        </div>
      ) : (
        <div className='space-y-3'>
          {activeGoals.map((goal) => {
            const percentage = getProgressPercentage(goal);
            const isCompleted = percentage >= 100;

            return (
              <div
                key={goal.id}
                className={clsx(
                  'bg-base-100 rounded-lg p-3',
                  isCompleted && 'border-2 border-success/30',
                )}
              >
                <div className='mb-2 flex items-center justify-between'>
                  <span className='text-base-content text-sm font-medium'>
                    {formatGoalDescription(goal)}
                  </span>
                  <button
                    className='btn btn-ghost btn-xs text-error'
                    onClick={() => handleRemoveGoal(goal.id)}
                    aria-label={_('Remove goal')}
                  >
                    <PiTrash size={14} />
                  </button>
                </div>

                {/* Progress bar */}
                <div className='mb-1 h-2 overflow-hidden rounded-full bg-base-300'>
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all duration-500',
                      isCompleted ? 'bg-success' : 'bg-primary',
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* Progress text */}
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-base-content/60'>{formatProgress(goal)}</span>
                  <span
                    className={clsx(
                      'font-medium',
                      isCompleted ? 'text-success' : 'text-base-content/70',
                    )}
                  >
                    {isCompleted ? _('Completed!') : `${Math.round(percentage)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GoalsPanel;
