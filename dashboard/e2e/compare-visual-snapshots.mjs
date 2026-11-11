import { readFile, readdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { join } from "node:path";

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error("usage: node compare-visual-snapshots.mjs <before-dir> <after-dir>");
  process.exit(2);
}

const names = (await readdir(beforeDir)).filter(name => name.endsWith(".png")).sort();
let failed = false;
for (const name of names) {
  const [before, after] = await Promise.all([decodePng(join(beforeDir, name)), decodePng(join(afterDir, name))]);
  if (before.width !== after.width || before.height !== after.height) {
    console.log(`${name}: SIZE ${before.width}x${before.height} -> ${after.width}x${after.height}`);
    failed = true;
    continue;
  }
  let changed = 0;
  let material = 0;
  let sum = 0;
  let max = 0;
  const pixels = before.width * before.height;
  for (let i = 0; i < before.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(before.data[i] - after.data[i]),
      Math.abs(before.data[i + 1] - after.data[i + 1]),
      Math.abs(before.data[i + 2] - after.data[i + 2]),
      Math.abs(before.data[i + 3] - after.data[i + 3]),
    );
    if (delta > 0) changed += 1;
    if (delta > 12) material += 1;
    sum += delta;
    max = Math.max(max, delta);
  }
  const changedRatio = changed / pixels;
  const materialRatio = material / pixels;
  const mean = sum / pixels;
  console.log(`${name}: changed=${percent(changedRatio)} material=${percent(materialRatio)} mean=${mean.toFixed(3)} max=${max}`);
  // Text antialiasing, current-time copy, and looping scene animation can move a small number
  // of pixels. Layout/color regressions affect a much larger part of the viewport.
  if (materialRatio > 0.015 || mean > 1.5) failed = true;
}

process.exitCode = failed ? 1 : 0;

function percent(value) {
  return `${(value * 100).toFixed(3)}%`;
}

async function decodePng(path) {
  const png = await readFile(path);
  const signature = "89504e470d0a1a0a";
  if (png.subarray(0, 8).toString("hex") !== signature) throw new Error(`${path}: not a PNG`);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`${path}: unsupported PNG format ${bitDepth}/${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(width * height * channels);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source++];
      const left = x >= channels ? decoded[row + x - channels] : 0;
      const up = y > 0 ? decoded[row + x - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? decoded[row + x - stride - channels] : 0;
      decoded[row + x] = (value + unfilter(filter, left, up, upperLeft)) & 255;
    }
  }
  if (channels === 4) return { width, height, data: decoded };
  const rgba = Buffer.alloc(width * height * 4);
  for (let sourceIndex = 0, target = 0; sourceIndex < decoded.length; sourceIndex += 3, target += 4) {
    rgba[target] = decoded[sourceIndex];
    rgba[target + 1] = decoded[sourceIndex + 1];
    rgba[target + 2] = decoded[sourceIndex + 2];
    rgba[target + 3] = 255;
  }
  return { width, height, data: rgba };
}

function unfilter(filter, left, up, upperLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) {
    const prediction = left + up - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const upDistance = Math.abs(prediction - up);
    const upperLeftDistance = Math.abs(prediction - upperLeft);
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
  }
  throw new Error(`unsupported PNG filter ${filter}`);
}
