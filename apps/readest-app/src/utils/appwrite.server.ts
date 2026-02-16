/**
 * Server-side Appwrite utilities.
 * These use `node-appwrite` and must ONLY be imported in server contexts
 * (API routes, server components). Do NOT import from client components.
 */

export const APPWRITE_DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || '';
export const APPWRITE_BUCKET_ID = process.env['APPWRITE_BUCKET_ID'] || 'books';

export const COLLECTIONS = {
  BOOKS: 'books',
  BOOK_CONFIGS: 'book_configs',
  BOOK_NOTES: 'book_notes',
  FILES: 'files',
} as const;

/**
 * Creates an admin Appwrite client for server-side operations.
 * Uses the APPWRITE_API_KEY for elevated permissions.
 */
export const createAppwriteAdminClient = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client, Databases, Users, Storage } =
    require('node-appwrite') as typeof import('node-appwrite');

  const serverEndpoint =
    process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || 'https://cloud.appwrite.io/v1';
  const serverProjectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';
  const apiKey = process.env['APPWRITE_API_KEY'] || '';

  if (!APPWRITE_DATABASE_ID) {
    console.warn('APPWRITE_DATABASE_ID is not set — database operations will fail');
  }

  const adminClient = new Client()
    .setEndpoint(serverEndpoint)
    .setProject(serverProjectId)
    .setKey(apiKey);

  return {
    databases: new Databases(adminClient),
    users: new Users(adminClient),
    storage: new Storage(adminClient),
    client: adminClient,
  };
};

/**
 * Creates a server-side Appwrite client authenticated with a user JWT.
 * Used by API routes to validate and operate as the requesting user.
 */
export const createAppwriteSessionClient = (jwt: string) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client, Databases, Account } = require('node-appwrite') as typeof import('node-appwrite');

  const serverEndpoint =
    process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || 'https://cloud.appwrite.io/v1';
  const serverProjectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';

  const sessionClient = new Client()
    .setEndpoint(serverEndpoint)
    .setProject(serverProjectId)
    .setJWT(jwt);

  return {
    databases: new Databases(sessionClient),
    account: new Account(sessionClient),
    client: sessionClient,
  };
};
