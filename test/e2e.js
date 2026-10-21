// Tiny Print Shop smoke / e2e test. Loads index.html over file:// (no server), drives the real UI with clicks and taps.
//   node test/e2e.js            (screenshots -> test/shots/)
// Covers: no console errors, start season, assign orders by tapping, buy a printer, every problem type raised + fixed via
// the chat-bubble UI, shop + upgrade map, cat, rent, season end + summary, research, save persistence (meta + mid-season),
// prestige to the Workshop, phone portrait / landscape layouts.
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../index.html');
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };

async function boot(browser, opts, q) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('NETWORK: ' + r.url()); });
  await page.goto(URL + (q || ''), { waitUntil: 'load' });
  return { ctx, page, errors };
}
const ev = (page, fn, a) => page.evaluate(fn, a);
async function tapCanvas(page, rect) {
  const x = rect.x + rect.w / 2, y = rect.y + rect.h * 0.55;
  await page.mouse.click(x, y);
}
async function printerRect(page, i) { return ev(page, (i) => window.__bl.R.hits.printers[i], i); }
async function ensureJob(page, i) {
  // make sure printer i has a job printing (spawn an order that fits and assign it via the core)
  return ev(page, (i) => {
    const b = window.__bl, r = b.run, p = r.printers[i];
    p.problem = null; p.busy = 0; if (p.plate) b.C.collect(r, i);
    if (!p.queue.length) {
      for (let k = 0; k < 30 && !p.queue.length; k++) {
        const o = r.inbox.find((x) => b.C.canAssign(r, x, i).ok) || b.C.spawnOrder(r);
        if (o && b.C.canAssign(r, o, i).ok) b.C.assign(r, o.id, i); else if (o) r.inbox.splice(r.inbox.indexOf(o), 1);
      }
    }
    p.status = 'printing'; if (p.prog <= 0) p.prog = p.queue[0].work * 0.3; p.used = p.queue[0].g * 0.3;
    return p.queue.length;
  }, i);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

  /* ================= phone portrait: the main playthrough ================= */
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  let { ctx, page, errors } = await boot(browser, phone, '?speed=10');
  await ev(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500);
  ok(await ev(page, () => window.__bl.mode === 'run' && !!window.__bl.run && window.__bl.run.tut), 'new player lands straight in a (tutorial) season, no menu');
  ok(await ev(page, () => document.getElementById('hint').textContent.length > 0), 'tutorial hint shown');
  ok(await page.isVisible('#pointer'), 'tutorial pointer points at something');
  ok(await page.isVisible('#skipTut'), 'tutorial is skippable');
  ok(await page.isVisible('#goalBar') && (await page.textContent('#goalTxt')).length > 3, 'goal bar shows the first goal: ' + await page.textContent('#goalTxt'));
  ok(await ev(page, () => !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B50]/u.test(document.body.innerText)), 'no emoji anywhere in the visible UI');
  await page.screenshot({ path: `${OUT}/phone-first.png` });
  await page.waitForFunction(() => document.querySelectorAll('.ocard').length > 0, null, { timeout: 5000 });
  const nCards = await page.locator('.ocard').count();
  ok(nCards >= 1, `orders arrived (${nCards} cards)`);

  // tap an order card, then tap the printer on the canvas
  await page.locator('.ocard').first().tap();
  await page.waitForTimeout(250);
  ok(await ev(page, () => window.__bl.sel != null), 'order selected by tapping its card');
  ok((await ev(page, () => document.getElementById('hint').textContent)).includes('printer'), 'hint says tap a printer');
  await page.screenshot({ path: `${OUT}/phone-select.png` });
  await tapCanvas(page, await printerRect(page, 0));
  await page.waitForTimeout(250);
  ok(await ev(page, () => window.__bl.run.printers[0].queue.length === 1 && window.__bl.sel == null), 'order assigned by tapping the printer');
  // goals: first delivery completes goal 1 and pays out
  const g0 = await ev(page, () => ({ goal: window.__bl.meta.goal, money: window.__bl.run.money }));
  await ev(page, () => { const r = window.__bl.run; window.__bl.C.tick(r, 20); });
  await page.waitForTimeout(300);
  await tapCanvas(page, await printerRect(page, 0)); await page.waitForTimeout(400);
  const g1 = await ev(page, () => ({ goal: window.__bl.meta.goal, money: window.__bl.run.money, done: window.__bl.run.stats.done }));
  ok(g1.done === 1 && g1.goal > g0.goal && g1.money > g0.money + 25, `first delivery -> goal 1 complete (goal ${g0.goal}->${g1.goal}, $${Math.round(g0.money)}->$${Math.round(g1.money)})`);
  ok(!(await page.isHidden('#goalPop')), 'goal-complete popup shown');
  await page.screenshot({ path: `${OUT}/phone-goal.png` });
  // pause menu with separate music / sound toggles
  await page.locator('#btnPause').tap(); await page.waitForTimeout(250);
  ok(await page.isVisible('#pauseMenu') && await ev(page, () => window.__bl.paused), 'pause menu opens and pauses');
  const tp = await ev(page, () => window.__bl.run.t); await page.waitForTimeout(500);
  ok(await ev(page, (t) => window.__bl.run.t === t, tp), 'simulation frozen while paused');
  await page.screenshot({ path: `${OUT}/phone-pause.png` });
  await page.locator('#pMusic').tap(); await page.waitForTimeout(100);
  ok(await ev(page, () => window.__bl.meta.settings.music === false && window.__bl.meta.settings.sfx === true && !window.__bl.S.music), 'music toggled off, sound still on');
  await page.locator('#pSfx').tap(); await page.waitForTimeout(100);
  ok(await ev(page, () => window.__bl.meta.settings.sfx === false && !window.__bl.S.sfx), 'sound toggled off separately');
  await page.locator('#pMusic').tap(); await page.locator('#pSfx').tap();
  ok(await ev(page, () => window.__bl.meta.settings.music && window.__bl.meta.settings.sfx), 'both back on');
  await page.locator('#pResume').tap(); await page.waitForTimeout(200);
  ok(!(await ev(page, () => window.__bl.paused)), 'resumed');
  // skip the rest of the tutorial
  await page.locator('#skipTut').tap(); await page.waitForTimeout(200);
  ok(await ev(page, () => window.__bl.meta.tut.done) && await page.isHidden('#skipTut'), 'tutorial skipped');
  await ev(page, () => { window.__bl.run.noHazard = true; }); // only the issues this test raises itself, so the UI checks are deterministic

  // buy a second printer by tapping the empty slot
  await ev(page, () => { window.__bl.run.money += 500; });
  const slot = await ev(page, () => window.__bl.R.hits.slots[1]);
  ok(!!slot, 'empty slot is tappable');
  await tapCanvas(page, slot); await page.waitForTimeout(300);
  ok(await page.isVisible('#sheet'), 'printer shop sheet opens');
  await page.screenshot({ path: `${OUT}/phone-buyprinter.png` });
  await page.click('button[data-type=rainbow]', { force: true }); await page.waitForTimeout(250);
  ok(await ev(page, () => window.__bl.run.printers[1] && window.__bl.run.printers[1].type === 'rainbow'), 'bought the Rainbow multi-colour printer');

  // multi-colour rule: a 4-colour job can't go on the Sprout
  const multi = await ev(page, () => {
    const b = window.__bl, r = b.run;
    const o = { id: 9999, tpl: 'figure', name: 'Test figurine', icon: 'o:figure', mat: 'PLA', nc: 4, q: 3, any: false, shape: 'fig', work: 40, g: 60, pay: 100, colors: ['#FF8000', '#F4EFE6', '#2B2B2E', '#2FA8A0'], arrive: r.t, deadline: r.t + 300, expires: r.t + 300 };
    r.inbox.push(o);
    return { sprout: b.C.canAssign(r, o, 0).ok, rainbow: b.C.canAssign(r, o, 1).ok };
  });
  ok(!multi.sprout && multi.rainbow, 'multi-colour jobs only fit the multi-colour printer');
  await page.waitForTimeout(300);
  await page.locator('.ocard[data-id="9999"]').tap(); await page.waitForTimeout(150);
  await tapCanvas(page, await printerRect(page, 0)); await page.waitForTimeout(150);
  ok(await ev(page, () => !window.__bl.run.printers[0].queue.some((o) => o.id === 9999)), 'tapping the wrong printer refuses the job');
  await tapCanvas(page, await printerRect(page, 1)); await page.waitForTimeout(200);
  ok(await ev(page, () => window.__bl.run.printers[1].queue.some((o) => o.id === 9999)), 'multi-colour job queued on the Rainbow');
  await ev(page, () => window.__bl.C.tick(window.__bl.run, 8));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/phone-printing.png` });

  // every problem type: raise it, see the chat bubble, fix it through the UI
  const fixes = { clog: 'spare', axis: 'repair', adhesion: 'glue', string: 'tune', warp: 'dry', power: 'ups', runout: 'buy' };
  await ev(page, () => { window.__bl.run.spares = 1; window.__bl.run.money += 400; });
  for (const [type, opt] of Object.entries(fixes)) {
    await ev(page, () => window.__bl.closeAlert());
    await ensureJob(page, 0);
    if (type === 'warp') await ev(page, () => { const r = window.__bl.run; r.printers[0].queue[0].mat = 'ABS'; r.fil.ABS = 2000; });
    if (type === 'runout') await ev(page, () => { const r = window.__bl.run; const m = r.printers[0].queue[0].mat; r.fil[m] = 0; r.fil.MYS = 0; r.printers[0].queue[0].any = false; });
    if (type !== 'runout') await ev(page, (t) => window.__bl.C.forceProblem(window.__bl.run, 0, t), type);
    await page.waitForTimeout(400);
    const got = await ev(page, () => { const p = window.__bl.run.printers[0]; return p.problem && p.problem.type; });
    ok(got === type, `problem "${type}" raised (got ${got})`);
    if (!(await page.isVisible('#alert'))) { await tapCanvas(page, await printerRect(page, 0)); await page.waitForTimeout(250); }
    ok(await page.isVisible('#alert'), `"${type}": chat bubble popup is open`);
    const txt = await page.textContent('#alertCard');
    ok(txt.includes('Hey, I have this issue!'), `"${type}": printer says "Hey, I have this issue!"`);
    if (type === 'clog') await page.screenshot({ path: `${OUT}/phone-issue-clog.png` });
    if (type === 'adhesion') await page.screenshot({ path: `${OUT}/phone-issue-adhesion.png` });
    const money0 = await ev(page, () => window.__bl.run.money);
    await page.click(`#alertCard .opt[data-opt=${opt}]`, { force: true });
    await page.waitForTimeout(200);
    const after = await ev(page, () => { const p = window.__bl.run.printers[0]; return { problem: p.problem && p.problem.type + ':' + p.problem.mat + ' fil=' + JSON.stringify(window.__bl.run.fil), busy: p.busy, status: p.status, money: window.__bl.run.money, ups: p.ups, glue: p.glue }; });
    ok((!after.problem || !after.problem.startsWith(type + ':')) && !(await page.isVisible('#alert')), `"${type}" fixed with "${opt}" (status ${after.status}${after.problem ? ' ' + after.problem : ''}${after.busy ? `, busy ${after.busy.toFixed(0)}s` : ''}, $${Math.round(money0)}→$${Math.round(after.money)})`);
  }
  // touch regression: "Later", then tapping the printer reopens the popup (the tap's ghost click must not close it again)
  await ev(page, () => window.__bl.closeAlert()); await ensureJob(page, 0);
  await ev(page, () => { const r = window.__bl.run; r.printers[0].queue[0].work = 1e6; window.__bl.C.forceProblem(r, 0, 'string'); }); await page.waitForTimeout(800);
  if (await page.isVisible('#aLater')) await page.locator('#aLater').tap();
  await page.waitForTimeout(300);
  { const r0 = await printerRect(page, 0); await page.touchscreen.tap(r0.x + r0.w / 2, r0.y + r0.h * 0.55); }
  await page.waitForTimeout(500);
  const gdiag = await ev(page, () => { const B = window.__bl, p = B.run.printers[0]; return JSON.stringify({ alertPi: B.alertPi, prob: p.problem, st: p.status, busy: p.busy, dbg: B.dbg, sel: B.sel, open: ['sheet', 'alert', 'pauseMenu', 'summary'].filter((x) => !document.getElementById(x).classList.contains('hidden')) }); });
  ok(await page.isVisible('#alert'), 'after "Later", tapping the printer reopens its issue popup (no ghost-click close)' + (await page.isVisible('#alert') ? '' : ' ' + gdiag));
  await ev(page, () => { const b = window.__bl, r = b.run; b.C.fix(r, 0, 'tune'); b.closeAlert(); r.printers[0].queue[0].work = 40; });
  // alternative fixes that cost time instead of money, and the ignore path
  await ensureJob(page, 0); await ev(page, () => window.__bl.C.forceProblem(window.__bl.run, 0, 'clog'));
  const nozz = await ev(page, () => { const b = window.__bl; b.run.spares = 0; return b.C.problemOptions(b.run, 0).find((o) => o.id === 'spare').ok; });
  ok(!nozz, 'no spare nozzle -> swap option disabled');
  await ev(page, () => { const b = window.__bl; b.C.fix(b.run, 0, 'order'); });
  ok(await ev(page, () => window.__bl.run.printers[0].busy >= 29), 'ordering a nozzle = 30 s downtime');
  await ev(page, () => { const b = window.__bl; b.C.tick(b.run, 31); b.closeAlert(); });
  await ensureJob(page, 0); await ev(page, () => window.__bl.C.forceProblem(window.__bl.run, 0, 'string'));
  await ev(page, () => { const b = window.__bl; b.C.fix(b.run, 0, 'ignore'); });
  ok(await ev(page, () => window.__bl.run.printers[0].pen >= 1.5), 'ignoring stringing costs 1.5 stars on that print');
  await ev(page, () => window.__bl.closeAlert());
  // adhesion failure creates scrap and the recycler turns it into mystery filament
  const scrap = await ev(page, () => { const b = window.__bl, r = b.run; r.scrap = 0; r.fil.MYS = 0; const p = r.printers[0]; p.problem = null; p.busy = 0; p.used = 80; p.status = 'printing'; b.C.forceProblem(r, 0, 'adhesion'); const s = r.scrap; b.C.fix(r, 0, 'clean'); b.C.tick(r, 20); return { s, mys: r.fil.MYS }; });
  ok(scrap.s > 0 && scrap.mys > 0, `failed print -> ${Math.round(scrap.s)} g scrap -> ${Math.round(scrap.mys)} g mystery PLA`);
  await ev(page, () => window.__bl.closeAlert());

  // maintenance: service from the printer sheet
  await ev(page, () => { const p = window.__bl.run.printers[1]; p.maint = 30; p.problem = null; p.busy = 0; if (p.plate) window.__bl.C.collect(window.__bl.run, 1); });
  await page.waitForTimeout(400); await ev(page, () => window.__bl.closeAlert());
  const pr1 = await printerRect(page, 1);
  await tapCanvas(page, pr1); await page.waitForTimeout(300);
  ok(await page.isVisible('#sheet'), 'printer sheet opens on tap ' + JSON.stringify(await ev(page, (r) => ({ r, hit: window.__bl.R.hitTest(r.x + r.w / 2, r.y + r.h * 0.55), alert: !document.getElementById('alert').classList.contains('hidden'), p: window.__bl.run.printers[1].status }), pr1)));
  await page.screenshot({ path: `${OUT}/phone-printer-sheet.png` });
  ok(!(await page.locator('#psBtns .btn.alt').isDisabled()), 'Service button enabled on a worn printer');
  await page.click('#psBtns .btn.alt', { force: true }); await page.waitForTimeout(150);
  await ev(page, () => window.__bl.C.tick(window.__bl.run, 9));
  const sv = await ev(page, () => { const p = window.__bl.run.printers[1]; return { m: p.maint, st: p.status, busy: p.busy }; });
  ok(sv.m >= 99, `servicing restores maintenance to 100% (${JSON.stringify(sv)})`);
  await ev(page, () => window.__bl.closeSheet());

  // shop + upgrades map
  await page.click('#btnShop', { force: true }); await page.waitForTimeout(250);
  const tpu0 = await ev(page, () => window.__bl.run.fil.TPU);
  await page.click('button[data-buy=TPU]', { force: true }); await page.waitForTimeout(150);
  ok(await ev(page, (t) => window.__bl.run.fil.TPU === t + 1000, tpu0), 'bought a TPU spool in Supplies');
  await page.screenshot({ path: `${OUT}/phone-shop.png` });
  await ev(page, () => window.__bl.closeSheet());
  await page.click('#btnUps', { force: true }); await page.waitForTimeout(400);
  await page.click('#upMap .node[data-id=hardened]', { force: true }); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/phone-upgrades.png` });
  await page.click('#upInfo .btn', { force: true }); await page.waitForTimeout(200);
  ok(await ev(page, () => !!window.__bl.run.ups.hardened), 'bought "Hardened nozzles" on the upgrade map');
  ok(await page.locator('#upMap .node.owned').count() >= 2, 'upgrade map shows owned nodes');
  await ev(page, () => window.__bl.closeSheet());

  // the cat
  await ev(page, () => { const c = window.__bl.run.cat; c.on = true; c.p = 0.45; c.dir = 1; c.lane = 0.2; c.petted = false; window.__bl.setPaused(true); });
  await page.waitForTimeout(200);
  const cat = await ev(page, () => window.__bl.R.hits.cat);
  ok(!!cat, 'Miso the cat walks across the garage');
  if (cat) { await page.mouse.click(cat.x + cat.w / 2, cat.y + cat.h / 2); await page.waitForTimeout(150); }
  ok(await ev(page, () => window.__bl.run.cat.petted), 'petted the cat');
  await ev(page, () => window.__bl.setPaused(false));

  // mid-season save survives a reload
  await ev(page, () => window.__bl.save());
  const tSaved = await ev(page, () => window.__bl.run.t);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.textContent('#btnGo')).includes('Continue'), 'after reload: "Continue season" offered');
  ok(await ev(page, (t) => window.__bl.meta.run && Math.abs(window.__bl.meta.run.t - t) < 5 && window.__bl.meta.run.printers[1].type === 'rainbow', tSaved), 'mid-season state restored (time, printers)');
  await page.click('#btnGo', { force: true }); await page.waitForTimeout(300);

  // play the rest of the season with the bot at high speed, rent gets paid
  await ev(page, () => { window.__bl.run.noHazard = false; });
  await ev(page, () => { window.__bot = setInterval(() => { const b = window.__bl, r = b.run; if (!r || r.over) return; b.C.tick(r, 3); b.C.botThink(r); b.closeAlert(); }, 16); });
  await page.waitForFunction(() => window.__bl.run && window.__bl.run.t > 200, null, { timeout: 30000 });
  await ev(page, () => clearInterval(window.__bot));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/phone-midseason.png` });
  ok(await ev(page, () => window.__bl.run.stats.rentPaid > 0 || window.__bl.run.over), 'first rent paid');
  await ev(page, () => { window.__bot = setInterval(() => { const b = window.__bl, r = b.run; if (!r || r.over) return; b.C.tick(r, 3); b.C.botThink(r); b.closeAlert(); }, 16); });
  await page.waitForFunction(() => !document.getElementById('summary').classList.contains('hidden'), null, { timeout: 60000 });
  await ev(page, () => clearInterval(window.__bot));
  await page.waitForTimeout(300);
  const res = await ev(page, () => window.__bl.meta.history[window.__bl.meta.history.length - 1]);
  ok(res && res.rep > 0, `season ended (${res && res.reason}) with +${res && res.rep} Reputation, ${res && res.done} orders`);
  await page.screenshot({ path: `${OUT}/phone-summary.png` });

  // research
  await page.click('#sumRes', { force: true }); await page.waitForTimeout(500);
  await ev(page, () => window.__bl.showTab('research')); await page.waitForTimeout(400);
  const rep0 = await ev(page, () => window.__bl.meta.rep);
  await page.click('#resMap .node[data-id=spares]', { force: true }); await page.waitForTimeout(150);
  await page.click('#btnResearch', { force: true }); await page.waitForTimeout(200);
  ok(await ev(page, () => !!window.__bl.meta.research.spares), `researched "Spare nozzle stock" (${rep0} -> ${await ev(page, () => window.__bl.meta.rep)} rep)`);
  await page.screenshot({ path: `${OUT}/phone-research.png` });

  // persistence of meta progress
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  ok(await ev(page, () => window.__bl.meta.seasons === 1 && window.__bl.meta.research.spares && window.__bl.meta.lifetimeRep > 0 && !window.__bl.meta.run), 'save persists after reload (seasons, research, reputation)');

  // prestige: earn enough lab reputation, move to the Workshop
  await ev(page, () => { window.__bl.meta.labRep = 190; window.__bl.meta.rep += 20; window.__bl.showTab('labs'); });
  await page.waitForTimeout(400);
  await page.click('#labMap .node[data-id=L1]', { force: true }); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/phone-labs.png` });
  await page.click('#btnMove', { force: true }); await page.waitForTimeout(200);
  await page.click('#btnMoveYes', { force: true }); await page.waitForTimeout(300);
  const pres = await ev(page, () => ({ lab: window.__bl.meta.lab, rep: window.__bl.meta.rep, res: Object.keys(window.__bl.meta.research).length, tr: window.__bl.meta.trophies }));
  ok(pres.lab === 1 && pres.rep === 0 && pres.res === 1 && pres.tr > 0, `prestige: moved to Workshop, research reset, ${pres.tr} trophies`);
  await ev(page, () => window.__bl.showTab('labs')); await page.waitForTimeout(300);
  await page.click('#labMap .node[data-id=catbed]', { force: true }); await page.waitForTimeout(150);
  await page.click('#labInfo .btn', { force: true }); await page.waitForTimeout(150);
  ok(await ev(page, () => !!window.__bl.meta.perks.catbed), 'bought the Cat bed lab perk with trophies');
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  ok(await ev(page, () => window.__bl.meta.lab === 1 && window.__bl.meta.perks.catbed), 'prestige persists after reload');
  await page.screenshot({ path: `${OUT}/phone-home-workshop.png` });
  await page.click('#btnGo', { force: true }); await page.waitForTimeout(400);
  const ws = await ev(page, () => ({ slots: window.__bl.run.slots, types: window.__bl.run.printers.map((p) => p && p.type) }));
  ok(ws.slots === 4 && ws.types[1] === 'kestrel', `Workshop season: ${ws.slots} slots, starts with ${ws.types.filter(Boolean).join(' + ')}`);
  await ev(page, () => { window.__bot = setInterval(() => { const b = window.__bl, r = b.run; if (!r || r.over) return; b.C.tick(r, 0.5); b.C.botThink(r); b.closeAlert(); }, 30); });
  await page.waitForTimeout(2500);
  await ev(page, () => clearInterval(window.__bot));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/phone-workshop.png` });
  ok(errors.length === 0, 'phone: no console errors / network requests' + (errors.length ? ' -> ' + errors.join(' | ') : ''));
  await ctx.close();

  /* ================= desktop 1280x720 ================= */
  ({ ctx, page, errors } = await boot(browser, { viewport: { width: 1280, height: 720 } }, '?speed=10'));
  await ev(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  ok(await ev(page, () => window.__bl.mode === 'run'), 'desktop: fresh player lands in gameplay');
  ok(await ev(page, () => document.body.classList.contains('wide')), 'desktop uses the side tray layout');
  await page.waitForFunction(() => document.querySelectorAll('.ocard').length > 0, null, { timeout: 5000 });
  await page.locator('.ocard').first().click(); await page.waitForTimeout(150);
  await tapCanvas(page, await printerRect(page, 0)); await page.waitForTimeout(200);
  ok(await ev(page, () => window.__bl.run.printers[0].queue.length === 1), 'desktop: mouse assign works');
  await ev(page, () => { const b = window.__bl, r = b.run; r.money += 700; b.C.buyPrinter(r, 1, 'kestrel'); b.C.buyPrinter(r, 2, 'rainbow'); b.C.buyUpgrade(r, 'enclose'); });
  await ev(page, () => { window.__bot = setInterval(() => { const b = window.__bl, r = b.run; if (!r || r.over) return; b.C.tick(r, 0.4); b.C.botThink(r, { noBuy: true }); b.closeAlert(); }, 30); });
  await page.waitForTimeout(3000);
  await ev(page, () => { clearInterval(window.__bot); const b = window.__bl, r = b.run; b.meta.tut.done = true; for (let k = 0; k < 3; k++) b.C.spawnOrder(r); r.cat.on = true; r.cat.p = 0.5; r.cat.lane = 0.3; b.setPaused(true); const o = r.inbox[0]; if (o) b.selectOrder(o.id); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-run.png` });
  await ev(page, () => { const b = window.__bl, r = b.run; b.selectOrder(null); const i = r.printers.findIndex((p) => p && p.queue.length && !p.problem); if (i >= 0) { b.C.forceProblem(r, i, 'adhesion'); b.openAlert(i); } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/desktop-issue.png` });
  await ev(page, () => window.__bl.closeAlert());
  await page.click('#btnUps', { force: true }); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-upgrades.png` });
  await ev(page, () => { window.__bl.closeSheet(); window.__bl.goHome('research'); }); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/desktop-research.png` });
  ok(errors.length === 0, 'desktop: no console errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));
  await ctx.close();

  /* ================= phone landscape ================= */
  ({ ctx, page, errors } = await boot(browser, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, ''));
  await ev(page, () => localStorage.clear()); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  await page.waitForFunction(() => document.querySelectorAll('.ocard').length > 0, null, { timeout: 8000 });
  await page.locator('.ocard').first().tap(); await page.waitForTimeout(150);
  await tapCanvas(page, await printerRect(page, 0)); await page.waitForTimeout(200);
  ok(await ev(page, () => window.__bl.run.printers[0].queue.length === 1), 'landscape phone: tap assign works');
  await ev(page, () => window.__bl.C.tick(window.__bl.run, 15)); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/landscape-run.png` });
  const overflow = await ev(page, () => { const t = document.getElementById('topbar').getBoundingClientRect(); return t.height; });
  ok(overflow < 70, `landscape top bar fits (${Math.round(overflow)} px tall)`);
  ok(errors.length === 0, 'landscape: no console errors' + (errors.length ? ' -> ' + errors.join(' | ') : ''));
  await ctx.close();

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
