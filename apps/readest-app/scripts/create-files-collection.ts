#!/usr/bin/env npx tsx
/**
 * Creates the 'files' collection in Appwrite database.
 *
 * Usage:
 *   npx tsx scripts/create-files-collection.ts
 *
 * Requires these env vars (from .env.tauri):
 *   NEXT_PUBLIC_APPWRITE_ENDPOINT
 *   NEXT_PUBLIC_APPWRITE_PROJECT_ID
 *   APPWRITE_API_KEY
 *   APPWRITE_DATABASE_ID
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client, Databases, IndexType } from 'node-appwrite';

// Load env vars from .env.tauri
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
  console.error('Missing required env vars in .env.tauri:');
  console.error('  NEXT_PUBLIC_APPWRITE_ENDPOINT');
  console.error('  NEXT_PUBLIC_APPWRITE_PROJECT_ID');
  console.error('  APPWRITE_API_KEY');
  console.error('  APPWRITE_DATABASE_ID');
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAttribute(collectionId: string, attrKey: string, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const attr = await databases.getAttribute(databaseId, collectionId, attrKey);
      if (attr.status === 'available') return;
    } catch {
      // attribute may not exist yet
    }
    await sleep(1000);
  }
  console.warn(`  Warning: attribute '${attrKey}' did not become available within ${maxWait}ms`);
}

async function main() {
  console.log(`\n🚀 Creating 'files' collection in Appwrite...`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Database: ${databaseId}\n`);

  const collectionId = 'files';

  // Check if collection already exists
  try {
    await databases.getCollection(databaseId, collectionId);
    console.log(`✅ Collection '${collectionId}' already exists!`);
    process.exit(0);
  } catch {
    console.log(`📝 Collection '${collectionId}' doesn't exist, creating...`);
  }

  // Create collection
  try {
    await databases.createCollection(databaseId, collectionId, 'Files', [
      'create("users")',
      'read("users")',
      'update("users")',
      'delete("users")',
    ]);
    console.log(`✅ Created collection '${collectionId}'`);
  } catch (error) {
    console.error(`❌ Failed to create collection:`, error);
    process.exit(1);
  }

  // Wait a bit for collection to be ready
  await sleep(2000);

  // Create attributes
  const attributes = [
    { key: 'user_id', type: 'string', size: 36, required: true },
    { key: 'book_hash', type: 'string', size: 64, required: false },
    { key: 'file_key', type: 'string', size: 512, required: true },
    { key: 'file_size', type: 'string', size: 20, required: true },
    { key: 'storage_file_id', type: 'string', size: 36, required: true },
    { key: 'created_at', type: 'string', size: 30, required: false },
    { key: 'deleted_at', type: 'string', size: 30, required: false },
  ];

  console.log(`\n📋 Creating ${attributes.length} attributes...`);
  for (const attr of attributes) {
    try {
      await databases.createStringAttribute(
        databaseId,
        collectionId,
        attr.key,
        attr.size,
        attr.required,
      );
      console.log(`  ✅ ${attr.key} (${attr.type}, size=${attr.size}, required=${attr.required})`);
      await waitForAttribute(collectionId, attr.key);
    } catch (error: any) {
      console.error(`  ❌ Failed to create attribute '${attr.key}':`, error.message);
    }
  }

  // Create indexes
  const indexes = [
    { key: 'idx_user_id', type: IndexType.Key, attributes: ['user_id'] },
    { key: 'idx_user_file_key', type: IndexType.Unique, attributes: ['user_id', 'file_key'] },
    { key: 'idx_user_book_hash', type: IndexType.Key, attributes: ['user_id', 'book_hash'] },
    { key: 'idx_storage_file_id', type: IndexType.Key, attributes: ['storage_file_id'] },
  ];

  console.log(`\n🔍 Creating ${indexes.length} indexes...`);
  await sleep(2000); // Wait for all attributes to be ready

  for (const index of indexes) {
    try {
      await databases.createIndex(
        databaseId,
        collectionId,
        index.key,
        index.type,
        index.attributes,
      );
      console.log(`  ✅ ${index.key} (${index.type})`);
    } catch (error: any) {
      console.error(`  ❌ Failed to create index '${index.key}':`, error.message);
    }
  }

  console.log(`\n🎉 Done! Collection 'files' is ready.`);
  console.log(
    `\n📝 Collection permissions set to: create("users"), read("users"), update("users"), delete("users")`,
  );
  console.log(`   This allows any authenticated user to manage their files.\n`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
