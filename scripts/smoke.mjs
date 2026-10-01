// Test dymny strony: otwiera ją w Chromium na desktopie (1440x900) i telefonie (390x844),
// zapisuje zrzuty ekranu do screenshots/ i kończy się błędem, gdy:
//   - w konsoli pojawi się błąd JS (pageerror),
//   - strona ma poziomy scroll (scrollWidth > innerWidth).
// Uruchomienie: node scripts/smoke.mjs   (wymaga: npm i playwright@1.56.1 && npx playwright install chromium)

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.SMOKE_URL || 'http://localhost:8080/';
const outDir = process.env.SMOKE_OUT || 'screenshots';
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];

try {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500); // chwila na fonty, WebGL i animacje wejścia

    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));

    await page.screenshot({ path: `${outDir}/${vp.name}.png`, fullPage: true });

    console.log(
      `${vp.name} ${vp.width}x${vp.height}: pageerror=${errors.length}, scrollWidth=${size.scrollWidth}, innerWidth=${size.innerWidth}`,
    );

    if (errors.length) {
      failures.push(`${vp.name}: błędy JS na stronie:\n  - ${errors.join('\n  - ')}`);
    }
    if (size.scrollWidth > size.innerWidth) {
      failures.push(`${vp.name}: poziomy scroll (scrollWidth ${size.scrollWidth} > innerWidth ${size.innerWidth})`);
    }

    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\nSmoke test: BŁĄD\n' + failures.join('\n'));
  process.exit(1);
}
console.log('\nSmoke test: OK');
