import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken, getStoragePlanData } from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

interface StorageStats {
  totalFiles: number;
  totalSize: number;
  usage: number;
  quota: number;
  usagePercentage: number;
  byBookHash: Array<{
    bookHash: string | null;
    fileCount: number;
    totalSize: number;
  }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET') {
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

    // Get all non-deleted files for this user
    const allFiles = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', user.$id),
      Query.isNull('deleted_at'),
      Query.limit(5000),
    ]);

    const totalFiles = allFiles.documents.length;
    const totalSize = allFiles.documents.reduce(
      (sum, doc) => sum + parseInt(doc.file_size || '0', 10),
      0,
    );

    // Group by book_hash
    const grouped = new Map<string | null, { count: number; size: number }>();
    for (const doc of allFiles.documents) {
      const key = doc.book_hash || null;
      const current = grouped.get(key) || { count: 0, size: 0 };
      grouped.set(key, {
        count: current.count + 1,
        size: current.size + parseInt(doc.file_size || '0', 10),
      });
    }

    const byBookHash = Array.from(grouped.entries())
      .map(([bookHash, stats]) => ({
        bookHash,
        fileCount: stats.count,
        totalSize: stats.size,
      }))
      .sort((a, b) => b.totalSize - a.totalSize);

    const { usage: _planUsage, quota } = getStoragePlanData(token);
    const usagePercentage = quota > 0 ? Math.round((totalSize / quota) * 100) : 0;

    const response: StorageStats = {
      totalFiles,
      totalSize,
      usage: totalSize,
      quota,
      usagePercentage,
      byBookHash,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
