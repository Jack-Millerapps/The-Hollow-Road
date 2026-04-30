import { put, list } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const FILES = [
  'public/Models/Stonehush.glb',
  'public/Models/Deeproot.glb',
  'public/Models/Mirror_town.glb',
  'public/Models/The_unamed.glb',
  'public/Models/Ashwick.glb',
  'public/Models/Westwind.glb',
];

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN missing. Run: vercel env pull .env.local');
  process.exit(1);
}

const existing = new Map();
{
  const { blobs } = await list({ prefix: 'models/' });
  for (const b of blobs) existing.set(b.pathname, b.url);
}

const results = {};
for (const rel of FILES) {
  const abs = resolve(rel);
  const name = basename(rel);
  const key = `models/${name}`;
  if (existing.has(key)) {
    console.log(`skip  ${name} (already uploaded)`);
    results[name] = existing.get(key);
    continue;
  }
  console.log(`upload ${name} ...`);
  const data = await readFile(abs);
  const { url } = await put(key, data, {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'model/gltf-binary',
    allowOverwrite: false,
  });
  results[name] = url;
  console.log(`  -> ${url}`);
}

console.log('\n=== URL MAP ===');
console.log(JSON.stringify(results, null, 2));
