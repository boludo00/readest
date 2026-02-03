import { Book, BookConfig, BookNote, BookDataRecord } from '@/types/book';
import { ReadingSession, ReadingGoal } from '@/types/statistics';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';

const SYNC_API_ENDPOINT = getAPIBaseUrl() + '/sync';

export type SyncType = 'books' | 'configs' | 'notes' | 'sessions' | 'goals';
export type SyncOp = 'push' | 'pull' | 'both';

interface BookRecord extends BookDataRecord, Book {}
interface BookConfigRecord extends BookDataRecord, BookConfig {}
interface BookNoteRecord extends BookDataRecord, BookNote {}
interface SessionRecord extends BookDataRecord, ReadingSession {}
interface GoalRecord extends BookDataRecord, Omit<ReadingGoal, 'progress'> {}

export interface SyncResult {
  books: BookRecord[] | null;
  notes: BookNoteRecord[] | null;
  configs: BookConfigRecord[] | null;
  sessions: SessionRecord[] | null;
  goals: GoalRecord[] | null;
}

export type SyncRecord = BookRecord | BookConfigRecord | BookNoteRecord | SessionRecord | GoalRecord;

export interface SyncData {
  books?: Partial<BookRecord>[];
  notes?: Partial<BookNoteRecord>[];
  configs?: Partial<BookConfigRecord>[];
  sessions?: Partial<SessionRecord>[];
  goals?: Partial<GoalRecord>[];
}

export class SyncClient {
  /**
   * Pull incremental changes since a given timestamp (in ms).
   * Returns updated or deleted records since that time.
   */
  async pullChanges(
    since: number,
    type?: SyncType,
    book?: string,
    metaHash?: string,
  ): Promise<SyncResult> {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const url = `${SYNC_API_ENDPOINT}?since=${encodeURIComponent(since)}&type=${type ?? ''}&book=${book ?? ''}&meta_hash=${metaHash ?? ''}`;
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      8000,
    );

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`Failed to pull changes: ${error.error || res.statusText}`);
    }

    return res.json();
  }

  /**
   * Push local changes to the server.
   * Uses last-writer-wins logic as implemented on the server side.
   */
  async pushChanges(payload: SyncData): Promise<SyncResult> {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetchWithTimeout(
      SYNC_API_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
      8000,
    );

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`Failed to push changes: ${error.error || res.statusText}`);
    }

    return res.json();
  }

  /**
   * Check if the user is authenticated (has a valid token).
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await getAccessToken();
      return !!token;
    } catch {
      return false;
    }
  }
}
