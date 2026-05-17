'use strict';

let _audioCtx   = null;
let _masterGain = null;
let _muted      = localStorage.getItem('tc_muted') === '1';
let _volume     = parseFloat(localStorage.getItem('tc_volume') || '1');

function _ctx() {
  if (!_audioCtx) {
    _audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    _masterGain = _audioCtx.createGain();
    _masterGain.gain.value = _muted ? 0 : _volume;
    _masterGain.connect(_audioCtx.destination);
  }
  return _audioCtx;
}

function _note(freq, type, duration, volume, when = 0) {
  const ctx  = _ctx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(_masterGain);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  gain.gain.setValueAtTime(volume, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.05);
}

// All volumes multiplied ×1.5 vs original
function _roll() {
  for (let i = 0; i < 7; i++) {
    _note(180 + Math.random() * 120, 'square', 0.035, 0.105, i * 0.058);
  }
}

function _bonus() {
  _note(523, 'sine', 0.14, 0.27);
  _note(659, 'sine', 0.14, 0.27, 0.12);
  _note(784, 'sine', 0.22, 0.30, 0.24);
}

function _penalty() {
  _note(320, 'sawtooth', 0.14, 0.21);
  _note(220, 'sawtooth', 0.22, 0.21, 0.13);
}

function _teleport() {
  const ctx  = _ctx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(_masterGain);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.28);
  gain.gain.setValueAtTime(0.255, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.38);
}

function _skip() {
  _note(440, 'square', 0.08, 0.165);
  _note(330, 'square', 0.16, 0.165, 0.10);
}

function _rollAgain() {
  _note(600, 'sine', 0.09, 0.255);
  _note(800, 'sine', 0.09, 0.255, 0.10);
  _note(600, 'sine', 0.09, 0.255, 0.20);
  _note(800, 'sine', 0.12, 0.255, 0.30);
}

function _win() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => _note(f, 'sine', 0.28, 0.27, i * 0.13));
}

function _countdownBeep() {
  _note(660, 'sine', 0.09, 0.195);
}

function playSound(type) {
  if (_muted) return;
  try {
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    if (type !== 'countdown') {
      duckBgMusic();
      unduckBgMusic(type === 'roll' ? 700 : type === 'win' ? 4500 : 2000);
    }
    switch (type) {
      case 'roll':      _roll();          break;
      case 'bonus':     _bonus();         break;
      case 'penalty':   _penalty();       break;
      case 'teleport':  _teleport();      break;
      case 'skip':      _skip();          break;
      case 'rollagain': _rollAgain();     break;
      case 'win':       _win();           break;
      case 'countdown': _countdownBeep(); break;
    }
  } catch(e) {}
}

function playSquareSound(url) {
  if (_muted) return;
  try {
    duckBgMusic();
    unduckBgMusic(3200);
    const audio = new Audio(url);
    audio.volume = Math.min(1, _volume * 0.85);
    audio.play().catch(() => {});
  } catch(e) {}
}

function setMasterVolume(v) {
  _volume = v;
  localStorage.setItem('tc_volume', v);
  if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume;
}

function toggleMute() {
  _muted = !_muted;
  localStorage.setItem('tc_muted', _muted ? '1' : '0');
  if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume;
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.textContent = _muted ? '🔇' : '🔊';
    btn.classList.toggle('muted', _muted);
  }
}

// ── Background music (procedural, no copyright) ───────────────
let _bgGain      = null;
let _bgActive    = false;
let _bgNodes     = [];
let _bgDuckTimer = null;
const _BG_VOL    = 0.20;
const _BG_DUCKED = 0.04;

function startBgMusic() {
  if (_bgActive) return;
  _bgActive = true;
  const ctx = _ctx();
  if (ctx.state === 'suspended') ctx.resume();
  _bgGain = ctx.createGain();
  _bgGain.gain.value = _BG_VOL;
  _bgGain.connect(_masterGain);
  _bgLoop(ctx, ctx.currentTime + 0.3);
}

function stopBgMusic() {
  _bgActive = false;
  clearTimeout(_bgDuckTimer);
  _bgNodes.forEach(n => { try { n.stop(); } catch {} });
  _bgNodes = [];
  if (_bgGain) { try { _bgGain.disconnect(); } catch {} _bgGain = null; }
}

function duckBgMusic() {
  if (!_bgGain) return;
  clearTimeout(_bgDuckTimer);
  const ctx = _ctx();
  _bgGain.gain.cancelScheduledValues(ctx.currentTime);
  _bgGain.gain.setTargetAtTime(_BG_DUCKED, ctx.currentTime, 0.08);
}

function unduckBgMusic(ms = 1800) {
  if (!_bgGain) return;
  clearTimeout(_bgDuckTimer);
  _bgDuckTimer = setTimeout(() => {
    if (!_bgGain) return;
    const ctx = _ctx();
    _bgGain.gain.cancelScheduledValues(ctx.currentTime);
    _bgGain.gain.setTargetAtTime(_BG_VOL, ctx.currentTime, 0.5);
  }, ms);
}

// Ambient loop: C–Am–F–G progression, pads + bass + soft melody
function _bgLoop(ctx, startTime) {
  if (!_bgActive || !_bgGain) return;

  const beat = 0.72; // ~83 BPM
  const bar  = beat * 4;
  const bars = 8;
  const dur  = bars * bar; // ~23s loop

  // Chord progression (2 bars each)
  const chords = [
    { midi: [60, 64, 67], bassM: 48 }, // C major  / C3
    { midi: [60, 64, 67], bassM: 48 },
    { midi: [57, 60, 64], bassM: 45 }, // A minor  / A2
    { midi: [57, 60, 64], bassM: 45 },
    { midi: [65, 69, 72], bassM: 53 }, // F major  / F3
    { midi: [65, 69, 72], bassM: 53 },
    { midi: [55, 59, 62], bassM: 43 }, // G major  / G2
    { midi: [55, 59, 62], bassM: 43 },
  ];

  chords.forEach(({ midi, bassM }, b) => {
    const t = startTime + b * bar;

    // Pad voices — low-pass sine, slow fade
    midi.forEach(m => {
      const freq = 440 * Math.pow(2, (m - 69) / 12);
      const osc  = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const g    = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      filt.type = 'lowpass'; filt.frequency.value = 680;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.38);
      g.gain.setValueAtTime(0.11, t + bar - 0.28);
      g.gain.linearRampToValueAtTime(0, t + bar);
      osc.connect(filt); filt.connect(g); g.connect(_bgGain);
      osc.start(t); osc.stop(t + bar + 0.05);
      _bgNodes.push(osc);
    });

    // Bass — triangle, punchy
    const bFreq = 440 * Math.pow(2, (bassM - 69) / 12);
    const bOsc  = ctx.createOscillator();
    const bG    = ctx.createGain();
    bOsc.type = 'triangle'; bOsc.frequency.value = bFreq;
    bG.gain.setValueAtTime(0, t);
    bG.gain.linearRampToValueAtTime(0.26, t + 0.06);
    bG.gain.setValueAtTime(0.26, t + bar * 0.55);
    bG.gain.linearRampToValueAtTime(0, t + bar * 0.82);
    bOsc.connect(bG); bG.connect(_bgGain);
    bOsc.start(t); bOsc.stop(t + bar);
    _bgNodes.push(bOsc);
  });

  // Melody — pentatonic motif, 1 note per 2 beats (half-note pace)
  const melMidi = [72, 76, 79, 81, 79, 76, 72, 74,
                   76, 79, 81, 79, 76, 72, 74, 72];
  melMidi.forEach((m, i) => {
    const t    = startTime + i * (beat * 2);
    const freq = 440 * Math.pow(2, (m - 69) / 12);
    const nd   = beat * 1.4;
    const osc  = ctx.createOscillator();
    const g    = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.05);
    g.gain.setValueAtTime(0.045, t + nd * 0.65);
    g.gain.linearRampToValueAtTime(0, t + nd);
    osc.connect(g); g.connect(_bgGain);
    osc.start(t); osc.stop(t + nd + 0.05);
    _bgNodes.push(osc);
  });

  setTimeout(() => {
    _bgNodes = [];
    if (_bgActive) _bgLoop(ctx, startTime + dur);
  }, (dur - 0.18) * 1000);
}
