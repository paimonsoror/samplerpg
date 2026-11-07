'use strict';
// ===================================================================
//  battle.js — side-view Active Time Battle.
//  Gauges fill in real time; time pauses while you browse sub-menus
//  or while an action animates ("wait" mode). Two ready heroes can
//  pool their turns into a Combo. Every action is a JS generator that
//  yields frame delays, so animations read like a script.
// ===================================================================

const ENEMY_SPR = {};
function enemySprites(id) {
  if (!ENEMY_SPR[id]) ENEMY_SPR[id] =
    id === 'gel' ? [makeGel(false), makeGel(true)] : id === 'bat' ? [makeBat(true), makeBat(false)] :
    id === 'shroom' ? [makeShroom(false), makeShroom(true)] : [makeSentinel()];
  return ENEMY_SPR[id];
}
const GEARS = Array.from({ length: 6 }, (_, i) => makeGear(i / 6 * Math.PI / 4));
const GEARS_HOT = Array.from({ length: 6 }, (_, i) => makeGear(i / 6 * Math.PI / 4, '#f05a3a'));
const WEAPON = {
  sword: pix(['...........b.', 'Wwwwwwwwwwwbh', '...........b.'], { w: '#eef2fa', W: '#ffffff', b: '#d8a840', h: '#6a4222' }),
  staff: pix(['.g.', 'gGg', '.g.', '.h.', '.h.', '.h.', '.h.', '.h.', '.h.', '.h.', '.h.'], { g: '#2ad0c0', G: '#d8fff8', h: '#8a5a30' }),
  hammer: pix(['ii....', 'IIhhhh', 'IIhhhh', 'ii....'], { i: '#7a82a4', I: '#b8c0dc', h: '#8a5a30' }),
};
WEAPON.hammerUp = rot90(WEAPON.hammer);
const BACKS = {};
const HERO_POS = [[204, 78], [214, 106], [224, 134]];
const FORM_POS = { 1: [[74, 112]], 2: [[56, 88], [96, 128]], 3: [[46, 80], [102, 104], [54, 138]] };

class Battle {
  constructor(formation, opts = {}) {
    this.boss = !!opts.boss;
    const bk = this.boss ? 'ruins' : 'forest';
    this.back = BACKS[bk] || (BACKS[bk] = bk === 'ruins' ? makeRuinsBack() : makeForestBack());
    this.heroes = Game.party.map((st, i) => ({
      side: 'hero', i, id: st.id, name: st.name, st, set: Field.heroSets[st.id], x: HERO_POS[i][0], y: HERO_POS[i][1],
      ox: 60, oy: 0, atb: rand() * 60, pose: 'stand', hurtT: 0, busy: false, ready: false,
    }));
    const counts = {};
    formation.forEach(id => (counts[id] = (counts[id] || 0) + 1));
    const seen = {};
    this.enemies = formation.map((id, i) => {
      const d = ENEMIES[id], spr = enemySprites(id), pos = this.boss ? [74, 122] : FORM_POS[formation.length][i];
      seen[id] = (seen[id] || 0) + 1;
      return { side: 'enemy', id, d, spr, name: d.name + (counts[id] > 1 ? ' ' + 'ABC'[seen[id] - 1] : ''),
        st: { hp: d.hp, maxhp: d.hp, atk: d.atk, def: d.def, mag: d.mag, mdef: d.mdef, spd: d.spd },
        x: pos[0], y: pos[1] - (d.fly ? 14 : 0), w: spr[0].width, h: spr[0].height, ox: -120, oy: 0,
        atb: rand() * 40, flashT: 0, actFlash: 0, dying: 0, gone: false, turn: 0, phase: rand() * 6 };
    });
    this.queue = []; this.actions = []; this.cur = null; this.waitF = 0;
    this.fx = []; this.pops = []; this.menu = null; this.msg = null; this.flash = null;
    this.state = 'intro'; this.t = 0; this.result = null;
    Sound.playSong(this.boss ? 'boss' : 'battle', { restart: true });
  }
  aliveE() { return this.enemies.filter(e => e.st.hp > 0); }
  aliveH() { return this.heroes.filter(h => h.st.hp > 0); }
  center(u) { return u.side === 'hero' ? [u.x + u.ox + 8, u.y + u.oy - 12] : [u.x + u.ox, u.y + u.oy - u.h / 2]; }

  // ---------------- update ----------------
  update() {
    this.t++;
    for (const u of this.heroes) { if (u.hurtT > 0) u.hurtT--; }
    for (const e of this.enemies) { if (e.flashT > 0) e.flashT--; if (e.dying > 0 && !e.gone) { e.dying += this.boss ? 0.008 : 0.03; if (e.dying >= 1) e.gone = true; } }
    this.fx = this.fx.filter(f => ++f.t < f.dur);
    this.pops = this.pops.filter(p => ++p.t < 56);
    if (this.msg && --this.msg.t <= 0) this.msg = null;

    if (this.state === 'intro') {
      const k = easeOut(Math.min(1, this.t / 36));
      for (const h of this.heroes) h.ox = Math.round(60 * (1 - k));
      for (const e of this.enemies) e.ox = Math.round(-120 * (1 - k));
      if (this.t >= 40) this.state = 'fight';
      return;
    }
    if (this.state === 'win' || this.state === 'lose') return this.updateEnd();

    // run the current action script
    if (this.cur) {
      if (this.waitF > 0) this.waitF--;
      else {
        const r = this.cur.gen.next();
        if (r.done) this.finishAction(); else this.waitF = r.value || 0;
      }
    } else if (this.actions.length) {
      this.startAction(this.actions.shift());
    } else if (this.checkEnd()) return;

    if (!this.aliveE().length || !this.aliveH().length) { this.menu = null; return; }
    // gauges ("wait" mode: frozen during animation and sub-menus)
    const frozen = this.cur || (this.menu && this.menu.level !== 'cmd');
    if (!frozen) {
      for (const h of this.heroes) {
        if (h.st.hp <= 0 || h.ready || h.busy) continue;
        h.atb += (h.st.spd + 10) * 0.045;
        if (h.atb >= 100) { h.atb = 100; h.ready = true; this.queue.push(h); Sound.sfx('cursor'); }
      }
      for (const e of this.enemies) {
        if (e.st.hp <= 0 || e.busy) continue;
        e.atb += (e.st.spd + 10) * 0.024 * (e.enraged ? 1.35 : 1);
        if (e.atb >= 100) { e.atb = 0; e.busy = true; this.actions.push(this.enemyAI(e)); }
      }
    }
    this.queue = this.queue.filter(h => h.st.hp > 0);
    if (!this.menu && this.queue.length) this.openMenu(this.queue[0]);
    if (this.menu) this.updateMenu();
  }
  checkEnd() {
    if (this.enemies.every(e => e.gone)) { this.beginWin(); return true; }
    if (this.heroes.every(h => h.st.hp <= 0)) { this.beginLose(); return true; }
    return false;
  }
  startAction(a) {
    // drop dead actors, retarget dead single targets
    const actors = a.actors || [a.actor];
    if (actors.some(u => u.st.hp <= 0)) { actors.forEach(u => this.release(u)); return; }
    if (a.targets && a.single) {
      const t = a.targets[0];
      const ok = a.kind === 'revive' ? t.st.hp <= 0 : t.st.hp > 0;
      if (!ok) {
        const pool = t.side === 'enemy' ? this.aliveE() : (a.kind === 'revive' ? this.heroes.filter(h => h.st.hp <= 0) : this.aliveH());
        if (!pool.length) { actors.forEach(u => this.release(u)); return; }
        a.targets = [pick(pool)];
      }
    }
    if (a.targets && !a.single) a.targets = a.targets.filter(t => t.st.hp > 0);
    this.cur = { a, gen: a.run.call(this, a) };
  }
  finishAction() {
    const a = this.cur.a; this.cur = null;
    (a.actors || [a.actor]).forEach(u => this.release(u));
  }
  release(u) { u.busy = false; u.atb = 0; u.ready = false; u.pose = 'stand'; u.ox = 0; u.oy = 0; }

  // ---------------- player menu ----------------
  openMenu(h) {
    this.menu = { hero: h, level: 'cmd', idx: h.lastIdx || 0, list: null, li: 0, tgt: null };
    Sound.sfx('ok');
  }
  commands(h) {
    const combos = this.availableCombos(h);
    return [
      { label: 'Fight', ok: true },
      { label: HEROES[h.id].cmd, ok: true },
      { label: 'Combo', ok: combos.length > 0 },
      { label: 'Item', ok: Object.values(Game.items).some(n => n > 0) },
    ];
  }
  availableCombos(h) {
    return COMBOS.filter(c => c.who.includes(h.id)).map(c => {
      const partners = c.who.map(id => this.heroes.find(x => x.id === id));
      const ready = partners.every(p => p.st.hp > 0 && this.queue.includes(p));
      const mpOk = partners.every((p, i) => p.st.mp >= c.mp[i]);
      return { c, partners, ok: ready && mpOk, ready };
    }).filter(x => x.ready);
  }
  updateMenu() {
    const m = this.menu, h = m.hero;
    if (h.st.hp <= 0 || !this.queue.includes(h)) { this.menu = null; return; }
    if (m.level === 'cmd') {
      const cmds = this.commands(h);
      if (Input.rep('up')) { m.idx = (m.idx + 3) % 4; Sound.sfx('cursor'); }
      if (Input.rep('down')) { m.idx = (m.idx + 1) % 4; Sound.sfx('cursor'); }
      if (Input.hit('cancel') && this.queue.length > 1) { // pass to the next ready hero
        this.queue.push(this.queue.shift()); this.menu = null; Sound.sfx('cancel'); return;
      }
      if (Input.hit('ok')) {
        if (!cmds[m.idx].ok) { Sound.sfx('buzz'); return; }
        Sound.sfx('ok'); h.lastIdx = m.idx;
        if (m.idx === 0) this.beginTarget({ type: 'attack', target: 'enemy' });
        else if (m.idx === 1) { m.level = 'list'; m.li = 0; m.list = HEROES[h.id].skills.map(k => ({ type: 'skill', key: k, s: SKILLS[k], ok: h.st.mp >= SKILLS[k].mp, cost: SKILLS[k].mp, name: SKILLS[k].name, desc: SKILLS[k].desc, target: SKILLS[k].target })); }
        else if (m.idx === 2) { m.level = 'list'; m.li = 0; m.list = this.availableCombos(h).map(x => ({ type: 'combo', c: x.c, partners: x.partners, ok: x.ok, name: x.c.name, cost: x.c.mp.join('+'), desc: x.c.desc, target: x.c.target })); }
        else { m.level = 'list'; m.li = 0; m.list = Object.entries(Game.items).filter(([, n]) => n > 0).map(([k, n]) => ({ type: 'item', key: k, it: ITEMS[k], ok: true, name: ITEMS[k].name, cost: 'x' + n, desc: ITEMS[k].desc, target: ITEMS[k].target })); }
      }
    } else if (m.level === 'list') {
      const n = m.list.length;
      if (Input.rep('up')) { m.li = (m.li + n - 1) % n; Sound.sfx('cursor'); }
      if (Input.rep('down')) { m.li = (m.li + 1) % n; Sound.sfx('cursor'); }
      if (Input.hit('cancel')) { m.level = 'cmd'; Sound.sfx('cancel'); return; }
      if (Input.hit('ok')) {
        const e = m.list[m.li];
        if (!e.ok) { Sound.sfx('buzz'); return; }
        if (e.target === 'ko' && !this.heroes.some(x => x.st.hp <= 0)) { Sound.sfx('buzz'); return; }
        Sound.sfx('ok'); this.beginTarget(e);
      }
    } else if (m.level === 'target') {
      const t = m.tgt;
      t.pool = t.pool.filter(u => (t.choice.target === 'ko' ? u.st.hp <= 0 : u.st.hp > 0));
      if (!t.pool.length) { m.level = 'cmd'; return; }
      t.i = Math.min(t.i, t.pool.length - 1);
      if (t.multi) {
        if (Input.hit('cancel')) { m.level = t.back; Sound.sfx('cancel'); return; }
        if (Input.hit('ok')) { Sound.sfx('ok'); this.commit(t.choice, t.pool); }
        return;
      }
      const n = t.pool.length;
      if (Input.rep('up') || Input.rep('left')) { t.i = (t.i + n - 1) % n; Sound.sfx('cursor'); }
      if (Input.rep('down') || Input.rep('right')) { t.i = (t.i + 1) % n; Sound.sfx('cursor'); }
      if (Input.hit('cancel')) { m.level = t.back; Sound.sfx('cancel'); return; }
      if (Input.hit('ok')) { Sound.sfx('ok'); this.commit(t.choice, [t.pool[t.i]]); }
    }
  }
  beginTarget(choice) {
    const m = this.menu, tg = choice.target;
    let pool, multi = false;
    if (tg === 'enemy') pool = this.aliveE();
    else if (tg === 'enemies') { pool = this.aliveE(); multi = true; }
    else if (tg === 'ally') pool = this.aliveH();
    else if (tg === 'allies') { pool = this.aliveH(); multi = true; }
    else pool = this.heroes.filter(x => x.st.hp <= 0);
    const i = tg === 'ally' ? Math.max(0, pool.indexOf(m.hero)) : 0;
    m.tgt = { choice, pool, multi, i, back: m.level };
    m.level = 'target';
  }
  commit(choice, targets) {
    const h = this.menu.hero, single = !(choice.target === 'enemies' || choice.target === 'allies');
    let a;
    if (choice.type === 'attack') a = { actor: h, targets, single, run: this.actAttack };
    else if (choice.type === 'skill') a = { actor: h, targets, single, s: choice.s, run: this.actSkill };
    else if (choice.type === 'item') { a = { actor: h, targets, single, key: choice.key, kind: choice.target === 'ko' ? 'revive' : '', run: this.actItem }; Game.items[choice.key]--; }
    else { a = { actors: choice.partners, actor: h, targets, single, c: choice.c, run: this.actCombo }; }
    const actors = a.actors || [h];
    for (const u of actors) { u.busy = true; u.ready = false; this.queue = this.queue.filter(x => x !== u); }
    this.actions.push(a);
    this.menu = null;
  }

  // ---------------- maths ----------------
  physDmg(att, def, mult) {
    const base = att.side === 'hero' ? att.st.atk * 2.2 * mult - def.st.def * 1.1 : att.st.atk * 1.5 * mult - def.st.def * 1.2;
    const crit = att.side === 'hero' && rand() < 0.08;
    return { n: Math.max(1, Math.round(base * (0.9 + rand() * 0.2) * (crit ? 1.6 : 1))), crit };
  }
  magDmg(magic, def, power, elem) {
    let base = power + magic * (def.side === 'hero' ? 1.5 : 2.4) - def.st.mdef;
    const weak = elem && def.d && def.d.weak.includes(elem);
    if (weak) base *= 1.8;
    return { n: Math.max(1, Math.round(base * (0.92 + rand() * 0.16))), weak };
  }
  damage(t, n, opts = {}) {
    t.st.hp = Math.max(0, t.st.hp - n);
    const [cx, cy] = this.center(t);
    this.pop(cx, cy - 8, String(n), opts.weak ? C_GOLD : C_TEXT, opts.crit ? 'Critical!' : opts.weak ? 'Weak!' : null);
    if (t.side === 'enemy') {
      t.flashT = 12;
      if (t.st.hp <= 0) { t.dying = 0.001; Sound.sfx(t.d.boss ? 'boom' : 'die'); if (t.d.boss) this.bossDeath(t); }
    } else {
      t.hurtT = 14;
      if (t.st.hp <= 0) { t.atb = 0; t.ready = false; t.busy = false; this.queue = this.queue.filter(x => x !== t); }
    }
  }
  heal(t, n, mp) {
    if (mp) t.st.mp = Math.min(t.st.maxmp, t.st.mp + n); else t.st.hp = Math.min(t.st.maxhp, t.st.hp + n);
    const [cx, cy] = this.center(t);
    this.pop(cx, cy - 8, String(n), mp ? C_CYAN : C_GREEN);
  }
  pop(x, y, text, color, label) { this.pops.push({ x, y, text, color, label, t: 0 }); }
  showName(text, t = 60) { this.msg = { text, t }; }

  // ---------------- action scripts (generators) ----------------
  *run(u, dx, frames) { const s = u.ox; for (let i = 1; i <= frames; i++) { u.ox = Math.round(lerp(s, dx, i / frames)); u.walk = i; yield 1; } u.walk = 0; }
  *actAttack(a) {
    const h = a.actor, t = a.targets[0];
    yield* this.run(h, -26, 8);
    h.pose = 'attack'; Sound.sfx('slash');
    const [cx, cy] = this.center(t);
    this.fx.push(fxSlash(cx, cy, '#ffffff'));
    yield 6;
    const r = this.physDmg(h, t, 1);
    Sound.sfx(r.crit ? 'crit' : 'hit'); if (r.crit) shake(10, 2);
    this.damage(t, r.n, r);
    yield 16;
    h.pose = 'stand';
    yield* this.run(h, 0, 8);
  }
  *castCharge(u, col) {
    u.pose = 'cast'; Sound.sfx('charge');
    const [cx, cy] = this.center(u);
    this.fx.push(fxCharge(cx, cy + 6, col));
    yield 26;
  }
  *actSkill(a) {
    const h = a.actor, s = a.s;
    h.st.mp -= s.mp;
    this.showName(s.name);
    if (s.kind === 'phys') {
      if (s.fx === 'whirl') {
        yield* this.run(h, -90, 12);
        for (const t of a.targets) {
          h.pose = 'attack'; Sound.sfx('slash');
          const [cx, cy] = this.center(t);
          this.fx.push(fxSlash(cx, cy, '#a8f0ff')); this.fx.push(fxRing(cx, cy, '#a8f0ff'));
          yield 4;
          const r = this.physDmg(h, t, s.mult); Sound.sfx('hit'); this.damage(t, r.n, r);
          h.pose = 'stand'; yield 6;
        }
        yield 10; yield* this.run(h, 0, 10);
      } else {
        yield* this.run(h, -26, 8);
        h.pose = 'cast'; yield 10;
        h.pose = 'attack'; Sound.sfx('slash');
        const t = a.targets[0], [cx, cy] = this.center(t);
        this.fx.push(fxSlash(cx, cy, '#ffe08a', 2)); this.fx.push(fxSparks(cx, cy, '#ffe08a', 14));
        yield 6;
        const r = this.physDmg(h, t, s.mult); Sound.sfx('crit'); shake(12, 3); this.damage(t, r.n, r);
        yield 18; h.pose = 'stand'; yield* this.run(h, 0, 8);
      }
      return;
    }
    const col = s.kind === 'heal' ? '#8cf2a0' : s.elem === 'fire' ? '#ffb040' : '#9ad8ff';
    yield* this.castCharge(h, col);
    yield* this.elementFx(s.fx, h, a.targets);
    for (const t of a.targets) {
      if (s.kind === 'heal') this.heal(t, Math.round((s.power + h.st.mag * 1.6) * (0.95 + rand() * 0.1)));
      else { const r = this.magDmg(h.st.mag, t, s.power, s.elem); this.damage(t, r.n, r); }
    }
    yield 24;
  }
  *elementFx(kind, src, targets) {
    if (kind === 'fire') {
      Sound.sfx('fire');
      for (const t of targets) { const [cx, cy] = this.center(t); this.fx.push(fxFire(cx, cy + 8)); }
      yield 30;
    } else if (kind === 'bolt' || kind === 'storm') {
      for (let k = 0; k < (kind === 'storm' ? 2 : 1); k++) {
        Sound.sfx('bolt');
        for (const t of targets) { const [cx, cy] = this.center(t); this.fx.push(fxBolt(cx, cy)); }
        this.flash = { c: '#ffffff', t: 6, a: 0.7 }; shake(8, 2);
        yield 14;
      }
    } else if (kind === 'heal') {
      Sound.sfx('heal');
      for (const t of targets) { const [cx, cy] = this.center(t); this.fx.push(fxHeal(cx, cy)); }
      yield 30;
    } else if (kind === 'bomb') {
      const [sx, sy] = this.center(src);
      const pts = targets.map(t => this.center(t));
      const ax = pts.reduce((s, p) => s + p[0], 0) / pts.length, ay = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      this.fx.push(fxLob(sx - 10, sy, ax - sx + 10, ay - sy, 16));
      yield 16;
      Sound.sfx('boom'); shake(14, 3);
      for (const [cx, cy] of pts) this.fx.push(fxBoom(cx, cy, 18));
      yield 20;
    }
  }
  *actItem(a) {
    const h = a.actor, it = ITEMS[a.key], t = a.targets[0];
    this.showName(it.name);
    yield* this.run(h, -10, 5);
    h.pose = 'cast'; Sound.sfx('item');
    const [cx, cy] = this.center(t);
    this.fx.push(fxHeal(cx, cy, it.mpheal ? '#9ad8ff' : '#8cf2a0'));
    yield 26;
    if (it.revive) { t.st.hp = Math.max(1, Math.round(t.st.maxhp * it.revive)); this.pop(cx, cy - 8, String(t.st.hp), C_GREEN, 'Revived!'); t.atb = 0; }
    else if (it.mpheal) this.heal(t, it.mpheal, true);
    else this.heal(t, it.heal);
    yield 20; h.pose = 'stand'; yield* this.run(h, 0, 5);
  }
  *actCombo(a) {
    const c = a.c, [p1, p2] = a.actors;
    a.actors.forEach((u, i) => (u.st.mp -= c.mp[i]));
    this.showName(c.name, 90);
    this.flash = { c: '#ffffff', t: 10, a: 0.5 };
    if (c.fx === 'flameedge') {
      const sera = p2, arden = p1, t = a.targets[0], [cx, cy] = this.center(t);
      yield* this.castCharge(sera, '#ffb040');
      const [ax, ay] = this.center(arden); this.fx.push(fxFire(ax, ay + 10, 20)); Sound.sfx('fire');
      yield 20;
      yield* this.run(arden, -120, 10);
      arden.pose = 'attack'; Sound.sfx('slash');
      this.fx.push(fxSlash(cx, cy, '#ffb040', 3)); this.fx.push(fxFire(cx, cy + 10)); this.fx.push(fxBoom(cx, cy, 22, true));
      yield 8; shake(18, 4); Sound.sfx('boom');
      const r = this.magDmg((sera.st.mag + arden.st.atk) * 1.5, t, c.power, c.elem); this.damage(t, r.n, r);
      yield 26; arden.pose = 'stand'; sera.pose = 'stand';
      yield* this.run(arden, 0, 10);
    } else if (c.fx === 'storm') {
      const tobin = p1, sera = p2;
      yield* this.castCharge(sera, '#9ad8ff');
      for (let i = 1; i <= 14; i++) { tobin.oy = -Math.round(Math.sin(i / 14 * Math.PI / 2) * 50); tobin.ox = -i * 4; yield 1; }
      tobin.pose = 'cast';
      const [tx, ty] = this.center(tobin); this.fx.push(fxBolt(tx, ty)); Sound.sfx('bolt'); this.flash = { c: '#ffffff', t: 6, a: 0.8 };
      yield 16;
      for (let i = 1; i <= 8; i++) { tobin.oy = Math.round(-50 + i / 8 * 50); tobin.ox = -56 - i * 6; yield 1; }
      tobin.pose = 'attack'; shake(20, 4); Sound.sfx('boom');
      yield* this.elementFx('storm', tobin, a.targets);
      for (const t of a.targets) { const r = this.magDmg(sera.st.mag + tobin.st.mag, t, c.power, c.elem); this.damage(t, r.n, r); }
      yield 26; tobin.pose = 'stand'; sera.pose = 'stand';
      yield* this.run(tobin, 0, 10);
    } else {
      const arden = p1, tobin = p2;
      const r1 = this.run(arden, -100, 10), r2 = this.run(tobin, -110, 10);
      for (let i = 0; i < 10; i++) { r1.next(); r2.next(); yield 1; }
      for (const t of a.targets) {
        for (const u of [arden, tobin]) {
          u.pose = 'attack'; Sound.sfx('slash');
          const [cx, cy] = this.center(t); this.fx.push(fxSlash(cx + (u === tobin ? 6 : -6), cy, u === tobin ? '#ffd27a' : '#ffffff'));
          yield 3;
          const r = this.physDmg(u, t, c.mult * 0.6); Sound.sfx('hit'); this.damage(t, r.n, r);
          yield 5; u.pose = 'stand';
        }
      }
      yield 14;
      const b1 = this.run(arden, 0, 10), b2 = this.run(tobin, 0, 10);
      for (let i = 0; i < 10; i++) { b1.next(); b2.next(); yield 1; }
    }
  }

  // ---------------- enemies ----------------
  enemyAI(e) {
    let act;
    if (e.d.boss) {
      if (e.charged) act = 'burst';
      else {
        if (!e.enraged && e.st.hp < e.st.maxhp * 0.4) { e.enraged = true; this.actions.push({ actor: { st: { hp: 1 }, side: 'x' }, run: function* () { this.showName('Its gears spin faster!', 70); Sound.sfx('roar'); shake(30, 3); yield 70; } }); }
        act = ['fist', 'steam', 'fist', 'charge'][e.turn++ % 4];
      }
    } else {
      const tot = e.d.acts.reduce((s, [, w]) => s + w, 0); let r = rand() * tot;
      act = e.d.acts.find(([, w]) => (r -= w) < 0)[0];
    }
    const A = EACTS[act], alive = this.aliveH();
    const targets = A.target === 'all' ? alive : [pick(alive.length ? alive : this.heroes)];
    return { actor: e, targets, single: A.target === 'one', act: A, run: this.actEnemy };
  }
  *actEnemy(a) {
    const e = a.actor, A = a.act;
    if (!this.aliveH().length) return;
    for (let i = 0; i < 2; i++) { e.actFlash = 4; yield 7; } // the classic "about to act" blink
    if (A.kind === 'charge') {
      this.showName('The core glows red hot!', 70); e.charged = true; Sound.sfx('charge'); yield 50; return;
    }
    this.showName(A.name);
    if (A.kind === 'phys') {
      const t = a.targets[0];
      for (let i = 1; i <= 6; i++) { e.ox = i * 3; yield 1; }
      const [cx, cy] = this.center(t);
      this.fx.push(fxSparks(cx, cy, '#ffffff', 10)); this.fx.push(fxSlash(cx, cy, '#ffd0d0'));
      const r = this.physDmg(e, t, A.mult); Sound.sfx('hit'); shake(e.d.boss ? 14 : 6, e.d.boss ? 3 : 1);
      this.damage(t, r.n);
      yield 6;
      for (let i = 5; i >= 0; i--) { e.ox = i * 3; yield 1; }
      yield 16;
      return;
    }
    // magic-type attacks
    const [ex, ey] = this.center(e);
    if (A.fx === 'goo') { const t = a.targets[0], [tx, ty] = this.center(t); this.fx.push(fxLob(ex, ey, tx - ex, ty - ey, 18, '#5ccf86')); Sound.sfx('miss'); yield 18; this.fx.push(fxSparks(tx, ty, '#5ccf86', 14)); Sound.sfx('hit'); }
    else if (A.fx === 'wave') { for (let i = 0; i < 3; i++) { this.fx.push(fxRing(ex, ey, '#d0a0ff', 40)); yield 6; } Sound.sfx('bolt'); yield 10; }
    else if (A.fx === 'spores') { for (const t of a.targets) { const [tx, ty] = this.center(t); this.fx.push(fxSpores(tx, ty)); } Sound.sfx('miss'); yield 30; }
    else if (A.fx === 'steam') { for (const t of a.targets) { const [tx, ty] = this.center(t); this.fx.push(fxSteam(tx, ty)); } Sound.sfx('fire'); shake(16, 2); yield 30; }
    else if (A.fx === 'burst') {
      e.charged = false; Sound.sfx('charge'); this.fx.push(fxCharge(ex + 4, ey - 2, '#ff6a3a'));
      yield 30; this.flash = { c: '#ff6040', t: 16, a: 0.6 }; Sound.sfx('boom'); shake(30, 4);
      for (const t of a.targets) { const [tx, ty] = this.center(t); this.fx.push(fxBoom(tx, ty, 16, true)); }
      yield 16;
    }
    for (const t of a.targets) { if (t.st.hp > 0) { const r = this.magDmg(e.st.mag, t, A.power); this.damage(t, r.n); } }
    yield 24;
  }
  bossDeath(e) {
    this.actions.unshift({ actor: { st: { hp: 1 }, side: 'x' }, run: function* () {
      this.actions = [];
      for (let i = 0; i < 14; i++) {
        this.fx.push(fxBoom(e.x - 36 + rand() * 72, e.y - 90 + rand() * 80, 10 + rand() * 10, true));
        Sound.sfx(i % 3 ? 'hit' : 'boom'); shake(8, 3);
        if (i % 4 === 0) this.flash = { c: '#ffffff', t: 6, a: 0.6 };
        yield 7;
      }
      yield 40;
    } });
  }

  // ---------------- victory / defeat ----------------
  beginWin() {
    this.state = 'win'; this.t = 0; this.menu = null;
    const exp = this.enemies.reduce((s, e) => s + e.d.exp, 0), gold = this.enemies.reduce((s, e) => s + e.d.gold, 0);
    Game.gold += gold;
    const lv = gainExp(exp);
    for (const h of this.heroes) if (h.st.hp <= 0) h.st.hp = 1; // fallen allies get back up after a win
    this.endPages = [`Gained ${exp} EXP and ${gold} Gold.`, ...lv];
    this.page = 0;
    Sound.playSong('victory', { loop: false });
  }
  beginLose() { this.state = 'lose'; this.t = 0; this.menu = null; Sound.playSong('gameover', { loop: false }); this.endPages = ['The party has fallen...']; this.page = 0; }
  updateEnd() {
    if (this.t < 70) return;
    if (Input.hit('ok')) {
      Sound.sfx('cursor');
      if (this.page < this.endPages.length - 1) { this.page++; if (this.endPages[this.page].includes('level')) Sound.sfx('levelup'); }
      else if (!this.result) { this.result = this.state; endBattle(this.state); }
    }
  }

  // ---------------- draw ----------------
  draw() {
    ctx.drawImage(this.back, 0, 0);
    if (this.boss) { // ambient motes in the ruins
      for (let i = 0; i < 16; i++) {
        const x = (i * 53 + frameCount * 0.2 * (1 + i % 3)) % 256, y = 150 - ((i * 37 + frameCount * 0.3) % 150);
        ctx.fillStyle = i % 2 ? '#5ae0ff' : '#2a90c0'; ctx.fillRect(x | 0, y | 0, 1, 1);
      }
    }
    for (const e of this.enemies) this.drawEnemy(e);
    for (const h of this.heroes) this.drawHero(h);
    for (const f of this.fx) f.draw(f.t, f.dur);
    for (const p of this.pops) this.drawPop(p);
    if (this.flash) { ctx.globalAlpha = Math.min(1, (this.flash.a || 0.6) * this.flash.t / 10); ctx.fillStyle = this.flash.c; ctx.fillRect(0, 0, W, 152); ctx.globalAlpha = 1; if (--this.flash.t <= 0) this.flash = null; }
    this.drawUI();
  }
  drawEnemy(e) {
    if (e.gone) return;
    const fr = e.spr.length > 1 ? e.spr[Math.floor((frameCount + e.phase * 10) / (e.d.fly ? 8 : 22)) % 2] : e.spr[0];
    const bob = e.d.fly ? Math.round(Math.sin(frameCount / 10 + e.phase) * 3) : 0;
    const x = Math.round(e.x + e.ox - e.w / 2), y = Math.round(e.y + e.oy - e.h + bob);
    if (!e.d.fly && !e.d.boss) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#0a1020'; ctx.fillRect(x + 4, e.y - 2, e.w - 8, 3); ctx.globalAlpha = 1; }
    if (e.d.fly) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#0a1020'; ctx.fillRect(x + 10, e.y + 14, e.w - 20, 3); ctx.globalAlpha = 1; }
    if (e.dying > 0) { // dissolve: tinted, scanline-sheared, fading
      const p = e.dying, img = tinted(fr, '#e050c0');
      ctx.globalAlpha = 1 - p;
      for (let r = 0; r < e.h; r++) {
        if (r / e.h < p * 1.2 - 0.2 && r % 2) continue;
        ctx.drawImage(img, 0, r, e.w, 1, x + Math.round(Math.sin(r * 0.7 + p * 20) * p * 10), y + r, e.w, 1);
      }
      ctx.globalAlpha = 1; return;
    }
    if (e.flashT > 0 && e.flashT % 4 < 2) return;
    if (e.actFlash > 0) { e.actFlash--; ctx.drawImage(tinted(fr, '#ffffff'), x, y); return; }
    ctx.drawImage(fr, x, y);
    if (e.d.boss) {
      const gs = e.charged ? GEARS_HOT : GEARS;
      ctx.drawImage(gs[Math.floor(frameCount / (e.enraged ? 2 : 4)) % 6], x + 33, y + 37);
      const glow = e.charged ? '#ff4a2a' : '#5af0ff', k = 0.5 + Math.sin(frameCount / 8) * 0.5;
      ctx.fillStyle = mixColor(glow, '#ffffff', k * 0.5);
      ctx.fillRect(x + 37 + Math.round(Math.sin(frameCount / 30) * 5), y + 16, 6, 2);
      if (frameCount % 90 < 30) { ctx.globalAlpha = 0.5 - (frameCount % 90) / 60; ctx.fillStyle = '#e8eef8'; const s = (frameCount % 90) / 3; ctx.fillRect(x + 8 - s / 2, y + 16 - s, 6 + s, 4 + s / 2); ctx.fillRect(x + 74 - s / 2, y + 16 - s, 6 + s, 4 + s / 2); ctx.globalAlpha = 1; }
    }
  }
  drawHero(h) {
    const b = h.set.b, st = h.st;
    let x = h.x + h.ox, y = h.y + h.oy - 24;
    const active = this.menu && this.menu.hero === h && this.state === 'fight';
    if (active && !h.busy) x -= 8;
    let img;
    if (st.hp <= 0) { img = h.koImg || (h.koImg = rot90(b.kneel)); ctx.drawImage(img, x - 4, h.y - 16); return; }
    if (this.state === 'win' && this.t > 20) { img = b.victory; y -= Math.round(Math.abs(Math.sin(this.t / 7)) * 5); }
    else if (h.hurtT > 0) { img = b.hurt; x += h.hurtT > 8 ? 3 : 1; }
    else if (h.walk) img = h.set.left[1 + (Math.floor(h.walk / 3) % 2)];
    else if (h.pose !== 'stand') img = b[h.pose];
    else img = st.hp < st.maxhp * 0.25 ? b.kneel : b.stand;
    ctx.drawImage(OBJ.shadow, h.x + h.ox + 1, h.y - 3);
    if (h.hurtT > 0 && h.hurtT % 4 < 2) ctx.drawImage(tinted(img, '#ffffff'), x, y);
    else ctx.drawImage(img, x, y);
    const wpn = HEROES[h.id].weapon;
    if (h.pose === 'attack' && !h.walk) {
      if (wpn === 'sword') ctx.drawImage(WEAPON.sword, x - 12, y + 12);
      else if (wpn === 'hammer') ctx.drawImage(WEAPON.hammer, x - 5, y + 11);
      else ctx.drawImage(WEAPON.staff, x - 2, y + 4);
    } else if (h.pose === 'cast' && !h.walk) {
      if (wpn === 'staff') ctx.drawImage(WEAPON.staff, x + 1, y - 2);
      else if (wpn === 'hammer') ctx.drawImage(WEAPON.hammerUp, x + 1, y + 1);
    }
  }
  drawPop(p) {
    const t = p.t, dy = t < 6 ? -t * 2 : t < 12 ? -12 + (t - 6) * 2 : t < 16 ? -(t - 12) : t < 20 ? -4 + (t - 16) : 0;
    if (t > 46 && t % 2) return;
    drawTextC(p.text, p.x, p.y + dy, p.color);
    if (p.label) drawTextC(p.label, p.x, p.y + dy - 10, p.label === 'Weak!' ? C_GOLD : C_RED);
  }
  drawUI() {
    const m = this.menu;
    // party window
    drawWindow(96, 152, 160, 72);
    this.heroes.forEach((h, i) => {
      const y = 160 + i * 20, st = h.st, ko = st.hp <= 0;
      const nameCol = ko ? C_GREY : (m && m.hero === h) ? C_GOLD : h.ready ? '#fff4b0' : C_TEXT;
      drawText(h.name, 106, y, nameCol);
      const hpCol = ko ? C_RED : st.hp < st.maxhp * 0.25 ? C_GOLD : C_TEXT;
      drawTextR(String(st.hp), 168, y, hpCol); drawText('/' + st.maxhp, 169, y, C_GREY);
      drawTextR(String(st.mp), 214, y, C_CYAN);
      drawBar(220, y + 3, 28, 3, h.atb / 100, h.ready ? (frameCount % 16 < 8 ? '#fff070' : '#ffd040') : '#e0e0f0');
    });
    // left window: commands or enemy names
    if (m && m.level === 'list') {
      drawWindow(0, 152, 256, 72);
      m.list.forEach((e, i) => {
        const y = 162 + i * 14;
        drawText(e.name, 26, y, e.ok ? C_TEXT : C_GREY);
        drawTextR(String(e.cost), 120, y, e.ok ? C_CYAN : C_GREY);
        if (e.type === 'combo') drawText(e.partners.map(p => p.name).join(' + '), 136, y, C_GREY);
      });
      if (m.list[m.li]) { drawCursor(24, 162 + m.li * 14); this.helpBar(m.list[m.li].desc); }
    } else if (m && (m.level === 'cmd' || m.level === 'target')) {
      drawWindow(0, 152, 96, 72);
      this.commands(m.hero).forEach((c, i) => drawText(c.label, 28, 161 + i * 14, c.ok ? C_TEXT : C_GREY));
      drawCursor(26, 161 + m.idx * 14, m.level !== 'cmd');
      if (m.level === 'target') this.drawTargets(m.tgt);
    } else {
      drawWindow(0, 152, 96, 72);
      this.enemies.filter(e => e.st.hp > 0).slice(0, 4).forEach((e, i) => drawText(e.name, 10, 161 + i * 14));
    }
    if (this.msg) {
      const w = textWidth(this.msg.text) + 24, my = m && (m.level === 'list' || m.level === 'target') ? 24 : 4;
      drawWindow((W - w) / 2, my, w, 19); drawTextC(this.msg.text, W / 2, my + 5);
    }
    if (this.state === 'win' || this.state === 'lose') {
      if (this.t > 30) {
        drawWindow(16, 8, 224, 34);
        drawTextC(this.state === 'win' ? 'Victory!' : 'Defeat', W / 2, 13, this.state === 'win' ? C_GOLD : C_RED);
        drawTextC(this.endPages[this.page], W / 2, 26);
      }
    }
  }
  helpBar(text) { drawWindow(0, 0, 256, 20); drawText(text, 10, 6); }
  drawTargets(t) {
    const list = t.multi ? t.pool : [t.pool[t.i]];
    if (t.multi && frameCount % 16 >= 10) return;
    for (const u of list) {
      if (!u) continue;
      const [cx, cy] = this.center(u);
      const lx = u.side === 'hero' ? u.x + u.ox - 6 : u.x + u.ox - u.w / 2 - 2;
      drawCursor(lx, cy - 4, t.multi);
    }
    const u = list[0];
    if (!t.multi && u) this.helpBar(u.name + (u.side === 'enemy' ? `   HP ${u.st.hp}/${u.st.maxhp}` : ''));
    else this.helpBar(t.pool[0] && t.pool[0].side === 'hero' ? 'All allies' : 'All enemies');
  }
}

// ---------------- visual effects ----------------
function fx(dur, draw) { return { t: 0, dur, draw }; }
function fxSlash(x, y, col, thick = 1) {
  return fx(12, t => {
    const k = Math.min(1, t / 5), a = 1 - Math.max(0, (t - 5) / 7);
    ctx.globalAlpha = a; ctx.fillStyle = col;
    for (let i = 0; i < 18 * k; i++) {
      const px = x + 12 - i * 1.4, py = y - 12 + i * 1.4 + Math.sin(i / 18 * Math.PI) * -3;
      ctx.fillRect(Math.round(px), Math.round(py), thick + 1, thick + 1);
    }
    ctx.globalAlpha = 1;
  });
}
function fxSparks(x, y, col, n = 10) {
  const ps = Array.from({ length: n }, () => ({ a: rand() * Math.PI * 2, v: 1 + rand() * 2.5 }));
  return fx(18, t => { ctx.fillStyle = col; for (const p of ps) ctx.fillRect(Math.round(x + Math.cos(p.a) * p.v * t), Math.round(y + Math.sin(p.a) * p.v * t + t * t * 0.03), 1 + (t < 8), 1 + (t < 8)); });
}
function fxRing(x, y, col, dur = 16) {
  return fx(dur, t => { ctx.strokeStyle = col; ctx.globalAlpha = 1 - t / dur; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 4 + t * 2.2, 2 + t * 1.2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; });
}
function fxFire(x, y, dur = 34) {
  const ps = Array.from({ length: 26 }, () => ({ ox: (rand() - 0.5) * 22, d: rand() * 14, v: 0.6 + rand() * 0.8, s: 2 + Math.floor(rand() * 3) }));
  const R = ['#fff6c0', '#ffd040', '#ff9a2a', '#e04a1a', '#7a1a0a'];
  return fx(dur, t => { for (const p of ps) { const lt = t - p.d; if (lt < 0 || lt > 20) continue; const c = R[Math.min(4, Math.floor(lt / 4))];
    ctx.fillStyle = c; ctx.fillRect(Math.round(x + p.ox + Math.sin(lt / 3 + p.ox) * 2), Math.round(y - lt * p.v * 1.4), p.s, p.s); } });
}
function fxBolt(x, y) {
  const pts = []; let px = x + (rand() - 0.5) * 20;
  for (let yy = 0; yy <= y; yy += 8) { pts.push([px, yy]); px += (rand() - 0.5) * 14; }
  pts.push([x, y]);
  return fx(16, t => {
    if (t % 4 >= 3) return;
    ctx.lineCap = 'square';
    for (const [w, c] of [[5, '#3a6aff'], [2, '#ffffff']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 6, y - 2, 12, 4);
  });
}
function fxHeal(x, y, col = '#8cf2a0') {
  const ps = Array.from({ length: 14 }, (_, i) => ({ ox: (rand() - 0.5) * 20, d: i * 1.5 }));
  return fx(34, t => { for (const p of ps) { const lt = t - p.d; if (lt < 0 || lt > 20) continue;
    const px = Math.round(x + p.ox), py = Math.round(y + 14 - lt * 1.4);
    ctx.fillStyle = lt % 6 < 3 ? '#ffffff' : col; ctx.fillRect(px, py - 1, 1, 3); ctx.fillRect(px - 1, py, 3, 1); } });
}
function fxCharge(x, y, col) {
  return fx(28, t => { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t * 0.2, r = 18 - t * 0.6;
    ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 2, 2); } });
}
function fxBoom(x, y, size = 16, big = false) {
  const R = ['#ffffff', '#fff2a0', '#ffb040', '#e04a1a', '#5a2a2a'];
  const sp = fxSparks(x, y, '#ffd040', big ? 16 : 8);
  return fx(24, t => { const r = Math.min(size, t * 3), c = R[Math.min(4, Math.floor(t / 5))];
    ctx.globalAlpha = 1 - t / 24; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; sp.draw(t, 24); });
}
function fxLob(x, y, dx, dy, dur, col = '#3a3848') {
  return fx(dur, t => { const k = t / dur; ctx.fillStyle = col; ctx.fillRect(Math.round(x + dx * k) - 2, Math.round(y + dy * k - Math.sin(k * Math.PI) * 30) - 2, 5, 5); });
}
function fxSpores(x, y) {
  const ps = Array.from({ length: 20 }, () => ({ ox: (rand() - 0.5) * 26, oy: (rand() - 0.5) * 20, d: rand() * 10 }));
  return fx(34, t => { for (const p of ps) { const lt = t - p.d; if (lt < 0) continue; ctx.fillStyle = lt % 8 < 4 ? '#e8d870' : '#c0a8e0';
    ctx.fillRect(Math.round(x + p.ox + Math.sin(lt / 4) * 3), Math.round(y + p.oy - lt * 0.4), 2, 2); } });
}
function fxSteam(x, y) {
  const ps = Array.from({ length: 10 }, () => ({ ox: (rand() - 0.5) * 24, oy: (rand() - 0.5) * 16, d: rand() * 8 }));
  return fx(34, t => { for (const p of ps) { const lt = t - p.d; if (lt < 0) continue; const r = 2 + lt * 0.35;
    ctx.globalAlpha = Math.max(0, 0.75 - lt / 34); ctx.fillStyle = '#eef2f8'; ctx.beginPath(); ctx.arc(x + p.ox, y + p.oy - lt * 0.5, r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; });
}
