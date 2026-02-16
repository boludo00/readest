import type { NextApiRequest, NextApiResponse } from 'next';
import { Query } from 'node-appwrite';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  createAppwriteAdminClient,
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
} from '@/utils/appwrite.server';
import { validateUserAndToken } from '@/utils/access';

async function deleteUserDocuments(
  databases: ReturnType<typeof createAppwriteAdminClient>['databases'],
  collectionId: string,
  userId: string,
): Promise<number> {
  let deleted = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await databases.listDocuments(APPWRITE_DATABASE_ID, collectionId, [
      Query.equal('user_id', userId),
      Query.limit(100),
    ]);

    if (response.documents.length === 0) {
      hasMore = false;
      break;
    }

    for (const doc of response.documents) {
      await databases.deleteDocument(APPWRITE_DATABASE_ID, collectionId, doc.$id);
      deleted++;
    }

    hasMore = response.documents.length === 100;
  }

  return deleted;
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

    const { databases, users } = createAppwriteAdminClient();

    // Delete all user data from database collections before deleting the account
    await Promise.all([
      deleteUserDocuments(databases, COLLECTIONS.BOOKS, user.$id),
      deleteUserDocuments(databases, COLLECTIONS.BOOK_CONFIGS, user.$id),
      deleteUserDocuments(databases, COLLECTIONS.BOOK_NOTES, user.$id),
    ]);

    await users.delete(user.$id);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
