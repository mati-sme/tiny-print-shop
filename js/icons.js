/* Tiny Print Shop - every UI icon, drawn in code (no emoji, no image files). Chunky "sticker" style with a cocoa outline and
 * isometric boxes where it makes sense, to match the canvas scene. Icons are drawn once per size into a cached canvas;
 * the DOM uses them as CSS background images (html()), the scene blits them (draw()). Order icons ("o:<template>")
 * are the same little 3D models that grow on the build plates (js/models.js). */
(function (root) {
'use strict';
const BL = root.BL = root.BL || {};
const OL = '#4a2c17';
let g = null, LW = 5.5;
const TAU = Math.PI * 2;

/* ---------- drawing helpers (100 x 100 design space) ---------- */
function fs(fill, lw) { if (fill) { g.fillStyle = fill; g.fill(); } if (lw !== 0) { g.lineWidth = lw || LW; g.strokeStyle = OL; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); } }
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
function ell(x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
function poly(pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function line(pts, w, c) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineWidth = w || LW; g.strokeStyle = c || OL; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
function shine(x, y, r, a0, a1) { g.beginPath(); g.arc(x, y, r, a0, a1); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineCap = 'round'; g.stroke(); }
const sh = (c, f) => BL.Models.shade(c, f);
/* iso box: top face centred on (cx, cy), half-width w (2:1 diamond), side height h */
function cube(cx, cy, w, h, c, o) {
  o = o || {};
  const d = w / 2;
  poly([[cx - w, cy], [cx, cy + d], [cx, cy + d + h], [cx - w, cy + h]]); fs(o.left || sh(c, -0.08));
  poly([[cx + w, cy], [cx, cy + d], [cx, cy + d + h], [cx + w, cy + h]]); fs(o.right || sh(c, -0.3));
  poly([[cx - w, cy], [cx, cy - d], [cx + w, cy], [cx, cy + d]]); fs(o.top || sh(c, 0.15));
}
function star(x, y, r, fill, inner) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * (inner || 0.48) : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  g.closePath(); fs(fill);
}
function spoolSide(x, y, r, c, fill) { // spool seen face-on, slightly tilted
  ell(x + r * 0.16, y + r * 0.04, r * 0.86, r, 0); fs('#26262a'); ell(x, y, r * 0.86, r, 0); fs('#3a3a40');
  if (fill > 0) { ell(x, y, r * 0.86 * (0.5 + 0.42 * fill), r * (0.5 + 0.42 * fill)); fs(c, 3); for (let i = 1; i < 3; i++) { ell(x, y, r * 0.86 * (0.5 + 0.14 * i * fill), r * (0.5 + 0.14 * i * fill)); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.18)'; g.stroke(); } }
  ell(x, y, r * 0.3, r * 0.35); fs('#d8cdbd', 3);
  circ(x, y, r * 0.11); fs('#3a3a40', 0);
}
function arrowArc(cx, cy, r, a0, a1, c, w) {
  g.beginPath(); g.arc(cx, cy, r, a0, a1); g.lineWidth = (w || 9) + 5; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke();
  g.lineWidth = w || 9; g.strokeStyle = c; g.stroke();
  const ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r, t = a1 + Math.PI / 2, s = 12;
  poly([[ex + Math.cos(t) * s * 1.1, ey + Math.sin(t) * s * 1.1], [ex + Math.cos(t - 2.2) * s, ey + Math.sin(t - 2.2) * s], [ex + Math.cos(t + 2.2) * s, ey + Math.sin(t + 2.2) * s]]); fs(c, 4);
}
function face(x, y, s, mood) { // tiny printer-screen style face
  g.fillStyle = OL; g.lineCap = 'round';
  if (mood === 'sad') { circ(x - s, y - s * 0.3, s * 0.32); g.fill(); circ(x + s, y - s * 0.3, s * 0.32); g.fill(); g.beginPath(); g.arc(x, y + s * 1.2, s * 0.8, Math.PI * 1.15, Math.PI * 1.85); g.lineWidth = 4; g.strokeStyle = OL; g.stroke(); }
  else { circ(x - s, y - s * 0.3, s * 0.32); g.fill(); circ(x + s, y - s * 0.3, s * 0.32); g.fill(); g.beginPath(); g.arc(x, y + s * 0.1, s * 0.8, 0.2, Math.PI - 0.2); g.lineWidth = 4; g.strokeStyle = OL; g.stroke(); }
}
const PAP = '#FF8000', GOLD = '#F7C52B', CREAM = '#FFF4E2', RED = '#E0473C', GREEN = '#5DB548', BLUE = '#4A90D9', TEAL = '#2FA8A0', GREY = '#9a9aa2', DARK = '#3a3a40', WOOD = '#b8743a', PURP = '#8E6BD1';

/* ---------- the icon set ---------- */
const I = {
  coin() { circ(50, 52, 36); fs('#E9A91B'); circ(50, 48, 36); fs(GOLD); circ(50, 48, 26); g.lineWidth = 3; g.strokeStyle = '#c98a10'; g.stroke();
    g.fillStyle = '#a86a00'; g.font = '900 40px Fredoka, Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 50, 50); shine(50, 48, 30, 3.6, 4.4); },
  cash() { g.save(); g.translate(50, 54); g.rotate(-0.18); rr(-40, -22, 80, 44, 8); fs('#8fd17a'); rr(-30, -14, 60, 28, 6); fs('#bfe8a8', 3); circ(0, 0, 10); fs('#5DB548', 3); g.restore(); },
  star() { star(50, 53, 42, GOLD); g.save(); g.globalAlpha = 0.55; star(46, 47, 16, '#fff4b0', 0.5); g.restore(); },
  starO() { star(50, 53, 40, '#e8d9c0'); },
  medal() { poly([[30, 6], [46, 6], [56, 40], [40, 40]]); fs(RED); poly([[70, 6], [54, 6], [44, 40], [60, 40]]); fs(BLUE); circ(50, 62, 30); fs(PAP); star(50, 63, 19, GOLD); },
  trophy() { g.beginPath(); g.arc(24, 34, 12, Math.PI * 0.5, Math.PI * 1.5); g.lineWidth = 12; g.strokeStyle = OL; g.stroke(); g.lineWidth = 6; g.strokeStyle = GOLD; g.stroke();
    g.beginPath(); g.arc(76, 34, 12, -Math.PI * 0.5, Math.PI * 0.5); g.lineWidth = 12; g.strokeStyle = OL; g.stroke(); g.lineWidth = 6; g.strokeStyle = GOLD; g.stroke();
    g.beginPath(); g.moveTo(24, 16); g.lineTo(76, 16); g.quadraticCurveTo(76, 62, 50, 64); g.quadraticCurveTo(24, 62, 24, 16); g.closePath(); fs(GOLD);
    rr(42, 62, 16, 14, 3); fs('#E9A91B'); rr(28, 76, 44, 14, 5); fs(WOOD); star(50, 36, 11, '#fff4b0'); },
  expo() { poly([[10, 86], [50, 22], [90, 86]]); fs(CREAM); g.save(); poly([[10, 86], [50, 22], [90, 86]]); g.clip();
    for (let i = -3; i < 4; i += 2) { poly([[50, 22], [50 + i * 14, 90], [50 + (i + 1) * 14, 90]]); g.fillStyle = PAP; g.fill(); } g.restore();
    poly([[10, 86], [50, 22], [90, 86]]); fs(null); poly([[40, 86], [50, 62], [60, 86]]); fs('#5a3a22'); line([[50, 22], [50, 6]], 4); poly([[51, 6], [68, 11], [51, 16]]); fs(RED, 3); },
  clock() { rr(42, 6, 16, 10, 3); fs(GREY); circ(50, 56, 36); fs(CREAM); circ(50, 56, 28); g.lineWidth = 3; g.strokeStyle = '#e3c9a3'; g.stroke();
    line([[50, 56], [50, 36]], 6); line([[50, 56], [64, 64]], 6); circ(50, 56, 5); fs(PAP, 3); },
  hourglass() { rr(22, 8, 56, 10, 4); fs(WOOD); rr(22, 82, 56, 10, 4); fs(WOOD);
    poly([[30, 18], [70, 18], [54, 50], [70, 82], [30, 82], [46, 50]]); fs('rgba(210,235,255,.9)'); poly([[38, 30], [62, 30], [50, 46]]); fs(GOLD, 0); poly([[36, 80], [64, 80], [50, 64]]); fs(GOLD, 0);
    poly([[30, 18], [70, 18], [54, 50], [70, 82], [30, 82], [46, 50]]); fs(null); },
  house() { rr(20, 44, 60, 44, 4); fs('#f2e2c4'); poly([[10, 48], [50, 12], [90, 48]]); fs(RED); rr(64, 18, 10, 18, 2); fs(sh(RED, -0.2));
    rr(42, 62, 16, 26, 3); fs(WOOD, 4); rr(26, 54, 12, 12, 2); fs('#9ad3ff', 3); rr(62, 54, 12, 12, 2); fs('#9ad3ff', 3); },
  garage() { poly([[10, 44], [50, 14], [90, 44]]); fs(PAP); rr(16, 42, 68, 46, 4); fs(CREAM); rr(26, 54, 48, 34, 3); fs('#d9c3a0');
    for (let i = 0; i < 4; i++) line([[28, 61 + i * 7], [72, 61 + i * 7]], 2.5, '#a8855a'); rr(26, 54, 48, 34, 3); fs(null, 4); },
  workshop() { poly([[8, 88], [8, 40], [34, 24], [34, 40], [60, 24], [60, 40], [92, 22], [92, 88]]); fs('#a9c48a');
    rr(18, 56, 16, 14, 2); fs('#ffe9a8', 3); rr(44, 56, 16, 14, 2); fs('#ffe9a8', 3); rr(68, 52, 16, 36, 2); fs(WOOD, 3); },
  factory() { rr(66, 10, 14, 40, 2); fs(GREY); poly([[8, 90], [8, 48], [30, 36], [30, 48], [52, 36], [52, 48], [92, 30], [92, 90]]); fs('#c9b8e0');
    for (let i = 0; i < 3; i++) { rr(16 + i * 24, 62, 14, 12, 2); fs('#ffe9a8', 3); } circ(73, 6, 6); fs('#e8e8e8', 2); },
  fast() { poly([[10, 22], [48, 50], [10, 78]]); fs(PAP); poly([[48, 22], [86, 50], [48, 78]]); fs(PAP); },
  pause() { rr(22, 18, 20, 64, 6); fs(CREAM); rr(58, 18, 20, 64, 6); fs(CREAM); },
  play() { poly([[26, 14], [84, 50], [26, 86]]); fs(GREEN); },
  inbox() { poly([[50, 22], [90, 42], [50, 62], [10, 42]]); fs('#fffaf0'); poly([[10, 42], [50, 62], [50, 84], [10, 64]]); fs('#d9b98f'); poly([[90, 42], [50, 62], [50, 84], [90, 64]]); fs('#b8956a');
    poly([[34, 30], [66, 30], [62, 46], [38, 46]]); fs('#fff', 3); line([[42, 36], [58, 36]], 3, '#c9a27a'); },
  spool(c) { c = c || PAP; spoolSide(46, 50, 40, c, 1); },
  spoolEmpty() { spoolSide(50, 50, 40, '#ccc', 0); g.setLineDash([4, 6]); circ(50, 50, 22); g.lineWidth = 3; g.strokeStyle = '#999'; g.stroke(); g.setLineDash([]); },
  myspool() { ell(50, 50, 34, 40); fs('#3a3a40'); const cs = ['#f66', '#fd6', '#6d6', '#6cf', '#a8f'];
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(50, 50); g.ellipse(50, 50, 30, 36, 0, i * TAU / 5 - 1.57, (i + 1) * TAU / 5 - 1.57); g.closePath(); g.fillStyle = cs[i]; g.fill(); }
    ell(50, 50, 30, 36); fs(null, 3); ell(50, 50, 10, 12); fs('#d8cdbd', 3); circ(50, 50, 4); fs(DARK, 0); },
  nozzle() { poly([[26, 14], [74, 14], [80, 30], [74, 46], [26, 46], [20, 30]]); fs('#E2B53A'); line([[34, 20], [34, 40]], 3, 'rgba(255,255,255,.55)');
    poly([[36, 46], [64, 46], [56, 74], [44, 74]]); fs('#d4a12a'); poly([[44, 74], [56, 74], [50, 88]]); fs('#b8860b'); },
  nozzles() { g.save(); g.translate(-14, 4); g.scale(0.7, 0.7); I.nozzle(); g.restore(); g.save(); g.translate(44, 4); g.scale(0.7, 0.7); I.nozzle(); g.restore(); g.save(); g.translate(15, 26); g.scale(0.7, 0.7); I.nozzle(); g.restore(); },
  clog() { I.nozzle(); circ(66, 80, 13); fs('#8a8a8a'); circ(30, 20, 8); fs('rgba(160,160,160,.9)', 3); circ(20, 8, 5); fs('rgba(180,180,180,.9)', 3); line([[72, 22], [88, 8]], 7, RED); line([[88, 22], [72, 8]], 7, RED); },
  truck() { rr(6, 30, 52, 40, 5); fs(PAP); poly([[58, 40], [80, 40], [94, 56], [94, 70], [58, 70]]); fs(CREAM); poly([[64, 45], [78, 45], [87, 56], [64, 56]]); fs('#9ad3ff', 3);
    circ(26, 74, 11); fs(DARK); circ(26, 74, 4); fs(GREY, 0); circ(76, 74, 11); fs(DARK); circ(76, 74, 4); fs(GREY, 0); line([[14, 42], [46, 42]], 4, '#fff'); },
  cart() { line([[6, 18], [20, 18], [30, 66], [80, 66]], 7); poly([[22, 28], [90, 28], [82, 56], [28, 56]]); fs(PAP);
    cube(42, 22, 10, 10, BLUE); cube(64, 20, 10, 12, GREEN); circ(36, 80, 8); fs(DARK); circ(74, 80, 8); fs(DARK); },
  wrench() { g.save(); g.translate(50, 50); g.rotate(-0.78); rr(-8, -6, 16, 46, 6); fs(GREY); g.beginPath(); g.arc(0, -22, 18, 0, TAU); fs(GREY); rr(-6, -46, 12, 22, 2); fs(CREAM, 0); g.restore(); },
  tools() { g.save(); g.translate(50, 50); g.rotate(0.78); rr(-6, -40, 12, 56, 4); fs('#c9c9d0'); rr(-9, 10, 18, 32, 6); fs(PAP); g.restore(); I.wrench(); },
  toolbox() { rr(32, 12, 36, 18, 6); fs(null, 7); rr(32, 12, 36, 18, 6); g.lineWidth = 3; g.strokeStyle = RED; g.stroke(); rr(10, 30, 80, 56, 8); fs(RED); rr(10, 30, 80, 18, 8); fs(sh(RED, 0.15)); rr(42, 42, 16, 12, 3); fs(GOLD, 4); },
  help() { circ(50, 50, 40); fs(BLUE); g.fillStyle = '#fff'; g.font = '900 56px Fredoka, Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 51, 54); shine(50, 50, 32, 3.7, 4.5); },
  close() { line([[24, 24], [76, 76]], 14); line([[76, 24], [24, 76]], 14); line([[24, 24], [76, 76]], 7, CREAM); line([[76, 24], [24, 76]], 7, CREAM); },
  check(c) { line([[16, 52], [40, 76], [86, 24]], 18); line([[16, 52], [40, 76], [86, 24]], 9, c || GREEN); },
  plus() { line([[50, 16], [50, 84]], 18); line([[16, 50], [84, 50]], 18); line([[50, 16], [50, 84]], 9, '#fff'); line([[16, 50], [84, 50]], 9, '#fff'); },
  speaker(on) { poly([[12, 38], [30, 38], [54, 16], [54, 84], [30, 62], [12, 62]]); fs(CREAM);
    if (on) { g.beginPath(); g.arc(56, 50, 16, -0.9, 0.9); g.lineWidth = 6; g.strokeStyle = OL; g.stroke(); g.beginPath(); g.arc(56, 50, 30, -0.9, 0.9); g.stroke(); }
    else { line([[66, 34], [90, 66]], 7, RED); line([[90, 34], [66, 66]], 7, RED); } },
  sound() { I.speaker(true); }, soundOff() { I.speaker(false); },
  note(on) { line([[40, 70], [40, 18], [80, 10], [80, 62]], 7); poly([[40, 18], [80, 10], [80, 24], [40, 32]]); fs(OL, 0);
    ell(30, 72, 13, 10, -0.4); fs(on ? PAP : '#cdbca4'); ell(70, 64, 13, 10, -0.4); fs(on ? PAP : '#cdbca4'); if (!on) line([[14, 14], [88, 88]], 8, RED); },
  music() { I.note(true); }, musicOff() { I.note(false); },
  flask() { poly([[38, 10], [62, 10], [62, 38], [86, 82], [80, 90], [20, 90], [14, 82], [38, 38]]); fs('rgba(220,240,255,.95)');
    poly([[26, 62], [74, 62], [86, 82], [80, 90], [20, 90], [14, 82]]); fs(GREEN, 0); poly([[38, 10], [62, 10], [62, 38], [86, 82], [80, 90], [20, 90], [14, 82], [38, 38]]); fs(null);
    circ(42, 74, 5); fs('#bff0a0', 0); circ(58, 80, 3); fs('#bff0a0', 0); rr(34, 6, 32, 8, 3); fs(CREAM, 4); },
  map() { poly([[8, 22], [34, 12], [66, 22], [92, 12], [92, 78], [66, 88], [34, 78], [8, 88]]); fs('#f6e3c4'); poly([[34, 12], [66, 22], [66, 88], [34, 78]]); fs('#ead2ae', 0);
    poly([[8, 22], [34, 12], [66, 22], [92, 12], [92, 78], [66, 88], [34, 78], [8, 88]]); fs(null); g.setLineDash([5, 6]); line([[18, 72], [40, 52], [58, 60], [76, 36]], 4, RED); g.setLineDash([]);
    circ(76, 32, 9); fs(PAP, 4); },
  gear() { g.save(); g.translate(50, 50); g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = i % 2 ? 30 : 40; g.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); g.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); } g.closePath(); fs('#b8b8c0'); circ(0, 0, 13); fs(CREAM); g.restore(); },
  lock() { g.beginPath(); g.arc(50, 42, 20, Math.PI, 0); g.lineWidth = 16; g.strokeStyle = OL; g.stroke(); g.lineWidth = 8; g.strokeStyle = GREY; g.stroke(); rr(20, 42, 60, 46, 8); fs(GOLD); circ(50, 60, 6); fs(OL, 0); rr(47, 62, 6, 14, 2); fs(OL, 0); },
  warn() { poly([[50, 8], [94, 88], [6, 88]]); fs(GOLD); rr(44, 32, 12, 32, 5); fs(OL, 0); circ(50, 75, 6); fs(OL, 0); },
  bang() { circ(50, 50, 40); fs(RED); rr(43, 20, 14, 38, 6); fs('#fff', 0); circ(50, 72, 8); fs('#fff', 0); },
  recycle() { const c = GREEN; arrowArc(50, 52, 30, -2.6, -1.2, c, 10); arrowArc(50, 52, 30, -0.5, 0.9, c, 10); arrowArc(50, 52, 30, 1.6, 3.0, c, 10); },
  scrap() { const cs = [RED, BLUE, GOLD, GREEN, PAP, PURP]; for (let i = 0; i < 9; i++) { const x = 22 + (i * 37 % 56), y = 40 + (i * 23 % 40); g.save(); g.translate(x, y); g.rotate(i); rr(-9, -6, 18, 12, 3); fs(cs[i % 6], 3); g.restore(); } },
  undo() { arrowArc(50, 55, 26, -0.3, -3.6 + 0.4, BLUE, 10); },
  sparkle() { const sp = (x, y, r) => { g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); fs(GOLD, 4); }; sp(42, 56, 34); sp(78, 22, 16); sp(80, 78, 10); },
  bolt() { poly([[58, 6], [18, 56], [46, 56], [38, 94], [82, 40], [54, 40]]); fs(GOLD); },
  palette() { g.beginPath(); g.moveTo(50, 10); g.bezierCurveTo(90, 10, 96, 50, 84, 66); g.bezierCurveTo(74, 80, 60, 64, 52, 76); g.bezierCurveTo(44, 90, 8, 86, 8, 52); g.bezierCurveTo(8, 26, 26, 10, 50, 10); fs('#f2d7a6');
    [[30, 34, RED], [52, 26, GOLD], [72, 36, GREEN], [28, 58, BLUE]].forEach(([x, y, c]) => { circ(x, y, 8); fs(c, 3); }); },
  cube() { cube(50, 34, 36, 40, '#9ad3ff', { top: 'rgba(200,235,255,.95)', left: 'rgba(150,205,240,.95)', right: 'rgba(110,170,215,.95)' }); line([[24, 40], [36, 46]], 3, 'rgba(255,255,255,.8)'); },
  glassbox() { cube(50, 32, 36, 42, '#ffc890', { top: 'rgba(255,225,190,.9)', left: 'rgba(255,205,150,.75)', right: 'rgba(240,180,120,.75)' }); rr(36, 56, 14, 18, 3); fs(PAP, 3); },
  wind() { line([[10, 36], [62, 36]], 7); g.beginPath(); g.arc(62, 26, 10, Math.PI / 2, -Math.PI * 0.8, true); g.lineWidth = 7; g.strokeStyle = OL; g.stroke();
    line([[10, 56], [76, 56]], 7); g.beginPath(); g.arc(76, 66, 10, -Math.PI / 2, Math.PI * 0.8); g.stroke(); line([[20, 74], [50, 74]], 7); },
  battery() { rr(14, 26, 66, 48, 8); fs(CREAM); rr(80, 40, 8, 20, 3); fs(GREY, 4); rr(22, 34, 16, 32, 3); fs(GREEN, 0); rr(42, 34, 16, 32, 3); fs(GREEN, 0); rr(62, 34, 10, 32, 3); fs('#bfe8a8', 0); },
  glue() { rr(30, 32, 40, 58, 8); fs('#9b6bd1'); rr(30, 32, 40, 14, 6); fs(CREAM); rr(36, 10, 28, 24, 6); fs('#fff8c0'); rr(36, 56, 28, 18, 4); fs(CREAM, 3); },
  sponge() { cube(50, 40, 38, 20, '#F2D44A'); poly([[12, 40], [50, 21], [88, 40], [50, 59]]); g.fillStyle = sh('#5DB548', 0.1); g.fill(); poly([[12, 40], [50, 21], [88, 40], [50, 59]]); fs(null, 4);
    for (const [x, y] of [[30, 66], [44, 72], [62, 70], [76, 62]]) { circ(x, y, 3); fs('#c9a020', 0); } },
  tap() { circ(46, 40, 30); g.lineWidth = 4; g.strokeStyle = 'rgba(255,128,0,.5)'; g.stroke(); circ(46, 40, 18); g.strokeStyle = 'rgba(255,128,0,.8)'; g.stroke();
    g.save(); g.translate(56, 54); g.rotate(-0.35); rr(-9, -26, 18, 44, 9); fs(CREAM); rr(-20, 4, 40, 34, 14); fs(CREAM); g.restore(); },
  hand() { g.save(); g.translate(50, 54); g.rotate(-0.25); rr(-10, -44, 20, 52, 10); fs('#ffe0bd'); rr(-24, -2, 48, 44, 16); fs('#ffe0bd'); line([[-10, 6], [-10, 18]], 3, '#d8a878'); line([[2, 6], [2, 18]], 3, '#d8a878'); line([[14, 6], [14, 18]], 3, '#d8a878'); g.restore(); },
  heart(c) { g.beginPath(); g.moveTo(50, 86); g.bezierCurveTo(8, 58, 6, 30, 26, 18); g.bezierCurveTo(40, 10, 50, 22, 50, 30); g.bezierCurveTo(50, 22, 60, 10, 74, 18); g.bezierCurveTo(94, 30, 92, 58, 50, 86); fs(c || '#F06292'); shine(32, 34, 10, 3.4, 4.6); },
  frown() { circ(50, 50, 38); fs('#ffd36b'); face(50, 48, 13, 'sad'); },
  smile() { circ(50, 50, 38); fs('#ffd36b'); face(50, 46, 13, 'happy'); },
  calendar() { rr(12, 18, 76, 70, 8); fs('#fff'); rr(12, 18, 76, 20, 8); fs(RED); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { rr(20 + j * 16, 46 + i * 13, 10, 8, 2); fs(i === 1 && j === 2 ? PAP : '#d9c3a0', 0); } line([[30, 10], [30, 26]], 6); line([[70, 10], [70, 26]], 6); },
  ruler() { g.save(); g.translate(50, 50); g.rotate(-0.6); rr(-44, -14, 88, 28, 4); fs(GOLD); for (let i = -36; i <= 36; i += 9) line([[i, -14], [i, i % 18 === 0 ? -1 : -6]], 3); g.restore(); },
  setsquare() { poly([[14, 88], [14, 14], [88, 88]]); fs(GOLD); poly([[28, 74], [28, 48], [54, 74]]); fs(CREAM, 4); for (let i = 22; i < 84; i += 10) line([[14, i], [20, i]], 3); },
  camera() { rr(8, 28, 84, 56, 10); fs(DARK); rr(18, 18, 26, 14, 4); fs(DARK); circ(52, 56, 22); fs('#c9c9d0'); circ(52, 56, 13); fs('#2a4a7a'); circ(47, 51, 4); fs('#fff', 0); circ(80, 38, 5); fs(RED, 0); },
  flashlight() { g.save(); g.translate(40, 60); g.rotate(-0.6); rr(-10, -6, 20, 46, 5); fs(DARK); poly([[-16, -6], [16, -6], [12, -22], [-12, -22]]); fs(GREY); g.restore();
    g.save(); g.globalAlpha = 0.85; poly([[46, 38], [92, 6], [96, 40]]); g.fillStyle = '#ffe98a'; g.fill(); g.restore(); line([[60, 30], [86, 14]], 2.5, '#ffb400'); line([[62, 36], [90, 30]], 2.5, '#ffb400'); },
  notebook() { rr(18, 10, 64, 80, 6); fs(PAP); rr(26, 10, 56, 80, 6); fs(sh(PAP, 0.08)); for (let i = 0; i < 5; i++) { circ(18, 20 + i * 15, 5); fs(GREY, 3); } rr(36, 26, 36, 14, 3); fs(CREAM, 3); },
  crate() { cube(50, 32, 38, 40, WOOD); line([[12, 48], [50, 67]], 3, '#7a4a2a'); line([[88, 48], [50, 67]], 3, '#7a4a2a'); ell(36, 30, 10, 6); fs(BLUE, 3); ell(60, 30, 10, 6); fs(RED, 3); ell(48, 24, 10, 6); fs(GREEN, 3); },
  swap() { arrowArc(50, 50, 30, -2.9, -0.4, PAP, 9); arrowArc(50, 50, 30, 0.25, 2.75, BLUE, 9); },
  dryer() { cube(50, 46, 36, 34, '#e8e0d2'); rr(30, 64, 20, 6, 2); fs(GREEN, 2); for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(34 + i * 16, 36); g.bezierCurveTo(28 + i * 16, 26, 42 + i * 16, 20, 34 + i * 16, 6); g.lineWidth = 5; g.strokeStyle = RED; g.lineCap = 'round'; g.stroke(); } },
  flame(c) { g.beginPath(); g.moveTo(50, 92); g.bezierCurveTo(14, 90, 14, 52, 34, 34); g.bezierCurveTo(32, 50, 42, 54, 44, 50); g.bezierCurveTo(40, 30, 50, 14, 62, 6); g.bezierCurveTo(60, 26, 88, 40, 84, 66); g.bezierCurveTo(82, 84, 66, 92, 50, 92); fs(c || PAP);
    g.beginPath(); g.moveTo(50, 88); g.bezierCurveTo(34, 86, 34, 66, 46, 56); g.bezierCurveTo(48, 66, 56, 64, 58, 58); g.bezierCurveTo(70, 70, 64, 88, 50, 88); fs(c ? '#c8f0ff' : GOLD, 0); },
  comet() { g.save(); g.globalAlpha = 0.9; poly([[10, 18], [54, 46], [44, 58]]); g.fillStyle = '#9ad3ff'; g.fill(); poly([[24, 8], [60, 40], [52, 48]]); g.fillStyle = '#c8e8ff'; g.fill(); g.restore(); g.save(); g.translate(14, 20); g.scale(0.78, 0.78); I.flame(BLUE); g.restore(); },
  megaphone() { poly([[14, 40], [36, 40], [80, 16], [80, 84], [36, 60], [14, 60]]); fs(PAP); ell(80, 50, 8, 34); fs(CREAM); rr(30, 60, 12, 24, 4); fs(DARK); line([[88, 30], [96, 24]], 4); line([[90, 50], [98, 50]], 4); },
  waffle() { poly([[50, 22], [92, 44], [50, 66], [8, 44]]); fs('#d4a84a'); poly([[8, 44], [50, 66], [50, 74], [8, 52]]); fs('#a8802e'); poly([[92, 44], [50, 66], [50, 74], [92, 52]]); fs('#8a6a20');
    g.save(); poly([[50, 22], [92, 44], [50, 66], [8, 44]]); g.clip(); for (let i = -4; i < 5; i++) { line([[30 + i * 10, 12 + i * 5], [70 + i * 10, 32 + i * 5]], 2, 'rgba(90,60,10,.4)'); line([[70 - i * 10, 12 + i * 5], [30 - i * 10, 32 + i * 5]], 2, 'rgba(90,60,10,.4)'); } g.restore(); },
  drybox() { cube(50, 30, 38, 46, '#cfe8f0'); poly([[18, 42], [44, 55], [44, 78], [18, 65]]); fs('rgba(255,255,255,.6)', 3); ell(31, 58, 8, 11); fs(PAP, 3); },
  clipboard() { rr(16, 14, 68, 78, 8); fs(WOOD); rr(24, 22, 52, 64, 4); fs('#fff'); rr(36, 8, 28, 14, 4); fs(GREY); for (let i = 0; i < 4; i++) { line([[32, 36 + i * 13], [40, 36 + i * 13]], 4, GREEN); line([[46, 36 + i * 13], [68, 36 + i * 13]], 4, '#c9a27a'); } },
  cat() { poly([[18, 40], [24, 10], [44, 30]]); fs('#e88a3a'); poly([[82, 40], [76, 10], [56, 30]]); fs('#e88a3a'); ell(50, 54, 38, 32); fs('#f09a4a');
    line([[50, 26], [50, 34]], 3, '#b8642a'); line([[40, 28], [42, 34]], 3, '#b8642a'); line([[60, 28], [58, 34]], 3, '#b8642a'); ell(36, 52, 5, 7); fs(OL, 0); ell(64, 52, 5, 7); fs(OL, 0);
    poly([[46, 62], [54, 62], [50, 67]]); fs('#f06292', 2); line([[14, 62], [30, 64]], 2.5); line([[86, 62], [70, 64]], 2.5); },
  signboard() { line([[30, 90], [30, 50]], 8); line([[70, 90], [70, 50]], 8); rr(8, 14, 84, 46, 8); fs(PAP); rr(16, 22, 68, 30, 4); fs(CREAM, 3); line([[26, 37], [74, 37]], 5, PAP); },
  mug() { g.beginPath(); g.arc(78, 54, 13, -1.4, 1.4); g.lineWidth = 14; g.strokeStyle = OL; g.stroke(); g.lineWidth = 7; g.strokeStyle = CREAM; g.stroke(); rr(18, 32, 58, 56, 10); fs(CREAM); ell(47, 34, 27, 6); fs('#7a4a2a', 3);
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(38 + i * 18, 24); g.bezierCurveTo(32 + i * 18, 16, 44 + i * 18, 12, 38 + i * 18, 4); g.lineWidth = 4; g.strokeStyle = '#c9a27a'; g.stroke(); } rr(34, 54, 26, 16, 4); fs(PAP, 3); },
  ice() { cube(50, 34, 34, 36, '#bfe6ff', { top: '#e6f6ff', left: '#a8dcff', right: '#7fc0ee' }); line([[28, 48], [36, 52]], 4, '#fff'); line([[28, 58], [32, 60]], 4, '#fff'); },
  hardhat() { g.beginPath(); g.moveTo(14, 66); g.bezierCurveTo(14, 20, 86, 20, 86, 66); g.closePath(); fs(GOLD); rr(6, 62, 88, 14, 6); fs(sh(GOLD, -0.1)); rr(44, 22, 12, 40, 4); fs(sh(GOLD, 0.2), 3); },
  slider() { for (let i = 0; i < 3; i++) { line([[16, 24 + i * 26], [84, 24 + i * 26]], 6, '#c9a27a'); const x = [34, 66, 46][i]; rr(x - 9, 14 + i * 26, 18, 20, 5); fs([PAP, BLUE, GREEN][i], 4); } },
  eyeoff() { g.beginPath(); g.moveTo(8, 50); g.quadraticCurveTo(50, 10, 92, 50); g.quadraticCurveTo(50, 90, 8, 50); fs('#fff'); circ(50, 50, 14); fs('#6a4a2a', 3); line([[16, 84], [84, 16]], 8, RED); },
  shrug() { circ(50, 50, 38); fs('#ffd36b'); circ(37, 44, 4); fs(OL, 0); circ(63, 44, 4); fs(OL, 0); line([[36, 64], [64, 64]], 5); },
  reboot() { g.beginPath(); g.arc(50, 54, 30, -1.1, 4.2); g.lineWidth = 16; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke(); g.lineWidth = 8; g.strokeStyle = GREEN; g.stroke(); line([[50, 12], [50, 50]], 16); line([[50, 12], [50, 50]], 8, GREEN); },
  trash() { rr(22, 30, 56, 60, 6); fs(GREY); rr(14, 18, 72, 12, 4); fs(sh(GREY, 0.2)); rr(40, 10, 20, 10, 3); fs(sh(GREY, 0.2)); for (let i = 0; i < 3; i++) line([[36 + i * 14, 42], [36 + i * 14, 78]], 4, '#6a6a72'); },
  plug() { rr(26, 34, 48, 34, 10); fs(DARK); rr(36, 14, 8, 22, 3); fs(GREY); rr(56, 14, 8, 22, 3); fs(GREY); line([[50, 68], [50, 92]], 9); poly([[70, 54], [86, 40], [80, 54], [94, 54], [76, 72], [82, 58]]); fs(GOLD, 3); },
  belt() { g.beginPath(); g.moveTo(20, 30); g.lineTo(46, 30); g.lineTo(42, 40); g.lineTo(50, 46); g.lineWidth = 9; g.strokeStyle = OL; g.lineCap = 'round'; g.stroke(); g.lineWidth = 4; g.strokeStyle = GREY; g.stroke();
    g.beginPath(); g.moveTo(80, 70); g.lineTo(54, 70); g.lineTo(58, 60); g.lineTo(52, 54); g.lineWidth = 9; g.strokeStyle = OL; g.stroke(); g.lineWidth = 4; g.strokeStyle = GREY; g.stroke();
    circ(20, 50, 16); fs('#c9c9d0'); circ(20, 50, 5); fs(DARK, 0); circ(80, 50, 16); fs('#c9c9d0'); circ(80, 50, 5); fs(DARK, 0); line([[46, 20], [54, 12]], 4, RED); line([[60, 84], [66, 92]], 4, RED); },
  spaghetti() { const cs = [PAP, RED, GOLD]; for (let s = 0; s < 3; s++) { g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * 0.95 + s * 2.1; const r = 10 + i * 2.2; g.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a * 1.2) * r * 0.75); } g.lineWidth = 8; g.strokeStyle = OL; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.lineWidth = 4; g.strokeStyle = cs[s]; g.stroke(); } },
  web() { g.lineWidth = 3.5; g.strokeStyle = OL; g.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(50, 50); g.lineTo(50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44); g.stroke(); }
    for (const r of [12, 24, 36]) { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i * TAU / 8, b = (i - 0.5) * TAU / 8; if (i) g.quadraticCurveTo(50 + Math.cos(b) * r * 0.75, 50 + Math.sin(b) * r * 0.75, 50 + Math.cos(a) * r, 50 + Math.sin(a) * r); else g.moveTo(50 + r, 50); } g.stroke(); } },
  warp() { poly([[8, 70], [62, 70], [62, 80], [8, 80]]); fs(DARK); g.beginPath(); g.moveTo(16, 70); g.lineTo(58, 70); g.quadraticCurveTo(70, 66, 78, 40); g.lineTo(88, 44); g.quadraticCurveTo(80, 76, 60, 60); g.lineTo(20, 60); g.quadraticCurveTo(10, 60, 8, 44); g.lineTo(16, 42); g.closePath(); fs(PAP); line([[78, 26], [86, 16]], 4, RED); line([[14, 28], [8, 18]], 4, RED); },
  booth() { cube(50, 54, 38, 26, '#c08850'); poly([[12, 54], [50, 35], [88, 54], [50, 73]]); g.fillStyle = PAP; g.fill(); poly([[12, 54], [50, 35], [88, 54], [50, 73]]); fs(null, 4); cube(38, 44, 9, 10, BLUE); cube(62, 46, 7, 14, GREEN); circ(52, 40, 6); fs(GOLD, 3); },
  banner() { line([[14, 14], [86, 14]], 6, WOOD); poly([[20, 16], [80, 16], [80, 78], [50, 64], [20, 78]]); fs(PAP); star(50, 40, 13, GOLD); },
  lights() { g.beginPath(); g.moveTo(6, 22); g.quadraticCurveTo(50, 62, 94, 22); g.lineWidth = 4; g.strokeStyle = OL; g.stroke(); const cs = [GOLD, RED, GREEN, BLUE, PAP];
    for (let i = 0; i < 5; i++) { const t = (i + 0.7) / 5.4, x = 6 + 88 * t, y = 22 + 80 * t * (1 - t) * 0.98 + 8; circ(x, y, 11); g.fillStyle = cs[i] + '55'; g.fill(); ell(x, y, 6, 8); fs(cs[i], 3); } },
  showcase() { rr(22, 66, 56, 22, 4); fs(WOOD); g.save(); g.globalAlpha = 0.9; rr(24, 18, 52, 50, 4); g.fillStyle = 'rgba(200,235,255,.6)'; g.fill(); g.restore(); rr(24, 18, 52, 50, 4); fs(null, 4); star(50, 44, 16, GOLD); line([[32, 26], [38, 38]], 3, 'rgba(255,255,255,.9)'); },
  printer() { cube(50, 24, 34, 58, DARK); poly([[18, 32], [48, 47], [48, 76], [18, 61]]); fs('rgba(255,220,170,.5)', 3); rr(56, 58, 22, 9, 3); fs('#2a8a6a', 2); },
  flag() { line([[22, 92], [22, 10]], 7); poly([[24, 12], [82, 24], [24, 48]]); fs(PAP); },
  target() { circ(50, 50, 40); fs(RED); circ(50, 50, 28); fs('#fff'); circ(50, 50, 15); fs(RED); circ(50, 50, 5); fs('#fff', 0); },
  gift() { cube(50, 40, 36, 38, RED); poly([[44, 22], [56, 22], [92, 40], [80, 40]]); fs(GOLD, 3); poly([[44, 58], [56, 58], [56, 96], [44, 90]]); fs(GOLD, 0); g.beginPath(); g.ellipse(40, 18, 12, 7, -0.4, 0, TAU); fs(GOLD, 4); g.beginPath(); g.ellipse(60, 18, 12, 7, 0.4, 0, TAU); fs(GOLD, 4); },
  arrow() { poly([[12, 40], [56, 40], [56, 20], [90, 50], [56, 80], [56, 60], [12, 60]]); fs(PAP); },
  bonsai() { BL.Models.draw(g, 'bonsai', null, 50, 70, 22, 1); },
  moon() { g.beginPath(); g.arc(50, 50, 36, 0.9, 5.4); g.quadraticCurveTo(48, 44, 77, 72); fs('#ffe08a'); },
  zzz() { g.fillStyle = PURP; g.font = '900 34px Fredoka, sans-serif'; g.fillText('z', 20, 80); g.font = '900 44px Fredoka, sans-serif'; g.fillText('z', 46, 54); },
};
I.rent = I.house;

function plateIcon(id, colors) {
  const h = BL.Models.height(id), k = Math.min(23, 86 / (2.2 + h)), cy = 50 + (h * k) / 2;
  const d = (x, y) => [50 + (x - y) * k, cy + (x + y) * k * 0.5];
  const q = 1.12; poly([d(-q, -q), d(q, -q), d(q, q), d(-q, q)]); fs('#3a3a40', 3);
  BL.Models.draw(g, id, colors, 50, cy, k, 1);
}

/* ---------- cache + API ---------- */
const cache = {};
function canvasFor(name, px) {
  const key = name + '@' + px;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.scale(px / 100, px / 100);
  g = ctx; LW = 5.5;
  try {
    const [base, arg] = name.split('|');
    if (base.startsWith('o:')) plateIcon(base.slice(2), arg ? arg.split(',') : null);
    else if (I[base]) I[base](arg);
    else { circ(50, 50, 30); fs('#ccc'); }
  } catch (e) { /* a broken icon must never break the game */ }
  cache[key] = c;
  return c;
}
/* blit centred at (x, y) with size s (CSS px) */
function draw(ctx, name, x, y, s) {
  const dpr = Math.min(2, root.devicePixelRatio || 1);
  const px = Math.max(16, Math.ceil(s * dpr / 8) * 8);
  ctx.drawImage(canvasFor(name, px), x - s / 2, y - s / 2, s, s);
}
const cls = {};
let sheet = null;
function classFor(name) {
  if (cls[name]) return cls[name];
  const c = 'ic-' + name.replace(/[^a-z0-9]/gi, '_');
  if (!sheet) { const st = document.createElement('style'); st.id = 'iconStyles'; document.head.appendChild(st); sheet = st.sheet; }
  try { sheet.insertRule(`.${c}{background-image:url(${canvasFor(name, 96).toDataURL()})}`, sheet.cssRules.length); } catch (e) { /* ignore */ }
  return (cls[name] = c);
}
/* inline icon for innerHTML */
function html(name, extra) { return `<i class="ic ${classFor(name)}${extra ? ' ' + extra : ''}" aria-hidden="true"></i>`; }
const orderIcon = (o) => 'o:' + o.tpl + (o.colors && o.colors.length ? '|' + o.colors.join(',') : '');
BL.Icons = { draw, html, canvasFor, orderIcon, names: () => Object.keys(I) };
})(window);
