import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import {
  createAppwriteAdminClient,
  APPWRITE_BUCKET_ID,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'PUT' && req.method !== 'POST') {
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

    // Verify the file record exists and belongs to this user
    const fileRecord = await databases.getDocument(APPWRITE_DATABASE_ID, COLLECTIONS.FILES, docId);
    if (fileRecord['user_id'] !== user.$id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const body = await readRawBody(req);
    if (body.length === 0) {
      return res.status(400).json({ error: 'Empty body' });
    }

    const storageFileId = fileRecord['storage_file_id'] as string;
    const fileName = (fileRecord['file_key'] as string).split('/').pop() || 'book';

    // Delete existing file if re-uploading
    try {
      await storage.getFile(APPWRITE_BUCKET_ID, storageFileId);
      await storage.deleteFile(APPWRITE_BUCKET_ID, storageFileId);
    } catch {
      // File doesn't exist yet — that's fine
    }

    // Use Node.js File API (node-appwrite expects a File object)
    const file = new File([new Uint8Array(body)], fileName);
    await storage.createFile(APPWRITE_BUCKET_ID, storageFileId, file);

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Upload data error:', message, error);
    return res.status(500).json({ error: `Upload failed: ${message}` });
  }
}
