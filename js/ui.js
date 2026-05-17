'use strict';

// ── Screen navigation ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Log ──────────────────────────────────────────────────────
function log(msg, type = 'system') {
  const el  = document.getElementById('game-log');
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  div.textContent = msg;
  el.insertBefore(div, el.firstChild);
  while (el.children.length > 30) el.removeChild(el.lastChild);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Dice animation ───────────────────────────────────────────
function animateDice(final) {
  return new Promise(resolve => {
    const face = document.getElementById('dice-face');
    const box  = document.getElementById('dice');
    box.classList.add('rolling');
    let ticks = 0;
    const id = setInterval(() => {
      face.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
      if (++ticks >= 9) {
        clearInterval(id);
        face.textContent = DICE_FACES[final - 1];
        box.classList.remove('rolling');
        resolve();
      }
    }, 75);
  });
}

// ── Players panel (in-game) ───────────────────────────────────
function buildPlayersPanel() {
  const panel = document.getElementById('players-panel');
  panel.innerHTML = '';
  state.players.forEach((p, i) => {
    const isMe = isOnline && i === myIdx;
    const card = document.createElement('div');
    card.id = `pc-${i}`;
    card.className = 'player-card';
    card.innerHTML = `
      <div class="p-avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
      <div class="p-text">
        <div class="p-name">${p.name}${isMe ? '<span class="you-badge">você</span>' : ''}</div>
        <div class="p-pos" id="pp-${i}">Casa 0</div>
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
      (i === state.current && !state.over ? ' active-turn'     : '') +
      (p.finished                          ? ' finished-player' : '') +
      (p.skipNext                          ? ' skip-player'     : '');
    document.getElementById(`pp-${i}`).textContent = `Casa ${p.pos} / ${BOARD_SIZE - 1}`;
    const st = document.getElementById(`ps-${i}`);
    if      (p.finished)                              st.textContent = '✅ Chegou!';
    else if (p.skipNext)                              st.textContent = '⏸ Vai pular vez';
    else if (i === state.current && !state.over)      st.textContent = '← Jogando...';
    else                                              st.textContent = '';
  });
}

// ── Roll button / turn label ─────────────────────────────────
function updateUI(rollAgain = false) {
  refreshPlayersPanel();
  if (state.over) return;
  const p       = state.players[state.current];
  const btn     = document.getElementById('roll-btn');
  const isMyTurn = !isOnline || myIdx === state.current;
  btn.disabled = !isMyTurn;
  btn.textContent = isMyTurn
    ? (rollAgain ? '🎲 Rolar de Novo!' : '🎲 Rolar Dado')
    : `⏳ Vez de ${p.name}...`;
}

// ── Mode screen ──────────────────────────────────────────────
function initModeScreen() {
  document.getElementById('btn-local').addEventListener('click', () => {
    showScreen('setup-screen');
    initLocalSetup();
  });
  document.getElementById('btn-online').addEventListener('click', () => {
    showScreen('online-screen');
  });
}

// ── Local setup ───────────────────────────────────────────────
function initLocalSetup() {
  let count = 2;
  renderNameInputs(count);

  // Rebind count buttons
  document.querySelectorAll('.count-btn').forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      count = parseInt(btn.dataset.count);
      renderNameInputs(count);
    });
  });

  const startBtn = document.getElementById('start-local-btn');
  const fresh = startBtn.cloneNode(true);
  startBtn.parentNode.replaceChild(fresh, startBtn);
  document.getElementById('start-local-btn').addEventListener('click', () => {
    const names = [...document.querySelectorAll('#player-names-section input')]
      .map(el => el.value.trim() || el.placeholder);
    startLocalGame(count, names);
  });

  document.getElementById('back-to-mode-from-setup').addEventListener('click', () => showScreen('mode-screen'));
}

function renderNameInputs(count) {
  const defaults = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4'];
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

// ── Online config screen ──────────────────────────────────────
function initOnlineScreen() {
  document.getElementById('ws-url').value = DEFAULT_WS_URL;

  document.getElementById('back-to-mode-from-online').addEventListener('click', () => showScreen('mode-screen'));

  document.getElementById('btn-create-room').addEventListener('click', async () => {
    const name = document.getElementById('online-name').value.trim() || 'Jogador';
    const url  = document.getElementById('ws-url').value.trim();
    setOnlineStatus('Conectando...', false);
    try { await connectWS(url); createRoom(name); }
    catch (e) { setOnlineStatus('❌ ' + e.message, true); }
  });

  document.getElementById('btn-join-room').addEventListener('click', async () => {
    const name = document.getElementById('online-name').value.trim() || 'Jogador';
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    const url  = document.getElementById('ws-url').value.trim();
    if (!code) { setOnlineStatus('❌ Digite o código da sala.', true); return; }
    setOnlineStatus('Conectando...', false);
    try { await connectWS(url); joinRoom(code, name); }
    catch (e) { setOnlineStatus('❌ ' + e.message, true); }
  });
}

function setOnlineStatus(msg, isError) {
  const el = document.getElementById('online-status');
  el.textContent = msg;
  el.className   = 'online-status' + (isError ? ' error' : '');
}

// ── Lobby ─────────────────────────────────────────────────────
let _lobbyCode    = '';
let _lobbyPlayers = [];

function showLobby(code, players) {
  _lobbyCode = code;
  _lobbyPlayers = players;
  showScreen('lobby-screen');
  document.getElementById('display-room-code').textContent = code;
  updateLobbyPlayers(players);

  document.getElementById('copy-code-btn').onclick = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    const btn = document.getElementById('copy-code-btn');
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 1800);
  };

  document.getElementById('back-to-mode-from-lobby').onclick = () => {
    cancelLobbyCountdown();
    if (socket) socket.close();
    socket = null; isOnline = false; myIdx = null;
    showScreen('mode-screen');
  };
}

function updateLobbyPlayers(players) {
  _lobbyPlayers = players;
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';

  players.forEach((p, i) => {
    const isMe   = p.sessionId === mySessionId;
    const isHost = myIdx === 0;

    const card = document.createElement('div');
    card.className = 'lobby-player-card' + (p.ready ? ' is-ready' : '');

    const leftHtml = `
      <div class="lp-avatar" style="background:${PLAYER_COLORS[i]}">${p.name[0].toUpperCase()}</div>
      <div class="lp-info">
        <span class="lp-name">${p.name}</span>
        ${i === 0 ? '<span class="lp-badge host">host</span>' : ''}
        ${p.ready  ? '<span class="lp-badge ready">✓ pronto</span>' : ''}
      </div>`;

    let rightHtml = '';
    if (isMe) {
      rightHtml = `<button class="btn-ready${p.ready ? ' active' : ''}" onclick="sendToServer({type:'player_ready'})">
        ${p.ready ? '✓ Pronto' : 'Pronto?'}
      </button>`;
    } else if (isHost && i !== 0) {
      rightHtml = `<button class="btn-kick" onclick="sendToServer({type:'kick_player',targetIdx:${i}})" title="Remover jogador">✕</button>`;
    }

    card.innerHTML = `<div class="lp-left">${leftHtml}</div><div class="lp-right">${rightHtml}</div>`;
    list.appendChild(card);
  });

  // Empty slots
  for (let i = players.length; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = 'lobby-player-card empty-slot';
    slot.innerHTML = `<div class="lp-avatar empty">${i + 1}</div><span class="lp-empty-text">Aguardando...</span>`;
    list.appendChild(slot);
  }

  const allReady = players.length >= 2 && players.every(p => p.ready);
  document.getElementById('lobby-hint').textContent = allReady
    ? '🚀 Todos prontos! Iniciando...'
    : players.length < 2
      ? 'Aguardando mais jogadores...'
      : 'Todos devem marcar "Pronto" para iniciar.';
}

// ── Lobby countdown ───────────────────────────────────────────
let _cdInterval = null;

function startLobbyCountdown(seconds) {
  cancelLobbyCountdown();
  const overlay = document.getElementById('lobby-countdown');
  const num     = document.getElementById('cd-number');
  overlay.classList.add('visible');
  let remaining = seconds;
  num.textContent = remaining;
  _cdInterval = setInterval(() => {
    remaining--;
    num.textContent = remaining;
    if (remaining <= 0) cancelLobbyCountdown();
  }, 1000);
}

function cancelLobbyCountdown() {
  if (_cdInterval) { clearInterval(_cdInterval); _cdInterval = null; }
  const overlay = document.getElementById('lobby-countdown');
  if (overlay) overlay.classList.remove('visible');
}

// ── Win screen ────────────────────────────────────────────────
function showWinScreen(text) {
  document.getElementById('winner-text').textContent = text;
  showScreen('win-screen');
}
