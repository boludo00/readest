'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2Icon,
  BookOpenIcon,
  PlusIcon,
  AlertCircleIcon,
  ChevronDownIcon,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { isBookIndexed, aiStore, aiLogger } from '@/services/ai';
import { generateRecap } from '@/services/ai/recapService';
import type { BookRecap } from '@/services/ai/types';

import { Button } from '@/components/ui/button';

/** Lightweight markdown renderer for recap text (bold, italic, paragraphs). */
function renderRecapMarkdown(text: string): React.ReactNode[] {
  return text.split(/\n{2,}/).map((paragraph, i) => {
    const trimmed = paragraph.trim();
    if (!trimmed) return null;

    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(trimmed)) !== null) {
      if (match.index > lastIndex) {
        parts.push(trimmed.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(
          <strong key={`${i}-b-${match.index}`} className='font-semibold'>
            {match[2]}
          </strong>,
        );
      } else if (match[3]) {
        parts.push(<em key={`${i}-i-${match.index}`}>{match[3]}</em>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < trimmed.length) {
      parts.push(trimmed.slice(lastIndex));
    }

    return (
      <p key={i} className='mb-3 last:mb-0'>
        {parts}
      </p>
    );
  });
}

function formatRecapDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RecapItemProps {
  recap: BookRecap;
  isExpanded: boolean;
  onToggle: () => void;
  isLatest: boolean;
}

const RecapItem: React.FC<RecapItemProps> = ({ recap, isExpanded, onToggle, isLatest }) => {
  const _ = useTranslation();

  return (
    <div className='border-base-content/10 overflow-hidden rounded-lg border'>
      <button
        type='button'
        onClick={onToggle}
        className='hover:bg-base-200/50 flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors'
      >
        <div className='bg-primary/10 flex size-7 shrink-0 items-center justify-center rounded-full'>
          <span className='text-primary text-[10px] font-bold'>{recap.progressPercent}%</span>
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-base-content text-xs font-medium'>
            {recap.progressPercent}% {_('Recap')}
            {isLatest && (
              <span className='bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium'>
                {_('Latest')}
              </span>
            )}
          </p>
          <p className='text-base-content/50 text-[10px]'>{formatRecapDate(recap.createdAt)}</p>
        </div>
        <ChevronDownIcon
          className={`text-base-content/40 size-3.5 shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className='border-base-content/10 border-t px-3 py-2.5'>
          <div className='text-base-content max-w-none select-text text-sm leading-relaxed'>
            {renderRecapMarkdown(recap.recap)}
          </div>
        </div>
      )}
    </div>
  );
};

interface RecapViewProps {
  bookKey: string;
}

const RecapView: React.FC<RecapViewProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { settings } = useSettingsStore();
  const { getBookData, getConfig } = useBookDataStore();
  const { getProgress } = useReaderStore();
  const abortRef = useRef<AbortController | null>(null);

  const bookData = getBookData(bookKey);
  const progress = getProgress(bookKey);
  const config = getConfig(bookKey);

  const bookHash = bookKey.split('-')[0] || '';
  const bookTitle = bookData?.book?.title || 'Unknown';
  const authorName = bookData?.book?.author || '';
  const currentPage = progress?.pageinfo?.current ?? 0;
  const totalPages = progress?.pageinfo?.total ?? 0;
  const aiSettings = settings?.aiSettings;

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recaps, setRecaps] = useState<BookRecap[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isIndexed, setIsIndexed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all recaps on mount
  useEffect(() => {
    const init = async () => {
      if (!bookHash) {
        setIsLoading(false);
        return;
      }

      const indexed = await isBookIndexed(bookHash);
      setIsIndexed(indexed);

      if (indexed) {
        const existing = await aiStore.getRecaps(bookHash);
        if (existing.length > 0) {
          // Reverse so earliest recaps appear at top (chronological order)
          setRecaps([...existing].reverse());
          setExpandedIndex(existing.length - 1); // expand the latest (last item)
        }
      }

      setIsLoading(false);
    };
    init();
  }, [bookHash]);

  const handleGenerate = useCallback(async () => {
    if (!aiSettings || !bookHash) return;

    setIsGenerating(true);
    setError(null);
    abortRef.current = new AbortController();

    const highlights: string[] = [];
    const booknotes = config?.booknotes || [];
    for (const note of booknotes) {
      if (note.text && !note.deletedAt) {
        highlights.push(note.text);
      }
    }

    try {
      const result = await generateRecap(
        bookHash,
        bookTitle,
        authorName,
        currentPage,
        totalPages,
        aiSettings,
        highlights.length > 0 ? highlights.slice(0, 10) : undefined,
        abortRef.current.signal,
        true, // forceRefresh — always generate fresh
      );

      // Reload all recaps from store and reverse for chronological order
      const allRecaps = [...(await aiStore.getRecaps(bookHash))].reverse();
      setRecaps(allRecaps);

      // Expand the newly generated recap (last item in chronological order)
      const newIndex = allRecaps.findIndex(
        (r) => r.progressPercent === result.progressPercent && r.createdAt === result.createdAt,
      );
      setExpandedIndex(newIndex >= 0 ? newIndex : allRecaps.length - 1);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        aiLogger.recap.generateError(bookHash, (e as Error).message);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [aiSettings, bookHash, bookTitle, authorName, currentPage, totalPages, config?.booknotes]);

  // AI disabled
  if (!aiSettings?.enabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Enable AI in Settings')}</p>
      </div>
    );
  }

  // Recap feature disabled
  if (!aiSettings.recapEnabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Recap is disabled in Settings')}</p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return null;
  }

  // Book not indexed
  if (!isIndexed) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        <div className='bg-primary/10 rounded-full p-3'>
          <BookOpenIcon className='text-primary size-6' />
        </div>
        <div>
          <h3 className='text-foreground mb-0.5 text-sm font-medium'>{_('Index Required')}</h3>
          <p className='text-muted-foreground text-xs'>
            {_('Index this book in the AI tab first to generate recaps')}
          </p>
        </div>
      </div>
    );
  }

  // No recaps yet and not generating — show initial prompt
  if (recaps.length === 0 && !isGenerating) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        {error ? (
          <>
            <div className='rounded-full bg-red-500/10 p-3'>
              <AlertCircleIcon className='size-6 text-red-500' />
            </div>
            <div>
              <h3 className='text-foreground mb-0.5 text-sm font-medium'>{_('Recap failed')}</h3>
              <p className='text-muted-foreground text-xs'>{error}</p>
            </div>
            <Button onClick={handleGenerate} size='sm' className='h-8 text-xs'>
              {_('Retry')}
            </Button>
          </>
        ) : (
          <>
            <div className='bg-primary/10 rounded-full p-3'>
              <BookOpenIcon className='text-primary size-6' />
            </div>
            <div>
              <h3 className='text-foreground mb-0.5 text-sm font-medium'>{_('Reading Recap')}</h3>
              <p className='text-muted-foreground text-xs'>
                {_("Get a chapter-by-chapter summary of what you've read")}
              </p>
            </div>
            <Button onClick={handleGenerate} size='sm' className='h-8 text-xs'>
              <BookOpenIcon className='mr-1.5 size-3.5' />
              {_('Generate Recap')}
            </Button>
          </>
        )}
      </div>
    );
  }

  // Recap history list
  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <div className='flex h-full flex-col'>
      {/* Generate new recap button */}
      <div className='border-base-content/10 flex items-center justify-between border-b px-3 py-2'>
        <span className='text-base-content/60 text-[11px]'>
          {_('Currently at')} {progressPercent}%
        </span>
        <button
          type='button'
          onClick={handleGenerate}
          disabled={isGenerating}
          className='text-primary hover:text-primary/80 disabled:text-base-content/30 flex items-center gap-1 text-[11px] font-medium transition-colors'
        >
          {isGenerating ? (
            <>
              <Loader2Icon className='size-3 animate-spin' />
              {_('Generating...')}
            </>
          ) : (
            <>
              <PlusIcon className='size-3' />
              {_('New Recap')}
            </>
          )}
        </button>
      </div>

      {/* Error banner */}
      {error && recaps.length > 0 && (
        <div className='border-b border-red-500/10 bg-red-500/5 px-3 py-1.5'>
          <p className='text-[10px] text-red-500'>{error}</p>
        </div>
      )}

      {/* Recap list */}
      <div className='flex-1 space-y-1.5 overflow-y-auto p-3'>
        {recaps.map((recap, index) => (
          <RecapItem
            key={`${recap.progressPercent}-${recap.createdAt}`}
            recap={recap}
            isExpanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
            isLatest={index === recaps.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export default RecapView;
