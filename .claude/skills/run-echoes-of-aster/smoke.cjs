// Smoke-drive Echoes of Aster in a headless browser: load the title, start a
// New Game, advance the intro, walk, open the menu. Saves a PNG of the game
// canvas after each step and exits non-zero if the game throws, the scene
// doesn't change as expected, or the canvas is blank.
//
// Usage: node smoke.cjs [url] [outDir]
//   url     default http://127.0.0.1:8765/
//   outDir  default ./aster-shots
// Env:     PW_CHANNEL=chrome|msedge  use an installed browser instead of
//          Playwright's bundled Chromium (works with playwright-core).
// Needs `playwright` or `playwright-core` resolvable (e.g. via NODE_PATH).

const path = require('path');
const fs = require('fs');

let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }

const url = process.argv[2] || 'http://127.0.0.1:8765/';
const out = path.resolve(process.argv[3] || 'aster-shots');
const channel = process.env.PW_CHANNEL || undefined;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await pw.chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console error:', m.text()); });

  const failures = [];
  const wait = ms => page.waitForTimeout(ms);
  const press = async (key, n = 1, gap = 350) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await wait(gap); } };
  const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };

  async function step(name, expectScene) {
    const scene = await page.evaluate('typeof scene === "undefined" ? null : scene');
    const colors = await page.evaluate(() => {
      const c = document.getElementById('screen');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 16) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return seen.size;
    });
    const file = path.join(out, `${name}.png`);
    await page.locator('#screen').screenshot({ path: file });
    const ok = (!expectScene || scene === expectScene) && colors >= 8;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: scene=${scene} colors=${colors} -> ${file}`);
    if (!ok) failures.push(`${name}: expected scene=${expectScene ?? 'any'}, got ${scene}; ${colors} distinct colors`);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('#screen');            // focus + unlock audio, like a player would
  await wait(2000);                        // logo + menu animate in over ~70 frames
  await step('1-title', 'title');

  await press('Enter', 1, 2500);           // "New Game" is preselected; fade takes ~80 frames
  await step('2-new-game', 'field');

  await press('KeyZ', 10, 400);            // advance the intro dialogue
  await step('3-intro-advanced');

  await hold('ArrowDown', 700);
  await hold('ArrowRight', 700);
  await wait(300);
  await step('4-walked');

  await press('KeyC', 1, 800);             // field menu
  await step('5-menu');
  await press('Escape', 1, 400);

  await browser.close();

  for (const e of pageErrors) failures.push(`page error: ${e}`);
  if (failures.length) {
    console.error('\nSMOKE FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log(`\nSMOKE PASSED - now look at the PNGs in ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
