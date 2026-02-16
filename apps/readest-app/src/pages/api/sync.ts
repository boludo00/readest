import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import {
  createAppwriteAdminClient,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';
import { BookDataRecord } from '@/types/book';
import {
  transformBookConfigToDB,
  transformBookNoteToDB,
  transformBookToDB,
} from '@/utils/transform';
import { runMiddleware, corsAllMethods } from '@/utils/cors';
import { SyncData, SyncRecord, SyncResult, SyncType } from '@/libs/sync';
import { validateUserAndToken } from '@/utils/access';
import { DBBook } from '@/types/records';

const transformsToDB = {
  books: transformBookToDB,
  book_notes: transformBookNoteToDB,
  book_configs: transformBookConfigToDB,
};

const DBSyncTypeMap = {
  books: 'books',
  book_notes: 'notes',
  book_configs: 'configs',
};

type CollectionId = keyof typeof transformsToDB;

const COLLECTION_IDS: Record<CollectionId, string> = {
  books: COLLECTIONS.BOOKS,
  book_notes: COLLECTIONS.BOOK_NOTES,
  book_configs: COLLECTIONS.BOOK_CONFIGS,
};

const APPWRITE_META_KEYS = [
  '$collectionId',
  '$databaseId',
  '$createdAt',
  '$updatedAt',
  '$permissions',
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripAppwriteMeta = (doc: Record<string, any>): Record<string, any> => {
  const result = { ...doc };
  for (const key of APPWRITE_META_KEYS) {
    delete result[key];
  }
  return result;
};

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { databases } = createAppwriteAdminClient();
  const databaseId = APPWRITE_DATABASE_ID;

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since');
  const typeParam = searchParams.get('type') as SyncType | undefined;
  const bookParam = searchParams.get('book');
  const metaHashParam = searchParams.get('meta_hash');

  if (!sinceParam) {
    return NextResponse.json({ error: '"since" query parameter is required' }, { status: 400 });
  }

  const since = new Date(Number(sinceParam));
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid "since" timestamp' }, { status: 400 });
  }

  const sinceIso = since.toISOString();

  try {
    const results: SyncResult = { books: [], configs: [], notes: [] };
    const errors: Record<CollectionId, string | null> = {
      books: null,
      book_notes: null,
      book_configs: null,
    };

    const queryCollection = async (
      collection: CollectionId,
      dedupeKeys?: (keyof BookDataRecord)[],
    ) => {
      const PAGE_SIZE = 100; // Appwrite max per request
      let allRecords: SyncRecord[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const queries: string[] = [
          Query.equal('user_id', user.$id),
          Query.limit(PAGE_SIZE),
          Query.offset(offset),
          Query.orderDesc('updated_at'),
        ];

        if (bookParam && metaHashParam) {
          queries.push(
            Query.or([
              Query.equal('book_hash', bookParam),
              Query.equal('meta_hash', metaHashParam),
            ]),
          );
        } else if (bookParam) {
          queries.push(Query.equal('book_hash', bookParam));
        } else if (metaHashParam) {
          queries.push(Query.equal('meta_hash', metaHashParam));
        }

        queries.push(
          Query.or([
            Query.greaterThan('updated_at', sinceIso),
            Query.greaterThan('deleted_at', sinceIso),
          ]),
        );

        console.log('Querying collection:', collection, 'since:', sinceIso, 'offset:', offset);

        const response = await databases.listDocuments(
          databaseId,
          COLLECTION_IDS[collection]!,
          queries,
        );

        if (response.documents.length > 0) {
          // Strip Appwrite metadata fields from documents
          const docs = response.documents.map(
            (doc) => stripAppwriteMeta(doc) as unknown as SyncRecord,
          );
          allRecords = allRecords.concat(docs);
          offset += PAGE_SIZE;
          hasMore = response.documents.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      let records = allRecords;
      if (dedupeKeys && dedupeKeys.length > 0) {
        const seen = new Set<string>();
        records = records.filter((rec) => {
          const key = dedupeKeys
            .map((k) => rec[k])
            .filter(Boolean)
            .join('|');
          if (key && seen.has(key)) {
            return false;
          } else {
            seen.add(key);
            return true;
          }
        });
      }
      results[DBSyncTypeMap[collection] as SyncType] = records || [];
    };

    if (!typeParam || typeParam === 'books') {
      await queryCollection('books').catch((err) => (errors['books'] = String(err)));
      // TODO: Remove this hotfix for the initial race condition for books sync
      if (results.books?.length === 0 && since.getTime() < 1000) {
        const dummyHash = '00000000000000000000000000000000';
        const now = new Date().getTime();
        results.books.push({
          user_id: user.$id,
          id: dummyHash,
          book_hash: dummyHash,
          deleted_at: now,
          updated_at: now,

          hash: dummyHash,
          title: 'Dummy Book',
          format: 'EPUB',
          author: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        });
      }
    }
    if (!typeParam || typeParam === 'configs') {
      await queryCollection('book_configs').catch((err) => (errors['book_configs'] = String(err)));
    }
    if (!typeParam || typeParam === 'notes') {
      await queryCollection('book_notes', ['id']).catch(
        (err) => (errors['book_notes'] = String(err)),
      );
    }

    const dbErrors = Object.entries(errors).filter(([, err]) => err !== null);
    if (dbErrors.length > 0) {
      console.error('Errors occurred:', dbErrors);
      const errorMsg = dbErrors.map(([table, err]) => `${table}: ${err}`).join('; ');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const response = NextResponse.json(results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.delete('ETag');
    return response;
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { databases } = createAppwriteAdminClient();
  const databaseId = APPWRITE_DATABASE_ID;
  const body = await req.json();
  const { books = [], configs = [], notes = [] } = body as SyncData;

  const BATCH_SIZE = 100;

  const upsertRecords = async (
    collection: CollectionId,
    primaryKeys: (keyof BookDataRecord)[],
    records: BookDataRecord[],
  ) => {
    if (records.length === 0) return { data: [] };

    const allAuthoritativeRecords: BookDataRecord[] = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const dbRecords = batch.map((rec) => {
        const dbRec = transformsToDB[collection](rec, user.$id);
        rec.user_id = user.$id;
        rec.book_hash = dbRec.book_hash;
        return { original: rec, db: dbRec };
      });

      const batchAuthoritativeRecords: BookDataRecord[] = [];

      for (const { original, db: dbRec } of dbRecords) {
        // Look up existing document
        const lookupQueries = [Query.equal('user_id', user.$id)];
        for (const pk of primaryKeys) {
          const value = original[pk];
          if (value !== undefined && value !== null) {
            // Map 'id' key to 'note_id' for book_notes collection
            const dbKey = collection === 'book_notes' && pk === 'id' ? 'note_id' : pk;
            lookupQueries.push(Query.equal(dbKey, String(value)));
          }
        }

        const existing = await databases.listDocuments(
          databaseId,
          COLLECTION_IDS[collection]!,
          lookupQueries,
        );

        if (existing.documents.length === 0) {
          // Insert new document
          dbRec.updated_at = new Date().toISOString();
          // Remove $id from the record before creating
          const { $id: _, ...createData } = dbRec as DBBook & { $id?: string };
          const created = await databases.createDocument(
            databaseId,
            COLLECTION_IDS[collection]!,
            ID.unique(),
            createData,
          );
          batchAuthoritativeRecords.push(stripAppwriteMeta(created) as unknown as BookDataRecord);
        } else {
          const serverData = existing.documents[0]!;
          const clientUpdatedAt = dbRec.updated_at ? new Date(dbRec.updated_at).getTime() : 0;
          const serverUpdatedAt = serverData['updated_at']
            ? new Date(serverData['updated_at'] as string).getTime()
            : 0;
          const clientDeletedAt = dbRec.deleted_at ? new Date(dbRec.deleted_at).getTime() : 0;
          const serverDeletedAt = serverData['deleted_at']
            ? new Date(serverData['deleted_at'] as string).getTime()
            : 0;
          const clientIsNewer =
            clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt;

          if (clientIsNewer) {
            // Update existing document
            const { $id: _, ...updateData } = dbRec as DBBook & { $id?: string };
            const updated = await databases.updateDocument(
              databaseId,
              COLLECTION_IDS[collection]!,
              serverData.$id,
              updateData,
            );
            batchAuthoritativeRecords.push(stripAppwriteMeta(updated) as unknown as BookDataRecord);
          } else {
            batchAuthoritativeRecords.push(
              stripAppwriteMeta(serverData) as unknown as BookDataRecord,
            );
          }
        }
      }

      allAuthoritativeRecords.push(...batchAuthoritativeRecords);
    }

    return { data: allAuthoritativeRecords };
  };

  try {
    const [booksResult, configsResult, notesResult] = await Promise.all([
      upsertRecords('books', ['book_hash'], books as BookDataRecord[]),
      upsertRecords('book_configs', ['book_hash'], configs as BookDataRecord[]),
      upsertRecords('book_notes', ['book_hash', 'id'], notes as BookDataRecord[]),
    ]);

    return NextResponse.json(
      {
        books: booksResult?.data || [],
        configs: configsResult?.data || [],
        notes: notesResult?.data || [],
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!req.url) {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

  const protocol = process.env['PROTOCOL'] || 'http';
  const host = process.env['HOST'] || 'localhost:3000';
  const url = new URL(req.url, `${protocol}://${host}`);

  await runMiddleware(req, res, corsAllMethods);

  try {
    let response: Response;

    if (req.method === 'GET') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'GET',
      });
      response = await GET(nextReq);
    } else if (req.method === 'POST') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      response = await POST(nextReq);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.status(response.status);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.send(buffer);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default handler;
