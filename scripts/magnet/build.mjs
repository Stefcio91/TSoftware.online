// Buduje lead magnet „30 procesów, które da się zautomatyzować w tydzień” w dwóch wersjach językowych:
//   pl: scripts/magnet/magnet.html     →  assets/dl/30-procesow-do-automatyzacji.pdf           (A4, 14 stron)
//                                      →  assets/img/magnet-cover.png                           (okładka, 2x)
//                                      →  assets/img/magnet-cover-400.webp, -800.webp           (okładka na stronę, srcset)
//   en: scripts/magnet/magnet-en.html  →  assets/dl/30-processes-to-automate-in-a-week.pdf
//                                      →  assets/img/magnet-cover-en.png
//                                      →  assets/img/magnet-cover-en-400.webp, -800.webp
// Uruchomienie: node scripts/magnet/build.mjs [--lang=pl,en] [--shots=<katalog>] [--shot-pages=1,2,4]
//   --lang        które wersje budować (domyślnie obie)
//   --shots       dodatkowo zapisuje podglądy wybranych stron (PNG, ~1240 px szerokości) do katalogu/<lang>/
//   --shot-pages  numery stron do podglądu (domyślnie 1,2,4)
// Wymaga Playwright z Chromium: lokalnie (npm i playwright) albo globalnie
// (/opt/node22/lib/node_modules/playwright, nadpisanie: PLAYWRIGHT_PATH=...).
// WebP okładki powstaje w Chromium (canvas), bez dodatkowych zależności.
// Kończy się kodem 1, gdy którakolwiek strona ma treść wystającą poza kontener .page.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, stat, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
  ].filter(Boolean);
  for (const id of candidates) {
    try {
      return require(id);
    } catch (err) {
      if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  throw new Error('Nie znaleziono Playwright. Zainstaluj: npm i playwright && npx playwright install chromium, albo ustaw PLAYWRIGHT_PATH.');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const LANGS = {
  pl: {
    src: path.join(here, 'magnet.html'),
    pdf: path.join(root, 'assets', 'dl', '30-procesow-do-automatyzacji.pdf'),
    cover: path.join(root, 'assets', 'img', 'magnet-cover.png'),
    webp: (w) => path.join(root, 'assets', 'img', `magnet-cover-${w}.webp`),
  },
  en: {
    src: path.join(here, 'magnet-en.html'),
    pdf: path.join(root, 'assets', 'dl', '30-processes-to-automate-in-a-week.pdf'),
    cover: path.join(root, 'assets', 'img', 'magnet-cover-en.png'),
    webp: (w) => path.join(root, 'assets', 'img', `magnet-cover-en-${w}.webp`),
  },
};
const WEBP_WIDTHS = [400, 800];
const WEBP_QUALITY = 0.82;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const shotsDir = typeof args.shots === 'string' ? path.resolve(args.shots) : null;
const shotPages = String(args['shot-pages'] || '1,2,4')
  .split(',')
  .map((s) => parseInt(s, 10))
  .filter((n) => Number.isInteger(n) && n > 0);
const langs = String(args.lang || Object.keys(LANGS).join(','))
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
for (const l of langs) {
  if (!LANGS[l]) {
    console.error(`Nieznany język: ${l} (dostępne: ${Object.keys(LANGS).join(', ')})`);
    process.exit(2);
  }
}

const { chromium } = await loadPlaywright();

const browser = await chromium.launch();
let overflowing = [];

/* Zmniejsza PNG okładki do podanej szerokości i koduje jako WebP w przeglądarce (canvas). */
async function pngToWebp(page, png, width, quality) {
  const b64 = await page.evaluate(
    async ({ b64, width, quality }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const h = Math.round((img.naturalHeight * width) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = width;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, h);
      return c.toDataURL('image/webp', quality).split(',')[1];
    },
    { b64: png.toString('base64'), width, quality },
  );
  return Buffer.from(b64, 'base64');
}

async function build(lang) {
  const L = LANGS[lang];
  console.log(`\n=== ${lang.toUpperCase()}: ${path.relative(root, L.src)} ===`);
  await mkdir(path.dirname(L.pdf), { recursive: true });
  await mkdir(path.dirname(L.cover), { recursive: true });

  // --- 1. PDF + kontrola przepełnienia stron (układ drukowany) ---
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('pageerror:', err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('console:', msg.text()); });

  await page.goto(pathToFileURL(L.src).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  const fontsOk = await page.evaluate(() =>
    ['Bricolage Grotesque', 'IBM Plex Sans', 'IBM Plex Mono'].map((f) => [f, document.fonts.check(`12px "${f}"`)]),
  );
  for (const [f, ok] of fontsOk) console.log(`font ${ok ? 'OK ' : 'BRAK'} ${f}`);

  const pages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.page')).map((el, i) => ({
      n: i + 1,
      id: el.id || '',
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    })),
  );
  for (const p of pages) {
    const over = p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth;
    if (over) overflowing.push({ lang, ...p });
    console.log(
      `strona ${String(p.n).padStart(2)} ${over ? 'PRZEPEŁNIONA' : 'ok'}  wys. ${p.scrollHeight}/${p.clientHeight}px  szer. ${p.scrollWidth}/${p.clientWidth}px${p.id ? '  #' + p.id : ''}`,
    );
  }

  await page.pdf({
    path: L.pdf,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const pdfSize = (await stat(L.pdf)).size;
  console.log(`PDF: ${path.relative(root, L.pdf)} (${(pdfSize / 1024).toFixed(0)} KB, ${pages.length} stron w HTML)`);

  // --- 2. Okładka jako PNG (2x) i WebP do srcset na stronie ---
  const cover = page.locator('.page').first();
  await cover.screenshot({ path: L.cover, type: 'png', scale: 'device' });
  const coverSize = (await stat(L.cover)).size;
  console.log(`Okładka: ${path.relative(root, L.cover)} (${(coverSize / 1024).toFixed(0)} KB)`);
  const png = await readFile(L.cover);
  for (const w of WEBP_WIDTHS) {
    const out = L.webp(w);
    await writeFile(out, await pngToWebp(page, png, w, WEBP_QUALITY));
    console.log(`WebP: ${path.relative(root, out)} (${((await stat(out)).size / 1024).toFixed(0)} KB)`);
  }
  await ctx.close();

  // --- 3. Podglądy stron (opcjonalnie) ---
  if (shotsDir) {
    const dir = path.join(shotsDir, lang);
    await mkdir(dir, { recursive: true });
    const pageCssWidth = (210 / 25.4) * 96; // 210 mm w px CSS
    const ctx2 = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1240 / pageCssWidth });
    const p2 = await ctx2.newPage();
    await p2.goto(pathToFileURL(L.src).href, { waitUntil: 'load' });
    await p2.emulateMedia({ media: 'print' });
    await p2.evaluate(() => document.fonts.ready);
    for (const n of shotPages) {
      const el = p2.locator('.page').nth(n - 1);
      if ((await el.count()) === 0) continue;
      const file = path.join(dir, `page-${String(n).padStart(2, '0')}.png`);
      await el.screenshot({ path: file, type: 'png', scale: 'device' });
      console.log(`Podgląd: ${file}`);
    }
    await ctx2.close();
  }
}

try {
  for (const lang of langs) await build(lang);
} finally {
  await browser.close();
}

if (overflowing.length) {
  console.error(`\nBŁĄD: ${overflowing.length} stron(y) z treścią poza kontenerem: ${overflowing.map((p) => `${p.lang}:${p.n}`).join(', ')}`);
  process.exit(1);
}
console.log('\nOK: wszystkie strony mieszczą się w A4.');
