'use strict';
// ===================================================================
//  core.js — screen, math helpers, input, bitmap font, windows
//  Everything renders into a 256x224 buffer (the SNES resolution)
//  that CSS scales up with nearest-neighbour filtering.
// ===================================================================

const W = 256, H = 224;
const screenCanvas = document.getElementById('screen');
const ctx = screenCanvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  c.ctx = c.getContext('2d');
  c.ctx.imageSmoothingEnabled = false;
  return c;
}

// ---------- math / colour ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = Math.random;
const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = arr => arr[Math.floor(rand() * arr.length)];

function hexToRgb(h) {
  if (Array.isArray(h)) return h;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(c) {
  return '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function mixColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
const darken = (c, t) => mixColor(c, '#0c0818', t);
const lighten = (c, t) => mixColor(c, '#ffffff', t);
// build an n-step ramp dark→light around a base colour
function ramp(base, n = 5, spread = 0.55) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * 2 - 1; // -1..1
    out.push(t < 0 ? darken(base, -t * spread) : lighten(base, t * spread * 0.75));
  }
  return out;
}

// 4x4 Bayer matrix for SNES-style ordered dithering
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// ---------- pixel buffer for procedural art ----------
class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const rgb = hexToRgb(c), i = (y * this.w + x) * 4;
    this.d[i] = rgb[0]; this.d[i + 1] = rgb[1]; this.d[i + 2] = rgb[2]; this.d[i + 3] = a;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  alpha(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  get(x, y) { const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  // selective outline: transparent pixels touching an opaque one become a dark version of it
  outline(col) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y)) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.alpha(x + dx, y + dy) > 200);
      if (n) add.push([x, y, col || darken(rgbToHex(this.get(x + n[0], y + n[1])), 0.75)]);
    }
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  }
  toCanvas() {
    const c = mkCanvas(this.w, this.h);
    c.ctx.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c;
  }
}

// sprite from text rows + palette ('.' = transparent)
function pix(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = mkCanvas(w, h);
  rows.forEach((r, y) => {
    for (let i = 0; i < r.length; i++) {
      const k = r[i];
      if (pal[k]) { c.ctx.fillStyle = pal[k]; c.ctx.fillRect(i, y, 1, 1); }
    }
  });
  return c;
}
function flipH(src) {
  const c = mkCanvas(src.width, src.height);
  c.ctx.translate(src.width, 0); c.ctx.scale(-1, 1); c.ctx.drawImage(src, 0, 0);
  return c;
}
const _tintCache = new WeakMap();
function tinted(src, color) {
  let m = _tintCache.get(src);
  if (!m) { m = {}; _tintCache.set(src, m); }
  if (m[color]) return m[color];
  const c = mkCanvas(src.width, src.height);
  c.ctx.drawImage(src, 0, 0);
  c.ctx.globalCompositeOperation = 'source-atop';
  c.ctx.fillStyle = color; c.ctx.fillRect(0, 0, c.width, c.height);
  return (m[color] = c);
}

// ---------- input ----------
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'ok', Enter: 'ok', Space: 'ok', NumpadEnter: 'ok',
  KeyX: 'cancel', Escape: 'cancel', Backspace: 'cancel',
  KeyC: 'menu', KeyM: 'menu', Tab: 'menu',
  ShiftLeft: 'dash', ShiftRight: 'dash',
};
const Input = {
  down: {}, queue: {}, pressed: {}, held: {}, onFirst: [],
  press(a) { if (!this.down[a]) this.queue[a] = true; this.down[a] = true; this._first(); },
  release(a) { this.down[a] = false; },
  _first() { while (this.onFirst.length) this.onFirst.shift()(); },
  frame() {
    this.pressed = this.queue; this.queue = {};
    for (const a of ['up', 'down', 'left', 'right', 'ok', 'cancel', 'menu', 'dash'])
      this.held[a] = this.down[a] ? (this.held[a] || 0) + 1 : 0;
  },
  hit(a) { return !!this.pressed[a]; },
  // menu-style auto-repeat for held directions
  rep(a) { const h = this.held[a]; return !!this.pressed[a] || (h > 16 && h % 4 === 0); },
  dir() { // held keys, plus taps that went down and up within a single frame
    for (const d of ['up', 'down', 'left', 'right']) if (this.down[d] || this.pressed[d]) return d;
    return null;
  },
  clear() { this.down = {}; this.queue = {}; this.pressed = {}; },
};
window.addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) Input.press(a);
});
window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) Input.release(a); });
window.addEventListener('blur', () => Input.clear());
screenCanvas.addEventListener('pointerdown', () => { screenCanvas.focus(); Input._first(); });
document.querySelectorAll('#pad button').forEach(b => {
  const a = b.dataset.act;
  const on = e => { e.preventDefault(); b.classList.add('on'); Input.press(a); };
  const off = e => { e.preventDefault(); b.classList.remove('on'); Input.release(a); };
  b.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, off));
});

// ---------- bitmap font (proportional, 7px caps + descenders) ----------
const FONT_SRC = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.###.|#...#|#....|.###.|....#|#...#|.###.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  a: '....|....|.##.|...#|.###|#..#|.###', b: '#...|#...|###.|#..#|#..#|#..#|###.',
  c: '...|...|.##|#..|#..|#..|.##', d: '...#|...#|.###|#..#|#..#|#..#|.###',
  e: '....|....|.##.|#..#|####|#...|.###', f: '..##|.#..|####|.#..|.#..|.#..|.#..',
  g: '....|....|.###|#..#|#..#|#..#|.###|...#|.##.', h: '#...|#...|###.|#..#|#..#|#..#|#..#',
  i: '#|.|#|#|#|#|#', j: '..#|...|..#|..#|..#|..#|..#|#.#|.#.',
  k: '#...|#...|#..#|#.#.|##..|#.#.|#..#', l: '##|.#|.#|.#|.#|.#|.#',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#', n: '....|....|###.|#..#|#..#|#..#|#..#',
  o: '....|....|.##.|#..#|#..#|#..#|.##.', p: '....|....|###.|#..#|#..#|#..#|###.|#...|#...',
  q: '....|....|.###|#..#|#..#|#..#|.###|...#|...#', r: '...|...|#.#|##.|#..|#..|#..',
  s: '....|....|.###|#...|.##.|...#|###.', t: '.#.|.#.|###|.#.|.#.|.#.|..#',
  u: '....|....|#..#|#..#|#..#|#..#|.###', v: '.....|.....|#...#|#...#|.#.#.|.#.#.|..#..',
  w: '.....|.....|#...#|#.#.#|#.#.#|#.#.#|.#.#.', x: '....|....|#..#|#..#|.##.|#..#|#..#',
  y: '....|....|#..#|#..#|#..#|#..#|.###|...#|.##.', z: '....|....|####|..#.|.#..|#...|####',
  0: '.##.|#..#|#.##|##.#|#..#|#..#|.##.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
  2: '.##.|#..#|...#|..#.|.#..|#...|####', 3: '###.|...#|...#|.##.|...#|...#|###.',
  4: '..#.|.##.|#.#.|#.#.|####|..#.|..#.', 5: '####|#...|###.|...#|...#|#..#|.##.',
  6: '.##.|#...|#...|###.|#..#|#..#|.##.', 7: '####|...#|..#.|..#.|.#..|.#..|.#..',
  8: '.##.|#..#|#..#|.##.|#..#|#..#|.##.', 9: '.##.|#..#|#..#|.###|...#|...#|.##.',
  '.': '.|.|.|.|.|.|#', ',': '.|.|.|.|.|.|#|#', '!': '#|#|#|#|#|.|#', '?': '.##.|#..#|...#|..#.|.#..|....|.#..',
  "'": '#|#', '"': '#.#|#.#', ':': '.|.|#|.|.|.|#', ';': '.|.|#|.|.|.|#|#', '-': '...|...|...|###',
  '+': '...|.#.|.#.|###|.#.|.#.', '/': '...#|...#|..#.|..#.|.#..|.#..|#...', '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '>': '...|#..|.#.|..#|.#.|#..',
  '<': '...|..#|.#.|#..|.#.|..#', '=': '...|...|###|...|###', '*': '.....|..#..|#.#.#|.###.|#.#.#|..#..',
  '&': '.#..|#.#.|#.#.|.#..|#.##|#..#|.##.', '~': '.....|.....|.....|.#.#.|#.#..', '_': '....|....|....|....|....|....|....|####',
  '…': '.....|.....|.....|.....|.....|.....|#.#.#',
};
const FONT = {};
for (const ch in FONT_SRC) {
  const rows = FONT_SRC[ch].split('|');
  FONT[ch] = { rows, w: Math.max(...rows.map(r => r.length)) };
}
FONT[' '] = { rows: [], w: 3 };
const _glyphs = {};
function glyph(ch, color) {
  const set = _glyphs[color] || (_glyphs[color] = {});
  if (set[ch]) return set[ch];
  const f = FONT[ch] || FONT['?'];
  const c = mkCanvas(f.w, 9);
  c.ctx.fillStyle = color;
  f.rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') c.ctx.fillRect(i, y, 1, 1); });
  c.adv = f.w + 1;
  return (set[ch] = c);
}
function textWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += (FONT[ch] || FONT['?']).w + 1;
  return Math.max(0, w - 1);
}
const C_TEXT = '#f4f2ff', C_SHADOW = '#14123a', C_GREY = '#8e8cb8', C_GOLD = '#ffd75e', C_RED = '#ff7a7a', C_GREEN = '#8cf2a0', C_CYAN = '#8ce8ff';
function drawText(s, x, y, color = C_TEXT, shadow = C_SHADOW, t = ctx) {
  x = Math.round(x); y = Math.round(y);
  let cx = x;
  for (const ch of String(s)) {
    if (ch === '\n') { cx = x; y += 12; continue; }
    const g = glyph(ch, color);
    if (shadow) t.drawImage(glyph(ch, shadow), cx + 1, y + 1);
    t.drawImage(g, cx, y);
    cx += g.adv;
  }
  return cx - x;
}
function drawTextR(s, xr, y, color, shadow, t) { return drawText(s, xr - textWidth(s), y, color, shadow, t); }
function drawTextC(s, xc, y, color, shadow, t) { return drawText(s, xc - textWidth(s) / 2, y, color, shadow, t); }
function wrapText(s, maxW) {
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (textWidth(test) > maxW && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

// ---------- windows (blue gradient, bevelled frame) ----------
const WIN_TOP = [74, 92, 196], WIN_BOT = [16, 20, 88];
const _winGrad = {};
function winGradient(h) {
  if (_winGrad[h]) return _winGrad[h];
  const c = mkCanvas(1, h);
  for (let y = 0; y < h; y += 2) { // 2-line bands, like SNES HDMA gradients
    const t = h > 1 ? y / (h - 1) : 0;
    c.ctx.fillStyle = rgbToHex([lerp(WIN_TOP[0], WIN_BOT[0], t), lerp(WIN_TOP[1], WIN_BOT[1], t), lerp(WIN_TOP[2], WIN_BOT[2], t)]);
    c.ctx.fillRect(0, y, 1, 2);
  }
  return (_winGrad[h] = c);
}
function ring(t, x, y, w, h, c) {
  t.fillStyle = c;
  t.fillRect(x + 1, y, w - 2, 1); t.fillRect(x + 1, y + h - 1, w - 2, 1);
  t.fillRect(x, y + 1, 1, h - 2); t.fillRect(x + w - 1, y + 1, 1, h - 2);
}
function drawWindow(x, y, w, h, t = ctx) {
  x |= 0; y |= 0; w |= 0; h |= 0;
  t.drawImage(winGradient(h - 4), x + 2, y + 2, w - 4, h - 4);
  ring(t, x, y, w, h, '#06061a');
  ring(t, x + 1, y + 1, w - 2, h - 2, '#eceaff');
  ring(t, x + 2, y + 2, w - 4, h - 4, '#9b98cc');
  t.fillStyle = '#06061a';
  t.fillRect(x + 1, y + 1, 1, 1); t.fillRect(x + w - 2, y + 1, 1, 1);
  t.fillRect(x + 1, y + h - 2, 1, 1); t.fillRect(x + w - 2, y + h - 2, 1, 1);
  t.fillStyle = '#eceaff';
  t.fillRect(x + 2, y + 2, 1, 1); t.fillRect(x + w - 3, y + 2, 1, 1);
  t.fillRect(x + 2, y + h - 3, 1, 1); t.fillRect(x + w - 3, y + h - 3, 1, 1);
}

// pointing-hand cursor
const CURSOR = pix([
  '...#####.....',
  '..#wwwww####.',
  '.#wwwwwwwwww#',
  '#wwwwwg#####.',
  '#wwwwwwg#....',
  '#wwwwwg#.....',
  '.#gwwwg#.....',
  '..#####......',
], { '#': '#1a1830', w: '#fbfbff', g: '#a9a7c8' });
let frameCount = 0;
function drawCursor(x, y, still = false) {
  const bob = still ? 0 : Math.round(Math.sin(frameCount / 6) * 1.2);
  ctx.drawImage(CURSOR, Math.round(x - 14 + bob), Math.round(y));
}

// gauge bar (ATB / HP)
function drawBar(x, y, w, h, frac, col, back = '#20204a') {
  ctx.fillStyle = '#06061a'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(frac, 0, 1));
  ctx.fillStyle = col; ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = lighten(col, 0.5); ctx.fillRect(x, y, fw, 1);
}
