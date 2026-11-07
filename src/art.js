'use strict';
// ===================================================================
//  art.js — every sprite is generated in code at startup.
//  Characters: a parametric chibi generator (hair style, body type,
//  palette) + selective outlining. Monsters: a tiny "shape shader"
//  that lights ellipses/boxes/polygons and quantises to a palette
//  ramp with ordered dithering, the way 16-bit sprite artists shaded.
// ===================================================================

const ramp3 = c => [darken(c, 0.34), c, lighten(c, 0.34)];
const tone3 = (nx, ny, x, y) => {
  const v = -0.55 * nx - 0.8 * ny + 0.1 + bayer(x, y) * 0.55;
  return v > 0.5 ? 2 : v > -0.4 ? 1 : 0;
};

// ---------------- characters ----------------
function charPalette(d) {
  return {
    hair: ramp3(d.hair), skin: [darken(d.skin, 0.22), d.skin], top: ramp3(d.top),
    pants: [darken(d.pants, 0.3), d.pants], boots: [darken(d.boots, 0.3), d.boots],
    acc: ramp3(d.acc), belt: d.belt || d.boots, eye: '#1a1428',
  };
}

function makeChar(d, view, o = {}) {
  const P = charPalette(d), b = new PixBuf(16, 24), S = (x, y, c) => b.set(x, y, c);
  const R = (x, y, w, h, c) => b.rect(x, y, w, h, c);
  const legs = o.legs || 'stand', arm = o.arm || 'side';
  const kneel = legs === 'kneel', side = view === 'left';
  const dy = kneel ? 3 : 0, lx = o.lean || 0;
  const robe = d.body === 'robe', stocky = d.body === 'stocky';
  const hcx = 8 + lx, hcy = 6.5 + dy;

  // ---- legs ----
  const legTop = robe ? 21 : 18;
  const legCol = (y, y1, back) => (y >= y1 - 1 ? P.boots[back ? 0 : 1] : P.pants[back ? 0 : 1]);
  if (!side) {
    const liftL = legs === 'stepA' ? 1 : 0, liftR = legs === 'stepB' ? 1 : 0;
    for (let y = legTop; y <= 22 - liftL; y++) R(5, y, 3, 1, legCol(y, 22 - liftL, false));
    for (let y = legTop; y <= 22 - liftR; y++) R(8, y, 3, 1, legCol(y, 22 - liftR, true));
  } else if (kneel) {
    R(4, 19, 5, 2, P.pants[1]); R(3, 21, 3, 2, P.boots[1]);
    R(8, 21, 4, 1, P.pants[0]); R(8, 22, 4, 1, P.boots[0]);
  } else if (legs === 'stand') {
    for (let y = legTop; y <= 22; y++) R(8, y, 2, 1, legCol(y, 22, true));
    for (let y = legTop; y <= 22; y++) R(6, y, 2, 1, legCol(y, 22, false));
    S(5, 22, P.boots[1]);
  } else {
    const fwd = back => { for (let y = legTop; y <= 22; y++) { const x = y < 20 ? 6 : y < 21 ? 5 : 4; R(x, y, 2, 1, legCol(y, 22, back)); } if (!robe || true) S(3, 22, P.boots[back ? 0 : 1]); };
    const bwd = back => { for (let y = legTop; y <= 22; y++) { const x = y < 20 ? 8 : y < 21 ? 9 : 10; R(x, y, 2, 1, legCol(y, 22, back)); } };
    if (legs === 'stepA') { bwd(true); fwd(false); } else { fwd(true); bwd(false); }
  }

  // ---- torso ----
  const ty0 = 12 + dy, ty1 = Math.min(22, (robe ? 20 : 17) + dy);
  let tx0, tx1;
  if (side) { tx0 = (stocky ? 4 : 5) + lx; tx1 = (stocky ? 11 : 10) + lx; }
  else { tx0 = stocky ? 3 : 4; tx1 = stocky ? 12 : 11; }
  const tcx = (tx0 + tx1 + 1) / 2;
  for (let y = ty0; y <= ty1; y++) {
    const widen = robe && y > ty0 + 5 ? 1 : 0;
    for (let x = tx0 - widen; x <= tx1 + widen; x++) {
      const nx = (x + 0.5 - tcx) / ((tx1 - tx0 + 2) / 2), ny = (y - ty0) / (ty1 - ty0 + 1) - 0.3;
      S(x, y, P.top[tone3(nx, ny, x, y)]);
    }
  }
  if (robe && d.trim) { // hem + front trim
    for (let x = tx0 - 1; x <= tx1 + 1; x++) S(x, ty1, P.acc[1]);
    if (!side && view === 'down') for (let y = ty0 + 1; y < ty1; y++) S(7, y, P.acc[1]);
  }
  if (!robe) R(tx0, ty0 + 5, tx1 - tx0 + 1, 1, P.belt);
  if (d.pouch && !robe) { S(side ? tx0 + 1 : tx0 + 1, ty0 + 5, P.acc[2]); S(side ? tx0 + 1 : tx1 - 1, ty0 + 5, P.acc[2]); }
  if (d.scarf) {
    R(tx0, ty0, tx1 - tx0 + 1, 1, P.acc[1]);
    if (side) { S(tx1 + 1, ty0 + 1, P.acc[1]); S(tx1 + 2, ty0 + 2, P.acc[0]); S(tx1 + 1, ty0 + 2, P.acc[1]); S(tx1 + 2, ty0 + 3, P.acc[0]); }
    else if (view === 'up') { S(9, ty0 + 1, P.acc[1]); S(9, ty0 + 2, P.acc[0]); S(10, ty0 + 3, P.acc[0]); }
  }

  // ---- arms (front views) ----
  if (!side) {
    const aL = stocky ? 1 : 2, aR = stocky ? 13 : 12;
    if (arm === 'raise2') {
      for (const ax of [aL, aR]) { R(ax, 6 + dy, 2, 6, P.top[2]); R(ax, 4 + dy, 2, 2, P.skin[1]); }
    } else {
      R(aL, ty0, 2, 5, P.top[1]); R(aR, ty0, 2, 5, P.top[0]);
      R(aL, ty0 + 5, 2, 1, P.skin[1]); R(aR, ty0 + 5, 2, 1, P.skin[0]);
    }
  }

  // ---- head ----
  const hairline = x => {
    switch (d.style) {
      case 'spiky': return 3 + dy + (((x + 1) % 3 === 0) ? 1 : 0);
      case 'long': return 3 + dy + (x === 7 || x === 8 ? -1 : 0);
      case 'elder': return 2 + dy;
      case 'cap': return 4 + dy;
      default: return 3 + dy + (x % 2 ? 1 : 0);
    }
  };
  for (let y = 0; y < 14; y++) for (let x = 1; x < 15; x++) {
    const nx = (x + 0.5 - hcx) / 5.3, ny = (y + 0.5 - hcy) / 5.6;
    if (nx * nx + ny * ny > 1) continue;
    let hair;
    if (view === 'up') hair = true;
    else if (view === 'down') hair = y <= hairline(x) || ((x <= hcx - 5 || x >= hcx + 4) && y <= 8 + dy);
    else hair = (x >= hcx && y <= 10 + dy) || y <= hairline(x) - (x < hcx - 3 ? 1 : 0);
    if (hair) S(x, y, P.hair[tone3(nx, ny, x, y)]);
    else S(x, y, (nx > 0.62 || ny > 0.72) ? P.skin[0] : P.skin[1]);
  }
  if (view === 'down') {
    const closed = o.eyes === 'closed';
    if (!closed) { S(hcx - 3, 7 + dy, P.eye); S(hcx + 2, 7 + dy, P.eye); }
    S(hcx - 3, 8 + dy, P.eye); S(hcx + 2, 8 + dy, P.eye);
    if (d.blush) { S(hcx - 4, 9 + dy, '#f08a90'); S(hcx + 3, 9 + dy, '#f08a90'); }
  } else if (side) {
    if (o.eyes !== 'closed') S(hcx - 4, 7 + dy, P.eye);
    S(hcx - 4, 8 + dy, P.eye);
    S(hcx - 6, 8 + dy, P.skin[1]);
    S(hcx, 8 + dy, P.skin[0]);
    if (d.blush) S(hcx - 3, 9 + dy, '#f08a90');
  }

  // ---- hair styles / headgear ----
  const HL = P.hair;
  if (d.style === 'spiky') {
    if (side) { S(hcx + 5, 3 + dy, HL[1]); S(hcx + 6, 4 + dy, HL[0]); S(hcx + 5, 6 + dy, HL[0]); S(hcx + 6, 7 + dy, HL[0]); S(hcx - 1, 0 + dy, HL[2]); S(hcx + 2, 0 + dy, HL[1]); }
    else { S(hcx - 3, 0 + dy, HL[2]); S(hcx, 0 + dy, HL[1]); S(hcx + 2, 0 + dy, HL[1]); S(hcx - 6, 4 + dy, HL[1]); S(hcx + 5, 4 + dy, HL[0]); }
  } else if (d.style === 'long') {
    if (view === 'down') { for (let y = 6; y <= 14; y++) { S(3, y + dy, HL[1]); S(12, y + dy, HL[0]); } S(4, 13 + dy, HL[1]); S(11, 13 + dy, HL[0]); }
    else if (view === 'up') { for (let y = 10; y <= 15; y++) for (let x = 4; x <= 11; x++) S(x, y + dy, HL[tone3((x - 7.5) / 4, (y - 10) / 6, x, y)]); }
    else { for (let y = 8; y <= 15; y++) for (let x = hcx + 1; x <= hcx + 4; x++) S(x, y + dy, HL[x > hcx + 2 ? 0 : 1]); }
  } else if (d.style === 'goggles') {
    if (side) { R(hcx - 4, 4 + dy, 9, 1, P.acc[0]); R(hcx - 4, 3 + dy, 2, 2, '#7fe0ff'); S(hcx - 4, 3 + dy, '#e8fbff'); }
    else if (view === 'down') { R(hcx - 5, 4 + dy, 10, 1, P.acc[0]); R(hcx - 4, 3 + dy, 3, 2, '#7fe0ff'); R(hcx + 1, 3 + dy, 3, 2, '#7fe0ff'); S(hcx - 4, 3 + dy, '#e8fbff'); S(hcx + 1, 3 + dy, '#e8fbff'); }
    else R(hcx - 5, 4 + dy, 10, 1, P.acc[0]);
  } else if (d.style === 'elder') {
    if (view === 'down') { for (let y = 9; y <= 13; y++) for (let x = hcx - 3; x <= hcx + 2; x++) if (!(y === 13 && (x === hcx - 3 || x === hcx + 2))) S(x, y + dy, HL[y > 11 ? 1 : 2]); }
    else if (side) { for (let y = 9; y <= 13; y++) for (let x = hcx - 5; x <= hcx - 1; x++) if (!(y === 13 && x === hcx - 5)) S(x, y + dy, HL[2]); }
  } else if (d.style === 'cap') {
    for (let y = 1; y <= 4; y++) for (let x = 3; x <= 12; x++) {
      const nx = (x + 0.5 - hcx) / 5.3, ny = (y + 0.5 - hcy) / 5.6;
      if (nx * nx + ny * ny <= 1) S(x, y + dy, P.acc[tone3(nx, ny, x, y)]);
    }
    if (side) R(hcx - 7, 4 + dy, 5, 1, P.acc[0]); else if (view === 'down') R(hcx - 5, 4 + dy, 10, 1, P.acc[0]);
  } else if (d.style === 'bun') {
    const bx = side ? hcx + 4 : hcx - 1;
    R(bx - 1, 0 + dy, 3, 2, HL[1]); S(bx - 1, 0 + dy, HL[2]);
  }

  // ---- arms (side view, drawn over the torso) ----
  if (side) {
    const sx = 7 + lx, sy = 12 + dy, A = P.top[2], Ad = P.top[0], K = P.skin[1];
    const seg = (x, y, w, h) => { R(x, y, w, h, A); };
    switch (arm) {
      case 'swingF': seg(sx, sy, 2, 2); seg(sx - 1, sy + 2, 2, 2); R(sx - 2, sy + 4, 2, 1, K); break;
      case 'swingB': seg(sx, sy, 2, 2); seg(sx + 1, sy + 2, 2, 2); R(sx + 2, sy + 4, 2, 1, K); break;
      case 'forward': seg(sx - 4, sy + 1, 6, 2); R(sx - 6, sy + 1, 2, 2, K); R(sx - 4, sy + 3, 6, 1, Ad); break;
      case 'cast': for (let i = 0; i < 4; i++) seg(sx - i, sy - i, 2, 2); R(sx - 5, sy - 5, 2, 2, K); break;
      case 'back': seg(sx + 1, sy, 2, 3); seg(sx + 2, sy + 3, 2, 1); R(sx + 3, sy + 4, 2, 1, K); break;
      default: seg(sx, sy, 2, 5); R(sx, sy + 5, 2, 1, K); R(sx + 2, sy + 1, 1, 4, Ad);
    }
  }
  b.outline();
  return b.toCanvas();
}

function buildCharSet(d) {
  const L = [makeChar(d, 'left'), makeChar(d, 'left', { legs: 'stepA', arm: 'swingF' }), makeChar(d, 'left', { legs: 'stepB', arm: 'swingB' })];
  return {
    down: [makeChar(d, 'down'), makeChar(d, 'down', { legs: 'stepA' }), makeChar(d, 'down', { legs: 'stepB' })],
    up: [makeChar(d, 'up'), makeChar(d, 'up', { legs: 'stepA' }), makeChar(d, 'up', { legs: 'stepB' })],
    left: L, right: L.map(flipH),
    b: {
      stand: L[0],
      attack: makeChar(d, 'left', { arm: 'forward', lean: -1, legs: 'stepA' }),
      cast: makeChar(d, 'left', { arm: 'cast', legs: 'stand' }),
      hurt: makeChar(d, 'left', { arm: 'back', lean: 1, eyes: 'closed' }),
      kneel: makeChar(d, 'left', { legs: 'kneel' }),
      victory: makeChar(d, 'down', { arm: 'raise2' }),
    },
  };
}
// lying-down sprite for KO (90° rotation keeps pixels exact)
function rot90(src) {
  const c = mkCanvas(src.height, src.width);
  c.ctx.translate(0, src.width); c.ctx.rotate(-Math.PI / 2); c.ctx.drawImage(src, 0, 0);
  return c;
}

// ---------------- shape shader for monsters ----------------
const LIGHT = (() => { const v = [-0.55, -0.7, 0.55], l = Math.hypot(...v); return v.map(x => x / l); })();
const Shp = {
  ell: (cx, cy, rx, ry, rmp, o = {}) => ({ ...o, rmp,
    hit: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
    n: (x, y) => { const nx = (x - cx) / rx, ny = (y - cy) / ry; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; } }),
  box: (x0, y0, w, h, rmp, o = {}) => ({ ...o, rmp,
    hit: (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h,
    n: (x, y) => { const bv = o.bevel || 2; let nx = 0, ny = 0;
      if (x < x0 + bv) nx = -0.8; else if (x > x0 + w - bv) nx = 0.8;
      if (y < y0 + bv) ny = -0.8; else if (y > y0 + h - bv) ny = 0.8;
      if (!nx && !ny && o.cyl) nx = ((x - x0) / w - 0.5) * 1.6;
      return [nx, ny, 0.75]; } }),
  poly: (pts, rmp, o = {}) => ({ ...o, rmp,
    hit: (x, y) => { let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      } return inside; },
    n: () => o.normal || [0, 0, 1] }),
  fn: (hit, n, rmp, o = {}) => ({ ...o, rmp, hit, n }),
};
function shadeSprite(w, h, shapes, post, outlineCol = '#120a1a') {
  const b = new PixBuf(w, h), id = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (!s.hit(x + 0.5, y + 0.5)) continue;
      const n = s.n(x + 0.5, y + 0.5), l = Math.hypot(...n) || 1;
      let v = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / l;
      v = clamp(v * 0.9 + 0.22 + bayer(x, y) * (s.dither ?? 0.22), 0, 0.999);
      let c = s.rmp[Math.floor(v * s.rmp.length)];
      if (s.tex) c = s.tex(x, y, c, v) || c;
      b.set(x, y, c); id[y * w + x] = i; break;
    }
  }
  // contour lines where a front shape overlaps a back one
  const g = i => (shapes[i].group ?? i);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = id[y * w + x]; if (i < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = id[yy * w + xx];
      if (j > i && g(j) !== g(i) && !shapes[j].noLine) { b.set(x, y, shapes[i].rmp[0]); break; }
    }
  }
  b.outline(outlineCol);
  if (post) post(b);
  return b.toCanvas();
}

// ---------------- monsters ----------------
const RAMP = {
  gel: ['#0c3430', '#165e4c', '#279468', '#55c884', '#b2f2ae'],
  moss: ['#1e3812', '#36661c', '#5a962a', '#98cc48'],
  bat: ['#180e28', '#36205a', '#5a3a88', '#8a64b8', '#c4a6ea'],
  wing: ['#1a0a1c', '#3a1638', '#64285a', '#94467e'],
  cap: ['#3a0c16', '#781a28', '#be303a', '#ea6a5a', '#ffb4a2'],
  stem: ['#5a4232', '#9a7c64', '#d4b89c', '#f2e2ca'],
  bronze: ['#2a160c', '#5a3416', '#8c5c24', '#c48c3c', '#eec472', '#fff2b8'],
  iron: ['#121420', '#2a2e44', '#4a5070', '#7a82a4', '#b8c0dc'],
};
function makeGel(squash) {
  const ry = squash ? 10.5 : 12, rx = squash ? 15 : 14, cy = 25 - ry * 0.75;
  return shadeSprite(34, 28, [
    Shp.fn((x, y) => y < 25 && ((x - 17) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      (x, y) => { const nx = (x - 17) / rx, ny = (y - cy) / ry; return [nx, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))]; }, RAMP.gel),
    Shp.ell(11, 28 - ry * 1.55, 4, 3, RAMP.moss, { group: 1 }), Shp.ell(17, 27 - ry * 1.75, 4.5, 3.2, RAMP.moss, { group: 1 }), Shp.ell(23, 28 - ry * 1.55, 4, 3, RAMP.moss, { group: 1 }),
  ], b => {
    const ey = Math.round(26 - ry * 0.85);
    for (const ex of [12, 21]) { b.rect(ex, ey, 2, 3, '#f8fff4'); b.rect(ex + (ex < 17 ? 1 : 0), ey + 1, 1, 2, '#10202a'); }
    b.rect(15, ey + 5, 4, 1, '#0c3430'); b.set(8, ey - 2, '#e8fff0'); b.set(9, ey - 3, '#e8fff0'); b.set(8, ey - 3, '#ffffff');
  });
}
function makeBat(up) {
  const L = up ? [[17, 13], [9, 2], [3, 1], [5, 6], [1, 9], [6, 11], [3, 15], [15, 17]]
               : [[17, 13], [11, 15], [3, 23], [7, 22], [6, 26], [11, 23], [14, 25], [16, 18]];
  const R = L.map(([x, y]) => [40 - x, y]);
  return shadeSprite(40, 30, [
    Shp.poly(L, RAMP.wing, { normal: [-0.3, up ? -0.3 : 0.2, 1], dither: 0.4 }),
    Shp.poly(R, RAMP.wing, { normal: [0.3, up ? -0.3 : 0.2, 1], dither: 0.4 }),
    Shp.poly([[15, 10], [16, 3], [19, 9]], RAMP.bat, { normal: [-0.4, -0.3, 1] }),
    Shp.poly([[21, 9], [24, 3], [25, 10]], RAMP.bat, { normal: [0.2, -0.3, 1] }),
    Shp.ell(20, 14, 6, 6.5, RAMP.bat),
  ], b => {
    b.rect(17, 12, 2, 2, '#ffe25a'); b.rect(22, 12, 2, 2, '#ffe25a'); b.set(17, 12, '#fffbd0'); b.set(22, 12, '#fffbd0');
    b.set(18, 17, '#f4f0ff'); b.set(22, 17, '#f4f0ff'); b.rect(19, 16, 3, 1, '#180e28');
  });
}
function makeShroom(hop) {
  const o = hop ? -2 : 0;
  const spots = [[9, 8], [16, 5], [22, 9], [13, 12], [20, 13], [5, 13], [25, 14]];
  return shadeSprite(32, 34, [
    Shp.ell(16, 25, 7.5, 8.5, RAMP.stem),
    Shp.ell(16, 16.5 + o, 11, 3, ['#4a3426', '#7a5c44', '#a88a6a'], { noLine: true }),
    Shp.fn((x, y) => y < 17 + o && ((x - 16) / 15) ** 2 + ((y - 14 - o) / 11.5) ** 2 <= 1,
      (x, y) => { const nx = (x - 16) / 15, ny = (y - 14 - o) / 11.5; return [nx, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))]; },
      RAMP.cap, { tex: (x, y, c, v) => spots.some(([sx, sy]) => (x - sx) ** 2 + (y - sy - o) ** 2 < 5) ? (v > 0.45 ? '#fbf6ff' : '#cfc4d6') : null }),
  ], b => {
    b.rect(13, 22, 1, 3, '#20141c'); b.rect(18, 22, 1, 3, '#20141c'); b.set(13, 22, '#ffffff'); b.set(18, 22, '#ffffff');
    b.rect(15, 27, 2, 1, '#6a4232'); b.set(12, 25, '#f2a0a0'); b.set(19, 25, '#f2a0a0');
    b.rect(9, 32, 5, 2, '#5a4232'); b.rect(18, 32, 5, 2, '#5a4232');
  });
}
function makeSentinel() {
  const B = RAMP.bronze, I = RAMP.iron;
  return shadeSprite(88, 96, [
    Shp.box(24, 66, 14, 22, I, { cyl: true, bevel: 3 }), Shp.box(50, 66, 14, 22, I, { cyl: true, bevel: 3 }),
    Shp.box(18, 84, 24, 10, B, { bevel: 3 }), Shp.box(46, 84, 24, 10, B, { bevel: 3 }),
    Shp.box(18, 26, 52, 44, B, { bevel: 4 }),
    Shp.box(28, 34, 32, 28, ['#1c0e08', '#3a2010', '#5a3416', '#7a4c22', '#9a6a32'], { bevel: 3 }),
    Shp.box(4, 40, 15, 28, B, { cyl: true, bevel: 3 }), Shp.box(69, 40, 15, 28, B, { cyl: true, bevel: 3 }),
    Shp.ell(15, 33, 12, 11, I), Shp.ell(73, 33, 12, 11, I),
    Shp.ell(11, 74, 10, 9, I), Shp.ell(77, 74, 10, 9, I),
    Shp.poly([[30, 10], [26, 0], [36, 7]], B, { normal: [-0.4, -0.5, 1] }), Shp.poly([[58, 10], [62, 0], [52, 7]], B, { normal: [0.3, -0.5, 1] }),
    Shp.box(30, 6, 28, 22, B, { bevel: 4 }),
    Shp.box(34, 14, 20, 6, ['#06060c', '#10101c', '#1a1a2a'], { bevel: 1 }),
  ], b => {
    for (const [x, y] of [[21, 29], [66, 29], [21, 66], [66, 66], [33, 9], [54, 9], [7, 44], [80, 44], [7, 64], [80, 64]]) { b.set(x, y, '#fff2b8'); b.set(x + 1, y + 1, '#5a3416'); }
    for (let x = 22; x < 66; x += 4) b.set(x, 70, '#2a160c');
    b.rect(10, 22, 3, 6, '#4a5070'); b.rect(75, 22, 3, 6, '#4a5070');
  });
}
// rotating gear for the Sentinel's chest
function makeGear(rot, col = '#d8a24a') {
  const b = new PixBuf(22, 22), G = ramp(col, 4, 0.5);
  for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
    const dx = x - 10.5, dy = y - 10.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + rot;
    const tooth = Math.cos(a * 8) > 0.3 ? 10.5 : 8.6;
    if (r <= tooth && r > 3) {
      const v = clamp((-dx - dy) / 22 + 0.5 + bayer(x, y) * 0.3, 0, 0.99);
      b.set(x, y, r < 5 ? G[0] : G[Math.floor(v * 4)]);
    }
  }
  b.outline('#1c0e08');
  return b.toCanvas();
}
// save crystal
function makeCrystal(phase) {
  const C = ['#103a6a', '#1e6cb0', '#3aa4e8', '#8ad8ff', '#e6faff'];
  const k = Math.sin(phase) * 0.6;
  return shadeSprite(16, 24, [
    Shp.poly([[8, 1], [2, 9], [8, 22]], C, { normal: [-0.8 + k, -0.2, 0.6], dither: 0.1 }),
    Shp.poly([[8, 1], [14, 9], [8, 22]], C, { normal: [0.5 + k, 0.1, 0.6], dither: 0.1, group: 0 }),
    Shp.poly([[8, 1], [5, 9], [8, 20], [11, 9]], C, { normal: [k * 0.5, -0.4, 1], dither: 0.1, group: 0 }),
  ], null, '#0a1830');
}
