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

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileKey } = req.query;
    if (!fileKey || typeof fileKey !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid fileKey' });
    }

    const { databases, storage } = createAppwriteAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Query } = require('node-appwrite') as typeof import('node-appwrite');

    const result = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', user.$id),
      Query.equal('file_key', fileKey),
      Query.isNull('deleted_at'),
      Query.limit(1),
    ]);

    if (result.documents.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileRecord = result.documents[0]!;
    if (fileRecord.user_id !== user.$id) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    // Delete from Appwrite Storage
    try {
      await storage.deleteFile(APPWRITE_BUCKET_ID, fileRecord.storage_file_id);
    } catch (error) {
      console.warn('Storage file may already be deleted:', error);
    }

    // Delete the database record
    await databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, fileRecord.$id);

    return res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
