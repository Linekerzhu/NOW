#!/usr/bin/env node
/**
 * Split a large texture into a grid of tiles using sharp.
 *
 * Usage:
 *   node scripts/split-texture.mjs <input> <cols> <rows> <outDir>
 *
 * Example:
 *   node scripts/split-texture.mjs public/textures/earth-day-16k.jpg 4 2 public/textures/tiles/earth-day-16k
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const [,, inputPath, colsStr = '4', rowsStr = '2', outDir = 'tiles'] = process.argv;

if (!inputPath) {
  console.error('Usage: node split-texture.mjs <input> <cols> <rows> <outDir>');
  process.exit(1);
}

const cols = parseInt(colsStr, 10);
const rows = parseInt(rowsStr, 10);

const meta = await sharp(inputPath).metadata();
const { width, height } = meta;
const tileW = Math.floor(width / cols);
const tileH = Math.floor(height / rows);

console.log(`📐 Input: ${width}×${height}`);
console.log(`🔲 Tiles: ${cols}×${rows} = ${cols * rows} tiles of ${tileW}×${tileH}`);
console.log(`📁 Output: ${outDir}`);

mkdirSync(outDir, { recursive: true });

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const left = col * tileW;
    const top = row * tileH;
    const outFile = resolve(outDir, `col${col}_row${row}.jpg`);

    console.log(`  ✂️  col${col}_row${row}.jpg (offset ${left},${top})`);

    await sharp(inputPath)
      .extract({ left, top, width: tileW, height: tileH })
      .jpeg({ quality: 90 })
      .toFile(outFile);
  }
}

// Generate manifest.json
const manifest = {
  width, height, cols, rows, tileWidth: tileW, tileHeight: tileH,
  tiles: [],
};
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    manifest.tiles.push({ col, row, file: `col${col}_row${row}.jpg` });
  }
}
writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`\n🎉 Done! Generated ${cols * rows} tiles + manifest.json`);
