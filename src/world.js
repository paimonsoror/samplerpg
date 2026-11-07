'use strict';
// ===================================================================
//  world.js — procedural 16x16 tiles, map objects (trees, houses,
//  pillars, gate), battle backdrops and the Mode 7 world texture.
// ===================================================================

const T = 16;
function tileCanvas(fn, seed) {
  const b = new PixBuf(T, T); const r = mulberry32(seed);
  fn(b, r);
  return b.toCanvas();
}
const GR = ['#2c6a2c', '#3c8434', '#4c9a3c', '#68b44a', '#90cc62'];
function grassBase(b, r, base = 2, pal = GR) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = r();
    b.set(x, y, pal[n < 0.12 ? base - 1 : n > 0.9 ? base + 1 : base]);
  }
  for (let i = 0; i < 5; i++) { // blades
    const x = Math.floor(r() * 15), y = 2 + Math.floor(r() * 13);
    b.set(x, y, pal[base - 2 < 0 ? 0 : base - 2]); b.set(x + 1, y - 1, pal[base - 1]); b.set(x, y - 1, pal[base + 1]);
  }
}
const TILES = {};
function buildTiles() {
  TILES.grass = [1, 2, 3].map(s => tileCanvas((b, r) => grassBase(b, r), s * 97));
  TILES.flowers = [1, 2].map(s => tileCanvas((b, r) => {
    grassBase(b, r);
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(r() * 11), y = 2 + Math.floor(r() * 11), c = pick.call(null, ['#f4f0f8', '#f6a2c0', '#ffe070', '#a8c0ff']);
      b.set(x, y - 1, c); b.set(x - 1, y, c); b.set(x + 1, y, c); b.set(x, y + 1, c); b.set(x, y, '#ffd040');
    }
  }, s * 31));
  TILES.tall = [1, 2].map(s => tileCanvas((b, r) => {
    grassBase(b, r, 1, GR);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * 16), y = 4 + Math.floor(r() * 12), h = 3 + Math.floor(r() * 3);
      for (let k = 0; k < h; k++) b.set(x + (k > 2 ? 1 : 0), y - k, k === h - 1 ? GR[4] : k > h - 3 ? GR[3] : GR[0]);
    }
  }, s * 53));
  const PA = ['#9a7a4a', '#b8935c', '#cca86c', '#ddbe84'];
  TILES.path = [1, 2].map(s => tileCanvas((b, r) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const n = r(); b.set(x, y, PA[n < 0.1 ? 0 : n < 0.3 ? 1 : n > 0.92 ? 3 : 2]); }
    for (let i = 0; i < 3; i++) { const x = Math.floor(r() * 14), y = Math.floor(r() * 14); b.set(x, y, '#7a6040'); b.set(x + 1, y, '#e8d0a0'); }
  }, s * 71));
  TILES.forest = tileCanvas((b, r) => grassBase(b, r, 1, ['#123018', '#1a4022', '#24502a', '#2e6032', '#3a7038']), 5);
  TILES.water = [0, 1, 2, 3].map(f => tileCanvas((b) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin((x + f * 4) * 0.4 + y * 0.9) + Math.sin((x - f * 4) * 0.25 - y * 0.6);
      b.set(x, y, w > 1.25 ? '#78b4f4' : w > 0.6 ? '#3c7cd4' : w < -1.2 ? '#1a3e94' : '#2a5cb8');
    }
    if (f % 2) { b.set(4 + f, 5, '#e0f4ff'); b.set(11 - f, 12, '#e0f4ff'); }
  }, 1));
  const ST = ['#5a5266', '#7a7286', '#8a8296', '#9a92a6', '#b0a8ba'];
  TILES.stone = [1, 2, 3].map(s => tileCanvas((b, r) => {
    const shade = [r(), r(), r(), r()].map(v => (v < 0.3 ? 1 : v > 0.8 ? 3 : 2));
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { // square flagstones
      const q = (y >= 8 ? 2 : 0) + (x >= 8 ? 1 : 0), mortar = x % 8 === 7 || y % 8 === 7;
      const n = r();
      b.set(x, y, mortar ? ST[0] : (x % 8 === 0 || y % 8 === 0) ? ST[Math.min(4, shade[q] + 1)] : ST[n < 0.1 ? shade[q] - 1 : shade[q]]);
    }
    if (s === 2) { b.set(5, 3, '#3a6a34'); b.set(6, 3, '#4c8a3c'); b.set(6, 4, '#3a6a34'); }
    if (s === 3) { b.set(9, 10, ST[0]); b.set(10, 11, ST[0]); b.set(11, 11, ST[0]); }
  }, s * 13));
  TILES.wall = tileCanvas((b, r) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = Math.floor(y / 5), off = row % 2 ? 4 : 0;
      const mortar = y % 5 === 4 || (x + off) % 8 === 7;
      const top = y % 5 === 0;
      b.set(x, y, mortar ? '#24223a' : top ? '#8a88a6' : r() < 0.2 ? '#4e4c68' : '#5e5c7a');
    }
  }, 9);
  TILES.bridge = tileCanvas((b) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const edge = x < 2 || x > 13;
      b.set(x, y, edge ? (x === 0 || x === 15 ? '#3a2414' : '#6a4424') : y % 4 === 3 ? '#5a3a1c' : y % 4 === 0 ? '#c89058' : '#a8743e');
    }
  }, 1);
}

// ---------------- objects ----------------
const OBJ = {};
function makeTree(kind, seed) {
  const r = mulberry32(seed);
  const L = kind === 'dark' ? ['#0a2214', '#123a1e', '#1e5428', '#2e7032', '#4a8c3c'] : ['#0f2e1a', '#1d5228', '#2f7a34', '#4ea040', '#86c858'];
  const shapes = [Shp.box(13, 30, 7, 18, ['#2a160c', '#4a2c16', '#6a4222', '#8a5a30'], { cyl: true, bevel: 2 })];
  const clumps = [[16, 18, 13, 12], [9, 21, 8, 7], [23, 21, 8, 7], [12, 11, 8, 7], [21, 11, 8, 7], [16, 7, 7, 6]];
  if (kind === 'pine') {
    shapes.push(Shp.poly([[16, 0], [3, 24], [29, 24]], L, { normal: [0, -0.2, 1], dither: 0.5,
      tex: (x, y, c) => ((y + Math.abs(x - 16) * 0.6) % 8 < 1.2 ? L[1] : null) }));
    shapes.push(Shp.poly([[16, 10], [1, 34], [31, 34]], L, { normal: [0, -0.1, 1], dither: 0.5,
      tex: (x, y, c) => (x > 16 + (y - 10) * 0.3 ? L[1] : null) }));
  } else {
    for (const [cx, cy, rx, ry] of clumps) shapes.push(Shp.ell(cx + (r() - 0.5) * 2, cy + (r() - 0.5) * 2, rx, ry, L, { group: 1, dither: 0.35 }));
  }
  const full = shadeSprite(32, 48, shapes, b => {
    if (kind !== 'pine') for (let i = 0; i < 6; i++) { const x = 8 + Math.floor(r() * 16), y = 6 + Math.floor(r() * 18); if (b.alpha(x, y)) b.set(x, y, L[4]); }
  });
  // split: canopy (above trunk tile) goes on the overlay layer
  const top = mkCanvas(32, 32), bot = mkCanvas(32, 16);
  top.ctx.drawImage(full, 0, 0); bot.ctx.drawImage(full, 0, -32);
  return { top, bot };
}
function makeHouse(roof) {
  const w = 80, h = 64, b = new PixBuf(w, h), R = ramp(roof, 5, 0.6);
  // roof: shingle rows with highlight per row
  for (let y = 4; y < 34; y++) {
    const inset = Math.max(0, 6 - Math.floor((y - 4) / 2));
    for (let x = inset; x < w - inset; x++) {
      const row = Math.floor((y - 4) / 5), off = row % 2 ? 4 : 0;
      const seam = (x + off) % 8 === 0, edge = (y - 4) % 5 === 4;
      let c = R[2];
      if (edge) c = R[0]; else if ((y - 4) % 5 === 0) c = R[4]; else if (seam) c = R[1]; else if (x > w * 0.62) c = R[1];
      b.set(x, y, c);
    }
  }
  for (let x = 6; x < w - 6; x++) { b.set(x, 3, R[3]); b.set(x, 4, R[4]); }
  b.rect(56, 0, 8, 10, '#6a5a58'); b.rect(56, 0, 8, 2, '#8a7a76'); b.rect(62, 2, 2, 8, '#4a3a3a');
  // walls: plaster with timber frame
  for (let y = 34; y < h; y++) for (let x = 2; x < w - 2; x++) {
    const beam = y === 34 || y === 35 || y === h - 2 || x < 4 || x > w - 5 || x === 26 || x === 27 || x === 52 || x === 53;
    b.set(x, y, beam ? (y === 35 || x === 27 || x === 53 ? '#4a2c18' : '#6a4222') : (y < 38 ? '#c8b494' : x > w - 14 ? '#d8c6a4' : '#ead8b6'));
  }
  b.rect(2, 34, w - 4, 1, R[0]);
  // windows (warm lamplight)
  for (const wx of [9, 58]) {
    b.rect(wx, 42, 12, 10, '#3a2414');
    b.rect(wx + 1, 43, 10, 8, '#ffd27a'); b.rect(wx + 1, 47, 10, 1, '#3a2414'); b.rect(wx + 5, 43, 1, 8, '#3a2414');
    b.rect(wx + 1, 43, 4, 1, '#fff2c8'); b.rect(wx - 1, 52, 14, 2, '#8a5a30');
  }
  // door
  b.rect(32, 40, 16, 24, '#3a2414'); b.rect(33, 41, 14, 23, '#7a4a24');
  for (let y = 42; y < 64; y += 4) b.rect(33, y, 14, 1, '#5a3418');
  b.rect(44, 52, 2, 2, '#ffd050'); b.rect(33, 41, 14, 1, '#9a6434');
  b.outline('#1a0e10');
  return b.toCanvas();
}
function buildObjects() {
  OBJ.trees = [makeTree('round', 11), makeTree('round', 23), makeTree('pine', 5), makeTree('dark', 7)];
  OBJ.houseRed = makeHouse('#b8463a'); OBJ.houseBlue = makeHouse('#3e6ab0'); OBJ.houseGreen = makeHouse('#4a8a52');
  OBJ.bush = shadeSprite(16, 16, [Shp.ell(5, 10, 5, 5, GR, { group: 1 }), Shp.ell(11, 10, 5, 5, GR, { group: 1 }), Shp.ell(8, 6, 5, 4.5, GR, { group: 1 })]);
  OBJ.rock = shadeSprite(16, 16, [Shp.ell(8, 10, 7, 5, ['#3a3848', '#5a586c', '#7e7c92', '#a8a6ba'])]);
  OBJ.fence = (() => { const b = new PixBuf(16, 16);
    b.rect(0, 6, 16, 2, '#a8743e'); b.rect(0, 11, 16, 2, '#8a5a30'); b.rect(0, 6, 16, 1, '#d8a466');
    b.rect(2, 3, 3, 12, '#8a5a30'); b.rect(11, 3, 3, 12, '#8a5a30'); b.rect(2, 3, 1, 12, '#c89058'); b.rect(11, 3, 1, 12, '#c89058');
    b.outline('#2a160c'); return b.toCanvas(); })();
  OBJ.sign = (() => { const b = new PixBuf(16, 16);
    b.rect(7, 8, 2, 7, '#6a4222'); b.rect(2, 2, 12, 7, '#b8834a'); b.rect(2, 2, 12, 1, '#dcaa6a'); b.rect(4, 4, 8, 1, '#5a3418'); b.rect(4, 6, 6, 1, '#5a3418');
    b.outline('#2a160c'); return b.toCanvas(); })();
  OBJ.well = shadeSprite(16, 24, [
    Shp.box(1, 12, 14, 11, ['#3a3848', '#5a586c', '#7e7c92', '#a8a6ba'], { cyl: true, bevel: 2, tex: (x, y, c) => ((y - 12) % 4 === 3 || (x + (Math.floor((y - 12) / 4) % 2) * 3) % 6 === 0 ? '#3a3848' : null) }),
    Shp.ell(8, 12, 7, 2.5, ['#0c2050', '#1a3e90', '#3a6ad0'], { noLine: true }),
    Shp.box(1, 2, 2, 11, ['#3a2414', '#6a4222', '#8a5a30']), Shp.box(13, 2, 2, 11, ['#3a2414', '#6a4222', '#8a5a30']),
    Shp.poly([[0, 3], [8, 0], [16, 3], [16, 5], [0, 5]], ramp('#b8463a', 4, 0.5), { normal: [0, -0.6, 1] }),
  ]);
  OBJ.chest = [false, true].map(open => { const b = new PixBuf(16, 16);
    b.rect(1, 6, 14, 9, '#7a4a24'); b.rect(1, 6, 14, 1, '#a8703a'); b.rect(1, 10, 14, 1, '#d8a440');
    if (open) { b.rect(1, 2, 14, 4, '#4a2c16'); b.rect(2, 4, 12, 2, '#120806'); b.rect(1, 1, 14, 1, '#a8703a'); }
    else { b.rect(1, 3, 14, 4, '#8a5a30'); b.rect(1, 3, 14, 1, '#c48a4a'); b.rect(6, 8, 4, 4, '#ffd050'); b.set(7, 9, '#7a4a24'); }
    b.rect(1, 3, 1, 12, '#d8a440'); b.rect(14, 3, 1, 12, '#d8a440');
    b.outline('#1a0e08'); return b.toCanvas(); });
  OBJ.pillar = (() => {
    const c = shadeSprite(16, 32, [
      Shp.box(3, 4, 10, 26, ['#3a3850', '#5a5874', '#7a7896', '#9e9cb8', '#c2c0d8'], { cyl: true, bevel: 1, tex: (x, y, c) => (x === 5 || x === 9) && y > 6 && y < 28 ? '#4a4864' : null }),
      Shp.box(1, 0, 14, 5, ['#3a3850', '#5a5874', '#7a7896', '#9e9cb8', '#c2c0d8'], { bevel: 2 }),
      Shp.box(1, 27, 14, 5, ['#3a3850', '#5a5874', '#7a7896', '#9e9cb8'], { bevel: 2 }),
    ], b => { b.set(6, 12, '#5fe8ff'); b.set(6, 13, '#2aa0d0'); b.set(6, 20, '#5fe8ff'); });
    const top = mkCanvas(16, 16), bot = mkCanvas(16, 16);
    top.ctx.drawImage(c, 0, 0); bot.ctx.drawImage(c, 0, -16);
    return { top, bot };
  })();
  OBJ.gate = (() => {
    const b = new PixBuf(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const arch = y > 8 && x > 7 && x < 40 && (y > 20 || Math.hypot(x - 23.5, y - 20) < 16);
      if (arch) { const door = x > 9 && x < 38 && (y > 22 || Math.hypot(x - 23.5, y - 22) < 13.5);
        b.set(x, y, door ? ((x === 23 || x === 24) ? '#1a1828' : (y % 6 === 0 ? '#3a3654' : x < 24 ? '#4e4a6e' : '#423e5e')) : '#24223a'); }
      else b.set(x, y, (y % 6 === 5 || (x + (Math.floor(y / 6) % 2) * 6) % 12 === 11) ? '#2a2840' : y % 6 === 0 ? '#9a98b4' : '#6e6c88');
    }
    return b;
  })();
  OBJ.crystal = Array.from({ length: 8 }, (_, i) => makeCrystal(i / 8 * Math.PI * 2));
  OBJ.shadow = (() => { const c = mkCanvas(14, 5); c.ctx.fillStyle = 'rgba(10,16,30,0.35)';
    c.ctx.fillRect(2, 0, 10, 5); c.ctx.fillRect(0, 1, 14, 3); return c; })();
}
// gate runes glow (drawn live)
function drawGate(x, y, glow, open) {
  const b = OBJ.gate;
  if (!OBJ.gateC) OBJ.gateC = b.toCanvas();
  ctx.drawImage(OBJ.gateC, x, y);
  if (open) { ctx.fillStyle = '#05040a'; ctx.fillRect(x + 10, y + 22, 28, 26); ctx.fillRect(x + 14, y + 12, 20, 10); return; }
  const c = mixColor('#1a7ab0', '#9af4ff', glow);
  ctx.fillStyle = c;
  for (const [rx, ry] of [[16, 26], [30, 26], [16, 34], [30, 34], [23, 14], [20, 40], [27, 40]]) { ctx.fillRect(x + rx, y + ry, 2, 3); ctx.fillRect(x + rx - 1, y + ry + 1, 4, 1); }
}

// ---------------- battle backdrops (256x152) ----------------
function bandGradient(c, y0, y1, top, bot, step = 2) {
  for (let y = y0; y < y1; y += step) { c.ctx.fillStyle = mixColor(top, bot, (y - y0) / (y1 - y0)); c.ctx.fillRect(0, y, 256, step); }
}
function makeForestBack() {
  const c = mkCanvas(256, 152), r = mulberry32(42), g = c.ctx;
  bandGradient(c, 0, 70, '#5a9ad8', '#c8e4f0');
  // far hills of pines
  const ridge = (baseY, amp, col, seed) => { const rr = mulberry32(seed);
    for (let x = 0; x < 256; x++) { const y = baseY - Math.abs(Math.sin(x * 0.11 + seed)) * amp - rr() * 3; g.fillStyle = col; g.fillRect(x, y, 1, 152 - y); } };
  ridge(64, 14, '#6a92b8', 1); ridge(74, 16, '#3e6e7e', 2);
  // mid forest wall
  for (let x = -8; x < 264; x += 10) {
    const h = 26 + r() * 18, top = 86 - h;
    for (let y = 0; y < h + 6; y++) { const w = Math.min(7, y * 0.35 + 1); g.fillStyle = y % 5 === 0 ? '#1e4a34' : '#28603e'; g.fillRect(x - w, top + y, w * 2, 1); g.fillStyle = '#1a3e2c'; g.fillRect(x + w * 0.3, top + y, w * 0.7, 1); }
  }
  // ground with perspective bands
  for (let y = 86; y < 152; y++) {
    const t = (y - 86) / 66, band = Math.floor(Math.pow(t, 0.6) * 10) % 2;
    g.fillStyle = band ? '#4a9a3c' : '#56a844'; g.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 140; i++) { const x = r() * 256, y = 88 + Math.pow(r(), 0.7) * 62, s = 1 + (y - 88) / 30;
    g.fillStyle = r() < 0.5 ? '#2e7a2e' : '#7cc458'; g.fillRect(x, y, Math.ceil(s * 0.6), Math.ceil(s)); }
  // path
  g.fillStyle = '#b89a62';
  for (let y = 100; y < 152; y++) { const w = 20 + (y - 100) * 1.4; g.fillRect(128 - w / 2 + Math.sin(y * 0.08) * 8, y, w, 1); }
  // foreground trees framing the scene
  for (const [x, flip] of [[0, 0], [256, 1]]) {
    g.fillStyle = '#183a24';
    for (let y = 0; y < 152; y++) { const w = 26 + Math.sin(y * 0.3) * 4 + (y < 40 ? 20 - y / 2 : 0); g.fillRect(flip ? x - w : x, y, w, 1); }
    g.fillStyle = '#2a1a10'; g.fillRect(flip ? x - 14 : x + 4, 40, 10, 112);
    g.fillStyle = '#4a2e1a'; g.fillRect(flip ? x - 12 : x + 6, 40, 3, 112);
  }
  return c;
}
function makeRuinsBack() {
  const c = mkCanvas(256, 152), g = c.ctx, r = mulberry32(7);
  bandGradient(c, 0, 96, '#0c0a1c', '#2a2848');
  // back wall bricks
  for (let y = 0; y < 96; y += 8) for (let x = -(y / 8 % 2) * 12; x < 256; x += 24) {
    g.fillStyle = mixColor('#2e2c48', '#4a4866', y / 96 * 0.6 + r() * 0.2); g.fillRect(x + 1, y + 1, 22, 6);
    g.fillStyle = '#5a587a'; g.fillRect(x + 1, y + 1, 22, 1);
  }
  // arches
  for (const ax of [48, 128, 208]) {
    g.fillStyle = '#0a0816';
    for (let y = 18; y < 96; y++) { const w = y < 40 ? Math.sqrt(Math.max(0, 22 * 22 - (40 - y) ** 2)) : 22; g.fillRect(ax - w, y, w * 2, 1); }
    g.fillStyle = '#5ae0ff'; g.fillRect(ax - 1, 30, 2, 2); g.fillRect(ax - 3, 31, 6, 1);
  }
  // floor in perspective
  for (let y = 96; y < 152; y++) {
    const t = (y - 96) / 56, z = 1 / (t + 0.08), row = Math.floor(z * 3) % 2;
    for (let x = 0; x < 256; x += 2) { const u = Math.floor(((x - 128) * (t + 0.15)) / 10 + 100); g.fillStyle = (u + row) % 2 ? '#4a4864' : '#5a5876'; g.fillRect(x, y, 2, 1); }
  }
  g.fillStyle = '#2a2a50'; g.fillRect(0, 96, 256, 2);
  // side pillars
  for (const px of [10, 230]) {
    g.fillStyle = '#3a3856'; g.fillRect(px, 0, 18, 152); g.fillStyle = '#6a6890'; g.fillRect(px + 3, 0, 3, 152); g.fillStyle = '#24223a'; g.fillRect(px + 14, 0, 4, 152);
  }
  return c;
}

// ---------------- Mode 7 world texture (256x256) ----------------
function makeWorldTexture() {
  const N = 256, h = new Float32Array(N * N), r = mulberry32(2024);
  const grid = s => { const g = []; for (let i = 0; i < s * s; i++) g.push(r()); return g; };
  const oct = [[4, 0.5], [8, 0.25], [16, 0.14], [32, 0.08], [64, 0.04]].map(([s, a]) => ({ s, a, g: grid(s) }));
  const smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const o of oct) {
      const fx = x / N * o.s, fy = y / N * o.s, ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
      const G = (a, b) => o.g[((b % o.s + o.s) % o.s) * o.s + ((a % o.s + o.s) % o.s)];
      v += o.a * lerp(lerp(G(ix, iy), G(ix + 1, iy), tx), lerp(G(ix, iy + 1), G(ix + 1, iy + 1), tx), ty);
    }
    h[y * N + x] = v;
  }
  const px = new Uint32Array(N * N);
  const col = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = h[y * N + x] + bayer(x, y) * 0.02;
    let c;
    if (v < 0.44) c = col(28, 56, 140); else if (v < 0.5) c = col(40, 92, 184); else if (v < 0.52) c = col(214, 196, 132);
    else if (v < 0.6) c = col(76, 156, 64); else if (v < 0.67) c = col(44, 112, 52); else if (v < 0.71) c = col(120, 104, 84);
    else if (v < 0.76) c = col(92, 80, 70); else c = col(232, 236, 244);
    if (v > 0.5 && v < 0.67 && ((x * 7 + y * 13) % 29 === 0)) c = col(30, 80, 40);
    px[y * N + x] = c;
  }
  return { N, px };
}
