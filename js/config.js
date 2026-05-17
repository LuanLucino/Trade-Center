'use strict';

const BOARD_SIZE    = 40;
const PER_ROW       = 10;
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
const DICE_FACES    = ['⚀','⚁','⚂','⚃','⚄','⚅'];

const SPECIALS = {
   4: { type: 'bonus',     value:  5, icon: '⬆️', label: '+5',   desc: 'Boa notícia! Avança 5 casas!' },
   7: { type: 'penalty',   value: -3, icon: '⬇️', label: '-3',   desc: 'Mau negócio. Volta 3 casas!' },
  11: { type: 'teleport',  value: 24, icon: '✈️', label: '→24',  desc: 'Atalho! Salta para a casa 24!' },
  14: { type: 'skip',      value:  0, icon: '⛔', label: 'STOP', desc: 'Fiscalização! Perde a vez.' },
  17: { type: 'penalty',   value: -5, icon: '📉', label: '-5',   desc: 'Prejuízo! Volta 5 casas.' },
  21: { type: 'teleport',  value:  9, icon: '🔙', label: '→9',   desc: 'Armadilha! Volta para a casa 9.' },
  26: { type: 'rollagain', value:  0, icon: '🎲', label: '+🎲',  desc: 'Sorte! Role o dado de novo.' },
  29: { type: 'bonus',     value:  4, icon: '💰', label: '+4',   desc: 'Investimento certo! Avança 4 casas.' },
  33: { type: 'penalty',   value: -6, icon: '💸', label: '-6',   desc: 'Falência! Volta 6 casas.' },
  37: { type: 'penalty',   value: -4, icon: '😬', label: '-4',   desc: 'Quase lá... Volta 4 casas!' },
};

// Board visual dimensions — derived once, shared by board.js
const BD = (() => {
  const w=900, h=600, padX=70, padY=56, sqSz=64, rows=4, cols=10;
  const xStep = (w - 2*padX) / (cols - 1);
  const yStep = (h - 2*padY) / (rows - 1);
  // strokeW is tied to sqSz, NOT yStep — keeps the track narrow
  // so the gap between rows (yStep - strokeW ≈ 84px) stays visible
  const strokeW = sqSz + 14;
  return {
    w, h, padX, padY, sqSz, rows, cols, xStep, yStep,
    strokeW,
    curveR: yStep / 2,
  };
})();

// Custom audio files per square index (path relative to project root)
const SQUARE_SOUNDS = {
   4: 'sounds/house4.wav',
  11: 'sounds/house11.wav',
  26: 'sounds/house26.wav',
  29: 'sounds/house29.wav',
};

// WebSocket server URL.
// In the online screen the user can override this via the URL input.
const DEFAULT_WS_URL = 'wss://resample-iron-blank.ngrok-free.dev';
