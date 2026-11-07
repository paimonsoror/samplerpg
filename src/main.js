'use strict';
// ===================================================================
//  main.js — scenes, transitions, Mode 7 title, game loop.
// ===================================================================

let scene = 'title', battle = null, trans = null;
let shakeT = 0, shakeMag = 0;
function shake(frames, mag) { shakeT = Math.max(shakeT, frames); shakeMag = Math.max(mag, shakeT > 0 ? shakeMag : 0); }

// ---------------- Mode 7 ----------------
const M7 = makeWorldTexture();
const m7img = ctx.createImageData(W, H), m7buf = new Uint32Array(m7img.data.buffer);
const SKY = Array.from({ length: H }, (_, y) => hexToRgb(mixColor('#1a2a78', '#f0b0a0', clamp(y / 96, 0, 1))));
function renderMode7(cx, cy, ang, horizon = 84, height = 34) {
  const px = M7.px, cos = Math.cos(ang), sin = Math.sin(ang);
  const haze = [236, 176, 168];
  for (let y = 0; y < H; y++) {
    const row = y * W;
    if (y <= horizon) {
      const s = SKY[y], band = Math.sin(y * 0.6 + frameCount * 0.01) > 0.85 && y > 40 ? 18 : 0;
      const c = (255 << 24) | (Math.min(255, s[2] + band) << 16) | (Math.min(255, s[1] + band) << 8) | Math.min(255, s[0] + band);
      for (let x = 0; x < W; x++) m7buf[row + x] = c;
      continue;
    }
    const z = height * 128 / (y - horizon);
    const fog = clamp((z - 30) / 260, 0, 0.9), inv = 1 - fog;
    const hr = haze[0] * fog, hg = haze[1] * fog, hb = haze[2] * fog;
    const fx = cx + cos * z, fy = cy + sin * z, k = z / 128;
    for (let x = 0; x < W; x++) {
      const lat = (x - 128) * k;
      const u = (fx - sin * lat) & 255, v = (fy + cos * lat) & 255;
      const c = px[v * 256 + u];
      m7buf[row + x] = (255 << 24) | (((c >> 16 & 255) * inv + hb) << 16) | (((c >> 8 & 255) * inv + hg) << 8) | ((c & 255) * inv + hr);
    }
  }
  ctx.putImageData(m7img, 0, 0);
}

// ---------------- title logo ----------------
function makeLogo(text, scale, top, bot) {
  const w = textWidth(text), base = mkCanvas(w, 9);
  drawText(text, 0, 0, '#ffffff', null, base.ctx);
  const big = mkCanvas(w * scale + 4, 9 * scale + 4);
  const g = big.ctx;
  g.drawImage(base, 0, 0, w, 9, 2, 2, w * scale, 9 * scale);
  g.globalCompositeOperation = 'source-atop';
  for (let y = 0; y < big.height; y++) { g.fillStyle = mixColor(top, bot, y / big.height); g.fillRect(0, y, big.width, 1); }
  g.globalCompositeOperation = 'source-over';
  const out = mkCanvas(big.width + 2, big.height + 2), sil = tinted(big, '#140c30');
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [2, 2], [2, 3], [3, 3]]) out.ctx.drawImage(sil, dx, dy);
  out.ctx.drawImage(big, 1, 1);
  return out;
}
const LOGO1 = makeLogo('ECHOES', 3, '#fff6c8', '#e08a2a');
const LOGO2 = makeLogo('of ASTER', 2, '#d8f4ff', '#5a8ae8');

const Title = {
  t: 0, sel: 0,
  enter() { this.t = 0; this.sel = 0; scene = 'title'; Sound.playSong('title'); },
  update() {
    this.t++;
    if (this.t < 30 || trans) return;
    if (Input.rep('up') || Input.rep('down')) { this.sel ^= 1; Sound.sfx('cursor'); }
    if (Input.hit('ok')) {
      Sound.unlock();
      if (this.sel === 1) { Sound.setMuted(!Sound.muted); Sound.sfx('ok'); return; }
      Sound.sfx('ok'); Sound.stopSong(1);
      fadeTo(() => {
        newGame(); Field.start(); scene = 'field';
        Field.playAreaMusic(true); Field.run(introEvent());
      }, 40);
    }
  },
  draw() {
    const t = this.t;
    renderMode7(128 + t * 0.35, 128 + Math.sin(t / 400) * 60, t / 900 - 0.6);
    const ly = Math.round(Math.min(26, -60 + t * 1.5));
    ctx.drawImage(LOGO1, (W - LOGO1.width) / 2, ly);
    if (t > 50) ctx.drawImage(LOGO2, (W - LOGO2.width) / 2, ly + 32);
    if (t > 70) {
      drawTextC('A 16-bit style tech demo', W / 2, ly + 56, '#fff2e0', '#3a1a40');
      drawWindow(80, 150, 96, 42);
      drawText('New Game', 104, 160); drawText(`Sound: ${Sound.muted ? 'Off' : 'On'}`, 104, 175);
      drawCursor(102, 160 + this.sel * 15);
      drawTextC(document.hasFocus() ? 'Z / Enter to choose' : 'Click the screen, then press Z', W / 2, 206, '#ffffff', '#3a1a40');
    }
  },
};

// ---------------- transitions ----------------
function fadeTo(mid, frames = 24) { trans = { kind: 'fade', t: 0, dur: frames, mid, done: false }; }
const snapC = mkCanvas(W, H), mosaicC = mkCanvas(W, H);
function startBattle(formation, opts = {}) {
  snapC.ctx.drawImage(screenCanvas, 0, 0);
  Sound.stopSong(0.15); Sound.sfx('encounter');
  trans = { kind: 'swirl', t: 0, dur: 48, mid: () => { battle = new Battle(formation, opts); scene = 'battle'; } };
}
function endBattle(result) {
  fadeTo(() => {
    battle = null;
    if (result === 'lose') { scene = 'gameover'; GameOver.t = 0; }
    else { scene = 'field'; Field.afterBattle(result); }
  }, 30);
}
function showEnding() { Sound.stopSong(2); fadeTo(() => { scene = 'ending'; Ending.t = 0; Sound.playSong('title'); }, 70); }
function updateTrans() {
  if (!trans) return;
  trans.t++;
  if (trans.t === trans.dur && !trans.done) { trans.done = true; trans.mid(); }
  if (trans.t >= trans.dur * 2 - (trans.kind === 'swirl' ? trans.dur - 20 : 0)) trans = null;
}
function drawTrans() {
  if (!trans) return;
  const half = trans.dur;
  if (trans.kind === 'swirl' && trans.t < half) {
    // SNES-style encounter: flash, then a spinning, zooming mosaic into black
    const k = trans.t / half;
    const m = Math.max(1, Math.floor(1 + k * 14)), sw = Math.ceil(W / m), sh = Math.ceil(H / m);
    mosaicC.ctx.clearRect(0, 0, W, H);
    mosaicC.ctx.drawImage(snapC, 0, 0, W, H, 0, 0, sw, sh);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(k * k * Math.PI * 1.6); ctx.scale(1 + k * 2.5, 1 + k * 2.5);
    ctx.drawImage(mosaicC, 0, 0, sw, sh, -W / 2, -H / 2, W, H);
    ctx.restore();
    if (trans.t < 10 && trans.t % 4 < 2) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = clamp(k * 1.3 - 0.2, 0, 1); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    return;
  }
  const a = trans.kind === 'swirl' ? 1 - (trans.t - half) / 20 : trans.t < half ? trans.t / half : 1 - (trans.t - half) / half;
  ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
}

// ---------------- game over / ending ----------------
const GameOver = {
  t: 0,
  update() {
    this.t++;
    if (this.t > 60 && Input.hit('ok') && !trans) {
      Sound.sfx('ok');
      fadeTo(() => { healParty(); Field.start(); scene = 'field'; Field.playAreaMusic(true); }, 30);
    }
  },
  draw() {
    ctx.fillStyle = '#05040c'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 3 ? '#2a2850' : '#5a58a0'; ctx.fillRect((i * 67) % W, (i * 41 + this.t * 0.1 * (1 + i % 3)) % H, 1, 1); }
    ctx.globalAlpha = clamp(this.t / 60, 0, 1);
    drawTextC('The light fades...', W / 2, 92, C_GREY);
    drawTextC('GAME OVER', W / 2, 108, C_RED);
    if (this.t > 60) drawTextC('Z: wake at the last crystal', W / 2, 140, C_TEXT);
    ctx.globalAlpha = 1;
  },
};
const ENDING_LINES = [
  ['The Sentinel has fallen.', C_TEXT], ['But somewhere beyond the gate,', C_TEXT], ['the Aster Bell still rings...', C_TEXT], ['', 0],
  ['To be continued', C_GOLD], ['', 0], ['', 0],
  ['ECHOES OF ASTER', C_GOLD], ['a 16-bit style tech demo', C_GREY], ['', 0],
  ['Every pixel, tile, monster,', C_TEXT], ['song and sound effect here', C_TEXT], ['is generated by code at load.', C_TEXT],
  ['No image or audio files.', C_TEXT], ['', 0],
  ['Mode 7 world  /  ATB battles', C_CYAN], ['combo techs  /  SNES-style echo', C_CYAN], ['', 0], ['', 0],
  ['Thanks for playing!', C_GOLD],
];
const Ending = {
  t: 0,
  update() {
    this.t++;
    if (this.t > 240 && Input.hit('ok') && !trans) { Sound.sfx('ok'); Sound.stopSong(1); fadeTo(() => Title.enter(), 40); }
  },
  draw() {
    renderMode7(60 + this.t * 0.5, 200, -1.2 + this.t / 1500, 70, 50);
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#0a0820'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    const maxScroll = 200 + (ENDING_LINES.length - 1) * 14 - 104, scroll = Math.min(this.t * 0.35, maxScroll);
    ENDING_LINES.forEach(([s, c], i) => {
      const y = 200 + i * 14 - scroll;
      if (s && y > -10 && y < H) drawTextC(s, W / 2, y, c);
    });
    if (scroll >= maxScroll && frameCount % 60 < 40) drawTextC('Z: return to title', W / 2, 196, C_GREY);
  },
};

// ---------------- loop ----------------
function update() {
  updateTrans();
  if (trans && trans.kind === 'swirl' && trans.t < trans.dur) return;
  if (trans && !trans.done && scene !== 'title') return;
  if (scene === 'title') Title.update();
  else if (scene === 'field') Field.update();
  else if (scene === 'battle' && battle) battle.update();
  else if (scene === 'gameover') GameOver.update();
  else if (scene === 'ending') Ending.update();
}
function render() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let sx = 0, sy = 0;
  if (shakeT > 0) { shakeT--; sx = Math.round((rand() - 0.5) * 2 * shakeMag); sy = Math.round((rand() - 0.5) * 2 * shakeMag); if (!shakeT) shakeMag = 0; }
  ctx.save(); ctx.translate(sx, sy);
  if (scene === 'title') Title.draw();
  else if (scene === 'field') Field.draw();
  else if (scene === 'battle' && battle) battle.draw();
  else if (scene === 'gameover') GameOver.draw();
  else if (scene === 'ending') Ending.draw();
  ctx.restore();
  drawTrans();
}
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= 1000 / 60) { Input.frame(); update(); frameCount++; acc -= 1000 / 60; }
  render();
  requestAnimationFrame(loop);
}

// ---------------- layout ----------------
function fit() {
  const pad = document.getElementById('pad');
  const padH = pad && getComputedStyle(pad).display !== 'none' ? pad.offsetHeight + 16 : 34;
  const availW = document.documentElement.clientWidth - 32, availH = window.innerHeight - padH - 36;
  let s = Math.min(availW / W, availH / H);
  if (s >= 2) s = Math.floor(s);
  s = Math.max(0.5, s);
  screenCanvas.style.width = Math.round(W * s) + 'px';
  screenCanvas.style.height = Math.round(H * s) + 'px';
}
window.addEventListener('resize', fit);
fit();

Input.onFirst.push(() => Sound.unlock());
Title.enter();
screenCanvas.focus();
requestAnimationFrame(loop);
