'use client';

import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import clsx from 'clsx';
import {
  Loader2Icon,
  AtomIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ListIcon,
  Share2Icon,
  BookOpenIcon,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useXRayStore, searchEntities } from '@/store/xrayStore';
import { useEnv } from '@/context/EnvContext';
import {
  extractEntities,
  clearEntityIndex,
  getExtractedPage,
  isBookIndexed,
  aiLogger,
  getAIConfigError,
} from '@/services/ai';
import type { EntityType } from '@/services/ai/types';

import { Button } from '@/components/ui/button';
import AIConfigBanner from './AIConfigBanner';
import XRayEntityCard from './XRayEntityCard';
import XRayEntityDetail from './XRayEntityDetail';
import XRayGraphView from './XRayGraphView';

const ENTITY_FILTERS: { value: EntityType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'character', label: 'Characters' },
  { value: 'location', label: 'Locations' },
  { value: 'theme', label: 'Themes' },
  { value: 'term', label: 'Terms' },
  { value: 'event', label: 'Events' },
];

interface XRayBrowserProps {
  bookKey: string;
}

const XRayBrowser: React.FC<XRayBrowserProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { getBookData } = useBookDataStore();
  const { getProgress } = useReaderStore();
  const abortRef = useRef<AbortController | null>(null);

  const bookData = getBookData(bookKey);
  const progress = getProgress(bookKey);
  const bookHash = bookKey.split('-')[0] || '';
  const currentPage = progress?.pageinfo?.current ?? 0;
  const aiSettings = settings?.aiSettings;

  const {
    entities,
    selectedEntityId,
    selectedEntityProfile,
    filterType,
    searchQuery,
    viewMode,
    isLoading,
    isEntityIndexed,
    isExtracting,
    isBackgroundExtracting,
    lastExtractedPage,
    extractionProgress,
    extractionError,
    loadEntities,
    setFilterType,
    setSearchQuery,
    setViewMode,
    selectEntity,
    setExtracting,
    setExtractionProgress,
    setExtractionError,
  } = useXRayStore();

  // Build chapter titles map from book data
  const chapterTitles = React.useMemo(() => {
    const map = new Map<number, string>();
    const toc = bookData?.bookDoc?.toc;
    if (toc) {
      for (const item of toc) {
        map.set(item.id, item.label);
      }
    }
    return map;
  }, [bookData?.bookDoc?.toc]);

  useEffect(() => {
    if (bookHash) {
      loadEntities(bookHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookHash]);

  const handleExtract = useCallback(async () => {
    if (!aiSettings || !bookHash) return;

    const indexed = await isBookIndexed(bookHash);
    if (!indexed) {
      setExtractionError(_('Please index this book first in the AI tab'));
      return;
    }

    setExtracting(true);
    setExtractionError(null);
    abortRef.current = new AbortController();

    try {
      const result = await extractEntities(
        bookHash,
        aiSettings,
        setExtractionProgress,
        abortRef.current.signal,
        currentPage || undefined,
      );
      console.log('[XRay] Extraction complete, entities:', result.length);
      useXRayStore.setState({
        entities: result,
        isEntityIndexed: true,
        isExtracting: false,
        lastExtractedPage: currentPage || 0,
        extractionProgress: null,
      });
    } catch (e) {
      console.error('[XRay] Extraction failed:', (e as Error).message, (e as Error).stack);
      if ((e as Error).message !== 'Extraction cancelled') {
        setExtractionError((e as Error).message);
        aiLogger.entity.extractError(bookHash, (e as Error).message);
      }
      setExtracting(false);
      setExtractionProgress(null);
    }
  }, [
    aiSettings,
    bookHash,
    currentPage,
    _,
    setExtracting,
    setExtractionError,
    setExtractionProgress,
  ]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setExtracting(false);
    setExtractionProgress(null);
  }, [setExtracting, setExtractionProgress]);

  const handleRebuild = useCallback(async () => {
    if (!appService) return;
    if (!(await appService.ask(_('Rebuild X-Ray? This will re-extract all entities.')))) return;
    await clearEntityIndex(bookHash);
    useXRayStore.setState({ entities: [], isEntityIndexed: false, selectedEntityId: null });
    handleExtract();
  }, [appService, _, bookHash, handleExtract]);

  const handleSelectEntityByName = useCallback(
    (name: string) => {
      const found = entities.find(
        (e) =>
          e.name.toLowerCase() === name.toLowerCase() ||
          e.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
      );
      if (found) {
        selectEntity(found.id, currentPage, chapterTitles);
      }
    },
    [entities, selectEntity, currentPage, chapterTitles],
  );

  // Seamless background incremental extraction as the user reads.
  // Runs silently without showing progress UI so the user never notices.
  const backgroundAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!bookHash || !aiSettings || !isEntityIndexed) return;
    if (isExtracting || isBackgroundExtracting || !currentPage) return;

    const runBackgroundExtraction = async () => {
      const extractedPage = lastExtractedPage || (await getExtractedPage(bookHash)) || 0;
      if (extractedPage <= 0 || currentPage - extractedPage < 20) return;

      backgroundAbortRef.current = new AbortController();
      useXRayStore.setState({ isBackgroundExtracting: true });

      try {
        const result = await extractEntities(
          bookHash,
          aiSettings,
          undefined,
          backgroundAbortRef.current.signal,
          currentPage,
        );
        useXRayStore.setState({
          entities: result,
          lastExtractedPage: currentPage,
          isBackgroundExtracting: false,
        });
      } catch (e) {
        if ((e as Error).message !== 'Extraction cancelled') {
          aiLogger.entity.extractError(bookHash, `background: ${(e as Error).message}`);
        }
        useXRayStore.setState({ isBackgroundExtracting: false });
      }
    };
    runBackgroundExtraction();

    return () => {
      backgroundAbortRef.current?.abort();
    };
  }, [
    bookHash,
    aiSettings,
    isEntityIndexed,
    isExtracting,
    isBackgroundExtracting,
    currentPage,
    lastExtractedPage,
  ]);

  // Compute subgraph entities for drill-down in graph mode
  // Includes selected entity + all 1-hop neighbors (forward and reverse) of any type
  const subgraphEntities = useMemo(() => {
    if (!selectedEntityId || !selectedEntityProfile || viewMode !== 'graph') return [];
    const selected = entities.find((e) => e.id === selectedEntityId);
    if (!selected) return [];

    // Build name/alias → entity lookup
    const nameToEntity = new Map<string, (typeof entities)[0]>();
    for (const e of entities) {
      nameToEntity.set(e.name.toLowerCase(), e);
      for (const alias of e.aliases) {
        nameToEntity.set(alias.toLowerCase(), e);
      }
    }

    // Forward: entities listed in selected's connections
    const resultIds = new Set<string>([selectedEntityId]);
    for (const connName of selected.connections) {
      const entity = nameToEntity.get(connName.toLowerCase());
      if (entity) resultIds.add(entity.id);
    }

    // Reverse: entities that list the selected entity in their connections
    const selectedNames = new Set<string>([selected.name.toLowerCase()]);
    for (const alias of selected.aliases) selectedNames.add(alias.toLowerCase());

    for (const e of entities) {
      if (resultIds.has(e.id)) continue;
      if (e.connections.some((c) => selectedNames.has(c.toLowerCase()))) {
        resultIds.add(e.id);
      }
    }

    return entities.filter((e) => resultIds.has(e.id));
  }, [entities, selectedEntityId, selectedEntityProfile, viewMode]);

  // AI disabled state
  if (!aiSettings?.enabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Enable AI in Settings')}</p>
      </div>
    );
  }

  // X-Ray feature disabled
  if (!aiSettings.xrayEnabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('X-Ray is disabled in Settings')}</p>
      </div>
    );
  }

  // Provider config incomplete (e.g. missing API key) — only block when not yet extracted
  if (!isEntityIndexed && getAIConfigError(aiSettings)) {
    return <AIConfigBanner settings={aiSettings} />;
  }

  // Loading state
  if (isLoading) {
    return null;
  }

  // Entity detail view (list mode only — graph mode uses split view below)
  if (selectedEntityId && selectedEntityProfile && viewMode !== 'graph') {
    return (
      <XRayEntityDetail
        profile={selectedEntityProfile}
        onBack={() => selectEntity(null)}
        onSelectEntity={handleSelectEntityByName}
        onRebuild={handleRebuild}
        bookHash={bookHash}
        spoilerMaxPage={aiSettings.spoilerProtection ? currentPage : undefined}
        chapterTitles={chapterTitles}
      />
    );
  }

  // Extracting state
  if (isExtracting) {
    const progressPercent =
      extractionProgress && extractionProgress.total > 0
        ? Math.round((extractionProgress.current / extractionProgress.total) * 100)
        : 0;

    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        <Loader2Icon className='text-primary size-6 animate-spin' />
        <div>
          <p className='text-foreground mb-1 text-sm font-medium'>{_('Extracting entities...')}</p>
          <p className='text-muted-foreground text-xs'>
            {extractionProgress?.phase === 'extracting'
              ? `${_('Pass')} ${extractionProgress.current + 1} / ${extractionProgress.total}`
              : _('Saving...')}
          </p>
        </div>
        <div className='bg-muted h-1.5 w-32 overflow-hidden rounded-full'>
          <div
            className='bg-primary h-full transition-all duration-300'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <button
          type='button'
          onClick={handleCancel}
          className='text-muted-foreground hover:text-foreground text-xs underline'
        >
          {_('Cancel')}
        </button>
      </div>
    );
  }

  // Not extracted yet (with or without error)
  if (!isEntityIndexed) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        {extractionError ? (
          <>
            <div className='rounded-full bg-red-500/10 p-3'>
              <AlertCircleIcon className='size-6 text-red-500' />
            </div>
            <div>
              <h3 className='text-foreground mb-0.5 text-sm font-medium'>
                {_('Extraction failed')}
              </h3>
              <p className='text-muted-foreground text-xs'>{extractionError}</p>
            </div>
            <Button onClick={handleExtract} size='sm' className='h-8 text-xs'>
              {_('Retry')}
            </Button>
          </>
        ) : (
          <>
            <div className='bg-primary/10 rounded-full p-3'>
              <AtomIcon className='text-primary size-6' />
            </div>
            <div>
              <h3 className='text-foreground mb-0.5 text-sm font-medium'>{_('X-Ray')}</h3>
              <p className='text-muted-foreground text-xs'>
                {_('Extract characters, locations, and themes from this book')}
              </p>
            </div>
            <Button onClick={handleExtract} size='sm' className='h-8 text-xs'>
              <AtomIcon className='mr-1.5 size-3.5' />
              {_('Start Extraction')}
            </Button>
          </>
        )}
      </div>
    );
  }

  // Entity list view
  const filteredEntities = searchEntities(
    entities,
    searchQuery,
    aiSettings.spoilerProtection ? currentPage : undefined,
    filterType,
  );

  return (
    <div className='flex h-full flex-col'>
      {/* Filter bar */}
      <div className='border-base-content/10 space-y-2 border-b px-3 py-2'>
        <div className='flex items-center gap-1'>
          <div className='flex flex-1 gap-1 overflow-x-auto'>
            {ENTITY_FILTERS.map((f) => (
              <button
                key={f.value}
                type='button'
                className={clsx(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filterType === f.value
                    ? 'bg-primary text-primary-content'
                    : 'bg-base-200 text-base-content/70 hover:bg-base-300',
                )}
                onClick={() => setFilterType(f.value)}
              >
                {_(f.label)}
              </button>
            ))}
          </div>
          <div className='flex shrink-0 items-center gap-0.5'>
            <button
              type='button'
              title={_('List view')}
              className={clsx(
                'rounded p-1 transition-colors',
                viewMode === 'list'
                  ? 'bg-base-300 text-base-content'
                  : 'text-base-content/40 hover:text-base-content/70',
              )}
              onClick={() => setViewMode('list')}
            >
              <ListIcon className='size-3.5' />
            </button>
            <button
              type='button'
              title={_('Graph view')}
              className={clsx(
                'rounded p-1 transition-colors',
                viewMode === 'graph'
                  ? 'bg-base-300 text-base-content'
                  : 'text-base-content/40 hover:text-base-content/70',
              )}
              onClick={() => setViewMode('graph')}
            >
              <Share2Icon className='size-3.5' />
            </button>
          </div>
        </div>
        <input
          type='text'
          className='bg-base-200 text-base-content placeholder:text-base-content/40 w-full rounded-lg px-2.5 py-1.5 text-xs outline-none'
          placeholder={_('Search entities...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Reading progress indicator */}
      {aiSettings.spoilerProtection && progress?.pageinfo && progress.pageinfo.total > 0 && (
        <div className='border-base-content/10 border-b px-3 py-1.5'>
          <div className='flex items-center gap-1.5'>
            <BookOpenIcon className='text-base-content/40 size-3' />
            <span className='text-base-content/50 text-[11px]'>
              {_('Analyzed to page {{current}} of {{total}}', {
                current: currentPage,
                total: progress.pageinfo.total,
              })}
            </span>
          </div>
          <div className='bg-base-content/10 mt-1 h-1 overflow-hidden rounded-full'>
            <div
              className='bg-primary/50 h-full rounded-full transition-all duration-500'
              style={{
                width: `${Math.round((currentPage / progress.pageinfo.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Entity content */}
      {viewMode === 'graph' ? (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className={clsx('overflow-hidden', selectedEntityId ? 'h-2/5' : 'flex-1')}>
            <XRayGraphView
              entities={selectedEntityId ? subgraphEntities : filteredEntities}
              onSelectEntity={(id) => selectEntity(id, currentPage, chapterTitles)}
              highlightedEntityId={selectedEntityId ?? undefined}
            />
          </div>
          {selectedEntityId && selectedEntityProfile && (
            <div className='border-base-content/10 flex-1 overflow-y-auto border-t'>
              <XRayEntityDetail
                profile={selectedEntityProfile}
                onBack={() => selectEntity(null)}
                onSelectEntity={handleSelectEntityByName}
                onRebuild={handleRebuild}
                compact
                bookHash={bookHash}
                spoilerMaxPage={aiSettings.spoilerProtection ? currentPage : undefined}
                chapterTitles={chapterTitles}
              />
            </div>
          )}
        </div>
      ) : (
        <div className='flex-1 overflow-y-auto px-3 py-2'>
          <div className='mb-2 flex justify-end'>
            <button
              type='button'
              onClick={handleRebuild}
              className='text-base-content/50 hover:text-base-content flex items-center gap-1 text-[11px] transition-colors'
            >
              <RefreshCwIcon className='size-3' />
              {_('Rebuild')}
            </button>
          </div>
          {filteredEntities.length === 0 ? (
            <div className='flex h-32 items-center justify-center'>
              <p className='text-muted-foreground text-xs'>
                {searchQuery ? _('No entities match your search') : _('No entities found')}
              </p>
            </div>
          ) : (
            <div className='space-y-1.5'>
              {filteredEntities.map((entity) => (
                <XRayEntityCard
                  key={entity.id}
                  entity={entity}
                  onClick={() => selectEntity(entity.id, currentPage, chapterTitles)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default XRayBrowser;
