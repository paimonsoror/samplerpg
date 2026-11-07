'use strict';
// ===================================================================
//  data.js — heroes, skills, items, monsters, the map and its people.
// ===================================================================

const HEROES = {
  arden: { name: 'Arden', cmd: 'Tech', weapon: 'sword', skills: ['cleave', 'whirl'],
    look: { hair: '#c8442e', skin: '#f4c4a0', top: '#3a62c4', pants: '#5a4632', boots: '#3a2a22', acc: '#e04848', belt: '#6a4a2a', style: 'spiky', scarf: true },
    lv: 5, hp: 168, mp: 22, atk: 24, def: 12, mag: 8, mdef: 8, spd: 12 },
  sera: { name: 'Sera', cmd: 'Magic', weapon: 'staff', skills: ['ember', 'spark', 'mend'],
    look: { hair: '#f0c860', skin: '#f8d4b8', top: '#e6e2f2', pants: '#6a5a8a', boots: '#5a4a7a', acc: '#2aa8a0', style: 'long', body: 'robe', trim: true, blush: true },
    lv: 5, hp: 118, mp: 46, atk: 10, def: 7, mag: 24, mdef: 15, spd: 11 },
  tobin: { name: 'Tobin', cmd: 'Gadget', weapon: 'hammer', skills: ['blast', 'coil', 'patch'],
    look: { hair: '#5a3a24', skin: '#e0a880', top: '#6e8a3a', pants: '#46506a', boots: '#3a2a22', acc: '#c88a30', belt: '#5a3a1a', style: 'goggles', body: 'stocky', pouch: true },
    lv: 5, hp: 150, mp: 30, atk: 19, def: 13, mag: 15, mdef: 10, spd: 9 },
};
const NPC_LOOKS = {
  elder: { hair: '#e4e4ee', skin: '#e8b898', top: '#7a4a9a', pants: '#4a2a5a', boots: '#3a2a2a', acc: '#e0c050', style: 'elder', body: 'robe', trim: true },
  kid: { hair: '#d89040', skin: '#f4c8a8', top: '#e07030', pants: '#3a5aa0', boots: '#3a2a22', acc: '#3aa04a', style: 'cap' },
  hana: { hair: '#6a3a2a', skin: '#f2c8aa', top: '#c85a7a', pants: '#7a3a5a', boots: '#4a2a2a', acc: '#f4e4c0', style: 'bun', body: 'robe', trim: true },
  guard: { hair: '#2a2a3a', skin: '#d8a888', top: '#7a7e94', pants: '#3a3e54', boots: '#2a2a2a', acc: '#b03a3a', belt: '#4a3a2a', style: 'short' },
  farmer: { hair: '#8a5a2a', skin: '#e8b090', top: '#a8884a', pants: '#4a5a3a', boots: '#3a2a22', acc: '#d0b060', belt: '#5a3a1a', style: 'short', body: 'stocky' },
};

const SKILLS = {
  cleave: { name: 'Cleave', mp: 3, target: 'enemy', kind: 'phys', mult: 1.8, fx: 'cleave', desc: 'A heavy two-handed strike.' },
  whirl: { name: 'Whirl Blade', mp: 7, target: 'enemies', kind: 'phys', mult: 0.95, fx: 'whirl', desc: 'Spin and cut every foe.' },
  ember: { name: 'Ember', mp: 4, target: 'enemy', kind: 'mag', power: 34, elem: 'fire', fx: 'fire', desc: 'Fire damage to one foe.' },
  spark: { name: 'Spark', mp: 8, target: 'enemies', kind: 'mag', power: 24, elem: 'bolt', fx: 'bolt', desc: 'Lightning strikes all foes.' },
  mend: { name: 'Mend', mp: 5, target: 'ally', kind: 'heal', power: 52, fx: 'heal', desc: 'Restore one ally\'s HP.' },
  blast: { name: 'Blast Pellet', mp: 5, target: 'enemies', kind: 'mag', power: 20, elem: 'fire', fx: 'bomb', desc: 'An explosive shot hits all foes.' },
  coil: { name: 'Shock Coil', mp: 6, target: 'enemy', kind: 'mag', power: 40, elem: 'bolt', fx: 'bolt', desc: 'Strong lightning on one foe.' },
  patch: { name: 'Patch Kit', mp: 7, target: 'allies', kind: 'heal', power: 30, fx: 'heal', desc: 'Restore HP to the whole party.' },
};
const COMBOS = [
  { name: 'Flame Edge', who: ['arden', 'sera'], mp: [4, 4], target: 'enemy', kind: 'mag', power: 90, elem: 'fire', fx: 'flameedge', desc: 'Sera sets Arden\'s blade alight.' },
  { name: 'Storm Hammer', who: ['tobin', 'sera'], mp: [5, 6], target: 'enemies', kind: 'mag', power: 48, elem: 'bolt', fx: 'storm', desc: 'A charged hammer calls lightning.' },
  { name: 'Gear Rush', who: ['arden', 'tobin'], mp: [3, 3], target: 'enemies', kind: 'phys', mult: 1.4, fx: 'rush', desc: 'A back-to-back assault on all foes.' },
];
const ITEMS = {
  tonic: { name: 'Tonic', target: 'ally', heal: 80, desc: 'Restores 80 HP to one ally.' },
  ether: { name: 'Mana Drop', target: 'ally', mpheal: 20, desc: 'Restores 20 MP to one ally.' },
  leaf: { name: 'Revival Leaf', target: 'ko', revive: 0.3, desc: 'Revives a fallen ally.' },
};

const ENEMIES = {
  gel: { name: 'Mossgel', hp: 62, atk: 15, def: 6, mag: 8, mdef: 6, spd: 7, exp: 14, gold: 9, weak: ['fire'], acts: [['tackle', 3], ['sap', 1]] },
  bat: { name: 'Duskwing', hp: 50, atk: 17, def: 5, mag: 9, mdef: 8, spd: 14, exp: 16, gold: 11, weak: ['bolt'], fly: true, acts: [['bite', 3], ['screech', 1]] },
  shroom: { name: 'Shroomcap', hp: 78, atk: 16, def: 9, mag: 11, mdef: 7, spd: 8, exp: 18, gold: 14, weak: ['fire'], acts: [['headbutt', 2], ['spores', 1]] },
  sentinel: { name: 'Sentinel', hp: 900, atk: 30, def: 15, mag: 21, mdef: 12, spd: 9, exp: 240, gold: 300, weak: ['bolt'], boss: true },
};
const EACTS = {
  tackle: { name: 'Tackle', kind: 'phys', mult: 1, target: 'one' },
  sap: { name: 'Sap Glob', kind: 'mag', power: 16, target: 'one', fx: 'goo' },
  bite: { name: 'Bite', kind: 'phys', mult: 1.1, target: 'one' },
  screech: { name: 'Screech', kind: 'mag', power: 10, target: 'all', fx: 'wave' },
  headbutt: { name: 'Headbutt', kind: 'phys', mult: 1.15, target: 'one' },
  spores: { name: 'Spore Puff', kind: 'mag', power: 12, target: 'all', fx: 'spores' },
  fist: { name: 'Iron Fist', kind: 'phys', mult: 1.3, target: 'one' },
  steam: { name: 'Steam Vent', kind: 'mag', power: 20, target: 'all', fx: 'steam' },
  charge: { name: 'Core Charge', kind: 'charge' },
  burst: { name: 'Core Burst', kind: 'mag', power: 40, target: 'all', fx: 'burst' },
};
const FORMATIONS = {
  south: [['gel', 'gel'], ['gel', 'gel', 'gel'], ['shroom', 'gel'], ['shroom', 'shroom']],
  north: [['bat', 'bat'], ['shroom', 'bat', 'gel'], ['bat', 'gel', 'bat'], ['shroom', 'shroom', 'bat']],
};

// ---------------- the map ----------------
// F forest  . grass  , flowers  " tall grass  = path  ~ water  # bridge  T tree
// S stone  X ruin wall  P pillar  G gate  g gate step  @ crystal  C chest
// b bush  r rock  f fence  s sign  w well
const MAP_SRC = [
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'FFFFFFXXXXXXXXXXXXXXXXXXFFFFFF',
  'FFFFFFXXXXXXXXXXXXXXXXXXFFFFFF',
  'FFFFFFXXXXXXXXXGXXXXXXXXFFFFFF',
  'FFFFFFXSSSSSSSSgSSSSSSSXFFFFFF',
  'FFFFFFXSPSSSSSSSSSSSSPSXFFFFFF',
  'FFFFFFXSSSSSSSSSSSSSSSSXFFFFFF',
  'FFFFFFXSPSSS@SSSSSSSSPSXFFFFFF',
  'FFFFFFXSSSSSSSSSSSSSSSSXFFFFFF',
  'FFFFFFXXXXXXXSSSSXXXXXXXFFFFFF',
  'FFFFFFFFFFF""====""FFFFFFFFFFF',
  'FFFFFFFFF"""".==.""""FFFFFFFFF',
  'FFFFFFFF"""T".==."""T""FFFFFFF',
  'FFFFFFF"""""".==.""""""FFFFFFF',
  'FFFFFFF""C""".==."""r""FFFFFFF',
  'FFFFFF""""""".==.""""""FFFFFFF',
  '~~~~~~~~~~~~~~##~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~##~~~~~~~~~~~~~~',
  'FFFFFF""""T"".==."""T"""FFFFFF',
  'FFFFFFF"""""".==.""""""FFFFFFF',
  'FFFFFFFF""""".==."""""FFFFFFFF',
  'FFFFFFFFFb""".==."""bFFFFFFFFF',
  'FFFFFFFFFF....==....FFFFFFFFFF',
  'FFFFFFFFF...s.==.....FFFFFFFFF',
  'FFFFFF........==........FFFFFF',
  'FFFFT.........==.........TFFFF',
  'FFF...........==...........FFF',
  'FF............==............FF',
  'FFC...........==............FF',
  'FF............==............FF',
  'FF............==............FF',
  'FF....=.......==......=.....FF',
  'FF.========================.FF',
  'FF,...........==...........,FF',
  'FF............==............FF',
  'FF........,w..==............FF',
  'FF............==............FF',
  'FFffff........==............FF',
  'FF,,,.........==........~~~.FF',
  'FF,,,.........==........~~~~FF',
  'FFF...........==........~~.FFF',
  'FFFFT.........==.........TFFFF',
  'FFFFFF........==........FFFFFF',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
];
const MW = 30, MH = MAP_SRC.length;
const MAP = MAP_SRC.map(r => (r + 'F'.repeat(MW)).slice(0, MW).split(''));
const HOUSES = [
  { x: 4, y: 28, kind: 'houseRed', door: 'The door is locked. A note reads: "Gone to the plaza."' },
  { x: 20, y: 28, kind: 'houseBlue', door: 'Tobin\'s workshop. Something inside is still ticking.' },
  { x: 18, y: 36, kind: 'houseGreen', door: 'Elder Maro\'s house. It smells of old books and tea.' },
];
const NPCS = [
  { id: 'elder', look: 'elder', x: 20, y: 40, dir: 'down', name: 'Elder Maro', talk: [
    ['Elder Maro', 'Three nights now the old bell in the Aster Ruins has rung. No hand has touched it.'],
    ['Elder Maro', 'Long ago our ancestors built a guardian to watch over that place. A Sentinel of brass and gears.'],
    ['Elder Maro', 'If it has woken, it may not know friend from foe. Go north through Whisperwood, and be careful.'],
  ], talk2: [['Elder Maro', 'The ruins lie past the river. Rest at the blue crystal before you face what waits there.']] },
  { id: 'hana', look: 'hana', x: 12, y: 35, dir: 'left', name: 'Hana', talk: [
    ['Hana', 'Every time that bell rings, the well water ripples. Even when there is no wind.'],
    ['Hana', 'Sera, keep these two out of trouble, will you?'],
    ['Sera', 'I always do.'],
  ] },
  { id: 'pip', look: 'kid', x: 9, y: 34, dir: 'down', name: 'Pip', wander: { x0: 6, y0: 34, x1: 12, y1: 37 }, talk: [
    ['Pip', 'Tobin! Is it true you built a hammer that shoots lightning?'],
    ['Tobin', 'Only on good days.'],
  ] },
  { id: 'farmer', look: 'farmer', x: 24, y: 34, dir: 'left', name: 'Bram', talk: [
    ['Bram', 'Monsters have been creeping out of the tall grass up north. Fire works well on those moss blobs.'],
  ] },
  { id: 'guard', look: 'guard', x: 14, y: 43, dir: 'up', name: 'Guard', talk: [
    ['Guard', 'The southern road washed out in the storm. The only way out of Larkspur is north.'],
  ] },
];
const SIGNS = { '12,24': [['', 'North: Whisperwood and the Aster Ruins. Monsters lurk in the tall grass.']] };
const CHESTS = {
  '9,15': { items: { tonic: 2, ether: 1 }, text: 'Found 2 Tonics and a Mana Drop!' },
  '2,29': { items: { leaf: 1 }, text: 'Found a Revival Leaf!' },
};

// ---------------- game state ----------------
const Game = {
  party: [], items: {}, gold: 0, flags: {}, frames: 0, respawn: null,
};
function expForLevel(lv) { return Math.floor(24 * Math.pow(lv, 1.6)); }
function newGame() {
  Game.party = ['arden', 'sera', 'tobin'].map(id => {
    const h = HEROES[id];
    return { id, name: h.name, lv: h.lv, exp: expForLevel(h.lv), hp: h.hp, maxhp: h.hp, mp: h.mp, maxmp: h.mp,
      atk: h.atk, def: h.def, mag: h.mag, mdef: h.mdef, spd: h.spd };
  });
  Game.items = { tonic: 3, ether: 1, leaf: 1 };
  Game.gold = 120; Game.flags = {}; Game.frames = 0;
  Game.respawn = { x: 14, y: 35, dir: 'up' };
}
function healParty() { for (const p of Game.party) { p.hp = p.maxhp; p.mp = p.maxmp; } }
function gainExp(amount) {
  const msgs = [];
  for (const p of Game.party) {
    if (p.hp <= 0) continue;
    p.exp += amount;
    const startLv = p.lv;
    while (p.exp >= expForLevel(p.lv + 1)) {
      p.lv++;
      const up = { hp: rint(11, 16), mp: rint(2, 4), atk: rint(1, 3), def: 1, mag: rint(1, 3), mdef: 1 };
      p.maxhp += up.hp; p.hp += up.hp; p.maxmp += up.mp; p.mp += up.mp;
      p.atk += up.atk; p.def += up.def; p.mag += up.mag; p.mdef += up.mdef;
    }
    if (p.lv > startLv) msgs.push(`${p.name} reached level ${p.lv}!`);
  }
  return msgs;
}
