import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { databases } = createAppwriteAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Query } = require('node-appwrite') as typeof import('node-appwrite');

    if (req.method === 'GET') {
      let fileKey = req.query['fileKey'] as string | undefined;
      // Parse fileKey directly from raw URL to handle special characters like & in filenames.
      if (req.url?.includes('fileKey=') && req.url?.includes('&')) {
        const fileKeyFromUrl = req.url
          .substring(req.url.indexOf('fileKey=') + 8)
          .replace(/\+/g, '%20')
          .replace(/&/g, '%26')
          .replace(/=$/, '');
        fileKey = decodeURIComponent(fileKeyFromUrl);
      }
      if (!fileKey || typeof fileKey !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid fileKey' });
      }

      const downloadUrl = await getDownloadUrl(databases, user.$id, fileKey, req, Query);
      if (!downloadUrl) {
        return res.status(404).json({ error: 'File not found' });
      }

      return res.status(200).json({ downloadUrl });
    }

    if (req.method === 'POST') {
      const { fileKeys } = req.body;

      if (!fileKeys || !Array.isArray(fileKeys)) {
        return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
      }
      if (fileKeys.length === 0) {
        return res.status(400).json({ error: 'fileKeys array cannot be empty' });
      }
      if (!fileKeys.every((key) => typeof key === 'string')) {
        return res.status(400).json({ error: 'All fileKeys must be strings' });
      }

      const downloadUrls: Record<string, string | undefined> = {};
      const results = await Promise.allSettled(
        fileKeys.map(async (fileKey: string) => {
          const url = await getDownloadUrl(databases, user.$id, fileKey, req, Query);
          return { fileKey, url };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          downloadUrls[result.value.fileKey] = result.value.url ?? undefined;
        }
      }

      return res.status(200).json({ downloadUrls });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getDownloadUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  databases: any,
  userId: string,
  fileKey: string,
  req: NextApiRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Query: any,
): Promise<string | undefined> {
  try {
    const result = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', userId),
      Query.equal('file_key', fileKey),
      Query.isNull('deleted_at'),
      Query.limit(1),
    ]);

    if (result.documents.length === 0) {
      // Fallback: try matching by book_hash for legacy file key formats
      if (fileKey.includes('Readest/Book')) {
        const parts = fileKey.split('/');
        if (parts.length >= 4) {
          const bookHash = parts[parts.length - 2];
          const fileName = parts[parts.length - 1];
          const fileExtension = fileName?.split('.').pop() || '';

          const fallbackResult = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            COLLECTIONS.FILES,
            [
              Query.equal('user_id', userId),
              Query.equal('book_hash', bookHash),
              Query.isNull('deleted_at'),
            ],
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = fallbackResult.documents.find((doc: any) =>
            doc.file_key.endsWith(`.${fileExtension}`),
          );

          if (match) {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host;
            return `${protocol}://${host}/api/storage/download-data?docId=${match.$id}`;
          }
        }
      }
      return undefined;
    }

    const doc = result.documents[0];
    if (doc.user_id !== userId) return undefined;

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    return `${protocol}://${host}/api/storage/download-data?docId=${doc.$id}`;
  } catch (error) {
    console.error(`Error resolving download URL for ${fileKey}:`, error);
    return undefined;
  }
}
