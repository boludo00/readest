import { create } from 'zustand';
import type {
  BookEntity,
  EntityProfile,
  EntityType,
  EntityExtractionProgress,
} from '@/services/ai/types';
import { aiStore } from '@/services/ai/storage/aiStore';
import { getEntityProfile, searchEntities } from '@/services/ai/entityExtractor';

type XRayViewMode = 'list' | 'graph';

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
  extractionProgress: EntityExtractionProgress | null;
  extractionError: string | null;

  loadEntities: (bookHash: string) => Promise<void>;
  setFilterType: (type: EntityType | 'all') => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: XRayViewMode) => void;
  selectEntity: (id: string | null, maxPage?: number, chapterTitles?: Map<number, string>) => void;
  setExtracting: (extracting: boolean) => void;
  setExtractionProgress: (progress: EntityExtractionProgress | null) => void;
  setExtractionError: (error: string | null) => void;
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
  extractionProgress: null,
  extractionError: null,

  loadEntities: async (bookHash: string) => {
    set({ isLoading: true });
    try {
      const isIndexed = await aiStore.isEntityIndexed(bookHash);
      if (isIndexed) {
        const entities = await aiStore.getEntities(bookHash);
        set({ entities, isEntityIndexed: true, isLoading: false });
      } else {
        set({ entities: [], isEntityIndexed: false, isLoading: false });
      }
    } catch {
      set({ entities: [], isEntityIndexed: false, isLoading: false });
    }
  },

  setFilterType: (type) => set({ filterType: type }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setViewMode: (mode) => set({ viewMode: mode }),

  selectEntity: (id, maxPage, chapterTitles) => {
    if (!id) {
      set({ selectedEntityId: null, selectedEntityProfile: null });
      return;
    }
    const entity = get().entities.find((e) => e.id === id);
    if (!entity) return;

    const profile = getEntityProfile(entity, maxPage, chapterTitles || new Map(), get().entities);
    set({ selectedEntityId: id, selectedEntityProfile: profile });
  },

  setExtracting: (extracting) => set({ isExtracting: extracting }),
  setExtractionProgress: (progress) => set({ extractionProgress: progress }),
  setExtractionError: (error) => set({ extractionError: error }),

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
      extractionProgress: null,
      extractionError: null,
    }),
}));

export { searchEntities };
