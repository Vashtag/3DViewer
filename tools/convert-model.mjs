#!/usr/bin/env node
/**
 * Convert an OBJ (+ .mtl + texture) into a Draco-compressed GLB for the viewer.
 *
 * Usage:
 *   node tools/convert-model.mjs <input.obj> <model-id>
 *
 * Example:
 *   node tools/convert-model.mjs ~/Downloads/knee.obj knee
 *   → writes models/knee/knee.glb
 *
 * The .mtl and texture referenced by the OBJ must sit next to it.
 * After running, add an entry to the MODELS array in js/main.js:
 *   { id: 'knee', label: 'Knee', file: 'models/knee/knee.glb' }
 *
 * Requires the dev tools installed once:  cd tools && npm install
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const bin = name => resolve(__dirname, 'node_modules', '.bin', name);

const [, , inputObj, modelId] = process.argv;
if (!inputObj || !modelId) {
  console.error('Usage: node tools/convert-model.mjs <input.obj> <model-id>');
  process.exit(1);
}
if (!existsSync(inputObj)) {
  console.error(`Input file not found: ${inputObj}`);
  process.exit(1);
}

const outDir = resolve(repoRoot, 'models', modelId);
mkdirSync(outDir, { recursive: true });
const plainGlb = resolve(outDir, `${modelId}.plain.glb`);
const finalGlb = resolve(outDir, `${modelId}.glb`);

console.log(`→ Converting ${inputObj} to glTF…`);
execFileSync(bin('obj2gltf'), ['-i', inputObj, '-o', plainGlb], { stdio: 'inherit' });

console.log('→ Applying Draco compression…');
execFileSync(bin('gltf-pipeline'),
  ['-i', plainGlb, '-o', finalGlb, '-d', '--draco.compressionLevel', '7'],
  { stdio: 'inherit' });

rmSync(plainGlb, { force: true });

console.log(`\n✔ Done: models/${modelId}/${modelId}.glb`);
console.log(`  Add this to the MODELS array in js/main.js:`);
console.log(`    { id: '${modelId}', label: '${modelId[0].toUpperCase() + modelId.slice(1)}', file: 'models/${modelId}/${modelId}.glb' },`);
