import { create } from 'zustand';
import type {
  BookEntity,
  EntityProfile,
  EntityType,
  EntityExtractionProgress,
} from '@/services/ai/types';
import { aiStore } from '@/services/ai/storage/aiStore';
import { getEntityProfile, searchEntities } from '@/services/ai/entityExtractor';
import { getAccessToken } from '@/utils/access';

type XRayViewMode = 'list' | 'graph';
type XRaySyncStatus = 'synced' | 'uploading' | 'local' | 'error';

interface XRayState {
  entities: BookEntity[];
  selectedEntityId: string | null;
  selectedEntityProfile: EntityProfile | null;
  filterType: EntityType | 'all';
  searchQuery: string;
  viewMode: XRayViewMode;
  isLoading: boolean;
  isEntityIndexed: boolean;
  isExtracting: boolean;
  isBackgroundExtracting: boolean;
  isDownloadingFromCloud: boolean;
  cloudDownloadError: string | null;
  lastExtractedSection: number;
  totalSections: number;
  extractionProgress: EntityExtractionProgress | null;
  extractionError: string | null;
  syncStatus: XRaySyncStatus;
  extractionAbortController: AbortController | null;

  loadEntities: (bookHash: string) => Promise<void>;
  downloadFromCloud: (bookHash: string) => Promise<void>;
  setFilterType: (type: EntityType | 'all') => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: XRayViewMode) => void;
  selectEntity: (
    id: string | null,
    maxSection?: number,
    chapterTitles?: Map<number, string>,
  ) => void;
  setExtracting: (extracting: boolean) => void;
  setBackgroundExtracting: (extracting: boolean) => void;
  setExtractionProgress: (progress: EntityExtractionProgress | null) => void;
  setExtractionError: (error: string | null) => void;
  setSyncStatus: (status: XRaySyncStatus) => void;
  setExtractionAbortController: (controller: AbortController | null) => void;
  clearState: () => void;
}

export const useXRayStore = create<XRayState>((set, get) => ({
  entities: [],
  selectedEntityId: null,
  selectedEntityProfile: null,
  filterType: 'all',
  searchQuery: '',
  viewMode: 'list',
  isLoading: false,
  isEntityIndexed: false,
  isExtracting: false,
  isBackgroundExtracting: false,
  isDownloadingFromCloud: false,
  cloudDownloadError: null,
  lastExtractedSection: 0,
  totalSections: 0,
  extractionProgress: null,
  extractionError: null,
  syncStatus: 'local',
  extractionAbortController: null,

  loadEntities: async (bookHash: string) => {
    set({ isLoading: true });
    try {
      // First, check if we have local data
      let index = await aiStore.getEntityIndex(bookHash);

      // If no local data, try to download from cloud
      if (!index || !index.complete) {
        try {
          const token = await getAccessToken();
          if (token) {
            const downloaded = await aiStore.downloadEntities(bookHash, token);
            if (downloaded) {
              // Re-fetch index after download
              index = await aiStore.getEntityIndex(bookHash);
            }
          }
        } catch (error) {
          // Ignore cloud sync errors - fall through to load local data
          console.warn('X-Ray cloud download failed:', error);
        }
      } else if (index.complete) {
        // We have local data - silently upload to cloud if not already synced
        try {
          const token = await getAccessToken();
          if (token) {
            // Upload in background, don't block loading
            aiStore.uploadEntities(bookHash, token).catch((error) => {
              console.warn('X-Ray auto-upload failed:', error);
              set({ syncStatus: 'local' });
            });
          }
        } catch (error) {
          // Ignore upload errors
          console.warn('X-Ray auto-upload failed:', error);
        }
      }

      if (index) {
        const entities = await aiStore.getEntities(bookHash);
        const derivedMaxSection =
          index.maxExtractedSection ??
          (index.processedSections.length > 0 ? Math.max(...index.processedSections) : 0);
        set({
          entities,
          isEntityIndexed: index.complete,
          lastExtractedSection: derivedMaxSection,
          totalSections: index.totalSections,
          isLoading: false,
        });
      } else {
        set({
          entities: [],
          isEntityIndexed: false,
          lastExtractedSection: 0,
          totalSections: 0,
          isLoading: false,
        });
      }
    } catch {
      set({
        entities: [],
        isEntityIndexed: false,
        lastExtractedSection: 0,
        totalSections: 0,
        isLoading: false,
      });
    }
  },

  downloadFromCloud: async (bookHash: string) => {
    set({ isDownloadingFromCloud: true, cloudDownloadError: null });
    try {
      const token = await getAccessToken();
      if (!token) {
        set({ cloudDownloadError: 'Not signed in', isDownloadingFromCloud: false });
        return;
      }
      const downloaded = await aiStore.downloadEntities(bookHash, token);
      if (!downloaded) {
        set({
          cloudDownloadError: 'No cloud data found for this book',
          isDownloadingFromCloud: false,
        });
        return;
      }
      const index = await aiStore.getEntityIndex(bookHash);
      if (index) {
        const entities = await aiStore.getEntities(bookHash);
        const derivedMaxSection =
          index.maxExtractedSection ??
          (index.processedSections.length > 0 ? Math.max(...index.processedSections) : 0);
        set({
          entities,
          isEntityIndexed: index.complete,
          lastExtractedSection: derivedMaxSection,
          totalSections: index.totalSections,
          isDownloadingFromCloud: false,
          cloudDownloadError: null,
        });
      } else {
        set({
          isDownloadingFromCloud: false,
          cloudDownloadError: 'Failed to load downloaded data',
        });
      }
    } catch (error) {
      set({
        isDownloadingFromCloud: false,
        cloudDownloadError: (error as Error).message || 'Download failed',
      });
    }
  },

  setFilterType: (type) => set({ filterType: type }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode }),

  selectEntity: (id, maxSection, chapterTitles) => {
    if (!id) {
      set({ selectedEntityId: null, selectedEntityProfile: null });
      return;
    }
    const entity = get().entities.find((e) => e.id === id);
    if (!entity) return;

    const profile = getEntityProfile(
      entity,
      maxSection,
      chapterTitles || new Map(),
      get().entities,
    );
    set({ selectedEntityId: id, selectedEntityProfile: profile });
  },

  setExtracting: (extracting) => set({ isExtracting: extracting }),
  setBackgroundExtracting: (extracting) => set({ isBackgroundExtracting: extracting }),
  setExtractionProgress: (progress) => set({ extractionProgress: progress }),
  setExtractionError: (error) => set({ extractionError: error }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setExtractionAbortController: (controller) => set({ extractionAbortController: controller }),

  clearState: () =>
    set({
      entities: [],
      selectedEntityId: null,
      selectedEntityProfile: null,
      filterType: 'all',
      searchQuery: '',
      viewMode: 'list',
      isLoading: false,
      isEntityIndexed: false,
      isExtracting: false,
      isBackgroundExtracting: false,
      isDownloadingFromCloud: false,
      cloudDownloadError: null,
      lastExtractedSection: 0,
      totalSections: 0,
      extractionProgress: null,
      extractionError: null,
      syncStatus: 'local',
      extractionAbortController: null,
    }),
}));

export { searchEntities };
