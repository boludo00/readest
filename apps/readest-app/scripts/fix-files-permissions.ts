#!/usr/bin/env npx tsx
/**
 * Fixes permissions on the 'files' collection to allow authenticated users.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client, Databases, Permission, Role } from 'node-appwrite';

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // file doesn't exist
  }
}

loadEnvFile(resolve(__dirname, '..', '.env.tauri'));

const endpoint = process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || '';
const projectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';
const apiKey = process.env['APPWRITE_API_KEY'] || '';
const databaseId = process.env['APPWRITE_DATABASE_ID'] || '';

if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Missing required env vars');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function main() {
  console.log(`\n🔧 Fixing permissions on 'files' collection...\n`);

  const collectionId = 'files';

  try {
    // Get current collection
    const collection = await databases.getCollection(databaseId, collectionId);
    console.log(`Current permissions:`, collection.$permissions);

    // Update with correct permissions
    const permissions = [
      Permission.create(Role.users()),
      Permission.read(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ];

    await databases.updateCollection(databaseId, collectionId, collection.name, permissions);

    console.log(`\n✅ Updated permissions to:`);
    console.log(`   - create("users")`);
    console.log(`   - read("users")`);
    console.log(`   - update("users")`);
    console.log(`   - delete("users")`);
    console.log(`\n🎉 Any authenticated user can now manage their files!\n`);
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

main();
