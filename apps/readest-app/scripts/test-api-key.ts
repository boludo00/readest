#!/usr/bin/env npx tsx
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

console.log('Testing API key...\n');
console.log('Endpoint:', endpoint);
console.log('Project:', projectId);
console.log('Database:', databaseId);
console.log('API Key:', apiKey.substring(0, 20) + '...');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function test() {
  try {
    console.log('\n1️⃣ Testing database access...');
    const db = await databases.get(databaseId);
    console.log('✅ Can access database:', db.name);

    console.log('\n2️⃣ Testing files collection access...');
    const collection = await databases.getCollection(databaseId, 'files');
    console.log('✅ Can access collection:', collection.name);

    console.log('\n3️⃣ Testing document query (this is what fails in upload)...');
    const docs = await databases.listDocuments(databaseId, 'files');
    console.log('✅ Can query documents! Count:', docs.total);

    console.log('\n🎉 API key works perfectly! The issue must be elsewhere.\n');
  } catch (error: any) {
    console.error('\n❌ API key test FAILED:', error.message);
    console.error('Response:', error.response);
    console.error('\nThis means your API key on Railway might be different or invalid!\n');
  }
}

test();
