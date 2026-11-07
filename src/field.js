'use strict';
// ===================================================================
//  field.js — the walkable map: layered rendering (ground / sprites /
//  canopy overlay), grid movement with a following party, NPCs,
//  dialogue, cutscene scripts, random encounters and the status menu.
// ===================================================================

const SOLID = new Set(['F', 'T', '~', 'X', 'G', 'P', 'b', 'r', 'f', 's', 'w', 'C', '@']);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const Field = {
  built: false,
  build() {
    buildTiles(); buildObjects();
    const r = mulberry32(99);
    this.ground = mkCanvas(MW * T, MH * T); this.overlay = mkCanvas(MW * T, MH * T);
    this.solid = new Uint8Array(MW * MH);
    this.water = []; this.props = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 'F' : MAP[y][x]);
    const g = this.ground.ctx, o = this.overlay.ctx;
    const isWall = c => c === 'X' || c === 'G';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const c = at(x, y), X = x * T, Y = y * T;
      if (SOLID.has(c)) this.solid[y * MW + x] = 1;
      let tile;
      switch (c) {
        case ',': tile = pick.call(null, TILES.flowers); break;
        case '"': tile = TILES.tall[(x + y) % 2]; break;
        case '=': tile = TILES.path[(x * 3 + y) % 2]; break;
        case 'F': tile = TILES.forest; break;
        case 'S': case 'g': case '@': case 'P': tile = TILES.stone[(x * 7 + y * 3) % 3]; break;
        case 'X': case 'G': tile = TILES.wall; break;
        case '~': case '#': tile = TILES.water[0]; break;
        default: tile = TILES.grass[Math.floor(r() * 3)];
      }
      g.drawImage(tile, X, Y);
      if (c === '#') g.drawImage(TILES.bridge, X, Y);
      if (c === '~' || c === '#') {
        const e = { x, y, bridge: c === '#', n: !'~#'.includes(at(x, y - 1)), s: !'~#'.includes(at(x, y + 1)), w: !'~#'.includes(at(x - 1, y)), e: !'~#'.includes(at(x + 1, y)) };
        this.water.push(e);
      }
      if (c === '=') { // ragged grass fringe onto the path
        g.fillStyle = GR[2];
        const fr = (dx, dy, horiz) => { if ('=#'.includes(at(x + dx, y + dy))) return;
          for (let i = 0; i < 16; i++) if (r() < 0.55) { const d = 1 + Math.floor(r() * 2);
            if (horiz) g.fillRect(X + i, dy < 0 ? Y : Y + 16 - d, 1, d); else g.fillRect(dx < 0 ? X : X + 16 - d, Y + i, d, 1); } };
        fr(-1, 0, false); fr(1, 0, false); fr(0, -1, true); fr(0, 1, true);
      }
      if (isWall(c)) {
        if (!isWall(at(x, y - 1)) ) { g.fillStyle = '#aaa8c4'; g.fillRect(X, Y, 16, 2); g.fillStyle = '#7a7896'; g.fillRect(X, Y + 2, 16, 1); }
        if (!isWall(at(x, y + 1)) && at(x, y + 1) !== 'F') { g.fillStyle = '#1a1830'; g.fillRect(X, Y + 13, 16, 3); }
      }
      if (c === 'S' && isWall(at(x, y - 1))) { g.fillStyle = 'rgba(10,8,24,0.45)'; g.fillRect(X, Y, 16, 5); }
      if (c === 'T') { const t = OBJ.trees[(x + y) % 2]; g.drawImage(t.bot, X - 8, Y); o.drawImage(t.top, X - 8, Y - 32); }
      if (c === 'P') { g.drawImage(OBJ.pillar.bot, X, Y); o.drawImage(OBJ.pillar.top, X, Y - 16); }
      if (c === 'G') this.gate = { x: X - 16, y: Y - 32, tx: x, ty: y };
      if (c === 'b') this.props.push({ img: OBJ.bush, x: X, y: Y });
      if (c === 'r') this.props.push({ img: OBJ.rock, x: X, y: Y });
      if (c === 'f') this.props.push({ img: OBJ.fence, x: X, y: Y });
      if (c === 's') this.props.push({ img: OBJ.sign, x: X, y: Y });
      if (c === 'w') this.props.push({ img: OBJ.well, x: X, y: Y - 8, h: 24 });
      if (c === 'C') this.props.push({ chest: `${x},${y}`, x: X, y: Y });
      if (c === '@') { this.crystal = { x: X, y: Y - 10 }; }
    }
    // dense forest: trees on a checkerboard of forest tiles, drawn top-down so lower canopies overlap
    for (let y = 0; y < MH + 2; y++) for (let x = -1; x <= MW; x++) {
      if (at(x, y) !== 'F' || (x + y) % 2) continue;
      const t = OBJ.trees[2 + ((x * 5 + y * 3) % 7 < 3 ? 0 : 1)];
      g.drawImage(t.bot, x * T - 8, y * T); o.drawImage(t.top, x * T - 8, y * T - 32);
    }
    for (const h of HOUSES) {
      g.drawImage(OBJ[h.kind], h.x * T, h.y * T);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) this.solid[(h.y + j) * MW + h.x + i] = 1;
    }
    this.npcs = NPCS.map(n => ({ ...n, set: buildCharSet(NPC_LOOKS[n.look]), px: n.x * T, py: n.y * T, moving: false, anim: 0, timer: rint(60, 140) }));
    this.heroSets = {};
    for (const id in HEROES) this.heroSets[id] = buildCharSet(HEROES[id].look);
    this.leaves = Array.from({ length: 14 }, () => ({ x: rand() * 256, y: rand() * 224, v: 0.2 + rand() * 0.4, p: rand() * 6 }));
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: i * 160 + rand() * 60, y: rand() * MH * T, rx: 50 + rand() * 30, ry: 26 + rand() * 12 }));
    this.built = true;
  },

  start() {
    if (!this.built) this.build();
    const sp = Game.respawn;
    this.party = Game.party.map((m, i) => ({ id: m.id, x: sp.x, y: sp.y, px: sp.x * T, py: sp.y * T, dir: sp.dir, moving: false, anim: 0 }));
    this.encounter = rint(14, 24);
    this.dialog = null; this.menu = false; this.script = null; this.wait = 0; this.banner = null; this.area = null;
    this.locked = false; this.paused = false; this.flash = 0;
    this.chestsOpen = Game.flags.chests || (Game.flags.chests = {});
  },
  leader() { return this.party[0]; },
  isSolid(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    if (this.solid[y * MW + x]) return true;
    return this.npcs.some(n => n.x === x && n.y === y);
  },
  areaOf(y) { return y <= 10 ? 'ruins' : y <= 24 ? 'forest' : 'village'; },

  // ---------- scripting ----------
  run(gen) { this.script = gen; this.wait = 0; this.stepScript(); },
  stepScript() {
    while (this.script && !this.wait && !this.dialog && !this.paused) {
      const r = this.script.next(this.resumeValue);
      this.resumeValue = undefined;
      if (r.done) { this.script = null; break; }
      const v = r.value;
      if (typeof v === 'number') this.wait = v;
      else if (v && v.battle) { this.paused = true; startBattle(v.battle, v); }
      else if (v && v.call) v.call();
    }
  },
  say(lines, onDone) { this.dialog = { lines, i: 0, shown: 0, onDone }; },
  afterBattle(result) { this.paused = false; this.resumeValue = result; this.encounter = rint(14, 24); this.playAreaMusic(true); },

  // ---------- update ----------
  update() {
    Game.frames++;
    const L = this.leader();
    if (this.dialog) return this.updateDialog();
    if (this.menu) { if (Input.hit('cancel') || Input.hit('menu')) { this.menu = false; Sound.sfx('cancel'); } return; }
    if (this.wait > 0) { this.wait--; this.animate(); if (!this.wait) this.stepScript(); return; }
    if (this.script) { this.stepScript(); this.animate(); return; }
    this.animate();
    if (this.paused || this.locked) return;
    if (!L.moving) {
      if (Input.hit('menu')) { this.menu = true; Sound.sfx('ok'); return; }
      if (Input.hit('ok')) { this.interact(); return; }
      const d = Input.dir();
      if (d) {
        L.dir = d;
        const [dx, dy] = DIRS[d], nx = L.x + dx, ny = L.y + dy;
        if (!this.isSolid(nx, ny)) {
          for (let i = this.party.length - 1; i > 0; i--) this.beginMove(this.party[i], this.party[i - 1].x, this.party[i - 1].y);
          this.beginMove(L, nx, ny);
        }
      }
    }
    this.updateNPCs();
  },
  beginMove(m, x, y) {
    if (m.x === x && m.y === y) return;
    m.dir = x > m.x ? 'right' : x < m.x ? 'left' : y > m.y ? 'down' : 'up';
    m.fx = m.x; m.fy = m.y; m.x = x; m.y = y; m.moving = true; m.t = 0;
  },
  animate() {
    const dash = Input.down.cancel || Input.down.dash;
    const dur = dash ? 8 : 14;
    let arrived = false;
    for (const m of this.party) {
      if (!m.moving) continue;
      m.t++; m.anim++;
      if (dash) m.anim++;
      const k = Math.min(1, m.t / dur);
      m.px = Math.round(lerp(m.fx, m.x, k) * T); m.py = Math.round(lerp(m.fy, m.y, k) * T);
      if (k >= 1) { m.moving = false; if (m === this.party[0]) arrived = true; }
    }
    if (arrived) this.onStep();
    for (const n of this.npcs) if (n.moving) {
      n.t++; n.anim++;
      const k = Math.min(1, n.t / 20);
      n.px = Math.round(lerp(n.fx, n.x, k) * T); n.py = Math.round(lerp(n.fy, n.y, k) * T);
      if (k >= 1) n.moving = false;
    }
  },
  onStep() {
    const L = this.leader(), c = MAP[L.y][L.x];
    this.playAreaMusic();
    if (c === 'g' && !Game.flags.boss) return this.run(bossEvent());
    if (c === '"' && !this.script) {
      if (--this.encounter <= 0) {
        const f = pick(FORMATIONS[L.y < 17 ? 'north' : 'south']);
        this.run((function* () { const res = yield { battle: f }; })());
      }
    }
  },
  playAreaMusic(force) {
    const a = this.areaOf(this.leader().y);
    if (a !== this.area || force) {
      if (a !== this.area) this.banner = { text: { village: 'Larkspur Village', forest: 'Whisperwood', ruins: 'Aster Ruins' }[a], t: 0 };
      this.area = a;
      Sound.playSong(a === 'village' ? 'village' : 'forest');
    }
  },
  updateNPCs() {
    for (const n of this.npcs) {
      if (!n.wander || n.moving) continue;
      if (--n.timer > 0) continue;
      n.timer = rint(50, 150);
      const d = pick(Object.keys(DIRS)), [dx, dy] = DIRS[d], nx = n.x + dx, ny = n.y + dy, w = n.wander;
      n.dir = d;
      if (nx < w.x0 || nx > w.x1 || ny < w.y0 || ny > w.y1) continue;
      if (this.isSolid(nx, ny) || this.party.some(p => p.x === nx && p.y === ny)) continue;
      n.fx = n.x; n.fy = n.y; n.x = nx; n.y = ny; n.moving = true; n.t = 0;
    }
  },
  interact() {
    const L = this.leader(), [dx, dy] = DIRS[L.dir], tx = L.x + dx, ty = L.y + dy, key = `${tx},${ty}`;
    const npc = this.npcs.find(n => n.x === tx && n.y === ty);
    if (npc) {
      npc.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[L.dir];
      const talked = Game.flags['talk_' + npc.id];
      Game.flags['talk_' + npc.id] = true;
      return this.say(talked && npc.talk2 ? npc.talk2 : npc.talk);
    }
    if (SIGNS[key]) return this.say(SIGNS[key]);
    if (CHESTS[key]) {
      if (this.chestsOpen[key]) return this.say([['', 'The chest is empty.']]);
      this.chestsOpen[key] = true; Sound.sfx('chest');
      for (const [k, n] of Object.entries(CHESTS[key].items)) Game.items[k] = (Game.items[k] || 0) + n;
      return this.say([['', CHESTS[key].text]]);
    }
    const c = MAP[ty] && MAP[ty][tx];
    if (c === '@') {
      Sound.sfx('save'); healParty(); Game.respawn = { x: L.x, y: L.y, dir: L.dir };
      this.flash = 30;
      return this.say([['', 'The crystal hums warmly. HP and MP fully restored. You will return here if the party falls.']]);
    }
    if (c === 'w') return this.say([['', 'The water far below shivers in rings, though the air is still.']]);
    if (c === '~') return this.say([['', 'Cold, clear water. A fish darts away.']]);
    const house = HOUSES.find(h => tx === h.x + 2 && ty === h.y + 3);
    if (house) return this.say([['', house.door]]);
  },
  updateDialog() {
    const d = this.dialog, [, text] = d.lines[d.i];
    if (d.shown < text.length) {
      const before = Math.floor(d.shown);
      d.shown = Math.min(text.length, d.shown + (Input.down.ok ? 3 : 1.25));
      if (Math.floor(d.shown / 3) !== Math.floor(before / 3)) Sound.sfx('text');
      if (Input.hit('ok') && d.shown > 2) d.shown = text.length;
      return;
    }
    if (Input.hit('ok') || Input.hit('cancel')) {
      Sound.sfx('cursor');
      d.i++; d.shown = 0;
      if (d.i >= d.lines.length) { this.dialog = null; if (d.onDone) d.onDone(); this.stepScript(); }
    }
  },

  // ---------- draw ----------
  camera() {
    const L = this.leader();
    return { x: clamp(Math.round(L.px + 8 - W / 2), 0, MW * T - W), y: clamp(Math.round(L.py + 8 - H / 2), 0, MH * T - H) };
  },
  drawChar(set, m, cam) {
    const seq = [0, 1, 0, 2], f = m.moving || m.forceWalk ? seq[Math.floor(m.anim / 7) % 4] : 0;
    const x = m.px - cam.x, y = m.py - cam.y;
    if (x < -24 || y < -32 || x > W + 8 || y > H + 8) return;
    ctx.drawImage(OBJ.shadow, x + 1, y + 12);
    ctx.drawImage(set[m.dir][f], x, y - 9);
  },
  draw() {
    const cam = this.cam = this.camera();
    ctx.drawImage(this.ground, cam.x, cam.y, W, H, 0, 0, W, H);
    // animated water + shoreline foam
    const wf = TILES.water[Math.floor(frameCount / 14) % 4];
    for (const w of this.water) {
      const x = w.x * T - cam.x, y = w.y * T - cam.y;
      if (x < -16 || y < -16 || x > W || y > H) continue;
      ctx.drawImage(wf, x, y);
      ctx.fillStyle = '#cfe8f8';
      if (w.n) ctx.fillRect(x, y, 16, 2); if (w.s) ctx.fillRect(x, y + 14, 16, 2);
      if (w.w && !w.bridge) ctx.fillRect(x, y, 2, 16); if (w.e && !w.bridge) ctx.fillRect(x + 14, y, 2, 16);
      if (w.bridge) ctx.drawImage(TILES.bridge, x, y);
    }
    if (this.gate) drawGate(this.gate.x - cam.x, this.gate.y - cam.y, 0.5 + Math.sin(frameCount / 20) * 0.5, Game.flags.boss);
    // y-sorted sprites
    const list = [];
    for (const p of this.props) list.push({ y: p.y + (p.h || 16), f: () => {
      const img = p.chest ? OBJ.chest[this.chestsOpen[p.chest] ? 1 : 0] : p.img;
      ctx.drawImage(img, p.x - cam.x, p.y - cam.y);
    } });
    if (this.crystal) list.push({ y: this.crystal.y + 26, f: () => this.drawCrystal(cam) });
    for (const n of this.npcs) list.push({ y: n.py + 16, f: () => this.drawChar(n.set, n, cam) });
    for (let i = this.party.length - 1; i >= 0; i--) {
      const m = this.party[i];
      if (i > 0 && !m.moving && m.x === this.party[0].x && m.y === this.party[0].y) continue;
      list.push({ y: m.py + 16 - i * 0.1, f: () => this.drawChar(this.heroSets[m.id], m, cam) });
    }
    list.sort((a, b) => a.y - b.y).forEach(s => s.f());
    ctx.drawImage(this.overlay, cam.x, cam.y, W, H, 0, 0, W, H);
    this.drawAmbient(cam);
    if (this.flash > 0) { ctx.fillStyle = `rgba(160,230,255,${this.flash / 60})`; ctx.fillRect(0, 0, W, H); this.flash--; }
    if (this.banner) this.drawBanner();
    if (this.dialog) this.drawDialog();
    if (this.menu) this.drawMenu();
  },
  drawCrystal(cam) {
    const c = this.crystal, bob = Math.round(Math.sin(frameCount / 18) * 2);
    const x = c.x - cam.x, y = c.y - cam.y + bob;
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#7fe0ff';
    ctx.fillRect(x + 2, c.y - cam.y + 26, 12, 2); ctx.globalAlpha = 1;
    ctx.drawImage(OBJ.crystal[Math.floor(frameCount / 8) % 8], x, y);
    for (let i = 0; i < 3; i++) {
      const a = frameCount / 30 + i * 2.1, sx = x + 8 + Math.cos(a) * 11, sy = y + 12 + Math.sin(a * 1.3) * 9;
      ctx.fillStyle = (frameCount + i * 7) % 20 < 10 ? '#ffffff' : '#8ae8ff'; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  },
  drawAmbient(cam) {
    const a = this.area;
    if (a !== 'ruins') { // drifting cloud shadows (SNES-style colour math)
      ctx.fillStyle = 'rgba(8,16,40,0.13)';
      for (const c of this.clouds) {
        c.x += 0.15; if (c.x - c.rx > MW * T) c.x = -c.rx * 2;
        const x = c.x - cam.x, y = c.y - cam.y;
        if (x < -c.rx * 2 || x > W + c.rx * 2 || y < -c.ry * 2 || y > H + c.ry * 2) continue;
        ctx.beginPath(); ctx.ellipse(x, y, c.rx, c.ry, 0, 0, Math.PI * 2); ctx.ellipse(x + c.rx * 0.7, y + 8, c.rx * 0.7, c.ry * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (a === 'forest' || a === 'ruins') {
      for (const l of this.leaves) {
        l.y += l.v; l.x += Math.sin((frameCount + l.p * 40) / 30) * 0.4; l.p += 0.01;
        if (l.y > H) { l.y = -4; l.x = rand() * W; }
        ctx.fillStyle = a === 'ruins' ? ((frameCount + l.p * 9 | 0) % 30 < 15 ? '#8ae8ff' : '#3aa8d8') : (l.v > 0.4 ? '#d8a040' : '#9ac848');
        ctx.fillRect(Math.round(l.x), Math.round(l.y), a === 'ruins' ? 1 : 2, 1);
      }
    }
  },
  drawBanner() {
    const b = this.banner; b.t++;
    if (b.t > 150) { this.banner = null; return; }
    const w = textWidth(b.text) + 24, y = b.t < 12 ? -20 + b.t * 2 : b.t > 138 ? 4 - (b.t - 138) * 2 : 4;
    drawWindow((W - w) / 2, y, w, 19); drawTextC(b.text, W / 2, y + 5);
  },
  drawDialog() {
    const d = this.dialog, [name, text] = d.lines[d.i];
    const L = this.leader(), top = L.py - this.cam.y > 130;
    const y = top ? 6 : 150, h = 66;
    drawWindow(4, y, 248, h);
    const lines = wrapText(text, 228);
    let left = Math.floor(d.shown), ty = y + 10;
    if (name) { drawText(name, 14, ty, C_GOLD); ty += 13; }
    for (const ln of lines) { if (left <= 0) break; drawText(ln.slice(0, left), 14, ty); left -= ln.length + 1; ty += 12; }
    if (d.shown >= text.length && frameCount % 40 < 26) {
      ctx.fillStyle = C_TEXT; const ax = 238, ay = y + h - 11;
      ctx.fillRect(ax, ay, 7, 1); ctx.fillRect(ax + 1, ay + 1, 5, 1); ctx.fillRect(ax + 2, ay + 2, 3, 1); ctx.fillRect(ax + 3, ay + 3, 1, 1);
    }
  },
  drawMenu() {
    drawWindow(0, 0, 176, 224);
    Game.party.forEach((p, i) => {
      const y = 8 + i * 72, set = this.heroSets[p.id];
      ctx.drawImage(set.down[0], 0, 0, 16, 24, 12, y + 6, 32, 48);
      drawText(p.name, 54, y + 6, C_GOLD); drawTextR('Lv ' + p.lv, 166, y + 6);
      drawText('HP', 54, y + 22, C_CYAN); drawTextR(`${p.hp}/${p.maxhp}`, 166, y + 22);
      drawBar(54, y + 33, 112, 2, p.hp / p.maxhp, '#6af08a');
      drawText('MP', 54, y + 39, C_CYAN); drawTextR(`${p.mp}/${p.maxmp}`, 166, y + 39);
      drawBar(54, y + 50, 112, 2, p.mp / p.maxmp, '#6ab8ff');
      drawText('Next', 54, y + 56, C_GREY); drawTextR(String(expForLevel(p.lv + 1) - p.exp), 166, y + 56, C_GREY);
    });
    drawWindow(176, 0, 80, 132);
    drawText('Items', 186, 9, C_GOLD);
    let y = 24;
    for (const [k, n] of Object.entries(Game.items)) { if (!n) continue; drawText(ITEMS[k].name, 186, y); drawTextR('x' + n, 248, y + 11, C_GREY); y += 24; }
    drawWindow(176, 132, 80, 92);
    drawText('Gold', 186, 142, C_GOLD); drawTextR(String(Game.gold), 248, 156);
    const s = Math.floor(Game.frames / 60);
    drawText('Time', 186, 174, C_GOLD); drawTextR(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 248, 188);
    drawTextC('X: close', 216, 206, C_GREY);
  },
};

// ---------- cutscenes ----------
function* introEvent() {
  yield 40;
  yield { call: () => Field.say([
    ['Sera', 'Arden! Did you hear it again last night? The bell in the Aster Ruins.'],
    ['Tobin', 'Bells don\'t ring themselves. Something up there is awake.'],
    ['Arden', 'Then we find out what. Let\'s talk to Elder Maro first. Her house is just east of here.'],
    ['', 'Arrow keys to walk, Z to talk, hold X to dash, C for the menu.'],
  ]) };
}
function* bossEvent() {
  const L = Field.leader();
  Sound.stopSong(1);
  yield 30;
  yield { call: () => Field.say([['Sera', 'The gate... the runes are glowing.'], ['Tobin', 'Hear that? Gears. Big ones.']]) };
  yield { call: () => { Sound.sfx('rumble'); shake(40, 3); } };
  yield 50;
  yield { call: () => { Sound.sfx('roar'); shake(30, 4); } };
  yield 40;
  yield { call: () => Field.say([['???', 'INTRUDERS DETECTED. THE ASTER BELL MUST NOT BE REACHED.'], ['Arden', 'Here it comes. Get ready!']]) };
  const res = yield { battle: ['sentinel'], boss: true };
  if (res === 'win') {
    Game.flags.boss = true;
    yield 30;
    yield { call: () => { Sound.sfx('rumble'); shake(30, 2); } };
    yield 60;
    yield { call: () => Field.say([
      ['Tobin', 'It\'s still twitching. Look at that core. Someone rebuilt this thing, and not long ago.'],
      ['Sera', 'The gate is open. And the bell is still ringing somewhere inside.'],
      ['Arden', 'Then that is where we go next.'],
    ]) };
    yield 20;
    yield { call: () => showEnding() };
  }
}
