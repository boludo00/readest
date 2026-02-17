import type { NextApiRequest, NextApiResponse } from 'next';
import { validateUserAndToken } from '@/utils/access';
import { createAppwriteAdminClient } from '@/utils/appwrite';
import { Query } from 'node-appwrite';

const APPWRITE_DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || '';
const COLLECTION_ID = 'book_entities';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization;
    const { user, token } = await validateUserAndToken(authHeader);

    if (!user || !token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get bookHash from query params
    const { bookHash } = req.query;

    if (!bookHash || typeof bookHash !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid bookHash parameter' });
    }

    // Initialize Appwrite admin client
    const { databases } = createAppwriteAdminClient();

    // Query for the document
    const docs = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTION_ID, [
      Query.equal('user_id', user.$id),
      Query.equal('book_hash', bookHash),
    ]);

    if (docs.total === 0 || !docs.documents[0]) {
      // Nothing to delete — treat as success
      return res.status(200).json({ success: true, action: 'not_found' });
    }

    const docId = docs.documents[0].$id;
    await databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, docId);

    return res.status(200).json({ success: true, action: 'deleted', docId });
  } catch (error: any) {
    console.error('X-Ray delete error:', error);
    return res.status(500).json({ error: error.message || 'Delete failed' });
  }
}
