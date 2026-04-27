import { loadImage, createCanvas } from 'canvas';

const path = '/Users/gaelduong/Documents/Code/lingo-map/public/assets/me/2_City_Terrains_Singles_16x16/ME_Singles_City_Terrains_16x16_Sidewalk_1_28.png';

const img = await loadImage(path);
const c = createCanvas(img.width, img.height);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);

// Map: '.' = base color, '#' = visibly darker (shadow), '~' = mid-tone
const data = ctx.getImageData(0, 0, img.width, img.height).data;
const base = { r: 218, g: 212, b: 203 };

let s = '';
for (let y = 0; y < img.height; y++) {
  for (let x = 0; x < img.width; x++) {
    const i = (y * img.width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.abs(r - base.r) + Math.abs(g - base.g) + Math.abs(b - base.b);
    if (dist < 8) s += '.';
    else if (dist < 30) s += '~';
    else s += '#';
  }
  s += '\n';
}
console.log(s);
