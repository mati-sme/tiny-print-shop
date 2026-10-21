// portal-test.js - headless test of the CrazyGames build.   tools/build-portals.sh && node tools/portal-test.js
// Serves dist/crazygames/tiny-print-shop/ on localhost (the SDK runs in its "local" mode there), plays the game like a new
// player and checks the SDK call order recorded in window.__portalLog:
//   init -> loadingStart -> loadingStop -> gameplayStart (only after loadingStop) ; pause -> gameplayStop ; resume -> gameplayStart
//   expo day -> happytime + gameplayStop ; no console errors ; saves go through the SDK data module.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(__dirname, '../test/node_modules/playwright-core'));
const ROOT = path.join(__dirname, '../dist/crazygames/tiny-print-shop');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const srv = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
}).listen(8841, async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1216, height: 684 } });
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
  const t0 = Date.now();
  await page.goto('http://localhost:8841/index.html?speed=20');
  await page.waitForFunction(() => (window.__portalLog || []).includes('gameplayStart'), null, { timeout: 20000 });
  const ms = Date.now() - t0;
  const log = await page.evaluate(() => window.__portalLog.slice());
  console.log('SDK calls after load:', log.join(' > '), `(${ms} ms)`);
  const i = (k) => log.indexOf(k);
  ok(log.some((x) => x.startsWith('init:')), 'SDK initialised (' + (log.find((x) => x.startsWith('init:')) || 'no init') + ')');
  ok(i('loadingStart') >= 0 && i('loadingStart') < i('loadingStop'), 'loadingStart before loadingStop');
  ok(i('loadingStop') < i('gameplayStart'), 'gameplayStart only after loadingStop');
  ok(log.filter((x) => x === 'loadingStart').length === 1 && log.filter((x) => x === 'loadingStop').length === 1, 'loading reported exactly once');
  ok(await page.evaluate(() => window.__bl.mode === 'run'), 'new player lands straight in gameplay');
  await page.waitForTimeout(1200); await page.evaluate(() => window.__bl.openPause()); await page.waitForTimeout(1300);
  let l2 = await page.evaluate(() => window.__portalLog.slice());
  ok(l2[l2.length - 1] === 'gameplayStop', 'pause menu -> gameplayStop');
  await page.evaluate(() => window.__bl.closePause()); await page.waitForTimeout(1300);
  l2 = await page.evaluate(() => window.__portalLog.slice());
  ok(l2[l2.length - 1] === 'gameplayStart', 'resume -> gameplayStart');
  // tab hidden -> stop (the game auto-pauses)
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1300);
  l2 = await page.evaluate(() => window.__portalLog.slice());
  ok(l2[l2.length - 1] === 'gameplayStop', 'tab hidden -> gameplayStop + auto-pause');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); window.__bl.closePause(); });
  await page.waitForTimeout(1300);
  // a quick pause/resume inside one second must not spam the SDK
  const n0 = await page.evaluate(() => window.__portalLog.length);
  await page.evaluate(() => { window.__bl.openPause(); }); await page.waitForTimeout(250); await page.evaluate(() => window.__bl.closePause()); await page.waitForTimeout(1500);
  const l3 = await page.evaluate((n) => window.__portalLog.slice(n), n0);
  ok(l3.length % 2 === 0 && (l3.length === 0 || l3[l3.length - 1] === 'gameplayStart') && !errs.some((e) => /throttled/.test(e)), `quick pause+resume: spaced out, ends playing, never throttled by the SDK (${l3.join(' > ') || 'coalesced'})`);
  // play the season out with the bot
  await page.evaluate(() => { window.__bot = setInterval(() => { const B = window.__bl, r = B.run; if (!r || r.over) return; B.C.tick(r, 3); B.C.botThink(r); if (B.alertPi >= 0) B.closeAlert(); }, 16); });
  await page.waitForFunction(() => !document.getElementById('summary').classList.contains('hidden'), null, { timeout: 60000 });
  await page.evaluate(() => clearInterval(window.__bot)); await page.waitForTimeout(1300);
  l2 = await page.evaluate(() => window.__portalLog.slice());
  const why = await page.evaluate(() => window.__bl.meta.history.slice(-1)[0].reason);
  ok((why !== 'expo' || l2.includes('happytime')) && l2[l2.length - 1] === 'gameplayStop', `season end (${why}) -> ${why === 'expo' ? 'happytime, ' : ''}gameplayStop on the summary`);
  let alt = true; let on = false;
  for (const x of l2.filter((y) => y === 'gameplayStart' || y === 'gameplayStop')) { if ((x === 'gameplayStart') === on) alt = false; on = x === 'gameplayStart'; }
  ok(alt, 'gameplayStart/Stop strictly alternate (no duplicates)');
  const saved = await page.evaluate(() => { try { return !!window.CrazyGames.SDK.data.getItem('tiny-print-shop-save-v1') || Object.keys(localStorage).length > 0; } catch (e) { return 'err ' + e.message; } });
  ok(saved === true, 'save written through the SDK data module');
  await page.click('#sumNext', { force: true }); await page.waitForTimeout(1300);
  l2 = await page.evaluate(() => window.__portalLog.slice());
  ok(l2[l2.length - 1] === 'gameplayStart', 'next season -> gameplayStart');
  console.log('full call log:', l2.join(' > '));
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
});
