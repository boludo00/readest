import React from 'react';
import clsx from 'clsx';
import type { BookEntity, EntityType } from '@/services/ai/types';

const TYPE_COLORS: Record<EntityType, string> = {
  character: 'bg-blue-500/15 text-blue-600',
  location: 'bg-green-500/15 text-green-600',
  theme: 'bg-purple-500/15 text-purple-600',
  term: 'bg-amber-500/15 text-amber-600',
  event: 'bg-rose-500/15 text-rose-600',
};

const TYPE_LABELS: Record<EntityType, string> = {
  character: 'CHR',
  location: 'LOC',
  theme: 'THM',
  term: 'TRM',
  event: 'EVT',
};

interface XRayEntityCardProps {
  entity: BookEntity;
  onClick: () => void;
}

const XRayEntityCard: React.FC<XRayEntityCardProps> = ({ entity, onClick }) => {
  return (
    <button
      type='button'
      className={clsx(
        'border-base-content/10 bg-base-100 hover:bg-base-200/80 w-full rounded-lg border p-2.5 text-left transition-colors',
      )}
      onClick={onClick}
    >
      <div className='flex items-start gap-2'>
        <span
          className={clsx(
            'mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
            TYPE_COLORS[entity.type],
          )}
        >
          {TYPE_LABELS[entity.type]}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            <span className='text-base-content truncate text-sm font-medium'>{entity.name}</span>
            {entity.importance === 'major' && (
              <span className='bg-primary/15 text-primary shrink-0 rounded px-1 py-0.5 text-[9px] font-medium'>
                MAJOR
              </span>
            )}
          </div>
          {entity.description && (
            <p className='text-base-content/60 mt-0.5 line-clamp-2 text-xs'>{entity.description}</p>
          )}
          {entity.sectionAppearances.length > 0 && (
            <span className='text-base-content/40 mt-1 block text-[10px]'>
              {entity.sectionAppearances.length} section
              {entity.sectionAppearances.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default XRayEntityCard;
