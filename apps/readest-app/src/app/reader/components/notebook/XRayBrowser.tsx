'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Loader2Icon,
  AtomIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ListIcon,
  Share2Icon,
  BookOpenIcon,
  ArrowUpCircleIcon,
  CloudCheckIcon,
  CloudUploadIcon,
  CloudOffIcon,
  CloudDownloadIcon,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useXRayStore, searchEntities } from '@/store/xrayStore';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import {
  extractEntities,
  clearEntityIndex,
  isBookIndexed,
  aiLogger,
  getAIConfigError,
} from '@/services/ai';
import { aiStore } from '@/services/ai/storage/aiStore';
import type { EntityType } from '@/services/ai/types';
import { eventDispatcher } from '@/utils/event';
import { getAccessToken } from '@/utils/access';

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
  const { isAuthReady, user } = useAuth();
  const { settings } = useSettingsStore();
  const { getBookData } = useBookDataStore();
  const { getProgress } = useReaderStore();
  const abortRef = useRef<AbortController | null>(null);
  const extractionLockRef = useRef(false);

  const bookData = getBookData(bookKey);
  const progress = getProgress(bookKey);
  const bookHash = bookKey.split('-')[0] || '';
  const currentSectionIndex = progress?.sectionId;
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
    isDownloadingFromCloud,
    cloudDownloadError,
    lastExtractedSection,
    totalSections,
    extractionProgress,
    extractionError,
    syncStatus,
    loadEntities,
    downloadFromCloud,
    setFilterType,
    setSearchQuery,
    setViewMode,
    selectEntity,
    setBackgroundExtracting,
    setExtractionProgress,
    setExtractionError,
    setExtractionAbortController,
  } = useXRayStore();

  const [hasNewContent, setHasNewContent] = useState(false);

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
    if (bookHash && isAuthReady) {
      loadEntities(bookHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookHash, isAuthReady]);

  // Detect when the user has read significantly beyond the last extraction (≥2 new chapters)
  const SECTION_UPDATE_THRESHOLD = 2;
  useEffect(() => {
    if (
      isEntityIndexed &&
      !isExtracting &&
      currentSectionIndex !== undefined &&
      lastExtractedSection > 0 &&
      currentSectionIndex - lastExtractedSection >= SECTION_UPDATE_THRESHOLD
    ) {
      setHasNewContent(true);
    } else {
      setHasNewContent(false);
    }
  }, [isEntityIndexed, isExtracting, currentSectionIndex, lastExtractedSection]);

  const handleExtract = useCallback(async () => {
    if (!aiSettings || !bookHash) return;
    if (extractionLockRef.current) return;
    extractionLockRef.current = true;

    try {
      const indexed = await isBookIndexed(bookHash);
      if (!indexed) {
        setExtractionError(_('Please index this book first in the AI tab'));
        return;
      }

      // Run extraction in background
      setBackgroundExtracting(true);
      setExtractionError(null);
      abortRef.current = new AbortController();
      setExtractionAbortController(abortRef.current);

      const result = await extractEntities(
        bookHash,
        aiSettings,
        setExtractionProgress,
        abortRef.current.signal,
        aiSettings.spoilerProtection ? currentSectionIndex : undefined,
      );

      console.log('[XRay] Extraction complete, entities:', result.length);
      useXRayStore.setState({
        entities: result,
        isEntityIndexed: true,
        isBackgroundExtracting: false,
        lastExtractedSection: currentSectionIndex ?? 0,
        extractionProgress: null,
        extractionAbortController: null,
        syncStatus: 'synced', // Upload happens in entityExtractor
      });

      // Show completion toast
      eventDispatcher.dispatch('toast', {
        message: _('X-Ray extraction complete! 🎉'),
        type: 'success',
        timeout: 5000,
      });
    } catch (e) {
      console.error('[XRay] Extraction failed:', (e as Error).message, (e as Error).stack);
      if ((e as Error).message !== 'Extraction cancelled') {
        setExtractionError((e as Error).message);
        aiLogger.entity.extractError(bookHash, (e as Error).message);
      }
      setBackgroundExtracting(false);
      setExtractionProgress(null);
      setExtractionAbortController(null);
    } finally {
      extractionLockRef.current = false;
    }
  }, [
    aiSettings,
    bookHash,
    currentSectionIndex,
    appService,
    _,
    setBackgroundExtracting,
    setExtractionError,
    setExtractionProgress,
    setExtractionAbortController,
  ]);

  const handleUpdate = useCallback(async () => {
    setHasNewContent(false);
    await handleExtract();
  }, [handleExtract]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    extractionLockRef.current = false;
    setBackgroundExtracting(false);
    setExtractionProgress(null);
    setExtractionAbortController(null);
  }, [setBackgroundExtracting, setExtractionProgress, setExtractionAbortController]);

  const handleRebuild = useCallback(async () => {
    if (!appService) return;
    if (!(await appService.ask(_('Rebuild X-Ray? This will re-extract all entities.')))) return;
    // Delete cloud data first so stale data is not synced back on other devices
    try {
      const token = await getAccessToken();
      if (token) {
        await aiStore.deleteCloudEntities(bookHash, token);
      }
    } catch (error) {
      console.warn(
        '[XRay] Cloud delete failed during rebuild, continuing with local clear:',
        error,
      );
    }
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
        selectEntity(found.id, currentSectionIndex, chapterTitles);
      }
    },
    [entities, selectEntity, currentSectionIndex, chapterTitles],
  );

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
        spoilerMaxSection={aiSettings.spoilerProtection ? currentSectionIndex : undefined}
        chapterTitles={chapterTitles}
      />
    );
  }

  // Extracting state (only show blocking UI if NOT in background)
  if (isExtracting && !isBackgroundExtracting) {
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

  // Not extracted yet or partially extracted (with or without error)
  if (!isEntityIndexed && entities.length === 0) {
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
            {user && (
              <div className='flex flex-col items-center gap-2'>
                <Button
                  onClick={() => downloadFromCloud(bookHash)}
                  disabled={isDownloadingFromCloud}
                  size='sm'
                  variant='outline'
                  className='h-8 text-xs'
                >
                  {isDownloadingFromCloud ? (
                    <Loader2Icon className='mr-1.5 size-3.5 animate-spin' />
                  ) : (
                    <CloudDownloadIcon className='mr-1.5 size-3.5' />
                  )}
                  {isDownloadingFromCloud ? _('Loading...') : _('Load from Cloud')}
                </Button>
                {cloudDownloadError && (
                  <p className='text-muted-foreground text-xs'>{cloudDownloadError}</p>
                )}
              </div>
            )}
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
    aiSettings.spoilerProtection ? currentSectionIndex : undefined,
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
            {/* Cloud sync status indicator */}
            <div className='ml-1 flex items-center'>
              {syncStatus === 'synced' && (
                <div title={_('Synced to cloud')}>
                  <CloudCheckIcon className='text-primary size-3.5' />
                </div>
              )}
              {syncStatus === 'uploading' && (
                <div title={_('Uploading to cloud...')}>
                  <CloudUploadIcon className='text-primary size-3.5 animate-pulse' />
                </div>
              )}
              {syncStatus === 'local' && (
                <div title={_('Local only (not synced)')}>
                  <CloudOffIcon className='text-base-content/30 size-3.5' />
                </div>
              )}
              {syncStatus === 'error' && (
                <div title={_('Sync failed')}>
                  <CloudOffIcon className='size-3.5 text-amber-500' />
                </div>
              )}
            </div>
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

      {/* Partial extraction banner — entities from completed passes survived a crash */}
      {!isEntityIndexed && entities.length > 0 && !isExtracting && (
        <div className='border-base-content/10 flex items-center gap-2 border-b px-3 py-1.5'>
          <AlertCircleIcon className='size-3 shrink-0 text-amber-500' />
          <span className='text-base-content/60 flex-1 text-[11px]'>
            {_('Extraction incomplete — partial results shown')}
          </span>
          <button
            type='button'
            onClick={handleExtract}
            className='text-primary text-[11px] font-medium'
          >
            {_('Continue')}
          </button>
        </div>
      )}

      {/* Reading progress indicator */}
      {aiSettings.spoilerProtection && lastExtractedSection > 0 && totalSections > 0 && (
        <div className='border-base-content/10 border-b px-3 py-1.5'>
          <div className='flex items-center gap-1.5'>
            <BookOpenIcon className='text-base-content/40 size-3' />
            <span className='text-base-content/50 text-[11px]'>
              {_('Analyzed through {{chapter}}', {
                chapter:
                  chapterTitles.get(lastExtractedSection) || `Section ${lastExtractedSection + 1}`,
              })}
            </span>
          </div>
          <div className='bg-base-content/10 mt-1 h-1 overflow-hidden rounded-full'>
            <div
              className='bg-primary/50 h-full rounded-full transition-all duration-500'
              style={{
                width: `${Math.round((lastExtractedSection / totalSections) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* New content available banner */}
      {hasNewContent && (
        <div className='border-base-content/10 flex items-center gap-2 border-b px-3 py-1.5'>
          <ArrowUpCircleIcon className='text-primary size-3 shrink-0' />
          <span className='text-base-content/60 flex-1 text-[11px]'>
            {_("You've read further — update X-Ray to include new content")}
          </span>
          <button
            type='button'
            onClick={handleUpdate}
            className='text-primary text-[11px] font-medium'
          >
            {_('Update')}
          </button>
        </div>
      )}

      {/* Entity content */}
      {viewMode === 'graph' ? (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className={clsx('overflow-hidden', selectedEntityId ? 'h-2/5' : 'flex-1')}>
            <XRayGraphView
              entities={selectedEntityId ? subgraphEntities : filteredEntities}
              onSelectEntity={(id) => selectEntity(id, currentSectionIndex, chapterTitles)}
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
                spoilerMaxSection={aiSettings.spoilerProtection ? currentSectionIndex : undefined}
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
                  onClick={() => selectEntity(entity.id, currentSectionIndex, chapterTitles)}
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
