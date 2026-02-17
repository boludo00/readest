import type { NextApiRequest, NextApiResponse } from 'next';
import { validateUserAndToken } from '@/utils/access';
import { createAppwriteAdminClient } from '@/utils/appwrite';
import { ID, Query } from 'node-appwrite';

const APPWRITE_DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || '';
const COLLECTION_ID = 'book_entities';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization;
    const { user, token } = await validateUserAndToken(authHeader);

    if (!user || !token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse request body
    const { bookHash, entities, entityIndex } = req.body;

    if (!bookHash || !entities || !entityIndex) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: bookHash, entities, entityIndex' });
    }

    // Initialize Appwrite admin client
    const { databases } = createAppwriteAdminClient();

    // Serialize entities and index to JSON strings
    const entitiesJson = JSON.stringify(entities);
    const entityIndexJson = JSON.stringify(entityIndex);

    // Check if document already exists for this user + book
    const existingDocs = await databases.listDocuments(APPWRITE_DATABASE_ID, COLLECTION_ID, [
      Query.equal('user_id', user.$id),
      Query.equal('book_hash', bookHash),
    ]);

    const now = new Date().toISOString();

    if (existingDocs.total > 0 && existingDocs.documents[0]) {
      // Update existing document
      const docId = existingDocs.documents[0].$id;
      await databases.updateDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, docId, {
        entities: entitiesJson,
        entity_index: entityIndexJson,
        updated_at: now,
      });

      return res.status(200).json({ success: true, action: 'updated', docId });
    } else {
      // Create new document
      const newDoc = await databases.createDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_ID,
        ID.unique(),
        {
          user_id: user.$id,
          book_hash: bookHash,
          entities: entitiesJson,
          entity_index: entityIndexJson,
          created_at: now,
          updated_at: now,
        },
      );

      return res.status(200).json({ success: true, action: 'created', docId: newDoc.$id });
    }
  } catch (error: any) {
    console.error('X-Ray upload error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
