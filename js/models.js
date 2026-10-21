/* Tiny Print Shop - little isometric 3D models of every printable order, built from boxes, cylinders and frustums.
 * The same models are drawn on the build plates (sliced at the current layer height, so prints really grow),
 * in the order cards and as icons. Model units: footprint within about [-1, 1], z up to `h`. */
(function (root) {
'use strict';
const BL = root.BL = root.BL || {};

let g = null, CX = 0, CY = 0, k = 10, ZC = 99, COLS = ['#ff8000'], MYS = 0, LW = 1;
const P = (x, y, z) => [CX + (x - y) * k, CY + (x + y) * k * 0.5 - z * k];

function hex2rgb(h) {
  if (h[0] !== '#') { const m = h.match(/\d+(\.\d+)?/g) || [128, 128, 128]; return [+m[0], +m[1], +m[2]]; }
  const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, f) {
  const [r, gg, b] = hex2rgb(h);
  const m = (c) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return `rgb(${m(r)},${m(gg)},${m(b)})`;
}
const OUT = 'rgba(45,22,8,.55)';
function col(i) {
  if (MYS) return `hsl(${(MYS * 40 + i * 70) % 360},68%,62%)`;
  return COLS[i % COLS.length] || '#cccccc';
}
function face(pts, fill) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
}
/* axis-aligned box, sliced at ZC */
function box(x, y, z, w, d, h, c) {
  if (z >= ZC) return; h = Math.min(h, ZC - z); if (h <= 0.001) return;
  face([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(c, -0.1));
  face([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(c, -0.3));
  face([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(c, 0.14));
}
/* frustum (r1 at bottom, r2 at top) with a lit top cap */
function cone(x, y, z, r1, r2, h, c, hole) {
  if (z >= ZC) return;
  if (z + h > ZC) { const f = (ZC - z) / h; r2 = r1 + (r2 - r1) * f; h = ZC - z; }
  if (h <= 0.001) return;
  const b = P(x, y, z), t = P(x, y, z + h);
  const bx = r1 * k * 1.414, by = r1 * k * 0.707, tx = r2 * k * 1.414, ty = r2 * k * 0.707;
  const gr = g.createLinearGradient(b[0] - bx, 0, b[0] + bx, 0);
  gr.addColorStop(0, shade(c, -0.02)); gr.addColorStop(0.55, shade(c, -0.16)); gr.addColorStop(1, shade(c, -0.38));
  g.beginPath(); g.ellipse(b[0], b[1], bx, by, 0, 0, Math.PI); g.lineTo(t[0] - tx, t[1]); g.ellipse(t[0], t[1], tx, ty, 0, Math.PI, 0, true); g.closePath();
  g.fillStyle = gr; g.fill(); g.strokeStyle = OUT; g.lineWidth = LW; g.stroke();
  g.beginPath(); g.ellipse(t[0], t[1], tx, ty, 0, 0, Math.PI * 2); g.fillStyle = shade(c, 0.16); g.fill(); g.stroke();
  if (hole && r2 > hole) { g.beginPath(); g.ellipse(t[0], t[1], hole * k * 1.414, hole * k * 0.707, 0, 0, Math.PI * 2); g.fillStyle = shade(c, -0.55); g.fill(); }
}
const cyl = (x, y, z, r, h, c, hole) => cone(x, y, z, r, r, h, c, hole);
function ball(x, y, z, r, c) { // sphere as a stack of frustums so it slices cleanly
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + Math.PI * i / n, a1 = -Math.PI / 2 + Math.PI * (i + 1) / n;
    const z0 = z + r + Math.sin(a0) * r, z1 = z + r + Math.sin(a1) * r;
    cone(x, y, z0, Math.max(0.02, Math.cos(a0) * r), Math.max(0.02, Math.cos(a1) * r), z1 - z0, c);
  }
}
function dome(x, y, z, r, c) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI / 2 * i / n, a1 = Math.PI / 2 * (i + 1) / n;
    cone(x, y, z + Math.sin(a0) * r, Math.cos(a0) * r, Math.max(0.03, Math.cos(a1) * r), (Math.sin(a1) - Math.sin(a0)) * r, c);
  }
}
/* triangular prism roof along x: ridge at the top */
function roof(x, y, z, w, d, h, c) {
  if (z >= ZC) return;
  const f = Math.min(1, (ZC - z) / h);
  if (f < 1) { box(x, y + d * f / 2 * 0, z, w, d, h * f * 0.6, c); return; }
  face([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d / 2, z + h), P(x, y + d / 2, z + h)], shade(c, 0.1));
  face([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d / 2, z + h)], shade(c, -0.3));
}

/* ---- the models: [height, colour count hint, draw()] ---- */
const MODELS = {
  stand: [1.45, () => { box(-0.85, -0.7, 0, 1.7, 1.4, 0.16, col(0)); box(-0.75, -0.6, 0.16, 1.5, 0.28, 1.25, col(0)); box(-0.75, 0.42, 0.16, 1.5, 0.22, 0.3, col(0)); }],
  clips: [0.42, () => { for (let i = 0; i < 3; i++) { const x = -0.95 + i * 0.68, y = (i % 2) * 0.35 - 0.35; box(x, y, 0, 0.45, 0.55, 0.42, col(i)); box(x + 0.12, y + 0.14, 0.42, 0.21, 0.27, 0.0001, '#5a3a22'); } }],
  keys: [0.18, () => { box(-1, -0.8, 0, 1.0, 0.7, 0.16, col(0)); box(0.05, -0.05, 0, 1.0, 0.7, 0.16, col(1)); if (ZC > 0.16) { cyl(-0.8, -0.45, 0.16, 0.12, 0.001, '#3a2414'); cyl(0.85, 0.3, 0.16, 0.12, 0.001, '#3a2414'); } }],
  helmet: [1.25, () => { cyl(0, 0, 0, 1.0, 0.1, col(0)); dome(0, 0, 0.1, 1.0, col(0)); if (ZC > 0.35) box(-0.55, 0.62, 0.35, 1.1, 0.12, 0.42, '#2b2b2e'); }],
  figure: [1.95, () => { ball(0, 0, 0, 0.7, col(0)); ball(-0.55, 0.45, 0, 0.28, col(2)); ball(0.45, 0.55, 0, 0.28, col(2)); ball(0, 0, 1.0, 0.5, col(1)); ball(-0.42, -0.15, 1.55, 0.18, col(3)); ball(0.2, -0.42, 1.55, 0.18, col(3)); }],
  gears: [0.55, () => {
    for (let t = 0; t < 10; t++) { const a = t / 10 * Math.PI * 2; if (Math.sin(a + 0.78) < 0) box(-0.2 + Math.cos(a) * 0.82 - 0.12, -0.2 + Math.sin(a) * 0.82 - 0.12, 0, 0.24, 0.24, 0.3, col(0)); }
    cyl(-0.2, -0.2, 0, 0.82, 0.3, col(0), 0.25);
    for (let t = 0; t < 10; t++) { const a = t / 10 * Math.PI * 2; if (Math.sin(a + 0.78) >= 0) box(-0.2 + Math.cos(a) * 0.82 - 0.12, -0.2 + Math.sin(a) * 0.82 - 0.12, 0, 0.24, 0.24, 0.3, col(0)); }
    cyl(0.75, 0.7, 0, 0.42, 0.55, col(0), 0.14);
  }],
  vase: [1.9, () => { const n = 7; for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n, r = (u) => 0.45 + 0.42 * Math.sin(Math.PI * (u * 1.15 + 0.08)); cone(0, 0, u0 * 1.9, r(u0), r(u1), 1.9 / n, col(0), i === n - 1 ? 0.32 : 0); } }],
  case: [0.3, () => { box(-0.62, -1.0, 0, 1.24, 2.0, 0.3, col(0)); if (ZC > 0.3) box(-0.45, -0.85, 0.3, 0.38, 0.42, 0.0001, '#2b2b2e'); }],
  bumper: [0.32, () => { cyl(-0.3, -0.3, 0, 0.75, 0.3, col(0), 0.52); cyl(0.65, 0.6, 0, 0.42, 0.3, col(0), 0.26); }],
  vent: [0.85, () => { box(-0.7, -0.5, 0, 1.4, 1.0, 0.2, col(0)); for (let i = 0; i < 4; i++) box(-0.6 + i * 0.36, -0.4, 0.2, 0.1, 0.8, 0.65, col(0)); }],
  bracket: [1.15, () => { box(-0.85, -0.65, 0, 1.7, 1.3, 0.22, col(0)); box(-0.85, -0.65, 0.22, 1.7, 0.28, 0.95, col(0)); if (ZC > 0.22) { cyl(-0.35, 0.25, 0.22, 0.16, 0.001, '#3a2414'); cyl(0.45, 0.25, 0.22, 0.16, 0.001, '#3a2414'); } }],
  insert: [0.6, () => { box(-0.95, -0.95, 0, 1.9, 1.9, 0.6, col(0)); if (ZC > 0.6) { box(-0.8, -0.8, 0.6, 0.7, 0.7, 0.0001, shade(col(1), -0.2)); box(0.1, -0.8, 0.6, 0.7, 0.7, 0.0001, shade(col(1), -0.2)); box(-0.8, 0.1, 0.6, 1.6, 0.7, 0.0001, shade(col(1), -0.2)); } }],
  pot: [0.75, () => { box(-0.95, -0.7, 0, 0.25, 0.25, 0.12, col(0)); box(0.7, 0.45, 0, 0.25, 0.25, 0.12, col(0)); box(-1.05, -0.8, 0.12, 2.1, 1.6, 0.5, col(0)); box(-1.15, -0.9, 0.62, 2.3, 1.8, 0.13, col(0)); if (ZC > 0.75) box(-0.95, -0.7, 0.75, 1.9, 1.4, 0.0001, '#5a3a22'); }],
  litho: [1.75, () => { cyl(0, 0, 0, 0.8, 0.2, '#2b2b2e'); cyl(0, 0, 0.2, 0.62, 1.45, shade(col(0), 0.35)); if (ZC > 0.5) { const p = P(0, 0, Math.min(ZC, 1.1)); const gr = g.createRadialGradient(p[0], p[1], 1, p[0], p[1], k * 1.2); gr.addColorStop(0, 'rgba(255,230,160,.55)'); gr.addColorStop(1, 'rgba(255,230,160,0)'); g.fillStyle = gr; g.fillRect(p[0] - k * 1.3, p[1] - k * 1.3, k * 2.6, k * 2.6); } }],
  sign: [1.2, () => { box(-1.05, -0.3, 0, 2.1, 0.6, 0.18, col(2)); box(-0.95, -0.15, 0.18, 1.9, 0.3, 1.0, col(0)); box(-0.7, 0.15, 0.45, 0.32, 0.08, 0.5, col(1)); box(-0.25, 0.15, 0.45, 0.32, 0.08, 0.5, col(1)); box(0.2, 0.15, 0.45, 0.32, 0.08, 0.5, col(2)); }],
  fidget: [0.32, () => { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3 + 0.4; cyl(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0, 0.42, 0.28, col(0), 0.2); } cyl(0, 0, 0, 0.38, 0.32, col(0), 0.14); }],
  picase: [0.75, () => { box(-0.95, -0.75, 0, 1.9, 1.5, 0.75, col(0)); if (ZC > 0.75) for (let i = 0; i < 4; i++) box(-0.6 + i * 0.3, -0.5, 0.75, 0.12, 1.0, 0.0001, shade(col(0), -0.45)); }],
  insole: [0.22, () => { const sole = (x, y) => { box(x, y, 0, 0.55, 1.6, 0.14, col(0)); cyl(x + 0.27, y + 0.15, 0, 0.27, 0.2, col(0)); cyl(x + 0.27, y + 1.35, 0, 0.3, 0.2, col(0)); }; sole(-0.85, -0.85); sole(0.25, -0.65); }],
  chess: [1.6, () => { cone(-0.45, -0.3, 0, 0.5, 0.3, 0.25, col(0)); cone(-0.45, -0.3, 0.25, 0.28, 0.16, 0.7, col(0)); ball(-0.45, -0.3, 0.85, 0.3, col(0));
    cone(0.5, 0.45, 0, 0.5, 0.36, 0.25, col(1)); cyl(0.5, 0.45, 0.25, 0.32, 0.95, col(1)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; box(0.5 + Math.cos(a) * 0.24 - 0.08, 0.45 + Math.sin(a) * 0.24 - 0.08, 1.2, 0.16, 0.16, 0.22, col(1)); } }],
  racecar: [0.7, () => {
    box(-1.0, -0.62, 0, 0.32, 0.22, 0.3, '#2b2b2e'); box(0.68, -0.62, 0, 0.32, 0.22, 0.3, '#2b2b2e');
    box(-1.05, -0.45, 0.08, 2.1, 0.9, 0.28, col(0)); box(-0.3, -0.25, 0.36, 0.7, 0.5, 0.18, col(1)); box(-1.1, -0.55, 0.36, 0.28, 1.1, 0.08, col(2)); box(0.85, -0.5, 0.12, 0.3, 1.0, 0.1, col(3 % COLS.length));
    box(-1.0, 0.42, 0, 0.32, 0.22, 0.3, '#2b2b2e'); box(0.68, 0.42, 0, 0.32, 0.22, 0.3, '#2b2b2e'); }],
  knob: [0.75, () => { cyl(0, 0, 0, 0.75, 0.55, col(0)); cone(0, 0, 0.55, 0.75, 0.6, 0.18, col(0)); if (ZC > 0.73) box(-0.06, 0.05, 0.73, 0.12, 0.5, 0.0001, '#fff4e2'); }],
  drone: [0.5, () => { box(-1.05, -0.12, 0, 2.1, 0.24, 0.16, col(0)); box(-0.12, -1.05, 0, 0.24, 2.1, 0.16, col(0)); box(-0.3, -0.3, 0, 0.6, 0.6, 0.3, col(0));
    for (const [x, y] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]]) cyl(x, y, 0.16, 0.22, 0.2, col(0), 0.12); }],
  topo: [0.95, () => { box(-1, -1, 0, 2, 2, 0.22, col(0)); box(-0.75, -0.85, 0.22, 1.35, 1.45, 0.22, col(1)); box(-0.45, -0.55, 0.44, 0.85, 0.85, 0.24, col(2)); box(-0.2, -0.25, 0.68, 0.38, 0.4, 0.26, col(3 % COLS.length)); }],
  proto: [0.95, () => { box(-0.95, -0.95, 0, 0.85, 0.85, 0.6, col(0)); box(0.1, -0.9, 0, 0.8, 0.75, 0.95, col(0)); box(-0.9, 0.1, 0, 0.75, 0.8, 0.35, col(0)); cyl(0.5, 0.5, 0, 0.38, 0.7, col(0), 0.18); }],
  arch: [1.45, () => { box(-1.05, -0.8, 0, 2.1, 1.6, 0.18, col(0)); for (const [x, y] of [[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5], [0, 0.5], [0, -0.5]]) cyl(x, y, 0.18, 0.16, 0.8, col(0)); box(-1.0, -0.75, 0.98, 2.0, 1.5, 0.12, col(1)); roof(-1.0, -0.75, 1.1, 2.0, 1.5, 0.35, col(1)); }],
  grip: [1.45, () => { cyl(-0.45, -0.25, 0, 0.36, 1.45, col(0), 0.18); cyl(0.45, 0.35, 0, 0.36, 1.45, col(0), 0.18); }],
  bonsai: [1.9, () => {
    box(-0.95, -0.65, 0, 1.9, 1.3, 0.38, col(0)); box(-1.05, -0.75, 0.38, 2.1, 1.5, 0.1, col(0)); box(-0.85, -0.55, 0.48, 1.7, 1.1, 0.0001, '#5a3a22');
    const tr = '#7a4a2a'; cone(0, 0, 0.48, 0.24, 0.16, 0.5, tr); cone(0.1, 0.05, 0.98, 0.16, 0.1, 0.35, tr);
    const lf = col(1), lf2 = shade(col(1), 0.25);
    ball(-0.55, 0.15, 1.0, 0.38, lf); ball(0.55, -0.1, 1.12, 0.36, lf); ball(0.0, 0.0, 1.25, 0.45, lf2);
  }],
};
const BASES = { // default colours for icons / previews
  stand: ['#FF8000'], clips: ['#3D7BD9', '#6BB34A', '#F2C230'], keys: ['#E0473C', '#2FA8A0'], helmet: ['#F4EFE6'], figure: ['#C8874A', '#E3A868', '#8A5A32', '#2B2B2E'],
  gears: ['#5DADE2'], vase: ['#2FA8A0'], case: ['#8E6BD1'], bumper: ['#F08BB0'], vent: ['#2B2B2E'], bracket: ['#3a3a40'], insert: ['#6BB34A', '#F2C230'],
  pot: ['#B8642A'], litho: ['#F2C230'], sign: ['#FF8000', '#F4EFE6', '#2B2B2E'], fidget: ['#F08BB0'], picase: ['#E0473C'], insole: ['#3D7BD9'],
  chess: ['#F4EFE6', '#2B2B2E'], racecar: ['#FF8000', '#2B2B2E', '#F4EFE6', '#3D7BD9'], knob: ['#2B2B2E'], drone: ['#E0473C'], topo: ['#3D7BD9', '#6BB34A', '#F2C230', '#F4EFE6'],
  proto: ['#5DADE2'], arch: ['#F4EFE6', '#E0473C'], grip: ['#2B2B2E'], bonsai: ['#B8642A', '#5f9e4a'],
};

/* draw model `id` with its base centre at screen (cx, cy), k = pixels per model unit, frac = printed fraction (0..1) */
function draw(ctx, id, colors, cx, cy, kk, frac, opts) {
  const m = MODELS[id] || MODELS.proto;
  opts = opts || {};
  g = ctx; CX = cx; CY = cy; k = kk; LW = Math.max(0.6, kk * 0.035);
  COLS = colors && colors.length ? colors : (BASES[id] || ['#cccccc']);
  MYS = opts.mystery ? (opts.time || 0) + 1 : 0;
  const f = frac == null ? 1 : Math.max(0, Math.min(1, frac));
  ZC = f >= 1 ? 99 : m[0] * f;
  if (f <= 0) return 0;
  g.save(); g.lineJoin = 'round';
  m[1]();
  if (f < 1 && opts.glow !== false) { // hot fresh layer glint
    const p = P(0, 0, ZC);
    g.fillStyle = 'rgba(255,236,190,.75)'; g.beginPath(); g.arc(p[0] + Math.sin((opts.time || 0) * 9) * k * 0.6, p[1], Math.max(1.2, k * 0.08), 0, 7); g.fill();
  }
  g.restore();
  return m[0] * f;
}
const height = (id) => (MODELS[id] || MODELS.proto)[0];
BL.Models = { draw, height, BASES, has: (id) => !!MODELS[id], shade };
})(typeof window !== 'undefined' ? window : globalThis);
