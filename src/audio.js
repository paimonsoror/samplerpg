'use strict';
// ===================================================================
//  audio.js — tiny Web Audio sequencer + synthesized SFX.
//  The SNES's SPC700 had a famous echo unit; a feedback delay into
//  a lowpass filter gets surprisingly close to that "16-bit" space.
// ===================================================================

const Sound = (() => {
  let ac = null, master, musicBus, sfxBus, echoIn, noiseBuf, waves = {};
  let muted = false;

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    // echo unit
    echoIn = ac.createGain();
    const dly = ac.createDelay(1); dly.delayTime.value = 0.24;
    const fb = ac.createGain(); fb.gain.value = 0.36;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const ret = ac.createGain(); ret.gain.value = 0.55;
    echoIn.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(ret); ret.connect(master);
    // noise
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // instrument waveforms from harmonic series
    const wave = h => {
      const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1);
      h.forEach((v, i) => (im[i + 1] = v));
      return ac.createPeriodicWave(re, im);
    };
    const pulse = duty => wave(Array.from({ length: 16 }, (_, i) => Math.sin(Math.PI * (i + 1) * duty) / (i + 1)));
    waves.flute = wave([1, 0.32, 0.1, 0.05, 0.02]);
    waves.reed = pulse(0.25);
    waves.lead = pulse(0.33);
    waves.str = wave(Array.from({ length: 12 }, (_, i) => 1 / (i + 1)));
    waves.harp = wave([1, 0.5, 0.22, 0.12, 0.06, 0.03]);
    waves.bass = wave([1, 0.7, 0.35, 0.18, 0.08]);
    if (pendingSong) { const p = pendingSong; pendingSong = null; playSong(p.name, p.opts); }
  }

  // instrument definitions: attack, decay, sustain level, release, filter cutoff, echo send, vibrato
  const INST = {
    flute: { w: 'flute', a: 0.03, d: 0.25, s: 0.7, r: 0.18, cut: 3200, echo: 0.55, vib: 5 },
    reed: { w: 'reed', a: 0.02, d: 0.2, s: 0.6, r: 0.12, cut: 2200, echo: 0.5, vib: 4 },
    lead: { w: 'lead', a: 0.008, d: 0.15, s: 0.65, r: 0.08, cut: 3400, echo: 0.42, vib: 5 },
    str: { w: 'str', a: 0.14, d: 0.4, s: 0.85, r: 0.35, cut: 1700, echo: 0.5, vib: 0 },
    harp: { w: 'harp', a: 0.004, d: 0.7, s: 0, r: 0.2, cut: 3600, echo: 0.6, vib: 0 },
    bass: { w: 'bass', a: 0.008, d: 0.25, s: 0.7, r: 0.06, cut: 1000, echo: 0.08, vib: 0 },
  };
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function freqOf(n) {
    const m = /^([a-g])(#?)(\d)$/.exec(n);
    if (!m) return 0;
    const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function voice(t, f, dur, instName, vol, out) {
    const I = INST[instName];
    const o = ac.createOscillator();
    o.setPeriodicWave(waves[I.w]);
    o.frequency.value = f;
    if (I.vib && dur > 0.25) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = I.vib; lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + I.r + 0.05);
    }
    const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = I.cut;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + I.a);
    g.gain.setTargetAtTime(vol * I.s, t + I.a, I.d / 3);
    g.gain.setValueAtTime(g.gain.value, t + dur);
    g.gain.setTargetAtTime(0, t + dur, I.r / 3);
    o.connect(flt); flt.connect(g); g.connect(out);
    const send = ac.createGain(); send.gain.value = I.echo; g.connect(send); send.connect(echoIn);
    o.start(t); o.stop(t + dur + I.r + 0.1);
  }
  function noise(t, dur, type, freq, vol, out, q = 1, sweepTo) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return g;
  }
  function tone(t, type, f0, f1, dur, vol, out, echo = 0) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out);
    if (echo) { const s = ac.createGain(); s.gain.value = echo; g.connect(s); s.connect(echoIn); }
    o.start(t); o.stop(t + dur + 0.02);
  }
  function drum(t, k, vol, out) {
    if (k === 'k') { tone(t, 'sine', 150, 42, 0.18, vol * 1.3, out); }
    else if (k === 's') { noise(t, 0.16, 'bandpass', 1900, vol * 0.9, out, 0.8); tone(t, 'triangle', 220, 150, 0.08, vol * 0.5, out); }
    else if (k === 'h') { noise(t, 0.045, 'highpass', 7000, vol * 0.35, out); }
    else if (k === 'c') { noise(t, 0.9, 'highpass', 5000, vol * 0.4, out); }
  }

  // ---------- sequencer ----------
  function parse(seq) {
    return seq.trim().split(/\s+/).map(tok => {
      const [n, l] = tok.split('/');
      return { notes: n === 'r' ? [] : n.split('+'), len: +l || 1 };
    });
  }
  const songs = {};
  function defineSong(name, def) { songs[name] = def; def.tracks.forEach(tr => (tr.ev = parse(tr.seq))); }
  let cur = null, curName = null, pendingSong = null;

  function playSong(name, opts = {}) {
    if (!ac) { pendingSong = { name, opts }; return; }
    if (curName === name && cur && !opts.restart) return;
    stopSong(0.4);
    const def = songs[name]; if (!def) return;
    const out = ac.createGain(); out.gain.value = def.vol || 1; out.connect(musicBus);
    const step = 60 / def.bpm / 4;
    const t0 = ac.currentTime + 0.08;
    cur = { def, out, step, loop: opts.loop !== false && def.loop !== false, onEnd: opts.onEnd,
      tracks: def.tracks.map(tr => ({ tr, i: 0, t: t0 })) };
    curName = name;
  }
  function stopSong(fade = 0.5) {
    if (!ac) { pendingSong = null; return; }
    if (cur) {
      const g = cur.out.gain; g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(g.value, ac.currentTime); g.linearRampToValueAtTime(0, ac.currentTime + fade);
      const o = cur.out; setTimeout(() => o.disconnect(), fade * 1000 + 400);
    }
    cur = null; curName = null;
  }
  function tick() {
    if (!ac || !cur) return;
    const horizon = ac.currentTime + 0.15;
    let alive = false;
    for (const ts of cur.tracks) {
      const ev = ts.tr.ev;
      while (ts.i < ev.length && ts.t < horizon) {
        const e = ev[ts.i], dur = e.len * cur.step;
        for (const n of e.notes) {
          if (ts.tr.inst === 'drums') drum(ts.t, n, ts.tr.vol, cur.out);
          else voice(ts.t, freqOf(n), dur * (ts.tr.gate || 0.92), ts.tr.inst, ts.tr.vol, cur.out);
        }
        ts.t += dur; ts.i++;
        if (ts.i >= ev.length && cur.loop) ts.i = 0;
      }
      if (ts.i < ev.length) alive = true;
    }
    if (!alive) {
      const cb = cur.onEnd, endT = Math.max(...cur.tracks.map(t => t.t));
      cur = null; curName = null;
      if (cb) setTimeout(cb, Math.max(0, (endT - ac.currentTime) * 1000));
    }
  }
  setInterval(tick, 25);

  // ---------- sound effects ----------
  const SFX = {
    cursor: t => tone(t, 'square', 1250, 1250, 0.035, 0.08, sfxBus),
    ok: t => { tone(t, 'square', 880, 880, 0.04, 0.08, sfxBus); tone(t + 0.045, 'square', 1320, 1320, 0.06, 0.08, sfxBus, 0.3); },
    cancel: t => { tone(t, 'square', 660, 440, 0.07, 0.08, sfxBus); },
    buzz: t => tone(t, 'square', 130, 110, 0.14, 0.1, sfxBus),
    text: t => tone(t, 'square', 760 + Math.random() * 60, 0, 0.018, 0.035, sfxBus),
    slash: t => noise(t, 0.14, 'bandpass', 900, 0.5, sfxBus, 1.2, 5000),
    hit: t => { noise(t, 0.14, 'lowpass', 2200, 0.7, sfxBus); tone(t, 'sine', 180, 60, 0.12, 0.5, sfxBus); },
    crit: t => { SFX.hit(t); tone(t + 0.02, 'square', 1800, 2400, 0.12, 0.08, sfxBus, 0.5); },
    fire: t => { noise(t, 0.6, 'lowpass', 300, 0.7, sfxBus, 2, 2600); noise(t + 0.1, 0.5, 'bandpass', 600, 0.4, sfxBus, 1, 200); },
    bolt: t => {
      for (let i = 0; i < 6; i++) tone(t + i * 0.045, 'sawtooth', 200 + Math.random() * 900, 80, 0.06, 0.16, sfxBus, 0.4);
      noise(t, 0.4, 'highpass', 2500, 0.55, sfxBus);
    },
    heal: t => ['c6', 'e6', 'g6', 'c7', 'e7'].forEach((n, i) => tone(t + i * 0.06, 'sine', freqOf(n), 0, 0.35, 0.12, sfxBus, 0.7)),
    charge: t => { tone(t, 'sine', 300, 1400, 0.45, 0.12, sfxBus, 0.5); tone(t, 'triangle', 150, 700, 0.45, 0.08, sfxBus); },
    die: t => { noise(t, 0.6, 'bandpass', 3000, 0.4, sfxBus, 2, 200); tone(t, 'square', 600, 60, 0.5, 0.06, sfxBus, 0.4); },
    encounter: t => {
      noise(t, 0.6, 'bandpass', 200, 0.6, sfxBus, 3, 5000);
      tone(t, 'square', 1600, 200, 0.5, 0.06, sfxBus, 0.5); tone(t + 0.25, 'square', 1200, 150, 0.4, 0.05, sfxBus, 0.5);
    },
    chest: t => { ['g5', 'c6', 'e6', 'g6'].forEach((n, i) => tone(t + i * 0.07, 'square', freqOf(n), 0, 0.12, 0.06, sfxBus, 0.5)); },
    save: t => { ['c6', 'g6', 'e6', 'c7', 'g6', 'e7'].forEach((n, i) => tone(t + i * 0.08, 'triangle', freqOf(n), 0, 0.5, 0.12, sfxBus, 0.8)); },
    levelup: t => { ['c5', 'e5', 'g5', 'c6', 'g5', 'c6'].forEach((n, i) => tone(t + i * 0.07, 'square', freqOf(n), 0, 0.1, 0.07, sfxBus, 0.5)); },
    boom: t => { noise(t, 1.3, 'lowpass', 900, 1, sfxBus, 1, 60); tone(t, 'sine', 90, 30, 0.8, 0.8, sfxBus); },
    roar: t => { tone(t, 'sawtooth', 90, 55, 0.9, 0.25, sfxBus, 0.6); noise(t, 0.9, 'lowpass', 400, 0.4, sfxBus, 2, 120); },
    rumble: t => noise(t, 1.4, 'lowpass', 160, 0.9, sfxBus, 1, 60),
    miss: t => noise(t, 0.12, 'highpass', 3000, 0.25, sfxBus, 1, 8000),
    item: t => { tone(t, 'sine', freqOf('e6'), 0, 0.2, 0.12, sfxBus, 0.6); tone(t + 0.08, 'sine', freqOf('b6'), 0, 0.3, 0.12, sfxBus, 0.6); },
    step: t => noise(t, 0.03, 'lowpass', 500, 0.08, sfxBus),
  };
  function sfx(name) {
    if (!ac || muted) return;
    const f = SFX[name]; if (f) f(ac.currentTime + 0.005);
  }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }

  return { unlock, playSong, stopSong, defineSong, sfx, setMuted, get muted() { return muted; }, get current() { return curName; } };
})();

// ---------- the soundtrack (all original) ----------
(() => {
  const rep = (s, n) => Array(n).fill(s).join(' ');
  // 5-note harp arpeggio, up and back down in 8th notes
  const arp = s => { const n = s.split(' '); return [n[0], n[1], n[2], n[3], n[4], n[3], n[2], n[1]].map(x => x + '/2').join(' '); };
  const oct8 = (lo, hi) => rep(`${lo}/2 ${hi}/2`, 4);

  const F = 'f3 c4 f4 a4 c5', Am = 'a3 e4 a4 c5 e5', Bb = 'a#3 f4 a#4 d5 f5', C = 'c4 g4 c5 e5 g5',
    Dm = 'd4 a4 d5 f5 a5', Gm = 'g3 d4 g4 a#4 d5';
  Sound.defineSong('village', {
    bpm: 96, tracks: [
      { inst: 'flute', vol: 0.2, seq:
        'a4/4 c5/4 f5/6 e5/2 e5/6 d5/2 c5/4 a4/4 d5/6 c5/2 a#4/4 d5/4 c5/12 r/4 ' +
        'a4/4 c5/4 f5/4 g5/4 a5/6 g5/2 f5/4 d5/4 d5/4 f5/4 e5/4 c5/4 f5/12 r/4 ' +
        'd5/4 f5/4 a#5/6 a5/2 g5/6 f5/2 e5/4 c5/4 e5/4 c5/4 a4/4 c5/4 d5/6 e5/2 f5/8 ' +
        'g5/4 f5/4 d5/4 a#4/4 c5/4 d5/4 e5/4 g5/4 a5/6 g5/2 f5/4 c5/4 e5/4 d5/4 c5/8' },
      { inst: 'harp', vol: 0.09, seq: [F, Am, Bb, C, F, Dm].map(arp).join(' ') +
        ' a#3/2 f4/2 a#4/2 d5/2 c4/2 g4/2 c5/2 e5/2 ' + arp(F) + ' ' + [Bb, C, Am, Dm, Gm, C, F, C].map(arp).join(' ') },
      { inst: 'bass', vol: 0.22, seq: 'f2/16 a2/16 a#2/16 c3/16 f2/16 d3/16 a#2/8 c3/8 f2/16 a#2/16 c3/16 a2/16 d3/16 g2/16 c3/16 f2/16 c3/16' },
      { inst: 'str', vol: 0.05, seq: 'f4+a4/16 e4+a4/16 f4+a#4/16 e4+g4/16 f4+a4/16 f4+a4/16 f4+a#4/8 e4+g4/8 f4+a4/16 ' +
        'f4+a#4/16 e4+g4/16 e4+a4/16 f4+a4/16 d4+g4/16 e4+g4/16 f4+a4/16 e4+g4/16' },
    ],
  });

  Sound.defineSong('forest', {
    bpm: 100, tracks: [
      { inst: 'reed', vol: 0.13, seq:
        'd5/4 a4/4 d5/4 e5/4 f5/6 e5/2 c5/8 d5/4 a#4/4 f4/4 a#4/4 a4/12 c#5/4 ' +
        'd5/4 f5/4 a5/6 g5/2 f5/4 e5/4 c5/8 d5/4 g5/4 f5/4 e5/4 e5/8 c#5/8 ' +
        'a4/16 g4/16 f4/16 e4/16 f4/16 a4/16 a#4/16 a4/16' },
      { inst: 'str', vol: 0.07, seq: rep('d4+f4+a4/16 c4+e4+g4/16 a#3+d4+f4/16 a3+c#4+e4/16 d4+f4+a4/16 c4+f4+a4/16 a#3+d4+g4/16 a3+c#4+e4/16', 2) },
      { inst: 'bass', vol: 0.2, gate: 0.6, seq: rep(['d2 a2 d3 a2', 'c2 g2 c3 g2', 'a#1 f2 a#2 f2', 'a1 e2 a2 e2', 'd2 a2 d3 a2', 'f2 c3 f3 c3', 'g1 d2 g2 d2', 'a1 e2 a2 c#3']
        .map(b => b.split(' ').map(n => n + '/4').join(' ')).join(' '), 2) },
      { inst: 'drums', vol: 0.18, seq: rep('k/4 h/4 h/4 h/2 h/2', 16) },
    ],
  });

  Sound.defineSong('battle', {
    bpm: 152, tracks: [
      { inst: 'lead', vol: 0.13, seq:
        'a4/2 c5/2 e5/4 d5/2 c5/2 b4/2 c5/2 a4/6 g4/2 f4/4 a4/4 b4/2 d5/2 g5/4 f5/2 e5/2 d5/2 b4/2 e5/12 g#4/4 ' +
        'a4/2 c5/2 e5/4 a5/4 g5/2 e5/2 f5/4 e5/2 d5/2 c5/4 a4/4 d5/4 f5/4 a5/4 g5/2 f5/2 e5/4 d5/2 c5/2 b4/4 g#4/4' },
      { inst: 'bass', vol: 0.2, gate: 0.7, seq: [['a2', 'a3'], ['f2', 'f3'], ['g2', 'g3'], ['e2', 'e3'], ['a2', 'a3'], ['f2', 'f3'], ['d2', 'd3'], ['e2', 'e3']].map(p => oct8(...p)).join(' ') },
      { inst: 'str', vol: 0.06, seq: 'a3+c4+e4/16 a3+c4+f4/16 b3+d4+g4/16 g#3+b3+e4/16 a3+c4+e4/16 a3+c4+f4/16 a3+d4+f4/16 g#3+b3+e4/16' },
      { inst: 'drums', vol: 0.28, seq: rep('k/2 h/2 s/2 h/2 k/2 k/2 s/2 h/2', 8) },
    ],
  });

  Sound.defineSong('boss', {
    bpm: 164, tracks: [
      { inst: 'lead', vol: 0.13, seq:
        'd5/4 d5/2 f5/2 a5/4 g#5/4 a5/2 g5/2 f5/2 e5/2 d5/8 f5/4 a#5/4 a5/4 f5/4 e5/6 c#5/2 a4/8 ' +
        'd6/4 c6/2 a#5/2 a5/4 f5/4 g5/4 a#5/2 a5/2 g5/4 d5/4 f5/4 e5/2 d5/2 c#5/4 e5/4 a5/16' },
      { inst: 'bass', vol: 0.22, gate: 0.7, seq: [['d2', 'd3'], ['d2', 'd3'], ['a#1', 'a#2'], ['a1', 'a2'], ['d2', 'd3'], ['g1', 'g2'], ['a#1', 'a#2'], ['a1', 'a2']].map(p => oct8(...p)).join(' ') },
      { inst: 'str', vol: 0.07, seq: 'd4+f4+a4/16 d4+f4+a4/16 d4+f4+a#4/16 c#4+e4+a4/16 d4+f4+a4/16 d4+g4+a#4/16 d4+f4+a#4/16 c#4+e4+a4/16' },
      { inst: 'drums', vol: 0.3, seq: rep('k/2 h/2 s/2 k/2 k/2 h/2 s/2 s/2', 7) + ' k/2 s/2 s/2 s/2 k/2 s/2 s/1 s/1 s/2' },
    ],
  });

  Sound.defineSong('victory', {
    bpm: 132, loop: false, tracks: [
      { inst: 'lead', vol: 0.15, seq: 'g4/2 c5/2 e5/2 g5/6 f5/2 e5/2 d5/2 e5/2 c5/12 r/4' },
      { inst: 'str', vol: 0.08, seq: 'c4+e4+g4/6 r/2 f4+a4+c5/4 g4+b4+d5/8 c4+e4+g4+c5/12 r/4' },
      { inst: 'bass', vol: 0.22, seq: 'c3/6 r/2 f2/4 g2/8 c2/12 r/4' },
      { inst: 'drums', vol: 0.28, seq: 'k/2 s/2 s/2 k/6 s/4 s/4 k+c/12 r/4' },
    ],
  });

  const tC = 'c3 g3 c4 e4 g4', tAm = 'a2 e3 a3 c4 e4', tF = 'f2 c3 f3 a3 c4', tG = 'g2 d3 g3 b3 d4', tEm = 'e3 b3 e4 g4 b4';
  Sound.defineSong('title', {
    bpm: 76, tracks: [
      { inst: 'flute', vol: 0.19, seq: 'e5/8 g5/8 a5/12 g5/4 f5/8 e5/4 c5/4 d5/16 e5/8 g5/8 b5/8 a5/4 g5/4 a5/6 g5/2 f5/4 e5/4 d5/12 r/4' },
      { inst: 'harp', vol: 0.1, seq: [tC, tAm, tF, tG, tC, tEm, tF, tG].map(arp).join(' ') },
      { inst: 'str', vol: 0.07, seq: 'c4+e4+g4/16 c4+e4+a4/16 c4+f4+a4/16 b3+d4+g4/16 c4+e4+g4/16 b3+e4+g4/16 c4+f4+a4/16 b3+d4+g4/16' },
      { inst: 'bass', vol: 0.2, seq: 'c3/16 a2/16 f2/16 g2/16 c3/16 e2/16 f2/16 g2/16' },
    ],
  });

  Sound.defineSong('gameover', {
    bpm: 66, loop: false, tracks: [
      { inst: 'flute', vol: 0.18, seq: 'a4/8 g4/8 f4/8 e4/12 r/4 d4/8 e4/8 a3/16' },
      { inst: 'str', vol: 0.08, seq: 'c4+e4+a4/16 a3+d4+f4/16 g#3+b3+e4/12 r/4 a3+c4+e4/16' },
      { inst: 'bass', vol: 0.18, seq: 'a2/16 d2/16 e2/16 a1/16' },
    ],
  });
})();
