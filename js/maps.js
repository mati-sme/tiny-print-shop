/* Tiny Print Shop - visual node maps (in-run upgrades, research, labs). Nodes are DOM buttons over an SVG of connecting paths. */
(function (root) {
'use strict';
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

/* opts: { nodes:[{id,x,y,icon,name,req}], kind, state(id)->'owned'|'buy'|'poor'|'locked'|..., badge(id)->html, onSelect(id), cols, rows } */
function renderMap(wrap, opts) {
  wrap.innerHTML = '';
  const N = opts.nodes;
  const maxX = Math.max(...N.map((n) => n.x)), maxY = Math.max(...N.map((n) => n.y));
  const inner = el('div', 'map-inner ' + (opts.kind || ''));
  wrap.appendChild(inner);
  const W = wrap.clientWidth || 360;
  const G = Math.max(80, Math.min(130, (W - 16) / (maxX + 1)));
  const GY = Math.max(104, Math.min(120, G * 1.0));
  inner.style.width = Math.max(W - 4, (maxX + 1) * G + 10) + 'px';
  inner.style.height = (maxY + 1) * GY + 24 + 'px';
  const off = Math.max(0, (W - 4 - (maxX + 1) * G) / 2);
  const pos = (n) => [off + n.x * G + G / 2, n.y * GY + 50];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-lines'); svg.setAttribute('width', inner.style.width); svg.setAttribute('height', inner.style.height);
  inner.appendChild(svg);
  for (const n of N) {
    const reqs = n.req ? [].concat(n.req) : [];
    for (const r of reqs) {
      const a = N.find((m) => m.id === r); if (!a) continue;
      const [x1, y1] = pos(a), [x2, y2] = pos(n);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const my = (y1 + y2) / 2;
      path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      const st = opts.state(n.id);
      path.setAttribute('class', 'map-path ' + (st === 'owned' || st === 'here' || st === 'done' ? 'on' : (st === 'buy' || st === 'poor' ? 'next' : 'off')));
      svg.appendChild(path);
    }
  }
  for (const lb of opts.labels || []) {
    const [x, y] = pos(lb);
    const d = el('div', 'map-label', lb.text); d.style.left = x + 'px'; d.style.top = y + 'px'; inner.appendChild(d);
  }
  for (const n of N) {
    const st = opts.state(n.id);
    const b = el('button', `node ${st}${n.root ? ' root' : ''}${n.small ? ' small' : ''}`);
    b.dataset.id = n.id;
    const [x, y] = pos(n);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    b.innerHTML = `${root.BL.Icons.html(n.icon, 'ni')}<span class="nn">${n.name}</span>${opts.badge ? `<span class="nb">${opts.badge(n.id, st)}</span>` : ''}`;
    b.addEventListener('click', () => opts.onSelect(n.id));
    inner.appendChild(b);
  }
  return inner;
}
root.BL.Maps = { renderMap, el };
})(window);
