'use client';

import { Client, Account, Databases } from 'appwrite';

const endpoint = process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || 'https://cloud.appwrite.io/v1';
const projectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';
const devKey = process.env['NEXT_PUBLIC_APPWRITE_DEV_KEY'] || '';
const isWebDev =
  process.env.NODE_ENV === 'development' && process.env['NEXT_PUBLIC_APP_PLATFORM'] === 'web';

export const appwriteClient = new Client().setEndpoint(endpoint).setProject(projectId);

// In web dev mode, proxy through Next.js to avoid CORS issues with Appwrite Cloud
if (typeof window !== 'undefined' && isWebDev) {
  appwriteClient.setEndpoint(`${window.location.origin}/appwrite`);
}

if (devKey) {
  appwriteClient.setDevKey(devKey);
}

export const appwriteAccount = new Account(appwriteClient);

export const appwriteDatabases = new Databases(appwriteClient);

// Re-export server utilities for backward compatibility.
// Server-only code should prefer importing from '@/utils/appwrite.server' directly.
export {
  APPWRITE_DATABASE_ID,
  COLLECTIONS,
  createAppwriteAdminClient,
  createAppwriteSessionClient,
} from './appwrite.server';
