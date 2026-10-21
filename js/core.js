/* Tiny Print Shop - simulation core. Pure game logic over plain JSON state (so it saves to localStorage as-is and also runs
 * in Node for balance sims: node sim/sim.js). No DOM in here. Time is in game seconds; the UI calls tick(run, dt). */
(function (root) {
'use strict';
const BL = root.BL;
const D = BL.Data;

/* ---------- helpers ---------- */
function rnd(run) { // mulberry32 kept in run.seed so runs are reproducible and serialisable
  let t = run.seed = (run.seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (run, arr) => arr[Math.floor(rnd(run) * arr.length)];
function pickW(run, items, wf) {
  let tot = 0; for (const it of items) tot += wf(it);
  let r = rnd(run) * tot;
  for (const it of items) { r -= wf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}
const up = (run, id) => !!run.ups[id];
const rs = (run, id) => !!run.res[id];
const ev = (run, e) => { run.events.push(e); if (run.events.length > 60) run.events.shift(); };

/* ---------- meta (persistent) ---------- */
function newMeta() {
  return { v: 1, rep: 0, lifetimeRep: 0, labRep: 0, trophies: 0, research: { lab: true }, perks: {}, lab: 0, seasons: 0,
    best: { rep: 0, money: 0, orders: 0, stars: 0 }, history: [], settings: { music: true, sfx: true }, run: null, tut: {}, goal: 0 };
}
function fixMeta(m) {
  const d = newMeta();
  if (!m || typeof m !== 'object') return d;
  for (const k in d) if (m[k] === undefined) m[k] = d[k];
  m.research.lab = true;
  if (m.settings.mute !== undefined) { m.settings.music = m.settings.sfx = !m.settings.mute; delete m.settings.mute; }
  if (m.settings.music === undefined) m.settings.music = true;
  if (m.settings.sfx === undefined) m.settings.sfx = true;
  return m;
}

/* ---------- run setup ---------- */
function makePrinter(type, idx) {
  return { type, idx, queue: [], prog: 0, used: 0, status: 'idle', maint: 100, problem: null, busy: 0, busyMax: 0, busyWhat: '',
    after: '', glue: 0, ups: false, pen: 0, useMys: false, plate: null, jobs: 0 };
}
function newRun(meta, seed, opts) {
  opts = opts || {};
  const lab = D.LABS[meta.lab];
  const res = Object.assign({}, meta.research);
  const run = {
    v: 1, seed: (seed >>> 0) || ((Date.now() ^ (Math.random() * 1e9)) >>> 0), t: 0, len: D.SEASON,
    money: lab.startMoney + (res.supplier ? 60 : 0), rating: meta.perks.sign ? 3.5 : 3.0, ratingN: 3,
    lab: meta.lab, slots: lab.slots, rentMul: lab.rentMul, repMul: lab.repMul,
    res, perks: Object.assign({}, meta.perks), ups: { garage: true },
    printers: [], inbox: [], nextId: 1, nextOrder: 1.5,
    fil: { PLA: 2000, PETG: 1000, TPU: 0, ABS: 0, MYS: 0 }, scrap: 0, spares: res.spares ? 2 : 0, deliveries: [],
    rentIdx: 0, rentDue: D.RENT.every, grace: 0, power: 0,
    stats: { done: 0, late: 0, failed: 0, lost: 0, dropped: 0, starsSum: 0, goodStars: 0, earned: 0, spent: 0, rentPaid: 0, problems: 0, fixed: 0, petted: 0,
      maxStars: 0, multi: 0, serviced: 0, goalCash: 0, byType: {} },
    events: [], over: false, reason: '', problemsSeen: 0, firstIssueAt: 40, tut: !!opts.tutorial,
    cat: { next: meta.perks.catbed ? 25 : 55, on: false, p: 0, dir: 1, lane: 0, petted: false },
  };
  if (res.supplier) for (const m of D.MAT_ORDER) run.fil[m] += 1000;
  for (let i = 0; i < run.slots; i++) run.printers.push(null);
  lab.start.forEach((t, i) => { run.printers[i] = makePrinter(t, i); });
  if (run.tut) { // the very first season: a quick, cheap first job and a spare nozzle for the first (scripted) clog
    spawnOrder(run, true, { tpl: 'clips', work: 14 }); spawnOrder(run, true, { tpl: 'stand', work: 30 }); spawnOrder(run, true, { tpl: 'keys' });
    run.spares = Math.max(run.spares, 1); run.firstIssueAt = 1e9; run.nextOrder = 20;
  } else for (let i = 0; i < 3; i++) spawnOrder(run, true);
  return run;
}

/* ---------- derived stats ---------- */
const T = (p) => D.PRINTERS[p.type];
function speedOf(run, p, order) {
  let s = T(p).speed * (1 + (up(run, 'hotend') ? 0.25 : 0) + (up(run, 'hotend2') ? 0.25 : 0));
  if (order) s *= D.MATS[order.mat].speed;
  if (p.maint < 25) s *= 0.85;
  return s;
}
const enclosed = (run, p) => T(p).enclosed || up(run, 'enclose');
const qualityOf = (run, p) => T(p).q + (up(run, 'calib') ? 0.5 : 0) + (rs(run, 'autocal') ? 0.5 : 0);
const maxQueue = (run) => (rs(run, 'sched') ? 4 : 3);
const inboxMax = (run) => 4 + (up(run, 'board') ? 2 : 0);
const patience = (run) => 60 * (up(run, 'board') ? 1.4 : 1) * (rs(run, 'sched') ? 1.3 : 1);
const payMul = (run) => (0.75 + run.rating * 0.083) * (up(run, 'flyer') ? 1.1 : 1);
const spoolPrice = (run, mat) => Math.round(D.MATS[mat].price * (rs(run, 'bulk') ? 0.75 : 1));
const fixTime = (run, s) => s * (run.perks.coffee ? 0.75 : 1);
function nextRent(run) {
  const base = D.RENT.base[Math.min(run.rentIdx, D.RENT.base.length - 1)];
  return Math.round(base * run.rentMul + run.power);
}
function expectedStars(run, p, o) {
  let q = qualityOf(run, p);
  if (o.mat === 'ABS' && !enclosed(run, p)) q -= 0.5;
  return clamp(Math.round(q * 2) / 2, 1, 5);
}
/* can this order go on this printer? {ok, why, warn} */
function canAssign(run, o, pi) {
  const p = run.printers[pi];
  if (!p) return { ok: false, why: 'Empty slot' };
  if (o.nc > T(p).colors) return { ok: false, why: 'Needs the multi-colour printer' };
  if (p.queue.length >= maxQueue(run)) return { ok: false, why: 'Queue full' };
  const warn = [];
  if (o.mat === 'ABS' && !enclosed(run, p)) warn.push('ABS warps on an open frame');
  const es = expectedStars(run, p, o);
  if (es < o.q) warn.push(`Quality ${es} stars, customer wants ${o.q}`);
  return { ok: true, warn, stars: es };
}

/* ---------- orders ---------- */
function spawnOrder(run, early, force) {
  if (run.inbox.length >= inboxMax(run)) return null;
  const hasMulti = run.printers.some((p) => p && T(p).colors > 1);
  let pool = D.ORDERS.filter((o) => (o.lab || 0) <= run.lab);
  if (early || run.t < 45) pool = pool.filter((o) => o.nc === 1 && (o.mat === 'PLA' || o.mat === 'PETG') && o.work < 70);
  const tpl = force ? D.ORDERS.find((o) => o.id === force.tpl) : pickW(run, pool, (o) => o.w * (o.nc > 1 && !hasMulti ? 0.45 : 1) * ((o.lab || 0) > 0 ? 1.6 : 1));
  const j = force && force.work ? force.work / tpl.work : 0.9 + rnd(run) * 0.25;
  const cols = D.COLORS.slice();
  const colors = [];
  if (tpl.id === 'racecar') colors.push(D.PAPAYA);
  while (colors.length < tpl.nc) { const c = cols.splice(Math.floor(rnd(run) * cols.length), 1)[0]; if (!colors.includes(c)) colors.push(c); }
  const work = Math.round(tpl.work * j);
  const pj = force && force.work ? Math.max(0.9, j) : j;
  const o = {
    id: run.nextId++, tpl: tpl.id, name: tpl.name, icon: tpl.icon, mat: tpl.mat, nc: tpl.nc, q: tpl.q, any: !!tpl.any, shape: tpl.shape,
    work, g: Math.round(tpl.g * j), pay: Math.round(tpl.pay * 1.3 * pj * payMul(run)),
    colors, arrive: run.t, deadline: Math.round(run.t + work * 2 + 70), expires: run.t + patience(run),
  };
  run.inbox.push(o);
  ev(run, { k: 'order', id: o.id });
  return o;
}
function orderInterval(run) {
  const r = Math.pow(3.5 / (run.rating + 0.5), 0.7);
  const early = run.t < 90 ? 0.8 : 1;
  const busy = 1 + 0.12 * (run.printers.filter(Boolean).length - 1);
  return (14 * r * early / busy / (up(run, 'flyer') ? 1.3 : 1)) * (0.75 + rnd(run) * 0.5);
}

/* ---------- player actions (all return {ok, msg}) ---------- */
function assign(run, orderId, pi) {
  const i = run.inbox.findIndex((o) => o.id === orderId);
  if (i < 0) return { ok: false, msg: 'Order gone' };
  const o = run.inbox[i];
  const c = canAssign(run, o, pi);
  if (!c.ok) return { ok: false, msg: c.why };
  run.inbox.splice(i, 1);
  o.accepted = run.t;
  const p = run.printers[pi];
  p.queue.push(o);
  if (p.status === 'idle') startNext(run, p);
  ev(run, { k: 'assign', pi, id: o.id });
  return { ok: true, warn: c.warn };
}
function unqueue(run, pi, idx) { // pull a waiting job back to the inbox (not the one printing)
  const p = run.printers[pi];
  if (!p || idx < 1 || idx >= p.queue.length) return { ok: false };
  const o = p.queue.splice(idx, 1)[0];
  run.inbox.push(o);
  return { ok: true };
}
function startNext(run, p) {
  if (p.plate || p.problem || p.busy > 0) return;
  if (!p.queue.length) { p.status = 'idle'; return; }
  p.status = 'printing'; p.prog = 0; p.used = 0; p.pen = 0; p.useMys = false;
}
function collect(run, pi) {
  const p = run.printers[pi];
  if (!p || !p.plate) return { ok: false };
  const pl = p.plate; p.plate = null;
  run.money += pl.pay; run.stats.earned += pl.pay;
  const n = Math.min(run.ratingN, 6);
  run.rating = clamp((run.rating * n + pl.stars) / (n + 1), 0.5, 5);
  run.ratingN++;
  ev(run, { k: 'paid', pi, pay: pl.pay, stars: pl.stars, late: pl.late, low: pl.low, tip: pl.tip });
  p.status = 'idle';
  startNext(run, p);
  return { ok: true, pay: pl.pay };
}
function service(run, pi) {
  const p = run.printers[pi];
  if (!p || p.problem || p.busy > 0 || p.plate) return { ok: false, msg: 'Busy' };
  const cost = up(run, 'kit') ? 0 : 15;
  if (run.money < cost) return { ok: false, msg: 'Not enough money' };
  run.money -= cost; run.stats.spent += cost;
  setBusy(run, p, fixTime(run, up(run, 'kit') ? 4 : 8), 'Servicing', 'service', 'sponge');
  return { ok: true };
}
function setBusy(run, p, secs, what, after, icon) {
  p.busy = p.busyMax = secs; p.busyWhat = what; p.busyIcon = icon || 'wrench'; p.after = after || '';
  p.status = 'fixing';
}
function buySpool(run, mat) {
  const c = spoolPrice(run, mat);
  if (run.money < c) return { ok: false, msg: 'Not enough money' };
  run.money -= c; run.stats.spent += c; run.fil[mat] += 1000;
  ev(run, { k: 'buy', what: mat });
  return { ok: true };
}
function buyNozzle(run) {
  if (run.money < 12) return { ok: false, msg: 'Not enough money' };
  run.money -= 12; run.stats.spent += 12;
  run.deliveries.push({ at: run.t + 30, what: 'nozzle' });
  ev(run, { k: 'buy', what: 'nozzle' });
  return { ok: true };
}
function upgradeState(run, id) {
  const u = D.UPGRADES.find((x) => x.id === id);
  if (run.ups[id]) return 'owned';
  if (u.req && !run.ups[u.req]) return 'locked';
  return run.money >= upCost(run, u) ? 'buy' : 'poor';
}
/* booth items cost more in bigger labs (the expo crowd is pickier) */
function upCost(run, u) { if (typeof u === 'string') u = D.UPGRADES.find((x) => x.id === u); return u.booth && run.lab > 0 ? Math.round(u.cost * 2.5) : u.cost; }
function buyUpgrade(run, id) {
  const u = D.UPGRADES.find((x) => x.id === id);
  const st = upgradeState(run, id);
  if (st !== 'buy') return { ok: false, msg: st === 'poor' ? 'Not enough money' : 'Locked' };
  const c = upCost(run, u);
  run.money -= c; run.stats.spent += c; run.ups[id] = true;
  ev(run, { k: 'upgrade', id });
  return { ok: true };
}
function buyPrinter(run, slot, type) {
  if (run.printers[slot]) return { ok: false, msg: 'Slot taken' };
  const c = D.PRINTERS[type].cost;
  if (run.money < c) return { ok: false, msg: 'Not enough money' };
  run.money -= c; run.stats.spent += c;
  run.printers[slot] = makePrinter(type, slot);
  ev(run, { k: 'printer', pi: slot, type });
  return { ok: true };
}
function petCat(run) {
  const c = run.cat;
  if (!c.on || c.petted) return { ok: false };
  c.petted = true;
  const g = run.perks.catbed ? 15 : 5;
  run.money += g; run.rating = clamp(run.rating + 0.05, 0.5, 5); run.stats.petted++;
  ev(run, { k: 'cat', gain: g });
  return { ok: true, gain: g };
}

/* ---------- problems ---------- */
function raise(run, p, type) {
  const o = p.queue[0];
  const prob = { type, t: run.t, mat: o ? o.mat : 'PLA' };
  run.problemsSeen++; run.stats.problems++;
  run.stats.byType[type] = (run.stats.byType[type] || 0) + 1;
  if (type === 'adhesion') {
    const keep = rs(run, 'camera') ? 0.7 : 0;
    const lost = p.used * (1 - keep);
    run.scrap += lost; prob.lost = Math.round(lost); prob.keep = keep;
    p.prog *= keep; p.used *= keep; run.stats.failed++;
  }
  if ((type === 'string' || type === 'warp') && rs(run, 'dryer')) {
    ev(run, { k: 'autofix', pi: p.idx, type, msg: type === 'warp' ? 'Dryer + brim saved the warp' : 'Filament dryer stopped the stringing' });
    p.stringDone = true; run.stats.fixed++;
    return;
  }
  p.problem = prob;
  if (D.PROBLEMS[type].stop) p.status = 'problem';
  ev(run, { k: 'problem', pi: p.idx, type });
}
/* debug/test hook: force a problem on a printer */
function forceProblem(run, pi, type) {
  const p = run.printers[pi];
  if (!p || p.problem) return false;
  if (!p.queue.length) return false;
  if (p.status !== 'printing') { p.status = 'printing'; }
  if (type === 'runout') { p.problem = { type, t: run.t, mat: p.queue[0].mat }; p.status = 'problem'; run.stats.problems++; ev(run, { k: 'problem', pi, type }); return true; }
  const had = run.res.dryer; if (type === 'string' || type === 'warp') run.res.dryer = false;
  raise(run, p, type);
  run.res.dryer = had;
  return true;
}
function problemOptions(run, pi) {
  const p = run.printers[pi];
  if (!p || !p.problem) return [];
  const pr = p.problem, m = run.money, o = p.queue[0];
  const f = (s) => Math.round(fixTime(run, s));
  switch (pr.type) {
    case 'clog': return [
      { id: 'spare', icon: 'nozzle', label: 'Swap in a spare nozzle', sub: `${run.spares} in stock · ${f(4)} s`, ok: run.spares > 0 },
      { id: 'order', icon: 'truck', label: 'Order a nozzle', sub: `$15 · arrives in 30 s`, ok: m >= 15, cost: 15 },
      { id: 'coldpull', icon: 'ice', label: 'Try a cold pull', sub: `free · ${f(18)} s · works 60%`, ok: true },
    ];
    case 'axis': return [
      { id: 'repair', icon: 'tools', label: 'Repair it yourself', sub: `$40 · ${f(25)} s downtime`, ok: m >= 40, cost: 40 },
      { id: 'express', icon: 'hardhat', label: 'Call the express tech', sub: `$90 · ${f(6)} s`, ok: m >= 90, cost: 90 },
    ];
    case 'adhesion': return [
      { id: 'clean', icon: 'sponge', label: 'Clean the bed and restart', sub: `free · ${f(8)} s`, ok: true },
      { id: 'glue', icon: 'glue', label: 'Clean + glue stick', sub: `$6 · ${f(3)} s · sticky for 3 prints`, ok: m >= 6, cost: 6 },
      { id: 'drop', icon: 'trash', label: 'Give up the order', sub: '-rating', ok: true },
    ];
    case 'string': return [
      { id: 'dry', icon: 'dryer', label: 'Dry the filament', sub: `free · pause ${f(20)} s`, ok: true },
      { id: 'tune', icon: 'slider', label: 'Tune retraction', sub: `$12 · ${f(3)} s`, ok: m >= 12, cost: 12 },
      { id: 'ignore', icon: 'shrug', label: 'Ignore it', sub: '-1.5 stars on this print', ok: true },
    ];
    case 'warp': return [
      { id: 'dry', icon: 'cube', label: 'Add a draft shield', sub: `free · pause ${f(20)} s`, ok: true },
      { id: 'tune', icon: 'flame', label: 'Brim + hotter bed', sub: `$12 · ${f(3)} s`, ok: m >= 12, cost: 12 },
      { id: 'ignore', icon: 'shrug', label: 'Ignore it', sub: '-1.5 stars on this print', ok: true },
    ];
    case 'power': return [
      { id: 'reboot', icon: 'reboot', label: 'Reconnect and resume', sub: rs(run, 'ups') ? `free · ${f(4)} s · no loss` : `free · ${f(12)} s · lose 15% progress`, ok: true },
      { id: 'ups', icon: 'battery', label: 'Install a UPS', sub: `$60 · ${f(3)} s · never again here`, ok: m >= 60, cost: 60 },
    ];
    case 'runout': {
      const mat = pr.mat, c = spoolPrice(run, mat);
      const left = o ? Math.max(0, o.g * (1 - p.prog / o.work)) : 0;
      return [
        { id: 'buy', icon: 'spool|' + D.MATS[mat].color, label: `Buy a ${mat} spool`, sub: `$${c} · resume now`, ok: m >= c, cost: c },
        { id: 'mystery', icon: 'myspool', label: 'Use mystery filament', sub: mat === 'PLA' ? `${Math.round(run.fil.MYS)} g · -0.5 star` : 'PLA jobs only', ok: mat === 'PLA' && run.fil.MYS >= left },
        { id: 'drop', icon: 'trash', label: 'Cancel the order', sub: '-rating', ok: true },
      ];
    }
  }
  return [];
}
function fix(run, pi, opt) {
  const p = run.printers[pi];
  if (!p || !p.problem) return { ok: false };
  const o = problemOptions(run, pi).find((x) => x.id === opt);
  if (!o || !o.ok) return { ok: false, msg: 'Can\'t do that right now' };
  const type = p.problem.type;
  if (o.cost) { run.money -= o.cost; run.stats.spent += o.cost; }
  const f = (s) => fixTime(run, s);
  const done = () => { p.problem = null; run.stats.fixed++; };
  switch (opt) {
    case 'spare': run.spares--; done(); setBusy(run, p, f(4), 'Swapping nozzle', '', 'nozzle'); break;
    case 'order': done(); setBusy(run, p, 30, 'Nozzle on the way', '', 'truck'); break;
    case 'coldpull': done(); setBusy(run, p, f(18), 'Cold pull', 'coldpull', 'ice'); break;
    case 'repair': done(); setBusy(run, p, f(25), 'Fixing the belt', 'axis', 'tools'); break;
    case 'express': done(); setBusy(run, p, f(6), 'Tech is on it', 'axis', 'hardhat'); break;
    case 'clean': done(); p.prog = p.prog; setBusy(run, p, f(8), 'Cleaning bed', '', 'sponge'); break;
    case 'glue': done(); p.glue = 3; setBusy(run, p, f(3), 'Glue stick', '', 'glue'); break;
    case 'dry': done(); p.stringDone = true; setBusy(run, p, f(20), type === 'warp' ? 'Draft shield' : 'Drying filament', '', type === 'warp' ? 'cube' : 'dryer'); break;
    case 'tune': done(); p.stringDone = true; setBusy(run, p, f(3), 'Tuning', '', 'slider'); break;
    case 'ignore': p.problem = null; p.pen += 1.5; p.stringDone = true; break;
    case 'reboot': done(); if (!rs(run, 'ups')) { const o2 = p.queue[0]; const back = o2 ? Math.min(p.prog, o2.work * 0.15) : 0; p.prog -= back; } setBusy(run, p, f(rs(run, 'ups') ? 4 : 12), 'Rebooting', '', 'reboot'); break;
    case 'ups': done(); p.ups = true; setBusy(run, p, f(3), 'Installing UPS', '', 'battery'); break;
    case 'buy': run.fil[p.problem.mat] += 1000; done(); p.status = 'printing'; break;
    case 'mystery': p.useMys = true; p.pen += 0.5; done(); p.status = 'printing'; break;
    case 'drop': {
      const ord = p.queue.shift();
      if (ord) { run.scrap += p.used; run.stats.dropped++; run.rating = clamp(run.rating - 0.15, 0.5, 5); }
      p.problem = null; p.status = 'idle'; startNext(run, p);
      break;
    }
  }
  ev(run, { k: 'fix', pi, type, opt });
  return { ok: true };
}

/* ---------- simulation ---------- */
const BASE_HAZARD = 0.0095;
function hazard(run, p, dt) {
  const o = p.queue[0];
  if (!o || run.noHazard) return; // noHazard: test hook for deterministic UI tests
  const m = p.maint / 100;
  const wear = 0.45 + 2.3 * (1 - m) * (1 - m);
  let lam = BASE_HAZARD * wear;
  if (run.problemsSeen === 0 && run.t > run.firstIssueAt) lam = 1; // make sure everyone meets the mechanic early
  if (run.tut && run.problemsSeen === 0) { // first season ever: one friendly, scripted clog on the second print
    if (run.stats.done + run.printers.filter((q) => q && q.plate).length >= 1 && p.prog > o.work * 0.4) raise(run, p, 'clog');
    return;
  }
  if (rnd(run) > lam * dt) return;
  const mat = D.MATS[p.useMys || (o.any && o.mat === 'PLA' && run.fil.MYS > 0) ? 'MYS' : o.mat];
  const enc = enclosed(run, p);
  const absOpen = o.mat === 'ABS' && !enc;
  const firstLayers = p.prog < o.work * 0.12 ? 2 : 1;
  const opts = [
    { t: 'clog', w: 1 * mat.clog * (up(run, 'hardened') ? 0.4 : 1) },
    { t: 'axis', w: 0.55 * (p.maint < 35 ? 3 : 0.45) },
    { t: 'adhesion', w: 1 * mat.adh * firstLayers * (up(run, 'pei') ? 0.5 : 1) * (rs(run, 'lidar') ? 0.4 : 1) * (p.glue > 0 ? 0.3 : 1) * (absOpen ? 1.6 : 1) },
    { t: 'power', w: p.ups ? 0 : 0.45 },
  ];
  if (!p.stringDone) {
    if (o.mat === 'ABS') opts.push({ t: 'warp', w: absOpen ? 2.4 : 0.35 });
    else opts.push({ t: 'string', w: mat.string * (up(run, 'drybox') ? 0.4 : 1) * (enc ? 0.8 : 1) });
  }
  raise(run, p, pickW(run, opts, (x) => x.w).t);
}
function finishPrint(run, p) {
  const o = p.queue.shift();
  if (p.problem && (p.problem.type === 'string' || p.problem.type === 'warp')) { p.pen += 1.5; p.problem = null; }
  let q = qualityOf(run, p) - p.pen;
  if (o.mat === 'ABS' && !enclosed(run, p)) q -= 0.5;
  const late = run.t > o.deadline;
  if (late) q -= 1;
  const stars = clamp(Math.round(q * 2) / 2, 1, 5);
  let pay = o.pay;
  const low = stars < o.q, tip = !low && stars >= o.q + 1;
  if (low) pay *= 0.5; else if (tip) pay *= 1.15;
  if (late) pay *= 0.7;
  pay = Math.round(pay);
  run.stats.done++; run.stats.starsSum += stars; run.stats.goodStars += Math.max(0, stars - 2.5);
  run.stats.maxStars = Math.max(run.stats.maxStars || 0, stars); if (o.nc > 1) run.stats.multi = (run.stats.multi || 0) + 1;
  if (late) run.stats.late++;
  p.plate = { order: o, stars, pay, late, low, tip };
  p.status = 'done'; p.jobs++;
  if (p.glue > 0) p.glue--;
  p.stringDone = false; p.useMys = false;
  ev(run, { k: 'done', pi: p.idx, stars });
  if (rs(run, 'swap')) collect(run, p.idx);
}
function stepPrinter(run, p, dt) {
  if (p.busy > 0) {
    p.busy -= dt;
    if (p.busy <= 0) {
      p.busy = 0;
      const after = p.after; p.after = '';
      if (after === 'service') { p.maint = 100; run.stats.serviced = (run.stats.serviced || 0) + 1; ev(run, { k: 'serviced', pi: p.idx }); }
      if (after === 'axis') p.maint = Math.max(p.maint, 70);
      if (after === 'coldpull' && rnd(run) > 0.6) {
        p.status = p.queue.length ? 'printing' : 'idle';
        p.problem = { type: 'clog', t: run.t, mat: p.queue[0] ? p.queue[0].mat : 'PLA', retry: true };
        p.status = 'problem';
        ev(run, { k: 'problem', pi: p.idx, type: 'clog', retry: true });
        return;
      }
      if (p.plate) p.status = 'done';
      else if (p.queue.length) p.status = 'printing';
      else p.status = 'idle';
      if (p.status === 'printing' && p.prog === 0) startNext(run, p);
    }
    return;
  }
  if (p.status === 'fixing') p.status = p.problem ? 'problem' : p.plate ? 'done' : p.queue.length ? 'printing' : 'idle';
  if (p.status === 'idle' && p.queue.length && !p.plate && !p.problem) startNext(run, p);
  if (p.status !== 'printing') return;
  const o = p.queue[0];
  if (!o) { p.status = 'idle'; return; }
  const sp = speedOf(run, p, o);
  const dprog = Math.min(dt * sp, o.work - p.prog);
  const need = o.g * dprog / o.work;
  const purge = o.nc > 1 ? need * 0.12 * (o.nc - 1) : 0;
  let src = o.mat;
  if (p.useMys || (o.any && o.mat === 'PLA' && run.fil.MYS >= need + purge)) src = 'MYS';
  if (run.fil[src] < need + purge) {
    p.problem = { type: 'runout', t: run.t, mat: o.mat }; p.status = 'problem';
    run.problemsSeen++; run.stats.problems++; run.stats.byType.runout = (run.stats.byType.runout || 0) + 1;
    ev(run, { k: 'problem', pi: p.idx, type: 'runout' });
    return;
  }
  run.fil[src] -= need + purge;
  run.scrap += purge;
  p.used += need;
  p.prog += dprog;
  p.maint = Math.max(0, p.maint - dt * 0.17 * (up(run, 'kit') ? 0.65 : 1));
  run.power += dt * D.RENT.power;
  if (!p.problem) hazard(run, p, dt);
  if (p.status === 'printing' && p.prog >= o.work - 1e-6) finishPrint(run, p);
}
function step(run, dt) {
  if (run.over) return;
  run.t += dt;
  // customers
  if (run.t >= run.nextOrder) { spawnOrder(run); run.nextOrder = run.t + orderInterval(run); }
  for (let i = run.inbox.length - 1; i >= 0; i--) {
    if (run.t > run.inbox[i].expires) { const o = run.inbox.splice(i, 1)[0]; run.stats.lost++; ev(run, { k: 'expired', id: o.id, name: o.name }); }
  }
  // printers
  for (const p of run.printers) if (p) stepPrinter(run, p, dt);
  // scrap recycler
  if (run.scrap > 0) {
    const rate = rs(run, 'recpro') ? 12 : 6, yld = rs(run, 'recpro') ? 0.9 : 0.75;
    const c = Math.min(run.scrap, rate * dt);
    run.scrap -= c; run.fil.MYS += c * yld;
  }
  // deliveries
  for (let i = run.deliveries.length - 1; i >= 0; i--) {
    if (run.t >= run.deliveries[i].at) { run.deliveries.splice(i, 1); run.spares++; ev(run, { k: 'delivery', what: 'nozzle' }); }
  }
  // rent & bills
  if (run.t >= run.rentDue && run.rentDue < run.len) {
    const amt = nextRent(run);
    if (run.money >= amt) {
      run.money -= amt; run.stats.rentPaid += amt; run.rentIdx++; run.rentDue += D.RENT.every; run.power = 0; run.grace = 0;
      ev(run, { k: 'rent', amt });
    } else if (run.grace <= 0) {
      run.grace = 25; run.graceAmt = amt; run.rentDue = run.t; ev(run, { k: 'rentwarn', amt });
    }
  }
  if (run.grace > 0) {
    run.grace -= dt;
    if (run.money >= nextRent(run)) { /* paid on next step via rentDue */ run.rentDue = run.t; }
    else if (run.grace <= 0) { endRun(run, 'rent'); return; }
  }
  // the cat
  const c = run.cat;
  if (!c.on && run.t >= c.next) { c.on = true; c.p = 0; c.dir = rnd(run) < 0.5 ? 1 : -1; c.lane = rnd(run); c.petted = false; ev(run, { k: 'catin' }); }
  if (c.on) { c.p += dt / 14; if (c.p >= 1) { c.on = false; c.next = run.t + (run.perks.catbed ? 35 : 70) * (0.7 + rnd(run) * 0.6); } }
  if (run.t >= run.len) endRun(run, 'expo');
}
function tick(run, dt) {
  let left = dt;
  while (left > 0 && !run.over) { const s = Math.min(0.25, left); step(run, s); left -= s; }
}
function endRun(run, reason) {
  if (run.over) return;
  run.over = true; run.reason = reason;
  // finished prints still sitting on plates get delivered at the bell
  for (const p of run.printers) if (p && p.plate) collect(run, p.idx);
  const s = run.stats;
  const avg = s.done ? s.starsSum / s.done : 0;
  const booth = reason === 'expo' ? D.UPGRADES.reduce((a, u) => a + (u.booth && run.ups[u.id] ? u.booth : 0), 0) : 0;
  let rep = s.done * REP.done + s.goodStars * REP.stars + Math.max(0, run.money) / REP.money + (run.rating - 3) * REP.rating;
  if (reason === 'expo') rep += REP.expo + booth; else rep *= 0.5;
  rep = Math.max(0, rep) * run.repMul * (rs(run, 'expo') ? 1.25 : 1);
  run.result = { reason, rep: Math.round(rep), booth, done: s.done, avg: Math.round(avg * 10) / 10, money: Math.round(run.money), rating: Math.round(run.rating * 10) / 10,
    late: s.late, failed: s.failed, lost: s.lost, problems: s.problems, fixed: s.fixed, rentPaid: s.rentPaid, earned: s.earned };
  ev(run, { k: 'end', reason });
}

const REP = { done: 0.12, stars: 0.12, money: 500, rating: 2, expo: 3 };

/* ---------- goal chain ---------- */
function goalCheck(meta, run, id) { // -> [have, need]
  const s = run ? run.stats : null, R = meta.research;
  switch (id) {
    case 'deliver1': return [s ? s.done : 0, 1];
    case 'fix1': return [s ? s.fixed : 0, 1];
    case 'earn150': return [s ? Math.floor(s.earned) : 0, 150];
    case 'printer2': return [run ? run.printers.filter(Boolean).length : 0, 2];
    case 'upgrade1': return [run ? Object.keys(run.ups).length - 1 : 0, 1];
    case 'rent1': return [s && s.rentPaid > 0 ? 1 : 0, 1];
    case 'stars4': return [s && s.maxStars >= 4 ? 1 : 0, 1];
    case 'deliver10': return [s ? s.done : 0, 10];
    case 'expo1': return [meta.history.some((h) => h.reason === 'expo') ? 1 : 0, 1];
    case 'research1': return [Object.keys(R).length - 1, 1];
    case 'multi1': return [s ? s.multi || 0 : 0, 1];
    case 'booth1': return [run && run.ups.table ? 1 : 0, 1];
    case 'service1': return [s ? s.serviced || 0 : 0, 1];
    case 'deliver25': return [s ? s.done : 0, 25];
    case 'rep20': return [meta.best.rep >= 20 ? 1 : 0, 1];
    case 'branch': return [R.supplier || R.sched || R.expo || meta.lab > 0 ? 1 : 0, 1];
    case 'showcase': return [run && run.ups.showcase ? 1 : 0, 1];
    case 'workshop': return [meta.lab >= 1 ? 1 : 0, 1];
  }
  return [0, 1];
}
function currentGoal(meta, run) {
  const gl = D.GOALS[meta.goal || 0];
  if (!gl) return null;
  const [have, need] = goalCheck(meta, run, gl.id);
  return { goal: gl, n: (meta.goal || 0) + 1, of: D.GOALS.length, have: Math.min(have, need), need, done: have >= need };
}
/* complete the current goal if it is met (one per call, so the UI can celebrate each one) */
function checkGoals(meta, run) {
  const cg = currentGoal(meta, run);
  if (!cg || !cg.done) return null;
  const rw = cg.goal.reward;
  if (rw.money && !(run && !run.over)) return null; // cash rewards only land during a season
  meta.goal = (meta.goal || 0) + 1;
  if (rw.money) { run.money += rw.money; run.stats.goalCash += rw.money; }
  if (rw.rep) { meta.rep += rw.rep; meta.lifetimeRep += rw.rep; meta.labRep += rw.rep; }
  if (run && !run.over) ev(run, { k: 'goal', id: cg.goal.id });
  return cg.goal;
}

/* ---------- meta actions ---------- */
function applyResult(meta, run) {
  const r = run.result;
  if (!r || run.applied) return r;
  run.applied = true;
  meta.rep += r.rep; meta.lifetimeRep += r.rep; meta.labRep += r.rep; meta.seasons++;
  meta.best.rep = Math.max(meta.best.rep, r.rep); meta.best.money = Math.max(meta.best.money, r.money);
  meta.best.orders = Math.max(meta.best.orders, r.done); meta.best.stars = Math.max(meta.best.stars, r.avg);
  meta.history.push({ lab: run.lab, rep: r.rep, done: r.done, money: r.money, reason: r.reason });
  if (meta.history.length > 20) meta.history.shift();
  meta.run = null;
  return r;
}
function researchState(meta, id) {
  const n = D.RESEARCH.find((x) => x.id === id);
  if (meta.research[id]) return 'owned';
  if (n.req && !meta.research[n.req]) return 'locked';
  return meta.rep >= n.cost ? 'buy' : 'poor';
}
function buyResearch(meta, id) {
  const n = D.RESEARCH.find((x) => x.id === id);
  if (researchState(meta, id) !== 'buy') return { ok: false };
  meta.rep -= n.cost; meta.research[id] = true;
  return { ok: true };
}
function labState(meta, id) {
  const L = D.LABS[id];
  if (id <= meta.lab) return id === meta.lab ? 'here' : 'done';
  if (id > meta.lab + 1) return 'locked';
  if (L.soon) return 'soon';
  return meta.labRep >= L.need ? 'buy' : 'poor';
}
function trophiesFor(meta) { return 2 + Math.floor(meta.labRep / 30); }
function moveLab(meta) {
  const next = meta.lab + 1;
  if (labState(meta, next) !== 'buy') return { ok: false };
  const gain = trophiesFor(meta);
  meta.trophies += gain; meta.lab = next; meta.research = { lab: true }; meta.rep = 0; meta.labRep = 0; meta.run = null;
  return { ok: true, trophies: gain };
}
function buyPerk(meta, id) {
  const pk = D.PERKS.find((x) => x.id === id);
  if (!pk || meta.perks[id] || meta.trophies < pk.cost || meta.lab < 1) return { ok: false };
  meta.trophies -= pk.cost; meta.perks[id] = true;
  return { ok: true };
}

/* ---------- simple bot (balance sims + e2e test) ---------- */
function botThink(run, opts) {
  opts = opts || {};
  if (run.over) return;
  run.printers.forEach((p, i) => {
    if (!p) return;
    if (p.plate) collect(run, i);
    if (p.problem) {
      const os = problemOptions(run, i).filter((o) => o.ok && o.id !== 'drop');
      const pref = ['spare', 'buy', 'tune', 'glue', 'reboot', 'clean', 'repair', 'order', 'coldpull', 'mystery', 'express', 'ups', 'dry', 'ignore'];
      os.sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id));
      if (os.length) fix(run, i, os[0].id); else fix(run, i, 'drop');
    }
    if (p.maint < 45 && p.status === 'idle') service(run, i);
  });
  // assign
  for (const o of run.inbox.slice()) {
    let best = -1, bs = -1e9;
    run.printers.forEach((p, i) => {
      if (!p) return;
      const c = canAssign(run, o, i);
      if (!c.ok) return;
      let left = 0; p.queue.forEach((q, k) => { left += (k === 0 ? q.work - p.prog : q.work) / speedOf(run, p, q); });
      const eta = run.t + left + o.work / speedOf(run, p, o);
      let sc = -left - (c.warn.length ? 60 : 0) - (eta > o.deadline ? 200 : 0);
      if (p.queue.length >= 2) sc -= 40;
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best >= 0 && bs > -150) assign(run, o.id, best);
  }
  // filament top-up
  for (const m of D.MAT_ORDER) {
    const needed = run.printers.some((p) => p && p.queue.some((q) => q.mat === m));
    if (needed && run.fil[m] < 400 && run.money > 60) buySpool(run, m);
  }
  if (run.spares < 1 && run.money > 150 && !run.deliveries.length) buyNozzle(run);
  if (opts.noBuy) return;
  const reserve = (run.rentDue - run.t < 75 ? nextRent(run) : Math.min(nextRent(run), 80)) + 20;
  const empty = run.printers.findIndex((p) => !p);
  if (empty >= 0) {
    const want = !run.printers.some((p) => p && p.type === 'rainbow') ? 'rainbow' : 'kestrel';
    const first = run.printers.filter(Boolean).length === 1 ? 'kestrel' : want;
    if (run.money > D.PRINTERS[first].cost + reserve) buyPrinter(run, empty, first);
  } else {
    const list = ['hardened', 'hotend', 'board', 'pei', 'drybox', 'hotend2', 'kit', 'enclose', 'flyer', 'calib'];
    if (run.t > 300 || list.every((u) => run.ups[u])) list.push('table', 'banner', 'lights', 'showcase');
    for (const u of list) {
      if (upgradeState(run, u) === 'buy' && run.money > upCost(run, u) + reserve) { buyUpgrade(run, u); break; }
    }
  }
}

BL.Core = { upCost, REP, goalCheck, currentGoal, checkGoals, rnd, clamp, newMeta, fixMeta, newRun, makePrinter, speedOf, enclosed, qualityOf, maxQueue, inboxMax, payMul, spoolPrice, nextRent,
  expectedStars, canAssign, spawnOrder, assign, unqueue, collect, service, buySpool, buyNozzle, upgradeState, buyUpgrade, buyPrinter, petCat,
  problemOptions, fix, forceProblem, tick, endRun, applyResult, researchState, buyResearch, labState, moveLab, trophiesFor, buyPerk, botThink };
if (typeof module !== 'undefined') module.exports = BL;
})(typeof window !== 'undefined' ? window : globalThis);
