// Diagnostic: estimate the tilt of the card's top edge in an exported crop.
import sharp from "sharp";

const file = process.argv[2];
const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

const pts = [];
for (let x = Math.round(width * 0.15); x < width * 0.85; x += 5) {
  for (let y = 0; y < height; y++) {
    if (data[y * width + x] > 80) {
      pts.push([x, y]);
      break;
    }
  }
}
// least squares fit y = a + b x
const n = pts.length;
const sx = pts.reduce((s, p) => s + p[0], 0);
const sy = pts.reduce((s, p) => s + p[1], 0);
const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0);
const sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
console.log(`${file}: top-edge tilt = ${((Math.atan(b) * 180) / Math.PI).toFixed(2)}° (${n} samples)`);
