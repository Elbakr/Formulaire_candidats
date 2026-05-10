// Generate PWA icon set from SVG sources using sharp.
// Run: node scripts/generate-icons.mjs

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, "..", "public", "icons");

mkdirSync(ICONS_DIR, { recursive: true });

const sourceSvg = readFileSync(resolve(ICONS_DIR, "source.svg"));
const maskableSvg = readFileSync(resolve(ICONS_DIR, "source-maskable.svg"));
const shortcutSvg = readFileSync(resolve(ICONS_DIR, "source-shortcut-planning.svg"));

const targets = [
  { svg: sourceSvg, size: 192, name: "icon-192.png" },
  { svg: sourceSvg, size: 512, name: "icon-512.png" },
  { svg: sourceSvg, size: 180, name: "apple-touch-icon.png" },
  { svg: maskableSvg, size: 192, name: "icon-maskable-192.png" },
  { svg: maskableSvg, size: 512, name: "icon-maskable-512.png" },
  { svg: shortcutSvg, size: 96, name: "shortcut-planning.png" },
];

for (const t of targets) {
  const out = resolve(ICONS_DIR, t.name);
  // eslint-disable-next-line no-await-in-loop
  const buf = await sharp(t.svg, { density: 384 })
    .resize(t.size, t.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(out, buf);
  console.log(`ok  ${t.name}  ${t.size}x${t.size}  ${(buf.length / 1024).toFixed(1)} KB`);
}

console.log("Icons generated in", ICONS_DIR);
