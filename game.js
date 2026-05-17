'use strict';

// ── Config ──────────────────────────────────────────────────
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

// ── Board Visual Dimensions ──────────────────────────────────
const BD = (() => {
  const w=900, h=380, padX=64, padY=56, sqSz=68, rows=4, cols=10;
  const xStep = (w - 2*padX) / (cols - 1);   // ≈ 85.8 px
  const yStep = (h - 2*padY) / (rows - 1);   // = 89.3 px
  return {
    w, h, padX, padY, sqSz, rows, cols, xStep, yStep,
    strokeW: Math.round(yStep * 0.93),        // ≈ 83 px  (gap ≈ 6px between rows)
    curveR:  yStep / 2,                       // ≈ 44.7 px
  };
})();

// ── State ────────────────────────────────────────────────────
let state = { players:[], current:0, rolling:false, over:false };

// ── Setup ────────────────────────────────────────────────────
function initSetup() {
  let count = 2;
  renderNameInputs(count);

  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      count = parseInt(btn.dataset.count);
      renderNameInputs(count);
    });
  });

  document.getElementById('start-game-btn').addEventListener('click', () => {
    const names = [...document.querySelectorAll('#player-names-section input')]
      .map((el) => el.value.trim() || el.placeholder);
    startGame(count, names);
  });

  document.getElementById('play-again-btn').addEventListener('click', () => showScreen('setup-screen'));
  document.getElementById('roll-btn').addEventListener('click', onRoll);
}

function renderNameInputs(count) {
  const defaults = ['Jogador 1','Jogador 2','Jogador 3','Jogador 4'];
  const section  = document.getElementById('player-names-section');
  section.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const g = document.createElement('div');
    g.className = 'player-input-group';
    g.innerHTML = `
      <div class="player-color-dot" style="background:${PLAYER_COLORS[i]}"></div>
      <input type="text" placeholder="${defaults[i]}" maxlength="20">`;
    section.appendChild(g);
  }
}

// ── Game Start ───────────────────────────────────────────────
function startGame(numPlayers, names) {
  state = {
    players: names.slice(0, numPlayers).map((name, i) => ({
      name, color: PLAYER_COLORS[i],
      pos: 0, skipNext: false, finished: false,
    })),
    current: 0, rolling: false, over: false,
  };

  showScreen('game-screen');
  buildBoard();
  refreshTokens();
  buildPlayersPanel();
  updateUI();
  log(`Jogo iniciado! ${state.players.map(p => p.name).join(', ')} — Boa sorte!`, 'system');
}

// ── Board Rendering ──────────────────────────────────────────

// Returns pixel center { x, y } of square index.
function squareCenter(idx) {
  const logRow = Math.floor(idx / BD.cols);
  const logCol = idx % BD.cols;
  const dispRow = (BD.rows - 1) - logRow;                          // 0 = top
  const dispCol = (logRow % 2 === 0) ? logCol : (BD.cols-1-logCol); // snake direction
  return {
    x: BD.padX + dispCol * BD.xStep,
    y: BD.padY + dispRow * BD.yStep,
  };
}

function squareClass(idx) {
  if (idx === 0)            return 'sq-start';
  if (idx === BOARD_SIZE-1) return 'sq-end';
  const sp = SPECIALS[idx];
  if (!sp) return 'sq-normal';
  return `sq-${sp.type}`;
}

// SVG path string for the snake body (bezier curves at corners).
function snakePath() {
  const { padX:xL, w, padY, yStep, curveR:r } = BD;
  const xR = w - xL;
  const Y  = dr => padY + dr * yStep; // dr 0=top  3=bottom (in SVG, larger y = lower)
  return [
    `M ${xL} ${Y(3)}`,
    `L ${xR} ${Y(3)}`,
    `C ${xR+r} ${Y(3)} ${xR+r} ${Y(2)} ${xR} ${Y(2)}`,
    `L ${xL} ${Y(2)}`,
    `C ${xL-r} ${Y(2)} ${xL-r} ${Y(1)} ${xL} ${Y(1)}`,
    `L ${xR} ${Y(1)}`,
    `C ${xR+r} ${Y(1)} ${xR+r} ${Y(0)} ${xR} ${Y(0)}`,
    `L ${xL} ${Y(0)}`,
  ].join(' ');
}

function mkPath(svg, NS, d, stroke, sw, opacity) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', sw);
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (opacity != null && opacity < 1) p.setAttribute('opacity', opacity);
  svg.appendChild(p);
  return p;
}

function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.width  = BD.w + 'px';
  board.style.height = BD.h + 'px';

  // ── SVG snake background ──────────────────────────────────
  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width',  BD.w);
  svg.setAttribute('height', BD.h);
  Object.assign(svg.style, { position:'absolute', top:'0', left:'0',
                              overflow:'visible', pointerEvents:'none' });

  const pd = snakePath();
  mkPath(svg, NS, pd, '#05091a',  BD.strokeW + 14);        // drop shadow
  mkPath(svg, NS, pd, '#192b56',  BD.strokeW);              // snake body
  mkPath(svg, NS, pd, '#243d7a',  BD.strokeW - 20, 0.4);   // top highlight

  // Teleport connector lines (like orange wires in the prototype)
  Object.entries(SPECIALS).forEach(([from, sp]) => {
    if (sp.type !== 'teleport') return;
    const a = squareCenter(+from), b = squareCenter(sp.value);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', '#e8891a');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-dasharray', '7 5');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);

    // Arrow at destination
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx/len, uy = dy/len;
    const arrowSize = 8;
    const ax = b.x - ux*arrowSize, ay = b.y - uy*arrowSize;
    const px = -uy*arrowSize*0.5, py = ux*arrowSize*0.5;
    const arrow = document.createElementNS(NS, 'polygon');
    arrow.setAttribute('points', `${b.x},${b.y} ${ax+px},${ay+py} ${ax-px},${ay-py}`);
    arrow.setAttribute('fill', '#e8891a');
    arrow.setAttribute('opacity', '0.8');
    svg.appendChild(arrow);
  });

  board.appendChild(svg);

  // ── Square divs (positioned on top of SVG) ───────────────
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { x, y } = squareCenter(i);
    const sp = SPECIALS[i];

    const div = document.createElement('div');
    div.id        = `sq-${i}`;
    div.className = `square ${squareClass(i)}`;
    div.style.left = (x - BD.sqSz/2) + 'px';
    div.style.top  = (y - BD.sqSz/2) + 'px';
    if (sp) div.title = sp.desc;

    let icon='', label='';
    if (i === 0)              { icon='🏁'; label='INÍCIO'; }
    else if (i===BOARD_SIZE-1){ icon='🏆'; label='FIM'; }
    else if (sp)              { icon=sp.icon; label=sp.label; }

    div.innerHTML = `
      <span class="sq-num">${i}</span>
      ${icon  ? `<span class="sq-icon">${icon}</span>`   : ''}
      ${label ? `<span class="sq-label">${label}</span>` : ''}
      <div class="tokens" id="tk-${i}"></div>`;
    board.appendChild(div);
  }
}

// ── Player Tokens ────────────────────────────────────────────
function refreshTokens() {
  document.querySelectorAll('.tokens').forEach(el => el.innerHTML = '');
  state.players.forEach(p => {
    const cont = document.getElementById(`tk-${p.pos}`);
    if (!cont) return;
    const tok = document.createElement('div');
    tok.className = 'token';
    tok.style.background = p.color;
    tok.title = p.name;
    cont.appendChild(tok);
  });
}

// ── Players Panel ────────────────────────────────────────────
function buildPlayersPanel() {
  const panel = document.getElementById('players-panel');
  panel.innerHTML = '';
  state.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.id = `pc-${i}`;
    card.innerHTML = `
      <div class="p-avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
      <div class="p-text">
        <div class="p-name">${p.name}</div>
        <div class="p-pos" id="pp-${i}">Casa 0 / ${BOARD_SIZE-1}</div>
        <div class="p-status" id="ps-${i}"></div>
      </div>`;
    panel.appendChild(card);
  });
}

function refreshPlayersPanel() {
  state.players.forEach((p, i) => {
    const card = document.getElementById(`pc-${i}`);
    if (!card) return;
    card.className = 'player-card' +
      (i === state.current && !state.over ? ' active-turn'      : '') +
      (p.finished                          ? ' finished-player'  : '') +
      (p.skipNext                          ? ' skip-player'      : '');
    document.getElementById(`pp-${i}`).textContent = `Casa ${p.pos} / ${BOARD_SIZE-1}`;
    const st = document.getElementById(`ps-${i}`);
    if (p.finished)                              st.textContent = '✅ Chegou!';
    else if (p.skipNext)                         st.textContent = '⏸ Vai pular vez';
    else if (i===state.current && !state.over)   st.textContent = '← Sua vez!';
    else                                         st.textContent = '';
  });
}

// ── Dice ─────────────────────────────────────────────────────
function rollDice() { return Math.floor(Math.random() * 6) + 1; }

function animateDice(final) {
  return new Promise(resolve => {
    const face = document.getElementById('dice-face');
    const box  = document.getElementById('dice');
    box.classList.add('rolling');
    let ticks = 0;
    const id = setInterval(() => {
      face.textContent = DICE_FACES[Math.floor(Math.random()*6)];
      if (++ticks >= 9) {
        clearInterval(id);
        face.textContent = DICE_FACES[final-1];
        box.classList.remove('rolling');
        resolve();
      }
    }, 75);
  });
}

// ── Core Turn Logic ──────────────────────────────────────────
async function onRoll() {
  if (state.rolling || state.over) return;
  state.rolling = true;
  document.getElementById('roll-btn').disabled = true;

  const p = state.players[state.current];

  if (p.skipNext) {
    p.skipNext = false;
    log(`⏸ ${p.name} perdeu a vez!`, 'skip');
    await delay(700);
    state.rolling = false;
    nextTurn();
    return;
  }

  const val = rollDice();
  await animateDice(val);
  log(`${p.name} tirou ${DICE_FACES[val-1]} (${val})`, 'move');

  const again = await applyMove(state.current, val);

  state.rolling = false;
  if (!state.over) {
    if (again) updateUI(true);
    else       nextTurn();
  }
}

async function applyMove(pIdx, steps) {
  const p = state.players[pIdx];
  p.pos = Math.min(p.pos + steps, BOARD_SIZE - 1);
  refreshTokens();
  refreshPlayersPanel();
  await delay(300);

  if (p.pos === BOARD_SIZE - 1) {
    p.finished = true;
    log(`🏆 ${p.name} chegou ao FIM!`, 'finish');
    refreshTokens();
    refreshPlayersPanel();
    checkWin();
    return false;
  }

  const sp = SPECIALS[p.pos];
  if (sp) return applySpecial(pIdx, sp, p.pos);
  return false;
}

async function applySpecial(pIdx, sp, landedOn) {
  const p = state.players[pIdx];
  await delay(350);

  switch (sp.type) {
    case 'bonus': {
      log(`✅ ${p.name}: ${sp.desc}`, 'bonus');
      const dest = Math.min(landedOn + sp.value, BOARD_SIZE - 1);
      p.pos = dest;
      refreshTokens();
      refreshPlayersPanel();
      if (dest === BOARD_SIZE - 1) {
        p.finished = true;
        log(`🏆 ${p.name} chegou ao FIM!`, 'finish');
        checkWin();
      }
      return false;
    }
    case 'penalty': {
      log(`❌ ${p.name}: ${sp.desc}`, 'penalty');
      p.pos = Math.max(0, landedOn + sp.value);
      refreshTokens();
      refreshPlayersPanel();
      return false;
    }
    case 'teleport': {
      log(`✈️ ${p.name}: ${sp.desc}`, 'teleport');
      p.pos = sp.value;
      refreshTokens();
      refreshPlayersPanel();
      return false;
    }
    case 'skip': {
      log(`⛔ ${p.name}: ${sp.desc}`, 'skip');
      p.skipNext = true;
      refreshPlayersPanel();
      return false;
    }
    case 'rollagain': {
      log(`🎲 ${p.name}: ${sp.desc}`, 'bonus');
      return true;
    }
  }
  return false;
}

function nextTurn() {
  const unfinished = state.players.filter(p => !p.finished);
  if (unfinished.length === 0) return;
  let tries = 0;
  do {
    state.current = (state.current + 1) % state.players.length;
    if (++tries >= state.players.length) break;
  } while (state.players[state.current].finished);
  updateUI();
}

function checkWin() {
  if (state.players.every(p => p.finished)) {
    state.over = true;
    setTimeout(() => {
      const names = state.players.map(p => p.name).join(', ');
      document.getElementById('winner-text').textContent =
        `${names} chegaram juntos ao fim do tabuleiro!\nMissão cumprida em equipe! 🎉`;
      showScreen('win-screen');
    }, 1600);
  }
}

// ── UI Helpers ───────────────────────────────────────────────
function updateUI(rollAgain = false) {
  const p   = state.players[state.current];
  const btn = document.getElementById('roll-btn');
  refreshPlayersPanel();
  if (!state.over) {
    btn.disabled    = false;
    btn.textContent = rollAgain
      ? `🎲 ${p.name} — Rolar de Novo!`
      : `🎲 ${p.name} — Rolar`;
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function log(msg, type = 'system') {
  const el  = document.getElementById('game-log');
  const div = document.createElement('div');
  div.className   = `log-entry ${type}`;
  div.textContent = msg;
  el.insertBefore(div, el.firstChild);
  while (el.children.length > 25) el.removeChild(el.lastChild);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initSetup);
