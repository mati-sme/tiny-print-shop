// A save under the game's previous localStorage key is migrated to the current key on load.
const { chromium } = require('playwright-core'); const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext();
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear();
    localStorage.setItem('bonsailab.save.v1', JSON.stringify({ seasons: 3, rep: 42, lifetimeRep: 42, tut: { done: true }, settings: { music: true, sfx: true } })); } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const D = window.BL.Data; return { seasons: window.__bl.meta.seasons, rep: window.__bl.meta.rep, mode: window.__bl.mode, newKey: !!localStorage.getItem(D.SAVE_KEY), oldKey: !!localStorage.getItem(D.OLD_SAVE_KEYS[0]), title: document.title }; });
  const ok = r.seasons === 3 && r.rep === 42 && r.newKey && !r.oldKey && r.mode === 'home' && r.title === 'Tiny Print Shop' && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL', 'old save migrated', JSON.stringify(r), errs.length ? errs : 'no errors');
  await b.close(); process.exit(ok ? 0 : 1);
})();
