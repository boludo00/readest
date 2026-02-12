import React, { useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import type { EntityProfile, EntityType, TextChunk } from '@/services/ai/types';
import { aiStore } from '@/services/ai';
import { useTranslation } from '@/hooks/useTranslation';

const TYPE_COLORS: Record<EntityType, string> = {
  character: 'bg-blue-500/15 text-blue-600',
  location: 'bg-green-500/15 text-green-600',
  theme: 'bg-purple-500/15 text-purple-600',
  term: 'bg-amber-500/15 text-amber-600',
  event: 'bg-rose-500/15 text-rose-600',
};

const SNIPPET_LENGTH = 200;

function getExcerptSnippet(text: string, entityName: string, aliases: string[]): React.ReactNode {
  const names = [entityName, ...aliases];
  const escapedNames = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedNames.join('|')})`, 'i');
  const matchIndex = text.search(pattern);

  let start: number;
  let end: number;
  if (matchIndex >= 0) {
    const half = Math.floor(SNIPPET_LENGTH / 2);
    start = Math.max(0, matchIndex - half);
    end = Math.min(text.length, start + SNIPPET_LENGTH);
    if (end - start < SNIPPET_LENGTH) {
      start = Math.max(0, end - SNIPPET_LENGTH);
    }
  } else {
    start = 0;
    end = Math.min(text.length, SNIPPET_LENGTH);
  }

  const snippet =
    (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');

  const parts = snippet.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = names.some((n) => n.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <strong key={i} className='text-base-content/80 font-semibold not-italic'>
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

interface XRayEntityDetailProps {
  profile: EntityProfile;
  onBack: () => void;
  onSelectEntity: (name: string) => void;
  onRebuild: () => void;
  compact?: boolean;
  bookHash?: string;
  spoilerMaxPage?: number;
  chapterTitles?: Map<number, string>;
}

const XRayEntityDetail: React.FC<XRayEntityDetailProps> = ({
  profile,
  onBack,
  onSelectEntity,
  onRebuild,
  compact,
  bookHash,
  spoilerMaxPage,
  chapterTitles,
}) => {
  const _ = useTranslation();
  const { entity, scopedDescription, visibleConnections, chaptersAppearing } = profile;

  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [excerptMap, setExcerptMap] = useState<Map<string, TextChunk[]> | null>(null);
  const [isLoadingExcerpts, setIsLoadingExcerpts] = useState(false);

  // Reset state when entity changes
  useEffect(() => {
    setExpandedChapter(null);
    setExcerptMap(null);
  }, [entity.id]);

  const fetchExcerpts = useCallback(async () => {
    if (excerptMap || !bookHash) return;

    setIsLoadingExcerpts(true);
    try {
      const allChunks = await aiStore.getChunks(bookHash);

      // Build a regex that matches the entity name or any alias
      const names = [entity.name, ...entity.aliases];
      const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const namePattern = new RegExp(escaped.join('|'), 'i');

      // Filter chunks that mention the entity, respecting spoiler limit
      const matching = allChunks.filter((chunk) => {
        if (spoilerMaxPage !== undefined && chunk.pageNumber > spoilerMaxPage) return false;
        return namePattern.test(chunk.text);
      });

      // Map sectionIndex → chapter display name using the same logic as
      // getEntityProfile: chapterTitles.get(s) || `Section ${s + 1}`
      const sectionToDisplayName = (sectionIndex: number): string =>
        chapterTitles?.get(sectionIndex) || `Section ${sectionIndex + 1}`;

      // Group chunks by the chapter display name derived from their sectionIndex
      const grouped = new Map<string, TextChunk[]>();
      for (const chunk of matching) {
        const key = sectionToDisplayName(chunk.sectionIndex);
        const list = grouped.get(key) || [];
        if (list.length < 3) list.push(chunk);
        grouped.set(key, list);
      }
      setExcerptMap(grouped);
    } catch {
      setExcerptMap(new Map());
    } finally {
      setIsLoadingExcerpts(false);
    }
  }, [excerptMap, bookHash, entity.name, entity.aliases, spoilerMaxPage, chapterTitles]);

  const toggleChapter = useCallback(
    (chapter: string) => {
      if (expandedChapter === chapter) {
        setExpandedChapter(null);
      } else {
        setExpandedChapter(chapter);
        fetchExcerpts();
      }
    },
    [expandedChapter, fetchExcerpts],
  );

  return (
    <div className='flex h-full flex-col'>
      <div className='border-base-content/10 flex items-center gap-2 border-b px-3 py-2'>
        <button
          type='button'
          onClick={onBack}
          className='text-base-content/60 hover:text-base-content flex items-center gap-0.5 text-xs transition-colors'
        >
          <ChevronLeftIcon className='size-3.5' />
          {_('Back')}
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-3'>
        <div className='mb-3'>
          <div className='flex items-center gap-2'>
            <h3 className='text-base-content text-base font-semibold'>{entity.name}</h3>
            <span
              className={clsx(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize',
                TYPE_COLORS[entity.type],
              )}
            >
              {entity.type}
            </span>
          </div>
          {entity.role && (
            <p className='text-base-content/50 mt-0.5 text-xs italic'>{entity.role}</p>
          )}
          {entity.aliases.length > 0 && (
            <p className='text-base-content/50 mt-1 text-xs'>
              {_('Also known as:')} {entity.aliases.join(', ')}
            </p>
          )}
        </div>

        {scopedDescription && (
          <div className='mb-4'>
            <h4 className='text-base-content/70 mb-1 text-xs font-semibold uppercase tracking-wide'>
              {_('Description')}
            </h4>
            <p className='text-base-content text-sm leading-relaxed'>{scopedDescription}</p>
          </div>
        )}

        {visibleConnections.length > 0 && (
          <div className='mb-4'>
            <h4 className='text-base-content/70 mb-1.5 text-xs font-semibold uppercase tracking-wide'>
              {_('Connections')}
            </h4>
            <div className='flex flex-wrap gap-1.5'>
              {visibleConnections.map((conn) => (
                <button
                  key={conn}
                  type='button'
                  className='bg-base-200 hover:bg-base-300 text-base-content rounded-full px-2.5 py-1 text-xs transition-colors'
                  onClick={() => onSelectEntity(conn)}
                >
                  {conn}
                </button>
              ))}
            </div>
          </div>
        )}

        {chaptersAppearing.length > 0 && (
          <div className='mb-4'>
            <h4 className='text-base-content/70 mb-1 text-xs font-semibold uppercase tracking-wide'>
              {_('Appears in')}
            </h4>
            <div className='space-y-0.5'>
              {chaptersAppearing.map((chapter) => {
                const isExpanded = expandedChapter === chapter;
                const chapterExcerpts = excerptMap?.get(chapter) || [];
                return (
                  <div key={chapter}>
                    <button
                      type='button'
                      onClick={() => (bookHash ? toggleChapter(chapter) : undefined)}
                      className={clsx(
                        'flex w-full items-center gap-1 py-1 text-xs',
                        bookHash
                          ? 'text-base-content/70 hover:text-base-content cursor-pointer'
                          : 'text-base-content/70 cursor-default',
                      )}
                    >
                      {bookHash && (
                        <ChevronRightIcon
                          className={clsx(
                            'size-3 shrink-0 transition-transform',
                            isExpanded && 'rotate-90',
                          )}
                        />
                      )}
                      <span className='text-left'>{chapter}</span>
                    </button>
                    {isExpanded && (
                      <div className='ml-4 space-y-1.5 pb-2'>
                        {isLoadingExcerpts ? (
                          <Loader2Icon className='text-base-content/30 size-3.5 animate-spin' />
                        ) : chapterExcerpts.length > 0 ? (
                          chapterExcerpts.map((chunk) => (
                            <p
                              key={chunk.id}
                              className='text-base-content/50 border-base-content/10 border-l-2 pl-2 text-[11px] italic leading-relaxed'
                            >
                              {getExcerptSnippet(chunk.text, entity.name, entity.aliases)}
                            </p>
                          ))
                        ) : (
                          <p className='text-base-content/30 text-[11px] italic'>
                            {_('No excerpts found')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!compact && (
        <div className='border-base-content/10 border-t px-3 py-2'>
          <button
            type='button'
            onClick={onRebuild}
            className='text-base-content/50 hover:text-base-content flex items-center gap-1.5 text-xs transition-colors'
          >
            <RefreshCwIcon className='size-3' />
            {_('Rebuild X-Ray')}
          </button>
        </div>
      )}
    </div>
  );
};

export default XRayEntityDetail;
