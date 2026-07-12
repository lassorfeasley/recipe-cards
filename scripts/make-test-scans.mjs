// Generates synthetic scan fixtures: black background, 9 light "index cards"
// per scan with slight skew, front + back per batch. Batch 2's backs are
// rotated 180° to exercise the flip toggle.
//
// Like the real scanner output, scans are written PORTRAIT with the cards
// sideways; the upload route rotates them back to landscape.
import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "test-scans");
const DPI = 300;
const SCAN_W = 3300; // landscape working canvas; final file is rotated to portrait
const SCAN_H = 2550;
const CARD_W = Math.round(5 * DPI * 0.55); // scaled-down 3x5 so 9 fit
const CARD_H = Math.round(3 * DPI * 0.55);

function cardSvg(label, upsideDown) {
  const lines = Array.from({ length: 5 }, (_, i) => {
    const y = 55 + i * 28;
    return `<line x1="18" y1="${y}" x2="${CARD_W - 18}" y2="${y}" stroke="#9db4c8" stroke-width="2"/>`;
  }).join("");
  const transform = upsideDown ? `rotate(180 ${CARD_W / 2} ${CARD_H / 2})` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
    <g transform="${transform}">
      <rect width="${CARD_W}" height="${CARD_H}" fill="#f3ecd9"/>
      <line x1="18" y1="30" x2="${CARD_W - 18}" y2="30" stroke="#c96a5b" stroke-width="3"/>
      ${lines}
      <text x="24" y="24" font-family="Georgia" font-size="20" fill="#5a4632">${label}</text>
      <text x="24" y="86" font-family="Georgia" font-size="17" fill="#3b3b6d">1 c. sugar — 2 T. oleo</text>
      <text x="24" y="114" font-family="Georgia" font-size="17" fill="#3b3b6d">bake 350° till done</text>
    </g>
  </svg>`;
}

async function makeScan(file, labelPrefix, { upsideDown = false, scanW = SCAN_W, scanH = SCAN_H, offsetX = 0, offsetY = 0 } = {}) {
  const composites = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const n = row * 3 + col + 1;
      const angle = (Math.random() - 0.5) * 4; // ±2° skew
      const buf = await sharp(Buffer.from(cardSvg(`${labelPrefix} #${n}`, upsideDown)))
        .rotate(angle, { background: "#000000" })
        .png()
        .toBuffer();
      const meta = await sharp(buf).metadata();
      composites.push({
        input: buf,
        left: Math.round(offsetX + 80 + col * (CARD_W + 60) + (Math.random() - 0.5) * 20 - (meta.width - CARD_W) / 2),
        top: Math.round(offsetY + 120 + row * (CARD_H + 80) + (Math.random() - 0.5) * 20 - (meta.height - CARD_H) / 2),
      });
    }
  }
  const landscape = await sharp({
    create: { width: scanW, height: scanH, channels: 3, background: "#000000" },
  })
    .composite(composites)
    .png()
    .toBuffer();
  // Rotate 90° cw so the file is portrait with sideways cards, like a real
  // flatbed scan; upload's 90° ccw rotation restores upright landscape cards.
  await sharp(landscape)
    .rotate(90)
    .jpeg({ quality: 92 })
    .withMetadata({ density: DPI })
    .toFile(file);
  console.log("wrote", file);
}

for (const batch of [1, 2, 3]) {
  const dir = path.join(OUT, String(batch));
  fs.mkdirSync(dir, { recursive: true });
  await makeScan(path.join(dir, "Front.jpeg"), `Recipe B${batch}F`);
  // Batch 3 simulates cards shifting on the scanner bed between passes:
  // the scanner's auto-crop yields a different canvas size and grid offset.
  await makeScan(path.join(dir, "Back.jpeg"), `Back B${batch}B`, {
    upsideDown: batch === 2,
    ...(batch === 3 ? { scanW: SCAN_W + 260, scanH: SCAN_H - 140, offsetX: 210, offsetY: 60 } : {}),
  });
}
console.log("done — fixtures in", OUT);
