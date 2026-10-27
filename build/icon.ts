import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

const SRC = path.resolve(process.argv[2] ?? "public/gallery/portrait-soft-light.webp");
const OUT512 = path.resolve(process.argv[3] ?? "public/icon-512.png");
const OUT192 = path.resolve(process.argv[4] ?? "public/icon-192.png");

async function main() {
  const raw = fs.readFileSync(SRC);
  const img = await Jimp.read(raw);
  console.log("decoded:", img.width, img.height);

  const max = 512;
  const scale = Math.max(max / img.width, max / img.height, 1);
  img.scale({ w: Math.round(img.width * scale), h: Math.round(img.height * scale) });
  img.crop({
    x: Math.round((img.width - max) / 2),
    y: Math.round((img.height - max) / 2),
    w: max,
    h: max,
  });

  const bg = new Jimp(max, max, 0x1a1625);
  bg.composite(img, Math.round((max - img.width) / 2), Math.round((max - img.height) / 2));

  bg.scan(0, 0, max, max, function (c, x, y) {
    const dx = (x - max / 2) / (max / 2);
    const dy = (y - max / 2) / (max / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.7) {
      const rim = Math.max(0.25, 0.9 - d * 0.5);
      c[0] = Math.min(255, c[0] + Math.round(18 * rim));
      c[1] = Math.min(255, c[1] + Math.round(6 * rim));
      c[2] = Math.min(255, c[2] + Math.round(22 * rim));
    }
  });

  await img.writeAsync(OUT512, "image/png");
  const thumb = bg.clone();
  thumb.scale({ w: 192, h: 192 });
  await thumb.writeAsync(OUT192, "image/png");
  console.log("wrote", OUT192, OUT512);
}

main().catch((err) => {
  console.error("failed", err?.message);
  process.exit(1);
});
