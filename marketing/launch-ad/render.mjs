// Renders ad.html frame by frame and encodes the MP4.
//   node marketing/launch-ad/render.mjs              16:9, 1920x1080
//   node marketing/launch-ad/render.mjs vertical     9:16, 1080x1920
//   node marketing/launch-ad/render.mjs stills 3,6.5,12   PNG stills at those seconds (for review)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const vertical = args.includes('vertical');
const stillsArg = args.indexOf('stills');
const FPS = 30;
const [W, H] = vertical ? [1080, 1920] : [1920, 1080];

// Use Playwright's own Chromium if it is installed; otherwise the newest one already on this machine.
function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const exe = join(root, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: findChrome() });
}
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'ad.html')).href + '?render' + (vertical ? '#vertical' : ''));
await page.waitForFunction(() => window.READY === true && [...document.images].every((i) => i.complete));

if (stillsArg !== -1) {
  const times = (args[stillsArg + 1] ?? '1').split(',').map(Number);
  for (const t of times) {
    await page.evaluate((tt) => window.seek(tt), t);
    const file = join(out, `still-${vertical ? 'v' : 'h'}-${String(t).replace('.', '_')}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  process.exit(0);
}

const music = join(out, 'music.wav');
const file = join(out, vertical ? 'sleek-connect-ad-vertical.mp4' : 'sleek-connect-ad.mp4');
const frames = 30 * FPS;
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  ...(existsSync(music) ? ['-i', music] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  ...(existsSync(music) ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
  file,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < frames; i++) {
  await page.evaluate((tt) => window.seek(tt), i / FPS);
  const png = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 90 === 0) console.log(`frame ${i}/${frames}`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(file);
