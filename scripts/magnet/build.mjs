// Buduje lead magnet „30 procesów, które da się zautomatyzować w tydzień”:
//   scripts/magnet/magnet.html  →  assets/dl/30-procesow-do-automatyzacji.pdf  (A4, 14 stron)
//                               →  assets/img/magnet-cover.png                 (okładka, 2x)
// Uruchomienie: node scripts/magnet/build.mjs [--shots=<katalog>] [--shot-pages=1,2,4]
//   --shots       dodatkowo zapisuje podglądy wybranych stron (PNG, ~1240 px szerokości) do katalogu
//   --shot-pages  numery stron do podglądu (domyślnie 1,2,4)
// Wymaga Playwright z Chromium: lokalnie (npm i playwright) albo globalnie
// (/opt/node22/lib/node_modules/playwright, nadpisanie: PLAYWRIGHT_PATH=...).
// Kończy się kodem 1, gdy którakolwiek strona ma treść wystającą poza kontener .page.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';

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
const srcHtml = path.join(here, 'magnet.html');
const outPdf = path.join(root, 'assets', 'dl', '30-procesow-do-automatyzacji.pdf');
const outCover = path.join(root, 'assets', 'img', 'magnet-cover.png');

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

const { chromium } = await loadPlaywright();

await mkdir(path.dirname(outPdf), { recursive: true });
await mkdir(path.dirname(outCover), { recursive: true });
if (shotsDir) await mkdir(shotsDir, { recursive: true });

const browser = await chromium.launch();
let overflowing = [];

try {
  // --- 1. PDF + kontrola przepełnienia stron (układ drukowany) ---
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('pageerror:', err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('console:', msg.text()); });

  await page.goto(pathToFileURL(srcHtml).href, { waitUntil: 'load' });
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
    if (over) overflowing.push(p);
    console.log(
      `strona ${String(p.n).padStart(2)} ${over ? 'PRZEPEŁNIONA' : 'ok'}  wys. ${p.scrollHeight}/${p.clientHeight}px  szer. ${p.scrollWidth}/${p.clientWidth}px${p.id ? '  #' + p.id : ''}`,
    );
  }

  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const pdfSize = (await stat(outPdf)).size;
  console.log(`PDF: ${path.relative(root, outPdf)} (${(pdfSize / 1024).toFixed(0)} KB, ${pages.length} stron w HTML)`);

  // --- 2. Okładka jako PNG (2x) ---
  const cover = page.locator('.page').first();
  await cover.screenshot({ path: outCover, type: 'png', scale: 'device' });
  const coverSize = (await stat(outCover)).size;
  console.log(`Okładka: ${path.relative(root, outCover)} (${(coverSize / 1024).toFixed(0)} KB)`);
  await ctx.close();

  // --- 3. Podglądy stron (opcjonalnie) ---
  if (shotsDir) {
    const pageCssWidth = (210 / 25.4) * 96; // 210 mm w px CSS
    const ctx2 = await browser.newContext({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1240 / pageCssWidth });
    const p2 = await ctx2.newPage();
    await p2.goto(pathToFileURL(srcHtml).href, { waitUntil: 'load' });
    await p2.emulateMedia({ media: 'print' });
    await p2.evaluate(() => document.fonts.ready);
    for (const n of shotPages) {
      const el = p2.locator('.page').nth(n - 1);
      if ((await el.count()) === 0) continue;
      const file = path.join(shotsDir, `page-${String(n).padStart(2, '0')}.png`);
      await el.screenshot({ path: file, type: 'png', scale: 'device' });
      console.log(`Podgląd: ${file}`);
    }
    await ctx2.close();
  }
} finally {
  await browser.close();
}

if (overflowing.length) {
  console.error(`\nBŁĄD: ${overflowing.length} stron(y) z treścią poza kontenerem: ${overflowing.map((p) => p.n).join(', ')}`);
  process.exit(1);
}
console.log('\nOK: wszystkie strony mieszczą się w A4.');
