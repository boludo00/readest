import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_BUCKET_ID,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user } = await validateUserAndToken(req.headers['authorization']);
    if (!user) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const docId = req.query['docId'] as string;
    if (!docId) {
      return res.status(400).json({ error: 'Missing docId' });
    }

    const { databases, storage } = createAppwriteAdminClient();

    const fileRecord = await databases.getDocument(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, docId);
    if (fileRecord.user_id !== user.$id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const storageFileId = fileRecord.storage_file_id;

    // Get file metadata for Content-Length header
    const fileMeta = await storage.getFile(APPWRITE_BUCKET_ID, storageFileId);
    const fileBuffer = await storage.getFileDownload(APPWRITE_BUCKET_ID, storageFileId);

    const fileName = fileRecord.file_key.split('/').pop() || 'book';

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileMeta.sizeOriginal);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    return res.status(200).send(Buffer.from(fileBuffer));
  } catch (error) {
    console.error('Download data error:', error);
    return res.status(500).json({ error: 'Download failed' });
  }
}
