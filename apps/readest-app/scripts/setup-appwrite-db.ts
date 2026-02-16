#!/usr/bin/env npx tsx
/**
 * Sets up the Appwrite database collections, attributes, and indexes
 * required by the Readest sync system.
 *
 * Usage:
 *   dotenv -e .env.local -- npx tsx scripts/setup-appwrite-db.ts
 *
 * Requires these env vars in .env.local:
 *   NEXT_PUBLIC_APPWRITE_ENDPOINT
 *   NEXT_PUBLIC_APPWRITE_PROJECT_ID
 *   APPWRITE_API_KEY
 *   APPWRITE_DATABASE_ID  (if empty, creates a new database)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client, Databases, Storage, ID } from 'node-appwrite';

// Simple .env.local loader (no dotenv dependency needed)
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
    // file doesn't exist, rely on env vars being set externally
  }
}

loadEnvFile(resolve(__dirname, '..', '.env.local'));

const endpoint = process.env['NEXT_PUBLIC_APPWRITE_ENDPOINT'] || 'https://cloud.appwrite.io/v1';
const projectId = process.env['NEXT_PUBLIC_APPWRITE_PROJECT_ID'] || '';
const apiKey = process.env['APPWRITE_API_KEY'] || '';
let databaseId = process.env['APPWRITE_DATABASE_ID'] || '';

if (!projectId || !apiKey) {
  console.error('Missing NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_API_KEY in .env.local');
  process.exit(1);
}

const bucketId = process.env['APPWRITE_BUCKET_ID'] || 'books';

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const storage = new Storage(client);

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

interface AttributeDef {
  key: string;
  type: 'string' | 'string[]' | 'float[]';
  size?: number;
  required: boolean;
  array?: boolean;
}

interface IndexDef {
  key: string;
  type: 'key' | 'unique' | 'fulltext';
  attributes: string[];
  orders?: ('asc' | 'desc')[];
}

interface CollectionSchema {
  id: string;
  name: string;
  attributes: AttributeDef[];
  indexes: IndexDef[];
}

const collections: CollectionSchema[] = [
  {
    id: 'files',
    name: 'Files',
    attributes: [
      { key: 'user_id', type: 'string', size: 36, required: true },
      { key: 'book_hash', type: 'string', size: 64, required: false },
      { key: 'file_key', type: 'string', size: 512, required: true },
      { key: 'file_size', type: 'string', size: 20, required: true },
      { key: 'storage_file_id', type: 'string', size: 36, required: true },
      { key: 'created_at', type: 'string', size: 30, required: false },
      { key: 'deleted_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
      { key: 'idx_user_file_key', type: 'unique', attributes: ['user_id', 'file_key'] },
      { key: 'idx_user_book_hash', type: 'key', attributes: ['user_id', 'book_hash'] },
      { key: 'idx_storage_file_id', type: 'key', attributes: ['storage_file_id'] },
      { key: 'idx_deleted_at', type: 'key', attributes: ['deleted_at'] },
    ],
  },
  {
    id: 'books',
    name: 'Books',
    attributes: [
      { key: 'user_id', type: 'string', size: 36, required: true },
      { key: 'book_hash', type: 'string', size: 64, required: true },
      { key: 'meta_hash', type: 'string', size: 64, required: false },
      { key: 'format', type: 'string', size: 10, required: true },
      { key: 'title', type: 'string', size: 512, required: true },
      { key: 'source_title', type: 'string', size: 512, required: false },
      { key: 'author', type: 'string', size: 512, required: true },
      { key: 'group_id', type: 'string', size: 64, required: false },
      { key: 'group_name', type: 'string', size: 256, required: false },
      { key: 'tags', type: 'string', size: 64, required: false, array: true },
      { key: 'progress', type: 'float[]', size: 0, required: false },
      { key: 'reading_status', type: 'string', size: 16, required: false },
      { key: 'metadata', type: 'string', size: 65535, required: false },
      { key: 'created_at', type: 'string', size: 30, required: false },
      { key: 'updated_at', type: 'string', size: 30, required: false },
      { key: 'deleted_at', type: 'string', size: 30, required: false },
      { key: 'uploaded_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
      { key: 'idx_user_book', type: 'key', attributes: ['user_id', 'book_hash'] },
      { key: 'idx_book_hash', type: 'key', attributes: ['book_hash'] },
      { key: 'idx_meta_hash', type: 'key', attributes: ['meta_hash'] },
      { key: 'idx_updated_at', type: 'key', attributes: ['updated_at'] },
      { key: 'idx_deleted_at', type: 'key', attributes: ['deleted_at'] },
    ],
  },
  {
    id: 'book_configs',
    name: 'Book Configs',
    attributes: [
      { key: 'user_id', type: 'string', size: 36, required: true },
      { key: 'book_hash', type: 'string', size: 64, required: true },
      { key: 'meta_hash', type: 'string', size: 64, required: false },
      { key: 'location', type: 'string', size: 1024, required: false },
      { key: 'xpointer', type: 'string', size: 1024, required: false },
      { key: 'progress', type: 'string', size: 128, required: false },
      { key: 'search_config', type: 'string', size: 65535, required: false },
      { key: 'view_settings', type: 'string', size: 65535, required: false },
      { key: 'created_at', type: 'string', size: 30, required: false },
      { key: 'updated_at', type: 'string', size: 30, required: false },
      { key: 'deleted_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
      { key: 'idx_user_book', type: 'key', attributes: ['user_id', 'book_hash'] },
      { key: 'idx_book_hash', type: 'key', attributes: ['book_hash'] },
      { key: 'idx_meta_hash', type: 'key', attributes: ['meta_hash'] },
      { key: 'idx_updated_at', type: 'key', attributes: ['updated_at'] },
      { key: 'idx_deleted_at', type: 'key', attributes: ['deleted_at'] },
    ],
  },
  {
    id: 'book_notes',
    name: 'Book Notes',
    attributes: [
      { key: 'user_id', type: 'string', size: 36, required: true },
      { key: 'book_hash', type: 'string', size: 64, required: true },
      { key: 'meta_hash', type: 'string', size: 64, required: false },
      { key: 'note_id', type: 'string', size: 64, required: true },
      { key: 'type', type: 'string', size: 16, required: true },
      { key: 'cfi', type: 'string', size: 1024, required: true },
      { key: 'text', type: 'string', size: 65535, required: false },
      { key: 'style', type: 'string', size: 16, required: false },
      { key: 'color', type: 'string', size: 16, required: false },
      { key: 'note', type: 'string', size: 65535, required: true },
      { key: 'created_at', type: 'string', size: 30, required: false },
      { key: 'updated_at', type: 'string', size: 30, required: false },
      { key: 'deleted_at', type: 'string', size: 30, required: false },
    ],
    indexes: [
      { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
      { key: 'idx_user_book', type: 'key', attributes: ['user_id', 'book_hash'] },
      { key: 'idx_book_hash', type: 'key', attributes: ['book_hash'] },
      { key: 'idx_meta_hash', type: 'key', attributes: ['meta_hash'] },
      { key: 'idx_note_id', type: 'key', attributes: ['note_id'] },
      { key: 'idx_updated_at', type: 'key', attributes: ['updated_at'] },
      { key: 'idx_deleted_at', type: 'key', attributes: ['deleted_at'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAttribute(
  dbId: string,
  collectionId: string,
  attrKey: string,
  maxWait = 30000,
) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const attr = await databases.getAttribute(dbId, collectionId, attrKey);
      if (attr.status === 'available') return;
    } catch {
      // attribute may not exist yet
    }
    await sleep(1000);
  }
  console.warn(`  Warning: attribute '${attrKey}' did not become available within ${maxWait}ms`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Appwrite endpoint: ${endpoint}`);
  console.log(`Project ID: ${projectId}`);

  // Create or verify database
  if (!databaseId) {
    console.log('\nNo APPWRITE_DATABASE_ID set, creating database...');
    const db = await databases.create(ID.unique(), 'readest-db');
    databaseId = db.$id;
    console.log(`Created database: ${databaseId}`);
    console.log(`\n** Add this to your .env.local: APPWRITE_DATABASE_ID=${databaseId} **\n`);
  } else {
    console.log(`Using existing database: ${databaseId}`);
    try {
      await databases.get(databaseId);
    } catch {
      console.error(`Database '${databaseId}' not found. Check your APPWRITE_DATABASE_ID.`);
      process.exit(1);
    }
  }

  // Create or verify storage bucket for book files
  console.log(`\n--- Storage Bucket: ${bucketId} ---`);
  try {
    await storage.getBucket(bucketId);
    console.log(`  Bucket already exists`);
  } catch {
    try {
      const maxFileSize = 50 * 1000 * 1000; // 50 MB (Appwrite Cloud limit)
      await storage.createBucket(
        bucketId,
        'Books',
        [], // No direct user access — all access goes through API routes with admin key
        false, // fileSecurity — bucket-level permissions
        undefined, // enabled
        maxFileSize,
        [], // Allow all file types (books + cover images)
      );
      console.log(`  Created bucket: ${bucketId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Error creating bucket: ${msg}`);
    }
  }

  // Process each collection
  for (const schema of collections) {
    console.log(`\n--- Collection: ${schema.name} (${schema.id}) ---`);

    // Create collection if it doesn't exist
    let collectionExists = false;
    try {
      await databases.getCollection(databaseId, schema.id);
      collectionExists = true;
      console.log(`  Collection already exists`);
    } catch {
      // doesn't exist, create it
    }

    if (!collectionExists) {
      await databases.createCollection(databaseId, schema.id, schema.name);
      console.log(`  Created collection`);
    }

    // Get existing attributes to skip duplicates
    const existingAttrs = new Set<string>();
    try {
      const attrList = await databases.listAttributes(databaseId, schema.id);
      for (const attr of attrList.attributes) {
        existingAttrs.add((attr as { key: string }).key);
      }
    } catch {
      // no attributes yet
    }

    // Create attributes
    for (const attr of schema.attributes) {
      if (existingAttrs.has(attr.key)) {
        console.log(`  Attribute '${attr.key}' already exists, skipping`);
        continue;
      }

      try {
        if (attr.type === 'float[]') {
          // progress field: array of floats
          await databases.createFloatAttribute(
            databaseId,
            schema.id,
            attr.key,
            attr.required,
            undefined, // min
            undefined, // max
            undefined, // default
            true, // array
          );
        } else if (attr.array) {
          // string array (e.g. tags)
          await databases.createStringAttribute(
            databaseId,
            schema.id,
            attr.key,
            attr.size!,
            attr.required,
            undefined, // default
            true, // array
            false, // encrypt
          );
        } else {
          await databases.createStringAttribute(
            databaseId,
            schema.id,
            attr.key,
            attr.size!,
            attr.required,
          );
        }
        console.log(`  Created attribute: ${attr.key}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists')) {
          console.log(`  Attribute '${attr.key}' already exists`);
        } else {
          console.error(`  Error creating attribute '${attr.key}': ${msg}`);
        }
      }
    }

    // Wait for all attributes to be available before creating indexes
    console.log(`  Waiting for attributes to be available...`);
    for (const attr of schema.attributes) {
      if (!existingAttrs.has(attr.key)) {
        await waitForAttribute(databaseId, schema.id, attr.key);
      }
    }

    // Get existing indexes to skip duplicates
    const existingIndexes = new Set<string>();
    try {
      const indexList = await databases.listIndexes(databaseId, schema.id);
      for (const idx of indexList.indexes) {
        existingIndexes.add(idx.key);
      }
    } catch {
      // no indexes yet
    }

    // Create indexes
    for (const idx of schema.indexes) {
      if (existingIndexes.has(idx.key)) {
        console.log(`  Index '${idx.key}' already exists, skipping`);
        continue;
      }

      try {
        await databases.createIndex(
          databaseId,
          schema.id,
          idx.key,
          idx.type,
          idx.attributes,
          idx.orders,
        );
        console.log(`  Created index: ${idx.key}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists')) {
          console.log(`  Index '${idx.key}' already exists`);
        } else {
          console.error(`  Error creating index '${idx.key}': ${msg}`);
        }
      }
    }
  }

  console.log('\nDone! Database setup complete.');
  if (!process.env['APPWRITE_DATABASE_ID']) {
    console.log(`\nRemember to add to .env.local:\n  APPWRITE_DATABASE_ID=${databaseId}`);
  }
  if (!process.env['APPWRITE_BUCKET_ID']) {
    console.log(`\nRemember to add to .env.local:\n  APPWRITE_BUCKET_ID=${bucketId}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
