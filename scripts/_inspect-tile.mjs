import { loadImage, createCanvas } from 'canvas';

const path = '/Users/gaelduong/Documents/Code/lingo-map/public/assets/me/2_City_Terrains_Singles_16x16/ME_Singles_City_Terrains_16x16_Sidewalk_1_28.png';

const img = await loadImage(path);
console.log(`size: ${img.width} x ${img.height}`);

const c = createCanvas(img.width, img.height);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);

// Sample center column and center row to detect any "cross" in the source.
const centerX = img.width / 2 - 1;
const centerY = img.height / 2 - 1;

console.log('\n=== row at y=15 (just above center): pixel rgb at each x ===');
const rowPixels = ctx.getImageData(0, 15, img.width, 1).data;
for (let x = 0; x < img.width; x++) {
  const i = x * 4;
  console.log(`  x=${x}: rgba(${rowPixels[i]}, ${rowPixels[i+1]}, ${rowPixels[i+2]}, ${rowPixels[i+3]})`);
}

console.log('\n=== row at y=16 (center boundary): pixel rgb at each x ===');
const rowPixels2 = ctx.getImageData(0, 16, img.width, 1).data;
for (let x = 0; x < img.width; x++) {
  const i = x * 4;
  console.log(`  x=${x}: rgba(${rowPixels2[i]}, ${rowPixels2[i+1]}, ${rowPixels2[i+2]}, ${rowPixels2[i+3]})`);
}

console.log('\n=== column at x=15 (just left of center) ===');
const colPixels = ctx.getImageData(15, 0, 1, img.height).data;
for (let y = 0; y < img.height; y++) {
  const i = y * 4;
  console.log(`  y=${y}: rgba(${colPixels[i]}, ${colPixels[i+1]}, ${colPixels[i+2]}, ${colPixels[i+3]})`);
}
