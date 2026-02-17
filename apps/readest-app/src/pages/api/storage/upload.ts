import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  getStoragePlanData,
  validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES,
} from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const { fileName, fileSize, bookHash, temp = false } = req.body;

  if (temp) {
    return res
      .status(501)
      .json({ error: 'Temp file upload not yet supported with Appwrite Storage' });
  }

  try {
    if (!fileName || !fileSize) {
      return res.status(400).json({ error: 'Missing file info' });
    }

    const { databases } = createAppwriteAdminClient();

    // Calculate current usage from the files collection
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Query, ID } = require('node-appwrite') as typeof import('node-appwrite');

    const existingFiles = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', user.$id),
      Query.isNull('deleted_at'),
    ]);

    const currentUsage = existingFiles.documents.reduce(
      (sum, doc) => sum + parseInt((doc['file_size'] as string) || '0', 10),
      0,
    );

    const { quota } = getStoragePlanData(token);
    if (currentUsage + fileSize > quota + STORAGE_QUOTA_GRACE_BYTES) {
      return res.status(403).json({ error: 'Insufficient storage quota', usage: currentUsage });
    }

    const fileKey = `${user.$id}/${fileName}`;

    // Check if file already exists for this user + fileKey
    const existingRecord = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, [
      Query.equal('user_id', user.$id),
      Query.equal('file_key', fileKey),
      Query.isNull('deleted_at'),
      Query.limit(1),
    ]);

    let docId: string;
    let storageFileId: string;

    if (existingRecord.documents.length > 0) {
      const doc = existingRecord.documents[0]!;
      docId = doc.$id;
      storageFileId = doc['storage_file_id'] as string;
      // Update file size
      await databases.updateDocument(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, docId, {
        file_size: String(fileSize),
      });
    } else {
      storageFileId = ID.unique();
      const newDoc = await databases.createDocument(
        APPWRITE_DATABASE_ID,
        COLLECTIONS.FILES,
        ID.unique(),
        {
          user_id: user.$id,
          book_hash: bookHash || null,
          file_key: fileKey,
          file_size: String(fileSize),
          storage_file_id: storageFileId,
          created_at: new Date().toISOString(),
        },
      );
      docId = newDoc.$id;
    }

    // Build the upload URL pointing to our upload-data proxy endpoint
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const uploadUrl = `${protocol}://${host}/api/storage/upload-data?docId=${docId}`;

    return res.status(200).json({
      uploadUrl,
      fileKey,
      usage: currentUsage + fileSize,
      quota,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
