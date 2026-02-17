import type { NextApiRequest, NextApiResponse } from 'next';
import { validateUserAndToken } from '@/utils/access';
import { createAppwriteAdminClient } from '@/utils/appwrite';
import { Query } from 'node-appwrite';

const APPWRITE_DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || '';
const COLLECTION_ID = 'book_entities';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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
      return res.status(404).json({ error: 'X-Ray data not found for this book' });
    }

    const doc = docs.documents[0];

    // Parse JSON strings back to objects
    const entities = JSON.parse(doc['entities'] as string);
    const entityIndex = JSON.parse(doc['entity_index'] as string);

    return res.status(200).json({
      success: true,
      bookHash,
      entities,
      entityIndex,
      createdAt: doc['created_at'],
      updatedAt: doc['updated_at'],
    });
  } catch (error: any) {
    console.error('X-Ray download error:', error);
    return res.status(500).json({ error: error.message || 'Download failed' });
  }
}
