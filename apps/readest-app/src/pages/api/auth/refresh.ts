import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createAppwriteAdminClient } from '@/utils/appwrite.server';

/**
 * Server-side JWT refresh endpoint.
 *
 * On iOS/Tauri the Appwrite session cookies don't persist across app restarts,
 * so the client-side `appwriteAccount.createJWT()` fails. This endpoint lets
 * the client request a fresh JWT using the admin SDK, as long as the caller
 * can prove their identity with a still-valid JWT or a matching userId.
 *
 * POST /api/auth/refresh
 * Body: { userId: string }
 * Header: Authorization: Bearer <jwt>  (may be expired — used as best-effort validation)
 *
 * Returns: { jwt: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const authHeader = req.headers['authorization'];
    const oldToken = authHeader?.replace('Bearer ', '') || '';

    const { users } = createAppwriteAdminClient();

    // First, try to validate the old JWT — if it's still valid, we know the
    // caller is who they say they are.
    if (oldToken) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Client, Account } = require('node-appwrite') as typeof import('node-appwrite');
        const endpoint =
          process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || 'https://cloud.appwrite.io/v1';
        const projectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';
        const sessionClient = new Client()
          .setEndpoint(endpoint)
          .setProject(projectId)
          .setJWT(oldToken);
        const account = new Account(sessionClient);
        const verifiedUser = await account.get();

        if (verifiedUser.$id !== userId) {
          return res.status(403).json({ error: 'User ID mismatch' });
        }
      } catch {
        // Old JWT is expired — fall through to admin verification below
      }
    }

    // Verify the user actually exists via admin SDK
    try {
      await users.get(userId);
    } catch {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create a fresh JWT for this user using the admin SDK
    const jwtResult = await users.createJWT(userId);

    return res.status(200).json({ jwt: jwtResult.jwt });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Failed to refresh token' });
  }
}
