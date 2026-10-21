/* Tiny Print Shop - UI controller: game loop, input, HUD, goal chain, tutorial, sheets, the "Hey, I have this issue!" popup,
 * maps, saving and the platform (CrazyGames) gameplay state. */
(function (root) {
'use strict';
const BL = root.BL, D = BL.Data, C = BL.Core, R = BL.Render, S = BL.Sfx, M = BL.Maps, PF = BL.Platform, IC = BL.Icons;
const $ = (id) => document.getElementById(id);
const el = M.el;
const ic = (n, cls) => IC.html(n, cls);
const qs = new URLSearchParams(root.location.search);
const URL_SPEED = Math.max(0.1, Math.min(200, parseFloat(qs.get('speed')) || 1));
const SPEEDS = [1, 2, 3];

let meta = null, mode = 'home', sel = null, paused = false, speedIdx = 0, tNow = 0, lastFrame = 0, hudTimer = 0, saveTimer = 0, booted = false, manual = false;
let W = 0, H = 0, DPR = 1, Z = 1, view = { vx: 0, vy: 0, vw: 100, vh: 100 };
let pending = [], sheet = null, alertPi = -1, homeTab = 'lab', resSel = null, labSel = null, upSel = null, ordersSig = '', hintTxt = '', seenCards = new Set();
let alertDelay = null;
const cv = $('cv'), ctx = cv.getContext('2d');
const run = () => meta && meta.run;

/* ---------- save ---------- */
function load() {
  let m = null;
  try {
    let raw = PF.storage.get(D.SAVE_KEY);
    // migrate a save from the game's earlier name (same data, older key)
    for (const k of D.OLD_SAVE_KEYS || []) { if (raw) break; raw = PF.storage.get(k); if (raw) { PF.storage.set(D.SAVE_KEY, raw); PF.storage.remove(k); } }
    if (raw) m = JSON.parse(raw);
  } catch (e) { m = null; }
  meta = C.fixMeta(m);
  meta._fresh = !m;
  if (meta.run && (meta.run.over || meta.run.v !== 1)) meta.run = null;
  S.setMusic(meta.settings.music); S.setSfx(meta.settings.sfx);
}
function save() {
  if (!meta) return;
  const r = meta.run;
  let evs = null;
  if (r) { evs = r.events; r.events = []; }
  const fresh = meta._fresh; delete meta._fresh;
  PF.storage.set(D.SAVE_KEY, JSON.stringify(meta));
  meta._fresh = fresh;
  if (r) r.events = evs;
}

/* ---------- layout ---------- */
function resize() {
  DPR = Math.min(2, root.devicePixelRatio || 1);
  W = root.innerWidth; H = root.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const wide = W > H * 1.15 && W >= 700;
  Z = wide ? Math.max(0.9, Math.min(1.45, W / 1050, H / 640)) : Math.max(0.88, Math.min(1.3, W / 400, H / 780));
  Z = Math.round(Z * 20) / 20;
  document.documentElement.style.setProperty('--z', Z);
  document.body.classList.toggle('wide', wide);
  document.body.classList.toggle('short', H < 560);
  computeView();
  ordersSig = '';
}
function computeView() {
  if (mode === 'run') {
    const tb = $('topbar').getBoundingClientRect(), tr = $('tray').getBoundingClientRect();
    $('goalBar').style.top = Math.round((tb.bottom + 4) / Z) + 'px';
    document.documentElement.style.setProperty('--gpTop', Math.round((tb.bottom + 2) / Z) + 'px');
    if (document.body.classList.contains('wide')) view = { vx: 6, vy: tb.bottom + 2, vw: tr.left - 12, vh: H - tb.bottom - 8 };
    else view = { vx: 4, vy: tb.bottom + 2, vw: W - 8, vh: tr.top - tb.bottom - 6 };
  } else {
    const top = document.querySelector('.hometop').getBoundingClientRect().bottom;
    let bottom = H - 70;
    if (homeTab === 'lab') { const c = document.querySelector('.home-card').getBoundingClientRect(); bottom = c.top - 6; }
    view = { vx: 6, vy: top, vw: W - 12, vh: Math.max(120, bottom - top) };
  }
}

/* ---------- loop ---------- */
function frame(ts) {
  if (!manual) {
    const dt = Math.min(0.1, lastFrame ? (ts - lastFrame) / 1000 : 0.016);
    lastFrame = ts;
    step(dt);
    requestAnimationFrame(frame);
  }
}
function step(dt) {
  tNow += dt;
  const r = run();
  if (mode === 'run' && r) {
    const frozen = r.over || paused || alertPi >= 0;
    if (!frozen) C.tick(r, dt * URL_SPEED * SPEEDS[speedIdx]);
    if (r.events.length) drainEvents(r);
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const selection = mode === 'run' && sel != null ? selectionFor(r) : null;
  R.draw(ctx, { time: tNow, dt, view, run: mode === 'run' ? r : null, lab: meta.lab, selection, W, H });
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.12;
    if (mode === 'run' && r) {
      const g = !r.over ? C.checkGoals(meta, r) : null; if (g) drainEvents(r);
      updateHud(r); renderOrders(r); refreshSheet(); refreshAlert(); updateTutorial(r);
      // an issue that came up while a sheet/menu was open pops as soon as the player is back in the lab
      if (alertPi < 0 && !alertDelay && !r.over && pending.length && !isModalOpen()) {
        pending = pending.filter((x) => r.printers[x] && r.printers[x].problem);
        if (pending.length) openAlert(pending.shift());
      }
    }
  }
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 3; if (mode === 'run') save(); }
  // platform: "gameplay" only while a season is actually being played
  const playing = booted && mode === 'run' && r && !r.over && !paused && !document.hidden;
  PF.gameplay(playing);
  S.setMood(mode === 'run' ? (paused ? 'pause' : 'run') : 'home');
}
function selectionFor(r) {
  const o = r.inbox.find((x) => x.id === sel);
  if (!o) { sel = null; return null; }
  return r.printers.map((p, i) => {
    if (!p) return { ok: false, short: 'empty slot' };
    const c = C.canAssign(r, o, i);
    if (c.ok) return c;
    return { ok: false, short: c.why.startsWith('Needs') ? 'needs Rainbow' : c.why === 'Queue full' ? 'queue full' : 'no' };
  });
}

/* ---------- events from the sim ---------- */
function moneyTarget() { const b = $('hMoney').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }
function bump(id) { const e = $(id); if (!e) return; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
function drainEvents(r) {
  const evs = r.events.splice(0);
  R.setTargets({ money: moneyTarget() });
  for (const e of evs) {
    switch (e.k) {
      case 'order': S.play('order'); break;
      case 'assign': S.play('assign'); R.burst('printer', e.pi, { type: 'spark', n: 8 }); break;
      case 'done': S.play('done'); R.floatAt('printer', e.pi, String(e.stars), '#ffd84a', 'star'); R.burst('printer', e.pi, { type: 'star', n: Math.round(e.stars) }); break;
      case 'paid':
        S.play('coin'); R.burst('printer', e.pi, { type: 'coin', value: e.pay });
        R.floatAt('printer', e.pi, `+$${e.pay}`, e.low ? '#ffb0a0' : '#9dff9d', e.tip ? 'heart' : e.late ? 'clock' : e.low ? 'frown' : 'coin');
        setTimeout(() => bump('hMoney'), 700); meta.tut.collected = true; break;
      case 'problem':
        S.play('issue', e.type); R.shake(16); R.burst('printer', e.pi, { type: 'smoke', n: 10 }); R.burst('printer', e.pi, { type: 'spark', n: 12, colors: ['#E0473C', '#FF8000', '#F7C52B'] });
        if (alertPi < 0 && !alertDelay && !isModalOpen()) { alertDelay = setTimeout(() => { alertDelay = null; if (!isModalOpen()) openAlert(e.pi); else queueAlert(e.pi); }, 550); }
        else queueAlert(e.pi);
        break;
      case 'autofix': R.floatAt('printer', e.pi, 'auto-fixed', '#ffe08a', 'dryer'); toast(ic('dryer') + ' ' + e.msg); break;
      case 'fix': S.play('fix'); break;
      case 'serviced': R.floatAt('printer', e.pi, '100%', '#9ff0ff', 'sponge'); R.burst('printer', e.pi, { type: 'spark', n: 10, colors: ['#9ff0ff', '#fff'] }); break;
      case 'rent': S.play('rent'); toast(`${ic('house')} Rent paid: $${e.amt}`, r.rentDue >= r.len ? 'That was the last one. Now push for the expo!' : 'Next one in 2:30'); break;
      case 'rentwarn': S.play('warn'); toast(`${ic('warn')} Rent $${e.amt} due!`, 'You have 25 s to find the money'); break;
      case 'expired': toast(`${ic('frown')} A customer left`, e.name); break;
      case 'delivery': toast(`${ic('truck')} Spare nozzle arrived`, '+1 nozzle in stock'); break;
      case 'catin': S.play('meow'); break;
      case 'cat': R.floatAt('cat', 0, `+$${e.gain}`, '#ffd0e0', 'heart'); S.play('meow'); break;
      case 'goal': celebrateGoal(D.GOALS.find((g) => g.id === e.id)); break;
      case 'end': onSeasonEnd(r); break;
    }
  }
}
function queueAlert(pi) { if (alertPi !== pi && !pending.includes(pi)) pending.push(pi); updatePending(); }
const pname = (r, i) => (r.printers[i] ? `${D.PRINTERS[r.printers[i].type].name} #${i + 1}` : 'Slot ' + (i + 1));
const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const money = (n) => '$' + Math.floor(n);
const rewardHtml = (rw) => rw.money ? `${ic('coin')}+$${rw.money}` : `${ic('medal')}+${rw.rep}`;

/* ---------- goals ---------- */
function celebrateGoal(g) {
  if (!g) return;
  S.play('goal');
  const p = $('goalPop');
  p.innerHTML = `<small>Goal complete!</small><b>${ic(g.icon)}${g.text}</b><small>${rewardHtml(g.reward)}</small>`;
  p.classList.remove('hidden'); p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  clearTimeout(p._t); p._t = setTimeout(() => p.classList.add('hidden'), 2400);
  R.burst(null, 0, { type: 'confetti', x: mode === 'run' ? view.vx + view.vw / 2 : W / 2, y: H * 0.25, n: 46 });
  const gb = $('goalBar'); gb.classList.remove('flash'); void gb.offsetWidth; gb.classList.add('flash');
  if (g.reward.money) setTimeout(() => bump('hMoney'), 300);
  goalSig = '';
}
let goalSig = '';
function updateGoalBar(r) {
  const cg = C.currentGoal(meta, r), bar = $('goalBar');
  if (!cg) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const sig = cg.goal.id;
  if (sig !== goalSig) {
    goalSig = sig;
    $('goalIc').className = 'gic ' + IC.html(cg.goal.icon).match(/class="ic ([^"]+)"/)[1] + ' ic';
    $('goalN').textContent = `Goal ${cg.n} of ${cg.of}`;
    $('goalTxt').textContent = cg.goal.text;
    $('goalRew').innerHTML = rewardHtml(cg.goal.reward);
  }
  $('goalProg').style.width = (100 * cg.have / cg.need).toFixed(0) + '%';
}

/* ---------- HUD ---------- */
function updateHud(r) {
  $('hMoney').textContent = Math.floor(r.money);
  $('hRating').textContent = r.rating.toFixed(1);
  $('hTime').textContent = fmtT(r.len - r.t);
  $('hTimeBar').style.width = (100 * r.t / r.len).toFixed(1) + '%';
  const chip = $('hRentChip');
  if (r.rentDue >= r.len && r.grace <= 0) { $('hRent').textContent = 'paid'; $('hRentT').textContent = ''; chip.classList.remove('warn', 'due'); }
  else if (r.grace > 0) { $('hRent').textContent = money(C.nextRent(r)); $('hRentT').textContent = fmtT(r.grace) + '!'; chip.classList.add('warn', 'due'); }
  else {
    const left = r.rentDue - r.t, amt = C.nextRent(r);
    $('hRent').textContent = money(amt); $('hRentT').textContent = fmtT(left);
    chip.classList.toggle('due', r.money < amt);
    chip.classList.toggle('warn', left < 20 && r.money < amt);
  }
  $('speedTxt').textContent = SPEEDS[speedIdx] * (URL_SPEED !== 1 ? URL_SPEED : 1) + 'x';
  const parts = [];
  for (const m of D.MAT_ORDER) parts.push(`<span data-shop="1" class="${r.fil[m] < 250 && r.printers.some((p) => p && p.queue.some((q) => q.mat === m)) ? 'low' : ''}">${ic('spool|' + D.MATS[m].color)}${m} ${(r.fil[m] / 1000).toFixed(1)}</span>`);
  if (r.fil.MYS > 1 || r.scrap > 1) parts.push(`<span data-shop="1">${ic('myspool')}${(r.fil.MYS / 1000).toFixed(1)}${r.scrap > 1 ? ` ${ic('recycle')}${Math.round(r.scrap)}g` : ''}</span>`);
  parts.push(`<span data-shop="1">${ic('nozzle')}${r.spares}${r.deliveries.length ? ' ' + ic('truck') : ''}</span>`);
  const html = parts.join('');
  if ($('inv')._h !== html) { $('inv').innerHTML = html; $('inv')._h = html; }
  $('ordCount').textContent = `${r.inbox.length}/${C.inboxMax(r)}`;
  $('dotUps').classList.toggle('hidden', !D.UPGRADES.some((u) => C.upgradeState(r, u.id) === 'buy'));
  updateGoalBar(r);
}
function matTag(m) { return `<span class="tag" style="background:${D.MATS[m].color}">${m}</span>`; }
function cdots(cols) { return `<span class="cdots">${cols.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`; }
function renderOrders(r) {
  const box = $('orders');
  const sig = r.inbox.map((o) => o.id).join(',') + '|' + sel + '|' + r.printers.map((p) => p ? p.type + p.queue.length : '-').join('') + '|' + Object.keys(r.ups).length;
  if (sig !== ordersSig) {
    ordersSig = sig;
    box.innerHTML = '';
    if (!r.inbox.length) box.appendChild(el('div', 'empty', `${ic('mug')} No orders right now. New customers are on their way...`));
    for (const o of r.inbox) {
      const any = r.printers.some((p, i) => p && C.canAssign(r, o, i).ok);
      const multiOk = r.printers.some((p) => p && D.PRINTERS[p.type].colors >= o.nc);
      const b = el('button', 'ocard' + (o.id === sel ? ' sel' : '') + (any ? '' : ' cant') + (seenCards.has(o.id) ? '' : ' new'));
      seenCards.add(o.id);
      b.dataset.id = o.id;
      b.innerHTML = `<div class="top">${ic(IC.orderIcon(o), 'oi')}<span class="on">${o.name}</span></div>
        <div class="row">${matTag(o.mat)}${cdots(o.colors)}<span class="qtag">${o.q}${ic('star')}</span>${o.any ? '<span class="any">any colour</span>' : ''}</div>
        <div class="money"><span>${ic('clock')}${o.work}s</span><b>$${o.pay}</b></div>
        ${multiOk ? '' : `<div class="row"><span class="need">${ic('palette')}needs Rainbow printer</span></div>`}
        <i class="wait"></i>`;
      b.addEventListener('click', () => {
        S.play('select');
        sel = sel === o.id ? null : o.id;
        ordersSig = '';
      });
      box.appendChild(b);
    }
  }
  for (const c of box.querySelectorAll('.ocard')) {
    const o = r.inbox.find((x) => x.id === +c.dataset.id); if (!o) continue;
    const f = Math.max(0, (o.expires - r.t) / (o.expires - o.arrive));
    const w = c.querySelector('.wait'); w.style.width = (f * 100).toFixed(1) + '%'; w.classList.toggle('low', f < 0.3);
  }
}

/* ---------- tutorial: visual, in the game, skippable ---------- */
function pointAt(x, y) {
  const p = $('pointer');
  if (x == null) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  p.style.left = Math.round(x - 26) + 'px'; p.style.top = Math.round(y - 4) + 'px'; p.dataset.x = Math.round(x); p.dataset.y = Math.round(y);
}
function pointAtEl(e) { if (!e) return pointAt(null); const b = e.getBoundingClientRect(); pointAt(b.left + b.width * 0.5, b.top + b.height * 0.5); }
function pointAtPrinter(i) { const h = R.hits.printers[i] || R.hits.slots[i]; if (!h) return pointAt(null); pointAt(h.x + h.w / 2, h.y + h.h * 0.5); }
function setHint(t, icon) {
  const key = (icon || '') + t;
  if (key !== hintTxt) { hintTxt = key; $('hint').innerHTML = t ? (icon ? ic(icon) : '') + `<span>${t}</span>` : ''; $('hint').classList.toggle('hidden', !t); }
  $('hint').style.top = 'auto'; $('hint').style.bottom = Math.round((H - (view.vy + view.vh) + 6) / Z) + 'px';
}
function updateTutorial(r) {
  const tut = meta.tut;
  let t = '', icon = '', pointer = null;
  const tutorial = r.tut && !tut.done && !r.over;
  if (tutorial) {
    const plate = r.printers.findIndex((p) => p && p.plate);
    const busyIdle = r.printers.findIndex((p) => p && !p.queue.length && !p.plate && !p.problem);
    if (alertPi >= 0) { /* the popup itself guides */ }
    else if (plate >= 0) { t = 'Done! Tap the printer to deliver it and get paid'; icon = 'check'; pointer = () => pointAtPrinter(plate); }
    else if (sel != null) { t = 'Now tap your printer to start printing'; icon = 'printer'; pointer = () => pointAtPrinter(Math.max(0, r.printers.findIndex((p, i) => p && C.canAssign(r, r.inbox.find((o) => o.id === sel) || r.inbox[0], i).ok))); }
    else if (busyIdle >= 0 && r.inbox.length && r.stats.done < 3) { t = r.stats.done ? 'Queue the next order' : 'A customer! Tap the order card'; icon = 'inbox'; pointer = () => pointAtEl($('orders').querySelector('.ocard')); }
    else if (r.stats.done < 1) { t = 'Printing... watch the layers stack up!'; icon = 'printer'; }
    else if (r.stats.fixed >= 1 && r.printers.filter(Boolean).length < 2) {
      const slot = r.printers.findIndex((p) => !p);
      if (r.money >= D.PRINTERS.kestrel.cost && slot >= 0) { t = 'You can afford a second printer! Tap the + slot'; icon = 'plus'; pointer = () => pointAtPrinter(slot); }
      else { t = 'Deliver prints to save up for a second printer'; icon = 'coin'; }
    } else if (r.stats.done >= 1 && r.stats.fixed < 1) { t = 'Keep the orders coming. Printers sometimes need help!'; icon = 'printer'; }
    if (r.printers.filter(Boolean).length >= 2) { tut.done = true; toast(`${ic('sparkle')} You're running a print shop!`, 'Goals at the top show what to do next'); }
  } else if (!r.over && sel == null && !tut.bought && r.printers.some((p) => !p) && r.money >= D.PRINTERS.kestrel.cost + 40) { t = 'You can afford another printer! Tap a + slot'; icon = 'plus'; }
  if (r.printers.filter(Boolean).length > 1) tut.bought = true;
  if (r.grace > 0) { t = `Rent due! Deliver prints to raise ${money(C.nextRent(r))}`; icon = 'warn'; }
  setHint(t, icon);
  if (pointer && !isModalOpen()) pointer(); else pointAt(null);
  const sk = $('skipTut');
  sk.classList.toggle('hidden', !tutorial);
  if (tutorial) { sk.style.left = Math.round((view.vx + 6) / Z) + 'px'; sk.style.top = Math.round((view.vy + view.vh - 34 * Z) / Z) + 'px'; }
}
$('skipTut').addEventListener('click', () => { meta.tut.done = true; S.play('tap'); pointAt(null); setHint(''); $('skipTut').classList.add('hidden'); toast('Tutorial skipped', 'Help is in the tray if you need it'); save(); });

/* ---------- input ---------- */
let down = null;
cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
cv.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved < 14) tapAt(e.clientX, e.clientY);
});
function tapAt(x, y) {
  if (mode !== 'run') return;
  const r = run(); if (!r || r.over) return;
  const h = R.hitTest(x, y);
  if (!h) { if (sel != null) { sel = null; ordersSig = ''; } return; }
  if (h.kind === 'cat') { const res = C.petCat(r); if (res.ok) drainEvents(r); return; }
  if (h.kind === 'printer') return tapPrinter(h.i);
  if (h.kind === 'slot') { if (sel != null) toast(`${ic('plus')} Empty slot`, 'Buy a printer here first'); return openSheet('slot', h.i); }
  if (h.kind === 'recycler') { S.play('tap'); return toast(`${ic('recycle')} Scrap recycler`, `${Math.round(r.scrap)} g scrap, ${Math.round(r.fil.MYS)} g mystery PLA ready`); }
  if (h.kind === 'shelf') return openSheet('shop');
}
function tapPrinter(i) {
  const r = run(), p = r.printers[i];
  if (p.problem) { if (sel != null) { sel = null; ordersSig = ''; } return openAlert(i); }
  if (p.plate) { C.collect(r, i); drainEvents(r); if (sel == null) return; }
  if (sel != null) {
    const res = C.assign(r, sel, i);
    if (res.ok) {
      meta.tut.assigned = true;
      if (res.warn && res.warn.length) toast(`${ic('warn')} ${res.warn[0]}`);
      sel = null; ordersSig = ''; drainEvents(r);
    } else { S.play('error'); toast(`${ic('warn')} ${res.msg}`); }
    return;
  }
  if (p.problem) return openAlert(i);
  if (p.plate) { C.collect(r, i); drainEvents(r); return; }
  openSheet('printer', i);
}
$('btnPause').addEventListener('click', () => openPause());
$('btnSpeed').addEventListener('click', () => { speedIdx = (speedIdx + 1) % SPEEDS.length; S.play('tap'); updateHud(run()); });
$('btnShop').addEventListener('click', () => openSheet('shop'));
$('btnUps').addEventListener('click', () => openSheet('ups'));
$('btnHelp').addEventListener('click', () => openSheet('help'));
$('inv').addEventListener('click', (e) => { if (e.target.closest('[data-shop]')) openSheet('shop'); });
root.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'KeyP') {
    e.preventDefault();
    if (mode !== 'run' || !run() || run().over) return;
    if (paused) closePause(); else if (!isModalOpen()) openPause();
  }
});

/* ---------- toast ---------- */
let toastT = 0;
function toast(a, b) {
  const t = $('toast');
  if (!$('summary').classList.contains('hidden')) return;
  t.style.top = Math.round((mode === 'run' ? view.vy + 6 + ($('goalBar').classList.contains('hidden') ? 0 : 44 * Z) + ($('goalPop').classList.contains('hidden') ? 0 : 50 * Z) : 76 * Z) / Z) + 'px'; t.innerHTML = a + (b ? `<small>${b}</small>` : '');
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000);
}
// touch: the tap that opens a modal is followed by a synthesized click on the new backdrop; ignore it
const modalOpenedAt = {};
new MutationObserver((ms) => { for (const m of ms) if (!m.target.classList.contains('hidden') && (m.oldValue || '').includes('hidden')) modalOpenedAt[m.target.id] = performance.now(); })
  .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
const backdropOk = (id) => performance.now() - (modalOpenedAt[id] || 0) > 400;
const isModalOpen = () => ['sheet', 'alert', 'summary', 'pauseMenu'].some((id) => !$(id).classList.contains('hidden'));

/* ---------- pause menu ---------- */
function openPause() {
  if (mode !== 'run') return;
  paused = true; S.play('tap'); closeSheet();
  const card = $('pauseCard');
  card.innerHTML = `<h2>Paused</h2>
    <button class="btn green" id="pResume">${ic('play')} Resume</button>
    <div class="toggles"><button class="btn toggle" id="pMusic"></button><button class="btn toggle" id="pSfx"></button></div>
    <button class="btn alt" id="pHelp">${ic('help')} How to play</button>
    <button class="btn alt" id="pHome">${ic('garage')} Back to the lab</button>
    <p class="small">The season clock is stopped. Your progress is saved.</p>`;
  $('pauseMenu').classList.remove('hidden');
  paintToggles();
  $('pResume').onclick = closePause;
  $('pMusic').onclick = () => toggleSetting('music');
  $('pSfx').onclick = () => toggleSetting('sfx');
  $('pHelp').onclick = () => { $('pauseMenu').classList.add('hidden'); openSheet('help'); };
  $('pHome').onclick = () => { $('pauseMenu').classList.add('hidden'); paused = false; goHome('lab'); };
}
function closePause() { $('pauseMenu').classList.add('hidden'); paused = false; S.play('tap'); }
$('pauseMenu').addEventListener('click', (e) => { if (e.target.id === 'pauseMenu' && backdropOk('pauseMenu')) closePause(); });
function paintToggles() {
  const m = meta.settings.music, s = meta.settings.sfx;
  for (const [id, on, a, b, label] of [['pMusic', m, 'music', 'musicOff', 'Music'], ['pSfx', s, 'sound', 'soundOff', 'Sound'], ['mMusic', m, 'music', 'musicOff', 'Music'], ['mSfx', s, 'sound', 'soundOff', 'Sound']]) {
    const e = $(id); if (!e) continue;
    e.innerHTML = `${ic(on ? a : b)} ${label} ${on ? 'on' : 'off'}`; e.classList.toggle('off', !on);
  }
  $('btnMusic').innerHTML = ic(m ? 'music' : 'musicOff'); $('btnMusic').classList.toggle('off', !m);
  $('btnSfx').innerHTML = ic(s ? 'sound' : 'soundOff'); $('btnSfx').classList.toggle('off', !s);
}
function toggleSetting(k) {
  meta.settings[k] = !meta.settings[k];
  S.setMusic(meta.settings.music); S.setSfx(meta.settings.sfx);
  S.unlock(); S.play('tap'); paintToggles(); save();
}
$('btnMusic').addEventListener('click', () => toggleSetting('music'));
$('btnSfx').addEventListener('click', () => toggleSetting('sfx'));

/* ---------- sheets ---------- */
function openSheet(kind, arg) {
  S.play('tap');
  sheet = { kind, arg, sig: '' };
  $('sheet').classList.remove('hidden');
  refreshSheet(true);
}
function closeSheet() { sheet = null; $('sheet').classList.add('hidden'); upSel = null; }
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' && backdropOk('sheet')) closeSheet(); });
function head(icon, title) { return `<h2>${icon ? ic(icon) : ''}<span>${title}</span><button class="round small x" data-close aria-label="Close">${ic('close')}</button></h2>`; }
function wireClose(card) { card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet)); }
function sheetSig() {
  const r = run();
  if (!sheet) return '';
  if (sheet.kind === 'printer') {
    const p = r && r.printers[sheet.arg]; if (!p) return 'x';
    return [p.status, p.queue.map((q) => q.id).join(','), !!p.problem, p.busy > 0, !!p.plate, Math.round(p.maint / 5), r.money >= 15, p.ups].join('|');
  }
  if (sheet.kind === 'shop') return D.MAT_ORDER.map((m) => r.money >= C.spoolPrice(r, m)).join('') + r.spares + r.deliveries.length + Math.round(r.fil.MYS / 100) + (r.money >= 12);
  if (sheet.kind === 'ups') return D.UPGRADES.map((u) => C.upgradeState(r, u.id)).join('') + upSel;
  if (sheet.kind === 'slot') return D.PRINTER_ORDER.map((t) => r.money >= D.PRINTERS[t].cost).join('') + !!r.printers[sheet.arg];
  return sheet.kind;
}
function refreshSheet(force) {
  if (!sheet) return;
  const r = run();
  if (sheet.kind !== 'help' && sheet.kind !== 'confirm' && (mode !== 'run' || !r)) return;
  const sig = sheetSig();
  const card = $('sheetCard');
  if (force || sig !== sheet.sig) {
    sheet.sig = sig;
    const k = sheet.kind;
    if (k === 'printer') renderPrinterSheet(card, r, sheet.arg);
    else if (k === 'shop') renderShop(card, r);
    else if (k === 'ups') renderUpsSheet(card, r);
    else if (k === 'slot') renderSlotSheet(card, r, sheet.arg);
    else if (k === 'help') { card.innerHTML = head('help', 'How to play') + helpHtml(); }
    wireClose(card);
  }
  if (sheet && sheet.kind === 'printer') {
    const p = r.printers[sheet.arg]; if (!p) return;
    const pb = card.querySelector('[data-live=prog]');
    if (pb && p.queue[0]) pb.style.width = (100 * p.prog / p.queue[0].work).toFixed(1) + '%';
    const mt = card.querySelector('[data-live=maint]');
    if (mt) { mt.style.width = p.maint.toFixed(0) + '%'; mt.className = p.maint < 30 ? 'low' : p.maint < 60 ? 'mid' : ''; }
    const st = card.querySelector('[data-live=status]'); if (st) st.textContent = statusText(r, p);
  }
}
function statusText(r, p) {
  if (p.problem) return `Problem: ${D.PROBLEMS[p.problem.type].title}`;
  if (p.busy > 0) return `${p.busyWhat}: ${Math.ceil(p.busy)} s`;
  if (p.plate) return `Finished: ${p.plate.order.name}, ${p.plate.stars} stars`;
  if (p.status === 'printing') { const o = p.queue[0]; return `Printing ${Math.round(100 * p.prog / o.work)}%, ${Math.ceil((o.work - p.prog) / C.speedOf(r, p, o))} s left`; }
  return 'Idle: tap an order, then this printer';
}
function renderPrinterSheet(card, r, i) {
  const p = r.printers[i]; if (!p) { closeSheet(); return; }
  const T = D.PRINTERS[p.type];
  card.innerHTML = head('', pname(r, i)) + `<div class="pinfo"><span data-icon></span><div>
    <div><b data-live="status"></b></div>
    <div class="stats"><span>${ic('bolt')}${(C.speedOf(r, p, null)).toFixed(2)}x speed</span><span>${ic('sparkle')}${C.qualityOf(r, p).toFixed(1)} stars</span><span>${ic('palette')}${T.colors} colour${T.colors > 1 ? 's' : ''}</span><span>${C.enclosed(r, p) ? ic('cube') + 'enclosed' : ic('wind') + 'open frame'}</span>${p.ups ? `<span>${ic('battery')}UPS</span>` : ''}${p.glue ? `<span>${ic('glue')}glue x${p.glue}</span>` : ''}</div></div></div>
    <h3>${ic('sponge')} Maintenance</h3><div class="meter"><i data-live="maint"></i></div>
    <p class="small">Worn printers break more often. Service when the bar turns yellow.</p>
    <div class="row2" id="psBtns"></div>
    <h3>${ic('clipboard')} Queue (${p.queue.length}/${C.maxQueue(r)})</h3><div class="qlist" id="psQueue"></div>`;
  card.querySelector('[data-icon]').appendChild(R.printerIcon(p.type, 84));
  const btns = card.querySelector('#psBtns');
  if (p.problem) { const b = el('button', 'btn danger', `${ic(D.PROBLEMS[p.problem.type].icon)} Fix the issue`); b.onclick = () => { closeSheet(); openAlert(i); }; btns.appendChild(b); }
  if (p.plate) { const b = el('button', 'btn green', `${ic('check')} Deliver, $${p.plate.pay}`); b.onclick = () => { C.collect(r, i); drainEvents(r); refreshSheet(true); }; btns.appendChild(b); }
  const kit = r.ups.kit;
  const sv = el('button', 'btn alt', `${ic('sponge')} Service <small>${kit ? 'free' : '$15'}, ${kit ? 4 : 8} s</small>`);
  sv.disabled = !!(p.problem || p.busy > 0 || p.plate || (!kit && r.money < 15) || p.maint > 97);
  sv.onclick = () => { const res = C.service(r, i); if (res.ok) { S.play('fix'); refreshSheet(true); } else toast(res.msg); };
  btns.appendChild(sv);
  const q = card.querySelector('#psQueue');
  if (!p.queue.length) q.appendChild(el('div', 'small', 'Nothing queued. Pick an order from the tray, then tap this printer.'));
  p.queue.forEach((o, k) => {
    const it = el('div', 'qitem', `${ic(IC.orderIcon(o), 'qi')}<div class="grow"><b>${o.name}</b> ${matTag(o.mat)} ${cdots(o.colors)}<br><small>$${o.pay}, wants ${o.q} stars, due in ${fmtT(o.deadline - r.t)}</small>${k === 0 ? '<div class="pbar"><i data-live="prog"></i></div>' : ''}</div>`);
    if (k > 0) { const x = el('button', 'round small', ic('undo')); x.title = 'Back to orders'; x.onclick = () => { C.unqueue(r, i, k); ordersSig = ''; refreshSheet(true); }; it.appendChild(x); }
    q.appendChild(it);
  });
}
function renderShop(card, r) {
  card.innerHTML = head('cart', 'Supplies') + '<p class="small">Spools come from the maker shop next door, instantly. Nozzles ship in 30 s.</p><div class="shopgrid" id="shopG"></div>';
  const g = card.querySelector('#shopG');
  for (const m of D.MAT_ORDER) {
    const c = C.spoolPrice(r, m);
    const it = el('div', 'shopitem', `<div class="si">${ic('spool|' + D.MATS[m].color)}<b>${m}</b></div><small>${D.MATS[m].note}</small><small>In stock: <b>${(r.fil[m] / 1000).toFixed(2)} kg</b></small>`);
    const b = el('button', 'btn', `+1 kg, $${c}`); b.disabled = r.money < c; b.dataset.buy = m;
    b.onclick = () => { const res = C.buySpool(r, m); if (res.ok) { S.play('buy'); drainEvents(r); refreshSheet(true); } };
    it.appendChild(b); g.appendChild(it);
  }
  const nz = el('div', 'shopitem', `<div class="si">${ic('nozzle')}<b>Spare nozzle</b></div><small>Swap a clogged nozzle in 4 s instead of waiting.</small><small>In stock: <b>${r.spares}</b>${r.deliveries.length ? `, ${r.deliveries.length} on the way` : ''}</small>`);
  const nb = el('button', 'btn', 'Order, $12'); nb.disabled = r.money < 12; nb.onclick = () => { if (C.buyNozzle(r).ok) { S.play('buy'); refreshSheet(true); } };
  nz.appendChild(nb); g.appendChild(nz);
  g.appendChild(el('div', 'shopitem', `<div class="si">${ic('myspool')}<b>Mystery PLA</b></div><small>${D.MATS.MYS.note}.</small><small>Recycled: <b>${Math.round(r.fil.MYS)} g</b>, scrap waiting ${Math.round(r.scrap)} g</small>`));
}
function renderSlotSheet(card, r, i) {
  if (r.printers[i]) { closeSheet(); return; }
  card.innerHTML = head('plus', `Printer for slot ${i + 1}`) + '<p class="small">Your lab has room for ' + r.slots + ' printers. Pick wisely, then upgrade.</p><div class="pbuy" id="pbG"></div>';
  const g = card.querySelector('#pbG');
  for (const t of D.PRINTER_ORDER) {
    const T = D.PRINTERS[t];
    const it = el('div', 'shopitem', `<div class="si"><b>${T.name}</b></div>`);
    it.appendChild(R.printerIcon(t, 92));
    it.appendChild(el('small', '', T.blurb));
    it.appendChild(el('div', 'stats', `<span>${ic('bolt')}${T.speed}x</span><span>${ic('sparkle')}${T.q}</span><span>${ic('palette')}${T.colors}</span><span>${T.enclosed ? ic('cube') : ic('wind')}</span>`));
    const b = el('button', 'btn' + (r.tut && !meta.tut.done && t === 'kestrel' && r.money >= T.cost ? ' green go pulse' : ''), `Buy, $${T.cost}`); b.disabled = r.money < T.cost; b.dataset.type = t;
    b.onclick = () => { const res = C.buyPrinter(r, i, t); if (res.ok) { S.play('big'); closeSheet(); toast(`${ic('sparkle')} ${T.name} installed!`); ordersSig = ''; setTimeout(() => R.burst('printer', i, { type: 'confetti', n: 30 }), 30); } };
    it.appendChild(b); g.appendChild(it);
  }
}
const upCostTxt = (r, u) => '$' + C.upCost(r, u);
function renderUpsSheet(card, r) {
  card.innerHTML = head('tools', `Upgrades <span class="chip" style="font-size:15px">${ic('coin')} ${Math.floor(r.money)}</span>`) + '<p class="small">Make every printer better for this season. The expo booth turns spare money into Reputation.</p><div class="mapwrap inrun" id="upMap"></div><div id="upInfo"></div>';
  const wrap = card.querySelector('#upMap');
  requestAnimationFrame(() => {
    M.renderMap(wrap, {
      nodes: D.UPGRADES, kind: 'up', state: (id) => C.upgradeState(r, id), labels: [{ x: 1.5, y: 3.72, text: 'Expo booth: Reputation at the expo' }],
      badge: (id, st) => st === 'owned' ? ic('check') : upCostTxt(r, D.UPGRADES.find((u) => u.id === id)),
      onSelect: (id) => { upSel = id; S.play('tap'); showUpInfo(card, r); wrap.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === id)); },
    });
    if (upSel) wrap.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === upSel));
  });
  showUpInfo(card, r);
}
function showUpInfo(card, r) {
  const box = card.querySelector('#upInfo'); box.innerHTML = '';
  if (!upSel) { box.appendChild(el('div', 'nodeinfo', `${ic('hand', 'big')}<div class="txt">Tap a node to see what it does.</div>`)); return; }
  const u = D.UPGRADES.find((x) => x.id === upSel), st = C.upgradeState(r, u.id);
  const ni = el('div', 'nodeinfo', `${ic(u.icon, 'big')}<div class="txt"><b>${u.name}</b>${u.desc}</div>`);
  if (!u.root) {
    const b = el('button', 'btn', st === 'owned' ? `${ic('check')} Owned` : st === 'locked' ? `${ic('lock')} Locked` : `Buy, ${upCostTxt(r, u)}`);
    b.disabled = st !== 'buy';
    b.onclick = () => { if (C.buyUpgrade(r, u.id).ok) { S.play('big'); toast(`${ic(u.icon)} ${u.name}!`); sheet.sig = ''; refreshSheet(true); } };
    ni.appendChild(b);
  }
  box.appendChild(ni);
}
function helpHtml() {
  const p = (i, t) => `<p class="helpp">${ic(i)} ${t}</p>`;
  return p('inbox', '<b>Orders</b> pop up in the tray. Tap one, then tap a glowing printer to queue it. The green bar shows how long the customer will wait.') +
    p('printer', '<b>Printers</b> print on their own. Watch the layers stack up! When a green tick appears, tap the printer to deliver and get paid.') +
    p('bang', '<b>"Hey, I have this issue!"</b> Printers clog, snap belts, lose their print, string, warp, go offline or run out of filament. Pick a fix: money, spare parts or time.') +
    p('palette', 'Multi-colour jobs need the Rainbow printer. ABS wants an enclosed printer. Quality must reach the stars the customer wants, or they pay half.') +
    p('sponge', 'Printers wear down: service them before they break. Failed prints become scrap, and the recycler turns scrap into mystery PLA for "any colour" orders.') +
    p('house', 'Rent comes every 2:30. Can\'t pay within 25 s? The season is over. Reach the expo for a big Reputation bonus, and buy expo booth upgrades with spare money.') +
    p('flask', 'Spend Reputation on Research between seasons. Earn enough in one lab to move up to the Workshop.') +
    p('flag', 'Follow the goals at the top of the screen for small rewards.') +
    p('cat', 'If Miso the cat strolls by, give her a pat.');
}

/* ---------- the "Hey, I have this issue!" popup ---------- */
function openAlert(i) {
  const r = run(); if (!r) return;
  const p = r.printers[i]; if (!p || !p.problem) return;
  if (sheet) closeSheet();
  clearTimeout(alertDelay); alertDelay = null;
  const fresh = alertPi !== i;
  alertPi = i;
  const pr = D.PROBLEMS[p.problem.type];
  const card = $('alertCard');
  let say = pr.say.replace(/^Hey, I have this issue! /, '');
  if (p.problem.type === 'runout') say = `I ran out of ${p.problem.mat}.`;
  if (p.problem.retry) say = 'That cold pull didn\'t work, I\'m still clogged!';
  if (p.problem.type === 'adhesion') say += p.problem.keep ? ` The camera caught it early, ${Math.round(p.problem.keep * 100)}% saved.` : p.problem.lost ? ` ${p.problem.lost} g went to the scrap bin.` : '';
  card.innerHTML = `<div class="ahead"><span data-icon></span><div class="hey"><div class="who">${pname(r, i)}</div><b class="heyt">Hey, I have this issue!</b><div class="say">${say}</div></div></div>
    <div class="atitle">${ic(pr.icon)} ${pr.title}</div><div class="opts" id="aOpts"></div>
    <div class="pending hidden" id="aPending"></div>
    <button class="btn alt later" id="aLater">${ic('hourglass')} Later</button>`;
  card.querySelector('[data-icon]').appendChild(R.printerIcon(p.type, 72));
  const box = card.querySelector('#aOpts');
  const tutorial = r.tut && !meta.tut.done;
  const opts = C.problemOptions(r, i);
  for (const o of opts) {
    const b = el('button', 'opt' + (tutorial && o.ok && o === opts.find((x) => x.ok) ? ' best' : ''), `${ic(o.icon, 'oi')}<span><b>${o.label}</b><small>${o.sub}</small></span>`);
    b.disabled = !o.ok; b.dataset.opt = o.id;
    b.onclick = () => {
      const res = C.fix(r, i, o.id);
      if (res.ok) {
        closeAlert(true); drainEvents(r);
        S.play('fixed'); R.floatAt('printer', i, o.id === 'ignore' ? 'ignored' : o.id === 'drop' ? 'dropped' : 'on it!', '#ffe08a', o.icon); R.burst('printer', i, { type: 'spark', n: 16, colors: ['#F7C52B', '#fff', '#5DB548'] });
      } else { S.play('error'); toast(res.msg || 'Not possible'); }
    };
    box.appendChild(b);
  }
  card.querySelector('#aLater').onclick = () => closeAlert(true);
  const a = $('alert');
  a.classList.remove('hidden');
  if (fresh) { a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash'); S.play('whoosh'); }
  card._sig = alertSig(r, i);
  pending = pending.filter((x) => x !== i);
  updatePending();
}
function updatePending() {
  const r = run(), box = $('aPending'); if (!box || !r) return;
  pending = pending.filter((x) => r.printers[x] && r.printers[x].problem && x !== alertPi);
  box.classList.toggle('hidden', !pending.length);
  box.textContent = pending.length ? `${pending.map((x) => pname(r, x)).join(', ')} also need${pending.length > 1 ? '' : 's'} help` : '';
}
function alertSig(r, i) { const p = r.printers[i]; return p && p.problem ? p.problem.type + C.problemOptions(r, i).map((o) => o.ok).join('') : ''; }
function closeAlert(next) {
  alertPi = -1; $('alert').classList.add('hidden');
  const r = run();
  if (next && r && !r.over) { pending = pending.filter((x) => r.printers[x] && r.printers[x].problem); if (pending.length) { const pi = pending.shift(); setTimeout(() => { if (!isModalOpen()) openAlert(pi); }, 350); } }
}
function refreshAlert() {
  if (alertPi < 0) return;
  const r = run(), p = r && r.printers[alertPi];
  if (!p || !p.problem) return closeAlert();
  if ($('alertCard')._sig !== alertSig(r, alertPi)) openAlert(alertPi);
}
$('alert').addEventListener('click', (e) => { if (e.target.id === 'alert' && backdropOk('alert')) closeAlert(true); });

/* ---------- season flow ---------- */
function startSeason(fresh) {
  S.unlock();
  if (fresh || !meta.run) meta.run = C.newRun(meta, 0, { tutorial: meta.seasons === 0 && !meta.tut.done });
  mode = 'run'; sel = null; paused = false; ordersSig = ''; hintTxt = ''; goalSig = '';
  $('home').classList.add('hidden'); $('hud').classList.remove('hidden'); $('summary').classList.add('hidden'); $('pauseMenu').classList.add('hidden');
  closeSheet(); closeAlert();
  computeView(); save();
}
function onSeasonEnd(r) {
  closeSheet(); closeAlert(); sel = null; pointAt(null); setHint('');
  const best = meta.best.rep;
  const res = C.applyResult(meta, r);
  let g; const goals = []; while ((g = C.checkGoals(meta, null))) goals.push(g);
  save();
  S.play('end');
  if (res.rep >= 15 || res.rep > best) PF.happy();
  const exp = res.reason === 'expo';
  const nextLab = D.LABS[meta.lab + 1];
  const canMove = nextLab && C.labState(meta, meta.lab + 1) === 'buy';
  $('sumCard').innerHTML = `<h2>${ic(exp ? 'expo' : 'house')} ${exp ? 'Expo day!' : 'Evicted!'}</h2>
    <p>${exp ? 'You made it through the season and showed your best prints at the maker expo.' : 'The rent was due and the piggy bank was empty. The landlord wants the garage back.'}</p>
    <div class="small">Reputation earned</div><div class="bigrep">${ic('medal')} +${res.rep}</div>
    ${(() => { const sv = Math.floor(Math.max(0, res.money) / 500 * (D.LABS[res.lab || 0].repMul || 1)); const parts = []; if (res.booth) parts.push(`+${res.booth} from your expo booth`); if (sv > 0) parts.push(`about +${sv} from savings`); return parts.length ? `<div class="small">including ${parts.join(', ')}</div>` : ''; })()}
    ${goals.length ? `<div class="small">${ic('flag')} Goal complete: ${goals.map((x) => x.text).join(', ')}</div>` : ''}
    <div class="sumgrid"><span>${ic('inbox')} ${res.done} delivered</span><span>${ic('star')} ${res.avg} average</span><span>${ic('coin')} $${res.money} left</span><span>${ic('smile')} ${res.rating} rating</span>
    <span>${ic('wrench')} ${res.fixed}/${res.problems} issues fixed</span><span>${ic('house')} $${res.rentPaid} rent</span><span>${ic('clock')} ${res.late} late</span><span>${ic('frown')} ${res.lost} missed</span></div>
    ${canMove ? `<p><b>${ic('map')} You can move to the ${nextLab.name}!</b> Check the Labs map.</p>` : (nextLab && !nextLab.soon ? `<p class="small">${ic('map')} ${nextLab.name}: ${meta.labRep}/${nextLab.need} Reputation earned in this lab</p>` : '')}
    <div class="row2"><button class="btn alt" id="sumRes">${ic('flask')} Research</button><button class="btn" id="sumNext">${ic('play')} Next season</button></div>`;
  $('summary').classList.remove('hidden'); $('toast').classList.remove('show');
  if (exp) R.burst(null, 0, { type: 'confetti', x: W / 2, y: H * 0.2, n: 60 });
  $('sumRes').onclick = () => goHome(canMove ? 'labs' : 'research');
  $('sumNext').onclick = () => startSeason(true);
}
function goHome(tab) {
  mode = 'home';
  if (meta.run && meta.run.over) meta.run = null;
  $('summary').classList.add('hidden'); $('hud').classList.add('hidden'); $('home').classList.remove('hidden'); $('pauseMenu').classList.add('hidden');
  closeSheet(); closeAlert(); pointAt(null);
  showTab(tab || 'lab');
  save();
}

/* ---------- home ---------- */
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { S.play('tap'); showTab(b.dataset.tab); }));
function showTab(t) {
  homeTab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  for (const id of ['lab', 'research', 'labs', 'more']) $('tab-' + id).classList.toggle('hidden', id !== t);
  renderHome();
  computeView();
}
function renderHome() {
  let g; while ((g = C.checkGoals(meta, null))) { celebrateGoal(g); save(); }
  $('repTxt').textContent = meta.rep;
  $('trophyChip').classList.toggle('hidden', !meta.trophies && meta.lab === 0);
  $('trophyTxt').textContent = meta.trophies;
  paintToggles();
  const L = D.LABS[meta.lab];
  $('labLine').innerHTML = `${ic(L.icon)} ${L.name}, ${L.slots} printer slots${meta.lab ? `, x${L.repMul} Reputation` : ''}`;
  $('goTxt').textContent = meta.run ? 'Continue season' : 'Start season';
  $('goSub').textContent = meta.run ? `${fmtT(meta.run.len - meta.run.t)} left until the expo` : '~10 min, rent every 2:30, expo at the end';
  const cg = C.currentGoal(meta, null);
  $('homeGoal').classList.toggle('hidden', !cg);
  if (cg) $('homeGoal').innerHTML = `${ic(cg.goal.icon)}<span><small class="small">Goal ${cg.n} of ${cg.of}</small><br><b>${cg.goal.text}</b></span><span style="margin-left:auto" class="small">${rewardHtml(cg.goal.reward)}</span>`;
  $('records').innerHTML = meta.seasons ? `<span>${ic('calendar')} ${meta.seasons} season${meta.seasons > 1 ? 's' : ''}</span><span>${ic('trophy')} best +${meta.best.rep}</span><span>${ic('inbox')} best ${meta.best.orders} orders</span><span>${ic('medal')} ${meta.lifetimeRep} lifetime</span>` : `<span>${ic('smile')} First day in the garage!</span>`;
  $('dotRes').classList.toggle('hidden', !D.RESEARCH.some((n) => C.researchState(meta, n.id) === 'buy'));
  $('dotLabs').classList.toggle('hidden', !(D.LABS[meta.lab + 1] && C.labState(meta, meta.lab + 1) === 'buy'));
  if (homeTab === 'research') renderResearch();
  if (homeTab === 'labs') renderLabs();
  if (homeTab === 'more') renderMore();
}
function renderResearch() {
  const wrap = $('resMap');
  requestAnimationFrame(() => {
    M.renderMap(wrap, {
      nodes: D.RESEARCH, kind: 'res', state: (id) => C.researchState(meta, id),
      badge: (id, st) => st === 'owned' ? ic('check') : D.RESEARCH.find((n) => n.id === id).cost + ic('medal'),
      onSelect: (id) => { resSel = id; S.play('tap'); renderResearchInfo(); wrap.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === id)); },
    });
    if (resSel) wrap.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === resSel));
  });
  renderResearchInfo();
}
function renderResearchInfo() {
  let box = $('resInfo');
  if (!box) { box = el('div', ''); box.id = 'resInfo'; $('tab-research').appendChild(box); }
  box.innerHTML = '';
  const n = D.RESEARCH.find((x) => x.id === (resSel || 'lab'));
  const st = C.researchState(meta, n.id);
  const ni = el('div', 'nodeinfo', `${ic(n.icon, 'big')}<div class="txt"><b>${n.name}</b>${n.desc}${n.root ? `<br><small>Tap a node. You have ${meta.rep} Reputation ${ic('medal')}</small>` : ''}</div>`);
  if (!n.root) {
    const b = el('button', 'btn', st === 'owned' ? `${ic('check')} Done` : st === 'locked' ? `${ic('lock')} Locked` : `Research, ${n.cost} ${ic('medal')}`);
    b.disabled = st !== 'buy'; b.id = 'btnResearch';
    b.onclick = () => { if (C.buyResearch(meta, n.id).ok) { S.play('big'); toast(`${ic(n.icon)} ${n.name} researched!`); save(); renderHome(); } };
    ni.appendChild(b);
  }
  box.appendChild(ni);
}
const LAB_NODES = () => [
  { id: 'L0', x: 1, y: 0, icon: D.LABS[0].icon, name: D.LABS[0].name, root: true },
  { id: 'L1', x: 1, y: 1.4, icon: D.LABS[1].icon, name: D.LABS[1].name, req: 'L0' },
  { id: 'catbed', x: 0, y: 2.4, icon: D.PERKS[0].icon, name: D.PERKS[0].name, req: 'L1', small: true },
  { id: 'sign', x: 1, y: 2.6, icon: D.PERKS[1].icon, name: D.PERKS[1].name, req: 'L1', small: true },
  { id: 'coffee', x: 2, y: 2.4, icon: D.PERKS[2].icon, name: D.PERKS[2].name, req: 'L1', small: true },
  { id: 'L2', x: 1, y: 3.9, icon: D.LABS[2].icon, name: D.LABS[2].name, req: 'L1' },
];
function labNodeState(id) {
  if (id[0] === 'L') return C.labState(meta, +id[1]);
  const pk = D.PERKS.find((x) => x.id === id);
  if (meta.perks[id]) return 'owned';
  if (meta.lab < 1) return 'locked';
  return meta.trophies >= pk.cost ? 'buy' : 'poor';
}
function renderLabs() {
  const wrap = $('labMap');
  $('labsSub').innerHTML = meta.lab === 0 ? `Earn ${D.LABS[1].need} Reputation in the Garage (${meta.labRep}/${D.LABS[1].need}) to move to the Workshop.` : `Trophies ${ic('trophy')} buy lab perks. The Factory comes in a later update.`;
  requestAnimationFrame(() => {
    M.renderMap(wrap, {
      nodes: LAB_NODES(), kind: 'labs', state: labNodeState,
      badge: (id, st) => {
        if (id[0] === 'L') { const L = D.LABS[+id[1]]; return st === 'here' ? `${ic('flag')} here` : st === 'done' ? ic('check') : L.soon ? 'soon' : `${meta.labRep}/${L.need}${ic('medal')}`; }
        return st === 'owned' ? ic('check') : D.PERKS.find((x) => x.id === id).cost + ic('trophy');
      },
      onSelect: (id) => { labSel = id; S.play('tap'); renderLabInfo(); wrap.querySelectorAll('.node').forEach((n) => n.classList.toggle('sel', n.dataset.id === id)); },
    });
  });
  renderLabInfo();
}
function renderLabInfo() {
  let box = $('labInfo');
  if (!box) { box = el('div', ''); box.id = 'labInfo'; $('tab-labs').appendChild(box); }
  box.innerHTML = '';
  const id = labSel || ('L' + Math.min(meta.lab + 1, 2));
  const st = labNodeState(id);
  if (id[0] === 'L') {
    const L = D.LABS[+id[1]];
    const ni = el('div', 'nodeinfo', `${ic(L.icon, 'big')}<div class="txt"><b>${L.name}${st === 'here' ? ' (you are here)' : ''}</b>${L.desc}${L.need && st !== 'here' && st !== 'done' && !L.soon ? `<br><small>Moving resets Research and Reputation but gives ${C.trophiesFor(meta)} trophies ${ic('trophy')}.</small>` : ''}</div>`);
    if (+id[1] === meta.lab + 1) {
      const b = el('button', 'btn', L.soon ? 'Soon' : st === 'buy' ? `${ic('truck')} Move!` : `${meta.labRep}/${L.need} ${ic('medal')}`);
      b.disabled = st !== 'buy'; b.id = 'btnMove';
      b.onclick = () => confirmMove(L);
      ni.appendChild(b);
    }
    box.appendChild(ni);
  } else {
    const pk = D.PERKS.find((x) => x.id === id);
    const ni = el('div', 'nodeinfo', `${ic(pk.icon, 'big')}<div class="txt"><b>${pk.name}</b>${pk.desc}${meta.lab < 1 ? '<br><small>Unlocks in the Workshop.</small>' : ''}</div>`);
    const b = el('button', 'btn', st === 'owned' ? ic('check') : `${pk.cost} ${ic('trophy')}`); b.disabled = st !== 'buy';
    b.onclick = () => { if (C.buyPerk(meta, id).ok) { S.play('big'); save(); renderHome(); } };
    ni.appendChild(b); box.appendChild(ni);
  }
}
function confirmMove(L) {
  sheet = { kind: 'confirm' };
  const card = $('sheetCard');
  card.innerHTML = head(L.icon, `Move to the ${L.name}?`) + `<p>${L.desc}</p><p>You pack up and start fresh: <b>Research and Reputation reset</b>. You keep your trophies ${ic('trophy')} and gain <b>${C.trophiesFor(meta)} more</b>.</p><div class="row2"><button class="btn alt" data-close>Not yet</button><button class="btn" id="btnMoveYes">${ic('truck')} Let's move!</button></div>`;
  wireClose(card);
  $('sheet').classList.remove('hidden');
  $('btnMoveYes').onclick = () => {
    const res = C.moveLab(meta);
    closeSheet();
    if (res.ok) { S.play('big'); PF.happy(); save(); labSel = null; resSel = null; toast(`${ic(L.icon)} Welcome to the ${L.name}!`, `+${res.trophies} trophies`); showTab('lab'); }
  };
}
function renderMore() {
  $('helpCard').innerHTML = `<h2>${ic('help')} How to play</h2>${helpHtml()}
    <h2>${ic('music')} Sound</h2><div class="toggles"><button class="btn toggle" id="mMusic"></button><button class="btn toggle" id="mSfx"></button></div>
    <h2>${ic('notebook')} Save</h2><p class="small">Saved on this device automatically (also mid-season).</p>
    <div class="row2"><button class="btn danger" id="mReset">${ic('trash')} Reset everything</button></div>
    <p class="small">Tiny Print Shop v${D.VERSION}. Drawn with Canvas, sound synthesized with WebAudio, no downloads.</p>`;
  paintToggles();
  $('mMusic').onclick = () => toggleSetting('music');
  $('mSfx').onclick = () => toggleSetting('sfx');
  $('mReset').onclick = () => {
    if ($('mReset').dataset.sure) { PF.storage.remove(D.SAVE_KEY); meta = C.newMeta(); save(); toast('Fresh start'); renderHome(); return; }
    $('mReset').dataset.sure = '1'; $('mReset').innerHTML = `${ic('warn')} Tap again to wipe`;
  };
}
$('btnGo').addEventListener('click', () => startSeason(false));

/* ---------- boot ---------- */
function fillStaticIcons() { document.querySelectorAll('i[data-ic]').forEach((e) => { e.outerHTML = ic(e.dataset.ic); }); }
root.addEventListener('resize', () => { resize(); if (mode === 'home') renderHome(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (mode === 'run' && run() && !run().over && !paused) openPause(); save(); } });
root.addEventListener('pagehide', save);
PF.onMute((m) => S.setPortalMute(m));
const fontReady = () => Promise.race([document.fonts && document.fonts.load ? document.fonts.load('600 20px Fredoka').catch(() => null) : Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
BL.ready = PF.init().then(() => { PF.loading(true); return fontReady(); }).then(() => {
  load();
  fillStaticIcons();
  resize();
  // brand-new players land straight in their first season (with the visual tutorial); returning players see their lab
  if (meta._fresh || (meta.seasons === 0 && !meta.tut.done && !qs.has('home'))) startSeason(!meta.run);
  else goHome('lab');
  return new Promise((res) => requestAnimationFrame((t) => {
    lastFrame = t; step(0.016);
    $('boot').classList.add('gone'); setTimeout(() => $('boot').remove(), 400);
    PF.loading(false); booted = true;
    requestAnimationFrame(frame);
    res();
  }));
});

/* test / debug / video handle */
root.__bl = {
  get meta() { return meta; }, set meta(m) { meta = m; }, get run() { return run(); }, get mode() { return mode; }, get sel() { return sel; },
  C, D, R, S, startSeason, goHome, showTab, openAlert, closeAlert, openSheet, closeSheet, openPause, closePause, tapAt, tapPrinter, save, load, renderHome,
  setPaused: (v) => { paused = v; }, get paused() { return paused; }, selectOrder: (id) => { sel = id; ordersSig = ''; }, get view() { return view; }, get alertPi() { return alertPi; },
  get dbg() { return { alertDelay: !!alertDelay, pending: pending.slice(), modal: isModalOpen(), sheet: sheet && sheet.kind, paused, mode }; },
  manual(on) { manual = !!on; if (!manual) { lastFrame = 0; requestAnimationFrame(frame); } }, step, resize,
};
})(window);
