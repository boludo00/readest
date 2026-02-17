#!/usr/bin/env npx tsx
/**
 * Updates the entity_index attribute size to 500KB (was 100KB, too small)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client, Databases } from 'node-appwrite';

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
  } catch {}
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
  console.log(`\n🔧 Updating entity_index attribute size...`);

  const collectionId = 'book_entities';

  try {
    // Delete old attribute
    console.log('  Deleting old entity_index attribute...');
    await databases.deleteAttribute(databaseId, collectionId, 'entity_index');

    // Wait for deletion
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create new attribute with larger size
    console.log('  Creating new entity_index attribute (500KB)...');
    await databases.createStringAttribute(databaseId, collectionId, 'entity_index', 500000, true);

    // Wait for creation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`\n✅ Updated entity_index size to 500KB!`);
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

main();
