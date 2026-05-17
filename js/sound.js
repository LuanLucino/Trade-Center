'use strict';

let _audioCtx = null;
let _muted = localStorage.getItem('tc_muted') === '1';

function _ctx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function _note(freq, type, duration, volume, when = 0) {
  const ctx  = _ctx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  gain.gain.setValueAtTime(volume, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.05);
}

function _roll() {
  for (let i = 0; i < 7; i++) {
    _note(180 + Math.random() * 120, 'square', 0.035, 0.07, i * 0.058);
  }
}

function _bonus() {
  _note(523, 'sine', 0.14, 0.18);
  _note(659, 'sine', 0.14, 0.18, 0.12);
  _note(784, 'sine', 0.22, 0.20, 0.24);
}

function _penalty() {
  _note(320, 'sawtooth', 0.14, 0.14);
  _note(220, 'sawtooth', 0.22, 0.14, 0.13);
}

function _teleport() {
  const ctx  = _ctx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.28);
  gain.gain.setValueAtTime(0.17, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.38);
}

function _skip() {
  _note(440, 'square', 0.08, 0.11);
  _note(330, 'square', 0.16, 0.11, 0.10);
}

function _rollAgain() {
  _note(600, 'sine', 0.09, 0.17);
  _note(800, 'sine', 0.09, 0.17, 0.10);
  _note(600, 'sine', 0.09, 0.17, 0.20);
  _note(800, 'sine', 0.12, 0.17, 0.30);
}

function _win() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => _note(f, 'sine', 0.28, 0.18, i * 0.13));
}

function playSound(type) {
  if (_muted) return;
  try {
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    switch (type) {
      case 'roll':      _roll();      break;
      case 'bonus':     _bonus();     break;
      case 'penalty':   _penalty();   break;
      case 'teleport':  _teleport();  break;
      case 'skip':      _skip();      break;
      case 'rollagain': _rollAgain(); break;
      case 'win':       _win();       break;
    }
  } catch(e) {}
}

function toggleMute() {
  _muted = !_muted;
  localStorage.setItem('tc_muted', _muted ? '1' : '0');
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.textContent = _muted ? '🔇' : '🔊';
    btn.classList.toggle('muted', _muted);
  }
}
