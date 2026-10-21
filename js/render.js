/* Tiny Print Shop - cozy isometric garage, drawn entirely in code on a 2D canvas.
 * World units are tiles: x runs along the back wall (down-right on screen), y comes toward the viewer (down-left), z is up. */
(function (root) {
'use strict';
const BL = root.BL, D = BL.Data, IC = BL.Icons, MD = BL.Models;
const FONT = 'Fredoka, Trebuchet MS, sans-serif';

let ctx, K = 40, OX = 0, OY = 0, now = 0;
const hits = { printers: [], slots: [], recycler: null, cat: null, shelf: null };
const floats = [], parts = [];
let shakeAmt = 0, targets = {};
let MS = 0.28; // model units -> world tiles (the cover art draws prints a bit bigger)

/* ---------- colour helpers ---------- */
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(h, f) {
  const [r, g, b] = hex2rgb(h);
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
function lerpHex(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

/* ---------- iso primitives ---------- */
const P = (x, y, z) => [OX + (x - y) * K, OY + (x + y) * K * 0.5 - (z || 0) * K];
function poly(pts, fill, stroke, lw) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
/* box with top / front-left (y+d) / front-right (x+w) faces */
function box(x, y, z, w, d, h, c, opt) {
  opt = opt || {};
  const top = opt.top || shade(c, 0.12), left = opt.left || shade(c, -0.12), right = opt.right || shade(c, -0.28);
  const st = opt.stroke === undefined ? 'rgba(40,20,10,.35)' : opt.stroke;
  if (!opt.noLeft) poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left, st);
  if (!opt.noRight) poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right, st);
  if (!opt.noTop) poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top, st);
}
/* draw in the plane y = const (faces the viewer, lower-left); local units are tiles, v goes DOWN from zTop */
function onFrontFace(x, y, zTop, fn) {
  const o = P(x, y, zTop);
  ctx.save(); ctx.transform(K, K * 0.5, 0, K, o[0], o[1]); fn(); ctx.restore();
}
/* draw in the plane x = const, text reads left-to-right: u goes toward -y */
function onSideFace(x, yStart, zTop, fn) {
  const o = P(x, yStart, zTop);
  ctx.save(); ctx.transform(K, -K * 0.5, 0, K, o[0], o[1]); fn(); ctx.restore();
}
function ellipse(x, y, z, r, fill, stroke) {
  const c = P(x, y, z);
  ctx.beginPath(); ctx.ellipse(c[0], c[1], r * K * 1.414, r * K * 0.707, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function rrect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ---------- room layout ---------- */
function layout(slots) {
  const RW = slots <= 3 ? 8.0 : 10.2, RD = 6.2, WH = 3.4;
  const xs = [];
  const start = 0.75, gap = (RW - 1.5) / slots;
  for (let i = 0; i < slots; i++) xs.push(start + gap * i + gap / 2);
  return { RW, RD, WH, slotX: xs, benchZ: 1.0, py: 0.3 };
}
function fit(L, vw, vh) {
  // bounding box at K=1, origin 0. On narrow screens focus on the workbench and let the room's edges crop off.
  const narrow = vw / vh < 1.35;
  const pts = narrow
    ? [[0.2, 0, L.WH * 0.92], [L.RW, 0, L.WH * 0.75], [0.6, 2.2, L.benchZ + 1.6], [L.RW, 2.1, 0], [0.9, 4.3, 0], [L.RW * 0.6, 4.6, 0]]
    : [[0, 0, L.WH], [L.RW, 0, L.WH], [0, L.RD, L.WH], [L.RW, L.RD, 0], [0, L.RD, 0], [L.RW, 0, 0]];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y, z] of pts) { const sx = x - y, sy = (x + y) * 0.5 - z; minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy); }
  const k = Math.min(vw / (maxX - minX), vh / (maxY - minY + 0.9)) * (narrow ? 1.0 : 0.97);
  return { k, minX, maxX, minY, maxY };
}

/* ---------- scene pieces ---------- */
function drawRoom(L, run, dayT) {
  const { RW, RD, WH } = L;
  const ws = L.lab >= 1;
  const wallL = ws ? '#d9e3c9' : '#efd9b6', wallB = ws ? '#e6eed8' : '#f7e6c8', floorC = ws ? '#b07a4a' : '#c98b52';
  // floor
  poly([P(0, 0, 0), P(RW, 0, 0), P(RW, RD, 0), P(0, RD, 0)], floorC);
  ctx.save();
  ctx.beginPath(); const f = [P(0, 0, 0), P(RW, 0, 0), P(RW, RD, 0), P(0, RD, 0)]; ctx.moveTo(...f[0]); f.slice(1).forEach((p) => ctx.lineTo(...p)); ctx.closePath(); ctx.clip();
  for (let y = 0; y <= RD; y += 0.62) { const a = P(0, y, 0), b = P(RW, y, 0); ctx.strokeStyle = 'rgba(90,50,20,.28)'; ctx.lineWidth = Math.max(1, K * 0.03); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  for (let y = 0, r = 0; y < RD; y += 0.62, r++) for (let x = (r % 2) * 1.3; x < RW; x += 2.6) { const a = P(x, y, 0), b = P(x, y + 0.62, 0); ctx.strokeStyle = 'rgba(90,50,20,.18)'; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
  ctx.restore();
  // rug
  poly([P(RW * 0.35, 3.0, 0.01), P(RW * 0.78, 3.0, 0.01), P(RW * 0.78, 5.4, 0.01), P(RW * 0.35, 5.4, 0.01)], '#e9a45f', '#b8642a', 2);
  poly([P(RW * 0.38, 3.2, 0.012), P(RW * 0.75, 3.2, 0.012), P(RW * 0.75, 5.2, 0.012), P(RW * 0.38, 5.2, 0.012)], null, 'rgba(255,240,210,.6)', 2);
  // left wall (x=0) and back wall (y=0)
  poly([P(0, 0, 0), P(0, RD, 0), P(0, RD, WH), P(0, 0, WH)], wallL);
  poly([P(0, 0, 0), P(RW, 0, 0), P(RW, 0, WH), P(0, 0, WH)], wallB);
  if (ws) { ctx.strokeStyle = 'rgba(90,110,70,.18)'; ctx.lineWidth = 1; for (let z = 0.9; z < WH; z += 0.3) { const a = P(0, 0, z), b = P(RW, 0, z); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); const c = P(0, RD, z); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...c); ctx.stroke(); } }
  // wainscot stripe in papaya
  poly([P(0, 0, 0.55), P(RW, 0, 0.55), P(RW, 0, 0.68), P(0, 0, 0.68)], D.PAPAYA);
  poly([P(0, 0, 0.55), P(0, RD, 0.55), P(0, RD, 0.68), P(0, 0, 0.68)], shade(D.PAPAYA, -0.12));
  poly([P(0, 0, 0), P(RW, 0, 0), P(RW, 0, 0.55), P(0, 0, 0.55)], '#e8c99c');
  poly([P(0, 0, 0), P(0, RD, 0), P(0, RD, 0.55), P(0, 0, 0.55)], '#dcba8a');
  // wall top edge
  poly([P(0, 0, WH), P(RW, 0, WH), P(RW, -0.15, WH), P(-0.15, -0.15, WH), P(-0.15, RD, WH), P(0, RD, WH)], '#7a4a2a');
  // window on back wall: sky changes over the season (morning -> sunset)
  const wx = L.RW * 0.42, ww = 1.9;
  onFrontFace(wx, 0, 2.95, () => {
    const t = dayT;
    const sky = ctx.createLinearGradient(0, 0, 0, 1.1);
    sky.addColorStop(0, lerpHex('#8fd3ff', '#5a3d8a', t)); sky.addColorStop(1, lerpHex('#d8f1ff', '#ff9a4a', t));
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-0.08, -0.08, ww + 0.16, 1.26);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, ww, 1.1);
    // sun
    ctx.fillStyle = lerpHex('#fff3b0', '#ff7a30', t);
    ctx.beginPath(); ctx.arc(0.3 + t * 1.3, 0.25 + t * 0.75, 0.16, 0, Math.PI * 2); ctx.fill();
    // hills + a tiny tree
    ctx.fillStyle = lerpHex('#7cc46a', '#4a5a3a', t);
    ctx.beginPath(); ctx.moveTo(0, 1.1); ctx.quadraticCurveTo(0.5, 0.65, 1.0, 0.95); ctx.quadraticCurveTo(1.5, 0.7, ww, 0.9); ctx.lineTo(ww, 1.1); ctx.fill();
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(ww / 2 - 0.02, 0.06, 0.04, 1.04);
    ctx.fillRect(0, 0.53, ww, 0.04);
    ctx.fillStyle = '#c0573a'; ctx.fillRect(-0.12, 1.12, ww + 0.24, 0.08);
  });
  // sign on the left wall, above the filament shelf
  onSideFace(0, 5.3, 3.05, () => {
    ctx.fillStyle = '#2b2b2e'; rrect(0, 0, 2.2, 0.66, 0.08); ctx.fill();
    ctx.fillStyle = D.PAPAYA; rrect(0.05, 0.05, 2.1, 0.56, 0.06); ctx.fill();
    ctx.fillStyle = '#fff7ea'; ctx.font = `700 0.23px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(L.lab >= 1 ? 'PRINT WORKSHOP' : 'TINY PRINT SHOP', 1.1, 0.34);
  });
  // calendar / rent sheet
  onFrontFace(L.RW * 0.72, 0, 2.7, () => {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 0.62, 0.72);
    ctx.fillStyle = '#e0473c'; ctx.fillRect(0, 0, 0.62, 0.16);
    ctx.fillStyle = '#7a4a2a';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) ctx.fillRect(0.06 + j * 0.14, 0.24 + i * 0.15, 0.09, 0.08);
    if (run) { const k = Math.min(11, Math.floor(run.t / run.len * 12)); for (let n = 0; n < k; n++) { ctx.strokeStyle = '#e0473c'; ctx.lineWidth = 0.025; const i = Math.floor(n / 4), j = n % 4; ctx.beginPath(); ctx.moveTo(0.05 + j * 0.14, 0.23 + i * 0.15); ctx.lineTo(0.16 + j * 0.14, 0.33 + i * 0.15); ctx.stroke(); } }
  });
  // pegboard with tools on the left wall
  onSideFace(0, 2.6, 2.75, () => {
    ctx.fillStyle = '#d8a86a'; ctx.fillRect(0, 0, 1.5, 0.85);
    ctx.fillStyle = 'rgba(90,50,20,.35)';
    for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.arc(0.1 + i * 0.16, 0.1 + j * 0.16, 0.018, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#555'; ctx.fillRect(0.2, 0.15, 0.06, 0.5); ctx.fillStyle = D.PAPAYA; ctx.fillRect(0.18, 0.15, 0.1, 0.18);
    ctx.fillStyle = '#777'; ctx.fillRect(0.5, 0.2, 0.32, 0.06); ctx.fillRect(0.6, 0.2, 0.06, 0.45);
    ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(1.12, 0.42, 0.18, 0, Math.PI * 2); ctx.stroke();
  });
}
function drawShelf(L, run) {
  // shelf on the left wall holding spools = filament inventory
  const y0 = 2.0, y1 = 5.6, z = 1.55;
  box(0, y0, z, 0.55, y1 - y0, 0.08, '#8a5a32');
  const fil = run ? run.fil : { PLA: 2000, PETG: 1000, TPU: 0, ABS: 0, MYS: 0 };
  const mats = ['PLA', 'PETG', 'TPU', 'ABS', 'MYS'];
  let yy = y0 + 0.25;
  const spots = [];
  for (const m of mats) {
    const n = Math.min(3, Math.ceil(fil[m] / 1000 - 0.001));
    for (let i = 0; i < Math.max(n, m === 'MYS' ? 0 : 0); i++) {
      if (yy > y1 - 0.2) break;
      const col = m === 'MYS' ? `hsl(${(now * 60 + i * 90) % 360},70%,65%)` : D.MATS[m].color;
      spool(0.28, yy, z + 0.08 + 0.2, 0.2, col, i === n - 1 ? (fil[m] % 1000 || 1000) / 1000 : 1);
      yy += 0.36;
    }
    if (n > 0) yy += 0.08;
    spots.push(m);
  }
  // a little potted plant on the shelf end
  const bx = 0.3, by = y1 - 0.25;
  box(bx - 0.14, by - 0.12, z + 0.08, 0.28, 0.24, 0.12, '#b8642a');
  const top = P(bx, by, z + 0.25);
  ctx.strokeStyle = '#6b4226'; ctx.lineWidth = K * 0.05; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(top[0], top[1] - K * 0.38); ctx.stroke();
  for (const [dx, dy, r] of [[-0.13, -0.3, 0.12], [0.13, -0.34, 0.12], [-0.08, -0.5, 0.11], [0.09, -0.52, 0.11], [0, -0.62, 0.1]]) { ctx.fillStyle = '#5f9e4a'; ctx.beginPath(); ctx.ellipse(top[0] + dx * K, top[1] + dy * K, r * K, r * K * 0.5, dx * 6, 0, 7); ctx.fill(); }
  hits.shelf = rectFrom([P(0, y0, z), P(0.55, y1, z), P(0, y1, z + 0.7), P(0, y0, z + 0.7)]);
}
function spool(x, y, z, r, col, fill) {
  // vertical spool seen from the side (disc in the y-z plane facing +x)
  const c = P(x, y, z);
  const rx = r * K * 0.55, ry = r * K;
  ctx.fillStyle = '#3a3a40'; ctx.beginPath(); ctx.ellipse(c[0] + K * 0.06, c[1] + K * 0.03, rx, ry, -0.5, 0, 7); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx * (0.55 + 0.4 * fill), ry * (0.55 + 0.4 * fill), -0.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2b2b2e'; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx * 0.3, ry * 0.3, -0.5, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, -0.5, 0, 7); ctx.stroke();
}
function drawBench(L) {
  const x0 = 0.25, x1 = L.RW - 0.25, y0 = 0.08, d = 1.85, z = L.benchZ;
  for (const lx of [x0 + 0.1, x1 - 0.25]) box(lx, y0 + d - 0.3, 0, 0.15, 0.15, z - 0.12, '#6b4226');
  box(x0, y0, z - 0.12, x1 - x0, d, 0.12, '#a8703f', { top: '#c08850' });
  // shelf under bench with a box
  box(x0 + 0.2, y0 + 0.2, 0.22, x1 - x0 - 0.4, d - 0.5, 0.06, '#8a5a32');
}
function rectFrom(pts) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return { x: a, y: b, w: c - a, h: d - b };
}

/* ---------- printed objects: the same iso models as the order icons, sliced at the current layer ---------- */
function objHeight(o) { return MD.height(o.tpl) * MS; }
function drawObject(cx, cy, cz, o, frac, opts) {
  opts = opts || {};
  const c = P(cx, cy, cz);
  return MD.draw(ctx, o.tpl, o.colors, c[0], c[1], K * MS, frac, { mystery: opts.mystery, time: now, glow: !!opts.printing }) * MS;
}
const hexCache = {};
function hexish(c) { // accept "#rrggbb" or css hsl/rgb by converting through a canvas once
  if (c[0] === '#') return c;
  if (hexCache[c]) return hexCache[c];
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data; const h = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  if (Object.keys(hexCache).length > 400) for (const k in hexCache) delete hexCache[k];
  return (hexCache[c] = h);
}

/* ---------- printer face on its little screen ---------- */
function face(w, h, mood) {
  const bg = { idle: '#203040', print: '#173a2c', done: '#1f5a2a', problem: '#6a1a1a', fix: '#4a3a10', off: '#050505', sleep: '#1a1f28' }[mood] || '#203040';
  ctx.fillStyle = '#111'; rrect(-0.02, -0.02, w + 0.04, h + 0.04, 0.04); ctx.fill();
  ctx.fillStyle = bg; rrect(0, 0, w, h, 0.03); ctx.fill();
  if (mood === 'off') { ctx.fillStyle = '#444'; ctx.font = `700 0.08px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('zzz', w / 2, h / 2); return; }
  const ex1 = w * 0.32, ex2 = w * 0.68, ey = h * 0.4, col = { problem: '#ffb0a0', done: '#c8ffb0', fix: '#ffe08a' }[mood] || '#9ff0ff';
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = h * 0.09; ctx.lineCap = 'round';
  const blink = (now % 3.7) < 0.12;
  const eye = (x) => {
    ctx.beginPath();
    if (mood === 'problem') { ctx.moveTo(x - h * 0.12, ey - h * 0.1); ctx.lineTo(x + h * 0.12, ey + h * 0.1); ctx.moveTo(x + h * 0.12, ey - h * 0.1); ctx.lineTo(x - h * 0.12, ey + h * 0.1); ctx.stroke(); }
    else if (mood === 'done') { star(x, ey, h * 0.16); }
    else if (mood === 'print' && !blink) { ctx.arc(x, ey + h * 0.06, h * 0.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else if (mood === 'idle' || mood === 'sleep' || blink) { ctx.moveTo(x - h * 0.1, ey); ctx.lineTo(x + h * 0.1, ey); ctx.stroke(); }
    else { ctx.arc(x, ey, h * 0.09, 0, 7); ctx.fill(); }
  };
  eye(ex1); eye(ex2);
  ctx.beginPath();
  if (mood === 'problem') { ctx.moveTo(w * 0.38, h * 0.78); ctx.quadraticCurveTo(w * 0.44, h * 0.68, w * 0.5, h * 0.78); ctx.quadraticCurveTo(w * 0.56, h * 0.88, w * 0.62, h * 0.78); }
  else if (mood === 'done' || mood === 'print') { ctx.arc(w * 0.5, h * 0.6, h * 0.14, 0.2, Math.PI - 0.2); }
  else { ctx.moveTo(w * 0.44, h * 0.74); ctx.lineTo(w * 0.56, h * 0.74); }
  ctx.stroke();
}
function star(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
function moodOf(p) {
  if (!p) return 'idle';
  if (p.problem && p.problem.type === 'power') return 'off';
  if (p.problem) return 'problem';
  if (p.busy > 0) return 'fix';
  if (p.plate) return 'done';
  if (p.status === 'printing') return 'print';
  return 'sleep';
}

/* ---------- printers ---------- */
function drawPrinter(L, p, run, i, sel) {
  const T = D.PRINTERS[p.type];
  const x0 = L.slotX[i] - 0.78, y0 = L.py, z0 = L.benchZ;
  const o = p.plate ? p.plate.order : p.queue[0];
  const printing = p.status === 'printing' && !p.problem && p.busy <= 0;
  const frac = p.plate ? 1 : (o && (p.status === 'printing' || p.problem || p.busy > 0) ? p.prog / o.work : 0);
  const ph = now * (2 + (printing ? 3 : 0)) + i * 1.7;
  const pt = p.problem ? p.problem.type : '';
  const encl = BL.Core.enclosed(run || { ups: {} }, p) && !T.enclosed;
  const matCol = o ? (p.useMys ? '#d6a2e8' : (o.colors[0] || D.MATS[o.mat].color)) : '#9a9a9a';
  // shadow & selection glow
  if (sel) {
    const pulse = 0.55 + 0.25 * Math.sin(now * 6);
    poly([P(x0 - 0.05, y0 - 0.05, z0 + 0.005), P(x0 + 1.61, y0 - 0.05, z0 + 0.005), P(x0 + 1.61, y0 + 1.55, z0 + 0.005), P(x0 - 0.05, y0 + 1.55, z0 + 0.005)],
      sel.ok ? `rgba(110,220,120,${pulse})` : 'rgba(220,70,60,.35)', sel.ok ? '#3fae4a' : '#b03a2a', 3);
  }
  poly([P(x0 + 0.05, y0 + 0.15, z0 + 0.002), P(x0 + 1.5, y0 + 0.15, z0 + 0.002), P(x0 + 1.5, y0 + 1.45, z0 + 0.002), P(x0 + 0.05, y0 + 1.45, z0 + 0.002)], 'rgba(60,30,10,.25)');

  const bedC = (run && run.ups.pei) ? '#b08a3a' : '#2c2c30';
  if (T.look === 'box') {
    const W = 1.4, Dd = 1.3, H = 1.55, x = x0 + 0.1, y = y0 + 0.1;
    // back + inside
    poly([P(x, y, z0), P(x + W, y, z0), P(x + W, y, z0 + H), P(x, y, z0 + H)], '#1d1d22');
    poly([P(x, y, z0), P(x, y + Dd, z0), P(x, y + Dd, z0 + H), P(x, y, z0 + H)], '#26262c');
    poly([P(x, y, z0 + 0.12), P(x + W, y, z0 + 0.12), P(x + W, y + Dd, z0 + 0.12), P(x, y + Dd, z0 + 0.12)], '#303036');
    // interior light
    const lg = ctx.createRadialGradient(...P(x + W / 2, y + Dd / 2, z0 + 1.2), 2, ...P(x + W / 2, y + Dd / 2, z0 + 0.5), K * 1.4);
    lg.addColorStop(0, printing ? 'rgba(255,240,200,.35)' : 'rgba(255,240,200,.12)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(P(x, y + Dd, 0)[0], P(x + W / 2, y, z0 + H)[1], W * 2 * K, H * K * 2);
    // bed lowers as the print grows (CoreXY)
    const objH = o ? objHeight(o) : 0;
    const bedZ = z0 + 0.6 - frac * objH * 0.8;
    box(x + 0.2, y + 0.2, bedZ, W - 0.4, Dd - 0.4, 0.05, bedC, { stroke: null });
    if (o && (frac > 0 || pt === 'adhesion')) drawObjectWithTrouble(x + W / 2, y + Dd / 2, bedZ + 0.05, o, frac, p, printing, matCol);
    // gantry + toolhead (CoreXY: moves in x & y)
    const gz = z0 + H - 0.58;
    const hx = x + 0.35 + (Math.sin(ph * 1.3) + 1) * 0.35 * (printing ? 1 : 0.1), hy = y + 0.45 + (Math.cos(ph * 0.9) + 1) * 0.2 * (printing ? 1 : 0.1);
    box(x + 0.08, hy + 0.06, gz + 0.12, W - 0.16, 0.08, 0.06, '#8a8a90', { stroke: null });
    toolhead(hx, hy, gz, p, matCol, printing);
    // glass front-left, solid right, lid
    poly([P(x, y + Dd, z0), P(x + W, y + Dd, z0), P(x + W, y + Dd, z0 + H), P(x, y + Dd, z0 + H)], 'rgba(190,225,255,.16)', '#18181c', 3);
    poly([P(x + 0.1, y + Dd, z0 + H - 0.2), P(x + 0.45, y + Dd, z0 + H - 0.2), P(x + 0.15, y + Dd, z0 + 0.4)], 'rgba(255,255,255,.12)');
    box(x + W - 0.0001, y, z0, 0.0001, Dd, H, T.body, { noTop: true, noLeft: true, right: '#2c2c32' });
    poly([P(x + W, y + 0.2, z0 + H - 0.25), P(x + W, y + Dd - 0.2, z0 + H - 0.25), P(x + W, y + Dd - 0.2, z0 + H - 0.33), P(x + W, y + 0.2, z0 + H - 0.33)], T.accent);
    box(x - 0.02, y - 0.02, z0 + H, W + 0.04, Dd + 0.04, 0.08, '#2a2a30', { top: '#3c3c44' });
    box(x, y + Dd - 0.02, z0, W, 0.04, 0.16, '#2a2a30');
    onFrontFace(x + W - 0.55, y + Dd + 0.02, z0 + 0.15, () => face(0.42, 0.12, moodOf(p)));
    // spool on the right side (outside, external spool holder)
    spool(x + W + 0.04, y + 0.65, z0 + 0.8, 0.26, matCol, 1);
  } else {
    // bed-slinger (Sprout) / bed-slinger + colour changer (Rainbow)
    const ams = T.look === 'changer';
    const bx = x0 + 0.1, bw = ams ? 1.15 : 1.35;
    box(bx, y0 + 0.3, z0, bw, 1.05, 0.18, T.body, { left: shade(T.body, -0.1), right: shade(T.body, -0.25) });
    // generic two-column gantry frame (left + right uprights and a top beam)
    box(bx + 0.06, y0 + 0.55, z0 + 0.18, 0.14, 0.16, 1.45, '#e0d8c8', { top: '#f0e8d8' });
    box(bx + bw - 0.16, y0 + 0.55, z0 + 0.18, 0.14, 0.16, 1.45, '#e0d8c8', { top: '#f0e8d8' });
    box(bx + 0.06, y0 + 0.55, z0 + 1.63, bw - 0.08, 0.16, 0.1, '#d6cebd', { top: '#f0e8d8' });
    // spool on a holder in the middle of the top beam
    if (!ams) { box(bx + bw / 2 - 0.03, y0 + 0.6, z0 + 1.73, 0.06, 0.06, 0.08, '#b8b0a0'); spool(bx + bw / 2, y0 + 0.63, z0 + 1.98, 0.22, matCol, 1); }
    // bed slinging in y
    const bedY = y0 + 0.38 + (printing ? Math.sin(ph * 2.1) * 0.12 : 0);
    box(bx + 0.28, bedY, z0 + 0.18, bw - 0.4, 0.86, 0.05, bedC, { stroke: null });
    let topZ = z0 + 0.23;
    if (o && (frac > 0 || pt === 'adhesion')) topZ += drawObjectWithTrouble(bx + 0.28 + (bw - 0.4) / 2, bedY + 0.43, z0 + 0.23, o, frac, p, printing, matCol);
    // arm (x) at height of the print
    const armZ = Math.max(z0 + 0.48, topZ + 0.32);
    const tilt = pt === 'axis' ? 0.25 : 0;
    poly([P(bx + 0.18, y0 + 0.66, armZ), P(bx + bw + 0.02, y0 + 0.66, armZ - tilt), P(bx + bw + 0.02, y0 + 0.66, armZ - tilt + 0.1), P(bx + 0.18, y0 + 0.66, armZ + 0.1)], '#d0c8b8', 'rgba(0,0,0,.3)');
    const hx = bx + 0.4 + (Math.sin(ph * 1.6) + 1) * 0.3 * (printing ? 1 : 0.08) * (bw / 1.35);
    toolhead(hx, y0 + 0.55, armZ - 0.2 - tilt * (hx - bx) / bw, p, matCol, printing);
    if (pt === 'axis') { const s = P(bx + bw, y0 + 0.66, armZ - tilt); ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 6; k++) ctx.lineTo(s[0] + k * 4, s[1] + (k % 2 ? -5 : 5)); ctx.stroke(); }
    onFrontFace(bx + bw - 0.5, y0 + 1.351, z0 + 0.16, () => face(0.4, 0.13, moodOf(p)));
    if (ams) {
      // generic colour changer: box with 4 spools visible through a smoked lid, tubes to the toolhead
      const ax = bx + bw + 0.05, ay = y0 + 0.35;
      box(ax, ay, z0, 0.42, 1.0, 0.5, '#e6e0d4');
      const cols = o && o.nc > 1 ? o.colors.concat(D.COLORS).slice(0, 4) : [matCol, '#F4EFE6', '#2B2B2E', '#2FA8A0'];
      const active = o && o.nc > 1 && printing ? Math.floor((frac * o.nc) % o.nc) : 0;
      for (let k = 0; k < 4; k++) {
        const c = P(ax + 0.21, ay + 0.15 + k * 0.23, z0 + 0.5);
        ctx.fillStyle = shade(hexish(cols[k]), -0.2); ctx.beginPath(); ctx.ellipse(c[0], c[1], K * 0.13, K * 0.08, 0, 0, 7); ctx.fill();
        ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.ellipse(c[0], c[1] - K * 0.04, K * 0.12, K * 0.07, 0, 0, 7); ctx.fill();
        if (k === active && printing) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      poly([P(ax, ay, z0 + 0.5), P(ax + 0.42, ay, z0 + 0.5), P(ax + 0.42, ay + 1, z0 + 0.5), P(ax, ay + 1, z0 + 0.5)], 'rgba(80,60,40,.25)', 'rgba(0,0,0,.3)');
      // tubes
      const tA = P(ax + 0.2, ay + 0.3, z0 + 0.52), tB = P(hx + 0.12, y0 + 0.66, armZ + 0.15);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1.5, K * 0.03);
      ctx.beginPath(); ctx.moveTo(...tA); ctx.bezierCurveTo(tA[0], tA[1] - K * 1.4, tB[0] + K * 0.4, tB[1] - K * 1.0, tB[0], tB[1]); ctx.stroke();
    }
    if (encl) {
      // enclosure kit upgrade: a cosy acrylic box around open printers
      const ex = x0 + 0.02, ey = y0 + 0.22, W = 1.58, Dd = 1.2, H = 1.95;
      poly([P(ex, ey + Dd, z0), P(ex + W, ey + Dd, z0), P(ex + W, ey + Dd, z0 + H), P(ex, ey + Dd, z0 + H)], 'rgba(255,200,140,.10)', 'rgba(120,70,30,.6)', 2);
      poly([P(ex + W, ey, z0), P(ex + W, ey + Dd, z0), P(ex + W, ey + Dd, z0 + H), P(ex + W, ey, z0 + H)], 'rgba(255,200,140,.14)', 'rgba(120,70,30,.6)', 2);
      poly([P(ex, ey, z0 + H), P(ex + W, ey, z0 + H), P(ex + W, ey + Dd, z0 + H), P(ex, ey + Dd, z0 + H)], 'rgba(255,220,180,.18)', 'rgba(120,70,30,.6)', 2);
    }
  }
  // UPS brick
  if (p.ups) box(x0 + 1.25, y0 + 1.25, z0, 0.3, 0.22, 0.18, '#3a3a40', { top: '#4caf50' });
  const top = P(x0 + 0.8, y0 + 0.8, z0 + 2.15);
  const bb = rectFrom([P(x0, y0 + 1.5, z0), P(x0 + 1.6, y0 + 1.5, z0), P(x0 + 1.6, y0, z0 + 2.1), P(x0, y0, z0 + 2.1), P(x0, y0 + 1.5, z0 + 2.1)]);
  hits.printers[i] = bb;
  return { top, bb };
}
function drawObjectWithTrouble(cx, cy, cz, o, frac, p, printing, matCol) {
  const pt = p.problem ? p.problem.type : '';
  if (pt === 'adhesion') {
    // spaghetti!
    ctx.strokeStyle = matCol; ctx.lineWidth = Math.max(1.5, K * 0.03);
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      for (let k = 0; k < 14; k++) { const a = k * 0.9 + s * 2; const q = P(cx + Math.cos(a) * 0.25 * (k / 14 + 0.3), cy + Math.sin(a * 1.3) * 0.25, cz + 0.02 + (k % 3) * 0.04); k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
      ctx.stroke();
    }
    return 0.1;
  }
  const h = drawObject(cx, cy, cz, o, frac, { printing, mystery: p.useMys });
  if (pt === 'string' || pt === 'warp' || p.pen >= 1.5) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
    for (let s = 0; s < 6; s++) { const a = P(cx - 0.2 + s * 0.08, cy, cz + h), b = P(cx - 0.15 + s * 0.06, cy - 0.1, cz + h + 0.2 + (s % 2) * 0.05); ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(a[0] + 4, (a[1] + b[1]) / 2 - 6, b[0], b[1]); ctx.stroke(); }
  }
  return h;
}
function toolhead(x, y, z, p, matCol, printing) {
  box(x, y, z, 0.26, 0.24, 0.3, '#f2f2f2', { left: D.PAPAYA, right: shade(D.PAPAYA, -0.25), top: '#fafafa' });
  const n = P(x + 0.13, y + 0.12, z - 0.04);
  ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.moveTo(n[0] - 3, n[1] - 4); ctx.lineTo(n[0] + 3, n[1] - 4); ctx.lineTo(n[0], n[1] + 2); ctx.fill();
  if (p.problem && p.problem.type === 'clog') {
    for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(120,120,120,${0.5 - k * 0.12})`; ctx.beginPath(); ctx.arc(n[0] + Math.sin(now * 2 + k) * 6, n[1] - K * (0.5 + k * 0.25 + (now % 1) * 0.2), K * (0.08 + k * 0.04), 0, 7); ctx.fill(); }
  }
  if (printing && Math.sin(now * 13) > 0.6) { ctx.fillStyle = 'rgba(255,200,120,.8)'; ctx.beginPath(); ctx.arc(n[0], n[1] + 3, 2, 0, 7); ctx.fill(); }
}
function drawEmptySlot(L, i, sel) {
  const x0 = L.slotX[i] - 0.7, y0 = L.py + 0.15, z0 = L.benchZ;
  ctx.setLineDash([6, 5]);
  poly([P(x0, y0, z0 + 0.01), P(x0 + 1.4, y0, z0 + 0.01), P(x0 + 1.4, y0 + 1.25, z0 + 0.01), P(x0, y0 + 1.25, z0 + 0.01)], 'rgba(255,240,210,.18)', 'rgba(120,60,20,.6)', 2);
  ctx.setLineDash([]);
  const c = P(x0 + 0.7, y0 + 0.62, z0 + 0.5);
  ctx.fillStyle = 'rgba(255,128,0,.9)'; ctx.beginPath(); ctx.arc(c[0], c[1], K * 0.28, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = K * 0.06; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c[0] - K * 0.13, c[1]); ctx.lineTo(c[0] + K * 0.13, c[1]); ctx.moveTo(c[0], c[1] - K * 0.13); ctx.lineTo(c[0], c[1] + K * 0.13); ctx.stroke();
  hits.slots[i] = rectFrom([P(x0, y0 + 1.25, z0), P(x0 + 1.4, y0 + 1.25, z0), P(x0 + 1.4, y0, z0 + 1.2), P(x0, y0, z0 + 1.2)]);
  hits.printers[i] = null;
}
function drawRecycler(L, run) {
  const x = 1.0, y = 3.1, z = 0;
  box(x, y, z, 0.9, 0.8, 0.7, '#5a8a5a', { top: '#6fa36f' });
  // hopper
  poly([P(x + 0.1, y + 0.1, 0.7), P(x + 0.8, y + 0.1, 0.7), P(x + 0.7, y + 0.2, 0.95), P(x + 0.2, y + 0.2, 0.95)], '#7fb07f', 'rgba(0,0,0,.3)');
  poly([P(x + 0.8, y + 0.1, 0.7), P(x + 0.8, y + 0.7, 0.7), P(x + 0.7, y + 0.6, 0.95), P(x + 0.7, y + 0.2, 0.95)], '#4a7a4a', 'rgba(0,0,0,.3)');
  const scrap = run ? run.scrap : 0;
  if (scrap > 1) for (let k = 0; k < Math.min(10, 2 + scrap / 40); k++) { const q = P(x + 0.3 + (k * 37 % 5) * 0.08, y + 0.3 + (k * 13 % 4) * 0.06, 0.85 + Math.sin(now * 8 + k) * 0.02); ctx.fillStyle = D.COLORS[k % D.COLORS.length]; ctx.fillRect(q[0] - 2, q[1] - 2, 5, 4); }
  onFrontFace(x + 0.12, y + 0.8, 0.6, () => { IC.draw(ctx, 'recycle', 0.33, 0.27, 0.36); });
  // output spool of mystery filament
  const mys = run ? run.fil.MYS : 0;
  if (mys > 1) spool(x + 0.95, y + 0.5, 0.25, 0.2, `hsl(${(now * 50) % 360},70%,65%)`, Math.min(1, mys / 1000));
  if (scrap > 1) { const g = P(x + 0.45, y + 0.4, 1.05 + (now % 1) * 0.2); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(g[0], g[1], 3, 0, 7); ctx.fill(); }
  hits.recycler = rectFrom([P(x, y + 0.8, 0), P(x + 1.2, y + 0.8, 0), P(x + 0.9, y, 1.0), P(x, y, 1.0)]);
}
function drawCat(L, run) {
  hits.cat = null;
  if (!run || !run.cat.on) return;
  const c = run.cat, u = c.dir > 0 ? c.p : 1 - c.p;
  // sometimes Miso hops onto the workbench and strolls right past the build plates
  const bench = c.lane < 0.3;
  const y = bench ? 1.82 : 4.0 + c.lane * 1.4, x = bench ? 0.5 + u * (L.RW - 1.0) : -0.3 + u * (L.RW + 0.6);
  const p = P(x, y, bench ? L.benchZ : 0);
  const s = K * 0.55, dir = c.dir, step = Math.sin(now * 12);
  ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(dir, 1);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e88a3a';
  // legs
  for (const lx of [-0.4, -0.25, 0.25, 0.4]) { ctx.fillRect(lx * s + (lx > 0 ? step : -step) * 2, -s * 0.35, s * 0.1, s * 0.35); }
  // body
  ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.55, s * 0.24, 0, 0, 7); ctx.fill();
  // stripes
  ctx.strokeStyle = '#b8642a'; ctx.lineWidth = s * 0.06; for (const sx of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(sx * s, -s * 0.66); ctx.lineTo(sx * s + 2, -s * 0.5); ctx.stroke(); }
  // tail
  ctx.strokeStyle = '#e88a3a'; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.5); ctx.quadraticCurveTo(-s * 0.9, -s * (0.7 + 0.2 * Math.sin(now * 3)), -s * 0.75, -s * 1.05); ctx.stroke();
  // head
  ctx.fillStyle = '#f09a4a'; ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.7, s * 0.22, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.38, -s * 0.82); ctx.lineTo(s * 0.42, -s * 1.02); ctx.lineTo(s * 0.52, -s * 0.88); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.6, -s * 0.88); ctx.lineTo(s * 0.72, -s * 1.02); ctx.lineTo(s * 0.74, -s * 0.8); ctx.fill();
  ctx.fillStyle = '#2b2b2e'; ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.72, s * 0.035, 0, 7); ctx.arc(s * 0.7, -s * 0.72, s * 0.035, 0, 7); ctx.fill();
  ctx.restore();
  if (c.petted) IC.draw(ctx, 'heart', p[0], p[1] - s * 1.45 - Math.sin(now * 4) * 3, K * 0.45);
  hits.cat = { x: p[0] - s, y: p[1] - s * 1.3, w: s * 2, h: s * 1.5 };
}

/* ---------- overlays (screen space) ---------- */
function bubble(x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
  rrect(x - w / 2, y - h, w, h, Math.min(12, h / 2)); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.lineTo(x, y + 8); ctx.lineTo(x + 7, y - 1); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y + 8); ctx.lineTo(x + 7, y); ctx.stroke();
}
function printerOverlay(p, run, info, i, sel, fs) {
  const { top, bb } = info;
  const x = top[0], y = bb.y - 4;
  const bob = Math.sin(now * 4 + i) * 3;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (p.problem) {
    const w = fs * 3.6, h = fs * 2.3;
    const age = run.t - (p.problem.t || 0);
    const pop = age < 0.5 ? 1 + 0.5 * Math.sin(Math.min(1, age / 0.5) * Math.PI) : 1 + 0.07 * Math.sin(now * 9);
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(pop, pop); ctx.rotate(Math.sin(now * 14) * 0.06);
    bubble(0, 0, w, h, '#fff4e6', '#e0473c');
    IC.draw(ctx, D.PROBLEMS[p.problem.type].icon, -w * 0.17, -h / 2, h * 0.78);
    ctx.font = `700 ${Math.round(fs * 1.5)}px ${FONT}`; ctx.fillStyle = '#e0473c'; ctx.fillText('!', w * 0.27, -h / 2 + 1);
    ctx.restore();
  } else if (p.plate) {
    const w = fs * 4.8, h = fs * 2.0;
    const pulse = 1 + 0.05 * Math.sin(now * 6);
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(pulse, pulse);
    bubble(0, 0, w, h, '#eaffdf', '#3fae4a');
    IC.draw(ctx, 'check', -w * 0.28, -h / 2, h * 0.62);
    ctx.font = `700 ${Math.round(fs * 1.05)}px ${FONT}`; ctx.fillStyle = '#226b2a'; ctx.fillText(`$${p.plate.pay}`, w * 0.1, -h / 2 + 1);
    ctx.restore();
  } else if (p.busy > 0) {
    const w = fs * 5.4, h = fs * 1.75;
    bubble(x, y, w, h, '#fff8de', '#c9a227');
    IC.draw(ctx, p.busyIcon || 'wrench', x - w / 2 + h * 0.5, y - h / 2, h * 0.7);
    const bx = x - w / 2 + h * 0.95, bw = w - h * 1.15;
    ctx.fillStyle = '#e8d9a8'; ctx.fillRect(bx, y - h * 0.3, bw, h * 0.16);
    ctx.fillStyle = '#c9a227'; ctx.fillRect(bx, y - h * 0.3, bw * (1 - p.busy / (p.busyMax || 1)), h * 0.16);
    ctx.font = `600 ${Math.round(fs * 0.62)}px ${FONT}`; ctx.fillStyle = '#5a4a10'; ctx.fillText(p.busyWhat, bx + bw / 2, y - h * 0.64);
  } else if (!p.queue.length && !sel) {
    IC.draw(ctx, 'zzz', x + Math.sin(now) * 4, y + bob - fs * 0.3, fs * 1.4);
  }
  // progress bar + queue under the printer
  if (p.queue.length && !p.plate) {
    const o = p.queue[0];
    const bw = Math.min(bb.w * 0.7, fs * 5.5), bx = x - bw / 2 + fs * 0.4, by = bb.y + bb.h + 6;
    ctx.fillStyle = 'rgba(40,20,10,.75)'; rrect(bx - 2, by - 2, bw + 4, fs * 0.6 + 4, 5); ctx.fill();
    ctx.fillStyle = p.problem ? '#e0473c' : D.PAPAYA; rrect(bx, by, Math.max(6, bw * Math.min(1, p.prog / o.work)), fs * 0.6, 4); ctx.fill();
    IC.draw(ctx, IC.orderIcon(o), bx - fs * 0.85, by + fs * 0.3, fs * 1.6);
    if (run && run.t > o.deadline) IC.draw(ctx, 'clock', bx + bw + fs * 0.6, by + fs * 0.3, fs * 1.0);
    for (let k = 1; k < p.queue.length; k++) IC.draw(ctx, IC.orderIcon(p.queue[k]), bx + bw * (k - 0.5) / 3 + fs * 0.2, by + fs * 1.55, fs * 1.25);
  }
  if (sel) {
    ctx.font = `700 ${Math.round(fs * 0.78)}px ${FONT}`;
    const t = sel.ok ? 'Tap!' : sel.short;
    const ico = sel.ok ? (sel.warn && sel.warn.length ? 'warn' : 'hand') : '';
    const tw = ctx.measureText(t).width, w = tw + 18 + (ico ? fs * 1.2 : 0), h = fs * 1.3, yy = bb.y + bb.h * 0.42;
    ctx.fillStyle = sel.ok ? '#3fae4a' : 'rgba(150,50,40,.92)'; rrect(x - w / 2, yy, w, h, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    if (ico) IC.draw(ctx, ico, x - w / 2 + 8 + fs * 0.5, yy + h / 2, fs * 1.05);
    ctx.fillStyle = '#fff'; ctx.fillText(t, x + (ico ? fs * 0.55 : 0), yy + h / 2 + 1);
  }
}
/* ---------- the expo booth corner (bought upgrades show up in the room) ---------- */
function drawBooth(L, run) {
  if (!run) return;
  const u = run.ups;
  if (u.lights) {
    const n = 9;
    ctx.strokeStyle = '#4a2c17'; ctx.lineWidth = Math.max(1, K * 0.02); ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const t = k / 40, q = P(0.3 + t * (L.RW - 0.6), 0, L.WH - 0.25 - Math.sin(t * Math.PI * 4) * 0.12); k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
    ctx.stroke();
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, q = P(0.3 + t * (L.RW - 0.6), 0, L.WH - 0.3 - Math.sin(t * Math.PI * 4) * 0.12);
      const c = ['#F7C52B', '#E0473C', '#5DB548', '#4A90D9', '#FF8000'][k % 5], on = 0.6 + 0.4 * Math.sin(now * 3 + k * 1.7);
      ctx.fillStyle = c; ctx.globalAlpha = 0.25 * on; ctx.beginPath(); ctx.arc(q[0], q[1] + K * 0.06, K * 0.13, 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(q[0], q[1] + K * 0.06, K * 0.04, K * 0.055, 0, 0, 7); ctx.fill();
    }
  }
  if (u.banner) onFrontFace(L.RW * 0.13, 0, 3.2, () => {
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(-0.05, -0.04, 1.2, 0.06);
    ctx.fillStyle = D.PAPAYA; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.1, 0); ctx.lineTo(1.1, 0.75); ctx.lineTo(0.55, 0.6); ctx.lineTo(0, 0.75); ctx.closePath(); ctx.fill();
    IC.draw(ctx, 'star', 0.55, 0.3, 0.42);
  });
  if (u.table) {
    const x = L.RW - 2.0, y = 4.3;
    for (const [lx, ly] of [[0.05, 0.05], [1.3, 0.05], [0.05, 0.75], [1.3, 0.75]]) box(x + lx, y + ly, 0, 0.08, 0.08, 0.55, '#6b4226');
    box(x, y, 0.55, 1.45, 0.9, 0.06, D.PAPAYA, { top: '#ff9a33' });
    box(x, y + 0.88, 0.25, 1.45, 0.02, 0.31, D.PAPAYA);
    const c = P(x + 0.45, y + 0.45, 0.61); MD.draw(ctx, 'figure', null, c[0], c[1], K * 0.17, 1);
    const c2 = P(x + 1.05, y + 0.4, 0.61); MD.draw(ctx, 'vase', ['#2FA8A0'], c2[0], c2[1], K * 0.13, 1);
  }
  if (u.showcase) {
    const x = 0.25, y = 5.0;
    box(x, y, 0, 0.9, 0.7, 0.35, '#8a5a32');
    const g1 = 'rgba(200,235,255,.28)';
    box(x + 0.05, y + 0.05, 0.35, 0.8, 0.6, 0.9, '#cfe8f0', { top: g1, left: g1, right: 'rgba(170,215,240,.32)', stroke: 'rgba(255,255,255,.7)' });
    const c = P(x + 0.45, y + 0.35, 0.36); MD.draw(ctx, 'figure', ['#E9A91B', '#F7C52B', '#c98a10', '#2B2B2E'], c[0], c[1], K * 0.14, 1);
    box(x, y, 1.25, 0.9, 0.7, 0.06, '#8a5a32');
  }
}
/* ---------- juice: particles, shake, coins ---------- */
function burst(kind, idx, opt) {
  opt = opt || {};
  const r = kind === 'printer' ? hits.printers[idx] : kind === 'slot' ? hits.slots[idx] : null;
  const x = opt.x != null ? opt.x : r ? r.x + r.w / 2 : 0, y = opt.y != null ? opt.y : r ? r.y + r.h * 0.35 : 0;
  const type = opt.type || 'spark';
  const n = opt.n || (type === 'confetti' ? 40 : type === 'coin' ? Math.min(8, 2 + Math.floor((opt.value || 20) / 25)) : 14);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = (type === 'smoke' ? 30 : 140) * (0.4 + Math.random());
    parts.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (type === 'smoke' ? 40 : 90), t: 0, life: type === 'coin' ? 0.9 + k * 0.06 : type === 'smoke' ? 1.4 : 0.9 + Math.random() * 0.5,
      c: opt.colors ? opt.colors[k % opt.colors.length] : ['#F7C52B', '#FF8000', '#5DB548', '#4A90D9', '#E0473C', '#F06292'][k % 6], rot: Math.random() * 6, delay: type === 'coin' ? k * 0.05 : 0 });
  }
}
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }
function setTargets(t) { targets = t || {}; }
function drawParts(dt, fs) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    if (q.delay > 0) { q.delay -= dt; continue; }
    q.t += dt;
    if (q.t > q.life) { parts.splice(i, 1); continue; }
    const u = q.t / q.life;
    if (q.type === 'coin' && targets.money) { // arc toward the money chip
      const tx = targets.money[0], ty = targets.money[1];
      const e = u * u * (3 - 2 * u);
      const x = q.x + (tx - q.x) * e + Math.sin(u * Math.PI) * q.vx * 0.25, y = q.y + (ty - q.y) * e - Math.sin(u * Math.PI) * 60;
      IC.draw(ctx, 'coin', x, y, fs * (1.25 - u * 0.4));
      continue;
    }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.type === 'smoke' ? -10 : q.type === 'confetti' ? 160 : 320) * dt; q.vx *= 0.98; q.rot += dt * 8;
    ctx.globalAlpha = Math.max(0, 1 - u);
    if (q.type === 'smoke') { ctx.fillStyle = 'rgba(120,110,100,.6)'; ctx.beginPath(); ctx.arc(q.x, q.y, fs * (0.3 + u * 0.9), 0, 7); ctx.fill(); }
    else if (q.type === 'confetti') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.c; ctx.fillRect(-fs * 0.25, -fs * 0.12, fs * 0.5, fs * 0.24); ctx.restore(); }
    else if (q.type === 'star') IC.draw(ctx, 'star', q.x, q.y, fs * 0.9);
    else { ctx.fillStyle = q.c; ctx.beginPath(); const r = fs * 0.22 * (1 - u * 0.5); ctx.moveTo(q.x, q.y - r * 2); ctx.lineTo(q.x + r * 0.6, q.y); ctx.lineTo(q.x, q.y + r * 2); ctx.lineTo(q.x - r * 0.6, q.y); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

/* ---------- main draw ---------- */
function draw(c, st) {
  ctx = c; now = st.time;
  const { vx, vy, vw, vh } = st.view;
  const run = st.run;
  const slots = run ? run.slots : D.LABS[st.lab || 0].slots;
  const L = layout(slots);
  L.lab = run ? run.lab : (st.lab || 0);
  const F = fit(L, vw, vh);
  K = F.k;
  OX = vx + vw / 2 - ((F.minX + F.maxX) / 2) * K;
  OY = vy + (vh - (F.maxY - F.minY) * K) / 2 - F.minY * K + K * 0.3;
  if (shakeAmt > 0.3) { OX += (Math.random() - 0.5) * shakeAmt; OY += (Math.random() - 0.5) * shakeAmt; }
  shakeAmt *= Math.pow(0.02, st.dt || 0.016);
  // background
  const g = ctx.createLinearGradient(0, 0, 0, st.H);
  g.addColorStop(0, '#3a2618'); g.addColorStop(1, '#22150d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, st.W, st.H);
  const dayT = run ? Math.min(1, run.t / run.len) : 0.15;
  drawRoom(L, run, dayT);
  drawShelf(L, run);
  drawBooth(L, run);
  drawBench(L);
  const printers = run ? run.printers : D.LABS[st.lab || 0].start.map((t, i) => BL.Core.makePrinter(t, i)).concat([null, null, null]).slice(0, slots);
  const infos = [];
  hits.printers = []; hits.slots = [];
  for (let i = 0; i < slots; i++) {
    const p = printers[i];
    const sel = st.selection ? st.selection[i] : null;
    if (p) {
      if (run && p.problem) { // red alarm glow on the bench under a printer that needs help
        const x0 = L.slotX[i] - 0.78, a = 0.35 + 0.25 * Math.sin(now * 8);
        poly([P(x0 - 0.1, L.py - 0.1, L.benchZ + 0.004), P(x0 + 1.66, L.py - 0.1, L.benchZ + 0.004), P(x0 + 1.66, L.py + 1.6, L.benchZ + 0.004), P(x0 - 0.1, L.py + 1.6, L.benchZ + 0.004)], `rgba(255,70,50,${a})`, '#e0473c', 3);
      }
      infos[i] = drawPrinter(L, p, run, i, sel);
    } else if (run) drawEmptySlot(L, i, sel); else drawEmptySlot(L, i);
  }
  drawRecycler(L, run);
  drawCat(L, run);
  // warm vignette
  const vg = ctx.createRadialGradient(vx + vw / 2, vy + vh / 2, Math.min(vw, vh) * 0.3, vx + vw / 2, vy + vh / 2, Math.max(vw, vh) * 0.8);
  vg.addColorStop(0, 'rgba(255,180,90,0)'); vg.addColorStop(1, `rgba(40,15,0,${0.18 + dayT * 0.2})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, st.W, st.H);
  const fs = Math.max(13, Math.min(22, K * 0.42));
  if (run) for (let i = 0; i < slots; i++) if (printers[i]) printerOverlay(printers[i], run, infos[i], i, st.selection ? st.selection[i] : null, fs);
  drawParts(st.dt || 0.016, fs);
  // floating texts (optionally with a leading icon)
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += st.dt;
    if (f.t > 1.8) { floats.splice(i, 1); continue; }
    const a = Math.min(1, 2 - f.t * 1.1), sc = f.t < 0.15 ? 0.6 + f.t / 0.15 * 0.4 : 1;
    ctx.globalAlpha = Math.max(0, a); ctx.font = `700 ${Math.round(fs * 1.1 * sc)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = f.y - f.t * 40, tw = ctx.measureText(f.text).width, isz = fs * 1.4 * sc, x = f.x + (f.icon ? isz * 0.45 : 0);
    if (f.icon) IC.draw(ctx, f.icon, x - tw / 2 - isz * 0.55, y, isz);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,20,5,.85)'; ctx.strokeText(f.text, x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
    ctx.globalAlpha = 1;
  }
  return { K, fs };
}
function floatAt(kind, idx, text, color, icon) {
  let r = kind === 'printer' ? hits.printers[idx] : kind === 'recycler' ? hits.recycler : kind === 'cat' ? hits.cat : null;
  if (!r) return;
  floats.push({ x: r.x + r.w / 2, y: r.y + r.h * 0.3, text, color: color || '#ffd84a', t: 0, icon });
}
function hitTest(x, y) {
  const inR = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inR(hits.cat)) return { kind: 'cat' };
  for (let i = hits.printers.length - 1; i >= 0; i--) if (inR(hits.printers[i])) return { kind: 'printer', i };
  for (let i = 0; i < hits.slots.length; i++) if (inR(hits.slots[i])) return { kind: 'slot', i };
  if (inR(hits.recycler)) return { kind: 'recycler' };
  if (inR(hits.shelf)) return { kind: 'shelf' };
  return null;
}
/* printer art as a little icon for the DOM (cards / sheets) */
function printerIcon(type, size) {
  const c = document.createElement('canvas'); const dpr = Math.min(2, root.devicePixelRatio || 1);
  c.width = c.height = size * dpr; c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const save = { ctx, K, OX, OY }, keep = hits.printers.slice(), keepNow = now;
  ctx = g; K = size / 2.7;
  const L = { slotX: [0.8], py: 0, benchZ: 0 };
  OX = size / 2 - (0.8 - 0.75) * K; OY = size / 2 - (0.8 + 0.75) * K * 0.5 + 1.0 * K;
  drawPrinter(L, BL.Core.makePrinter(type, 0), null, 0, null);
  ({ ctx, K, OX, OY } = save); hits.printers = keep; now = keepNow;
  return c;
}

/* a big printer busy with a print, for the cover art: draws into any 2D context, centred on (cx, cy), `size` px tall-ish */
function hero(g, type, cx, cy, size, st) {
  st = st || {};
  const save = { ctx, K, OX, OY, MS }, keep = hits.printers.slice(), keepNow = now;
  ctx = g; K = size / 2.7; MS = st.ms || MS; now = st.time || 0;
  OX = cx - (0.8 - 0.75) * K; OY = cy - (0.8 + 0.75) * K * 0.5 + 1.0 * K;
  const p = BL.Core.makePrinter(type, 0);
  if (st.tpl) {
    const o = { id: 1, tpl: st.tpl, colors: st.colors || MD.BASES[st.tpl], mat: 'PLA', nc: 1, q: 3, work: 100, g: 40, pay: 1 };
    if (st.frac >= 1) p.plate = { order: o }; else { p.queue = [o]; p.status = 'printing'; p.prog = (st.frac || 0.5) * 100; }
  }
  drawPrinter({ slotX: [0.8], py: 0, benchZ: 0 }, p, null, 0, null);
  ({ ctx, K, OX, OY, MS } = save); hits.printers = keep; now = keepNow;
}

BL.Render = { draw, hitTest, floatAt, printerIcon, hero, hits, burst, shake, setTargets, get fs() { return Math.max(13, Math.min(22, K * 0.42)); } };
})(window);
