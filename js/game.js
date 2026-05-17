'use strict';

// ── State ────────────────────────────────────────────────────
let state = { players:[], current:0, rolling:false, over:false };

// ── Entry point ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initModeScreen();
  initOnlineScreen();
  document.getElementById('roll-btn').addEventListener('click', onRoll);
  document.getElementById('play-again-btn').addEventListener('click', () => {
    isOnline = false;
    myIdx    = null;
    if (socket) { socket.close(); socket = null; }
    showScreen('mode-screen');
  });
});

// ── Local game ───────────────────────────────────────────────
function startLocalGame(numPlayers, names) {
  isOnline = false;
  myIdx    = null;
  initGame(names.slice(0, numPlayers));
}

// ── Online game ───────────────────────────────────────────────
function startOnlineGame(serverPlayers) {
  isOnline = true;
  initGame(serverPlayers.map(p => p.name));
  log(`Você é ${state.players[myIdx].name}. Boa sorte!`, 'system');
}

// ── Common initializer ────────────────────────────────────────
function initGame(names) {
  state = {
    players: names.map((name, i) => ({
      name, color: PLAYER_COLORS[i],
      pos: 0, skipNext: false, finished: false,
    })),
    current: 0, rolling: false, over: false,
  };
  showScreen('game-screen');
  buildBoard();
  initTokens();
  refreshTokens();
  buildPlayersPanel();
  updateUI();
  log(`Jogo iniciado! ${names.join(', ')} — Boa sorte!`, 'system');
}

// ── Dice ─────────────────────────────────────────────────────
function rollDice() { return Math.floor(Math.random() * 6) + 1; }

// ── Turn flow ─────────────────────────────────────────────────
async function onRoll() {
  if (state.rolling || state.over) return;
  if (isOnline && myIdx !== state.current) return;

  state.rolling = true;
  document.getElementById('roll-btn').disabled = true;

  const p = state.players[state.current];

  if (p.skipNext) {
    p.skipNext = false;
    if (isOnline) sendToServer({ type: 'game_action', action: 'skip' });
    log(`⏸ ${p.name} perdeu a vez!`, 'skip');
    await delay(700);
    state.rolling = false;
    nextTurn();
    return;
  }

  const val = rollDice();
  if (isOnline) sendToServer({ type: 'game_action', action: 'roll', value: val });
  await processTurn(val);
}

// processTurn is shared between local and remote-action paths.
async function processTurn(val) {
  await animateDice(val);
  log(`${state.players[state.current].name} tirou ${DICE_FACES[val-1]} (${val})`, 'move');

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
  await delay(380);

  switch (sp.type) {
    case 'bonus': {
      log(`✅ ${p.name}: ${sp.desc}`, 'bonus');
      const dest = Math.min(landedOn + sp.value, BOARD_SIZE - 1);
      p.pos = dest;
      refreshTokens();
      refreshPlayersPanel();
      if (dest === BOARD_SIZE - 1) { p.finished = true; log(`🏆 ${p.name} chegou ao FIM!`, 'finish'); checkWin(); }
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
  if (!state.players.every(p => p.finished)) return;
  state.over = true;
  setTimeout(() => {
    showWinScreen(
      state.players.map(p => p.name).join(', ') +
      ' chegaram juntos ao fim!\nMissão cumprida em equipe! 🎉'
    );
  }, 1600);
}
