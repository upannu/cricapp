// Copies the ffmpeg.wasm single-threaded core into public/ so it's served
// same-origin (avoids CDN/CORS dependency and version drift). Runs on every
// `npm install` since the ~32MB wasm binary isn't committed to git.
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "node_modules", "@ffmpeg", "core", "dist", "umd");
const destDir = path.join(__dirname, "..", "public", "ffmpeg");

if (!fs.existsSync(srcDir)) {
  console.warn("[copy-ffmpeg-core] @ffmpeg/core not found, skipping (video transcoding will be unavailable)");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}
console.log("[copy-ffmpeg-core] copied ffmpeg-core.js + ffmpeg-core.wasm to public/ffmpeg/");
