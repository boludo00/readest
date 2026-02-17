import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_BUCKET_ID,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

interface BulkDeleteResult {
  success: string[];
  failed: Array<{ fileKey: string; error: string }>;
  deletedCount: number;
  failedCount: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileKeys } = req.body;

    if (!fileKeys || !Array.isArray(fileKeys)) {
      return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
    }
    if (fileKeys.length === 0) {
      return res.status(400).json({ error: 'fileKeys array cannot be empty' });
    }
    if (fileKeys.length > 100) {
      return res.status(400).json({ error: 'Cannot delete more than 100 files at once' });
    }
    if (!fileKeys.every((key) => typeof key === 'string')) {
      return res.status(400).json({ error: 'All fileKeys must be strings' });
    }

    const { databases, storage } = createAppwriteAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Query } = require('node-appwrite') as typeof import('node-appwrite');

    // Fetch all matching file records
    const result = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', user.$id),
      Query.equal('file_key', fileKeys),
      Query.isNull('deleted_at'),
      Query.limit(100),
    ]);

    const success: string[] = [];
    const failed: Array<{ fileKey: string; error: string }> = [];

    // Process deletions
    const deleteResults = await Promise.allSettled(
      result.documents.map(async (doc) => {
        if (doc['user_id'] !== user.$id) {
          return { fileKey: doc['file_key'] as string, success: false, error: 'Unauthorized' };
        }

        try {
          // Delete from Appwrite Storage
          try {
            await storage.deleteFile(APPWRITE_BUCKET_ID, doc['storage_file_id'] as string);
          } catch {
            // File may already be deleted from storage
          }

          // Delete the database record
          await databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, doc.$id);

          return { fileKey: doc['file_key'] as string, success: true };
        } catch (error) {
          return {
            fileKey: doc['file_key'] as string,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    for (const deleteResult of deleteResults) {
      if (deleteResult.status === 'fulfilled') {
        if (deleteResult.value.success) {
          success.push(deleteResult.value.fileKey);
        } else {
          failed.push({
            fileKey: deleteResult.value.fileKey,
            error: deleteResult.value.error || 'Unknown',
          });
        }
      } else {
        failed.push({
          fileKey: 'unknown',
          error: deleteResult.reason?.message || 'Promise rejected',
        });
      }
    }

    // Track files not found in database
    const foundFileKeys = new Set(result.documents.map((doc) => doc['file_key'] as string));
    for (const key of fileKeys) {
      if (!foundFileKeys.has(key)) {
        failed.push({ fileKey: key, error: 'File not found or already deleted' });
      }
    }

    const response: BulkDeleteResult = {
      success,
      failed,
      deletedCount: success.length,
      failedCount: failed.length,
    };

    const statusCode =
      failed.length > 0 && success.length > 0 ? 207 : failed.length > 0 ? 500 : 200;

    return res.status(statusCode).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
