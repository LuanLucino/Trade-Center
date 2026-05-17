'use strict';

// ── Screen navigation ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Log (one entry per player, no scrollbar) ─────────────────
let _playerLastEvents = [];
let _sysMsg = '';

function initLog() {
  _playerLastEvents = [];
  _sysMsg = '';
  const el = document.getElementById('game-log');
  if (el) el.innerHTML = '';
}

function log(msg, type = 'system', pIdx = null) {
  if (pIdx !== null && pIdx >= 0) {
    _playerLastEvents[pIdx] = { msg, type };
  } else {
    _sysMsg = msg;
  }
  _renderLog();
}

function _renderLog() {
  const el = document.getElementById('game-log');
  if (!el) return;
  el.innerHTML = '';
  if (_sysMsg) {
    const d = document.createElement('div');
    d.className = 'log-entry system';
    d.textContent = _sysMsg;
    el.appendChild(d);
  }
  _playerLastEvents.forEach((ev, i) => {
    if (!ev) return;
    const d = document.createElement('div');
    d.className = `log-entry ${ev.type}`;
    const p = typeof state !== 'undefined' && state.players && state.players[i];
    if (p) {
      const dot = document.createElement('span');
      dot.className = 'log-player-dot';
      dot.style.background = p.color;
      d.appendChild(dot);
    }
    d.appendChild(document.createTextNode(ev.msg));
    el.appendChild(d);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Dice dots ────────────────────────────────────────────────
// 3×3 grid positions: top-left … bottom-right
const DOT_PATTERNS = {
  1: [0,0,0, 0,1,0, 0,0,0],
  2: [1,0,0, 0,0,0, 0,0,1],
  3: [1,0,0, 0,1,0, 0,0,1],
  4: [1,0,1, 0,0,0, 1,0,1],
  5: [1,0,1, 0,1,0, 1,0,1],
  6: [1,0,1, 1,0,1, 1,0,1],
};

function setDiceFace(val, sel = '#dice') {
  const cells = document.querySelectorAll(sel + ' .dice-dot-grid span');
  const pat   = DOT_PATTERNS[val] || DOT_PATTERNS[1];
  cells.forEach((c, i) => c.classList.toggle('dot', !!pat[i]));
}

// ── Dice animation (runs inside roll overlay) ────────────────
function animateDice(final) {
  return new Promise(resolve => {
    const box = document.getElementById('roc-dice');
    let ticks = 0;
    const id = setInterval(() => {
      setDiceFace(Math.floor(Math.random() * 6) + 1, '#roc-dice');
      if (++ticks >= 12) clearInterval(id);
    }, 58);

    box.classList.add('rolling');
    box.addEventListener('animationend', () => {
      box.classList.remove('rolling');
      setDiceFace(final, '#roc-dice');
      setDiceFace(final, '#dice');
      resolve();
    }, { once: true });
  });
}

// ── Roll overlay ─────────────────────────────────────────────
function openRollOverlay(playerName, playerColor, playerIcon) {
  const av = document.getElementById('roc-avatar');
  av.textContent       = playerIcon || playerName[0].toUpperCase();
  av.style.background  = playerColor;
  document.getElementById('roc-player-name').textContent = playerName;
  document.getElementById('roc-value').textContent       = '';
  document.getElementById('roc-event-box').style.display = 'none';
  document.getElementById('roc-continue').style.display  = 'none';
  setDiceFace(Math.ceil(Math.random() * 6), '#roc-dice');
  document.getElementById('roll-overlay').classList.add('visible');
}

function showOverlayRollValue(val) {
  document.getElementById('roc-value').textContent = val;
}

function setOverlayEvent(text, type) {
  const box  = document.getElementById('roc-event-box');
  const span = document.getElementById('roc-event-text');
  if (!box || !span) return;
  span.textContent = text;
  box.className    = 'roc-event-box' + (type ? ' ' + type : '');
  box.style.display = '';
}

function showOverlayContinue() {
  document.getElementById('roc-continue').style.display = '';
}

function closeRollOverlay() {
  document.getElementById('roll-overlay').classList.remove('visible');
}

function setOverlayDarkMode(on) {
  document.getElementById('roll-overlay').classList.toggle('dark-mode', on);
}

function showOverlayChoices(labelA, labelB) {
  return new Promise(resolve => {
    const div  = document.getElementById('roc-choices');
    const btnA = document.getElementById('roc-choice-a');
    const btnB = document.getElementById('roc-choice-b');
    btnA.textContent = labelA;
    btnB.textContent = labelB;
    const pick = key => { div.style.display = 'none'; btnA.onclick = null; btnB.onclick = null; resolve(key); };
    btnA.onclick = () => pick('a');
    btnB.onclick = () => pick('b');
    div.style.display = '';
  });
}

function showOverlayCards(cards) {
  return new Promise(resolve => {
    const container = document.getElementById('roc-cards');
    container.innerHTML = '';
    container.style.display = '';
    cards.forEach(card => {
      const btn = document.createElement('button');
      btn.className = 'roc-card-btn';
      btn.textContent = '?';
      btn.addEventListener('click', () => {
        container.querySelectorAll('.roc-card-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.35'; });
        btn.style.opacity = '1';
        btn.textContent = card.icon;
        btn.classList.add('revealed', card.good ? 'card-good' : 'card-bad');
        setTimeout(() => { container.style.display = 'none'; resolve(card); }, 900);
      }, { once: true });
      container.appendChild(btn);
    });
  });
}

function waitForRollContinue(autoClose = false) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closeRollOverlay();
      resolve();
    };
    document.getElementById('roc-continue').onclick = finish;
    if (autoClose) setTimeout(finish, 2800);
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
      <div class="p-avatar" style="background:${p.color}">${p.icon || p.name[0].toUpperCase()}</div>
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
      (p.skipTurns > 0                     ? ' skip-player'     : '');
    document.getElementById(`pp-${i}`).textContent = `Casa ${p.pos} / ${BOARD_SIZE - 1}`;
    const st = document.getElementById(`ps-${i}`);
    if      (p.finished)                              st.textContent = '✅ Chegou!';
    else if (p.skipTurns > 0)                         st.textContent = p.skipTurns > 1 ? `🏰 Preso (${p.skipTurns})` : '⏸ Vai pular vez';
    else if (i === state.current && !state.over)      st.textContent = '← Jogando...';
    else                                              st.textContent = '';
  });
}

// ── Turn toast ───────────────────────────────────────────────
let _toastTimer = null;

function showTurnToast(playerName, playerColor) {
  const toast = document.getElementById('turn-toast');
  if (!toast) return;
  toast.textContent   = `🎲 Vez de ${playerName}!`;
  toast.style.background  = playerColor;
  toast.style.boxShadow   = `0 6px 24px ${playerColor}88`;
  toast.classList.remove('show');
  clearTimeout(_toastTimer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.classList.add('show');
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }));
}

// ── Roll button / turn label ─────────────────────────────────
function updateUI(rollAgain = false) {
  refreshPlayersPanel();
  if (state.over) return;
  const p        = state.players[state.current];
  const btn      = document.getElementById('roll-btn');
  const isMyTurn = !isOnline || myIdx === state.current;
  btn.disabled   = !isMyTurn;
  btn.textContent = isMyTurn
    ? (rollAgain ? '🎲 Rolar de Novo!' : '🎲 Rolar Dado')
    : `⏳ Vez de ${p.name}...`;

  document.getElementById('dice-area').classList.toggle('my-turn', isMyTurn);

  if (isMyTurn && !rollAgain) showTurnToast(p.name, p.color);
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
    const groups = [...document.querySelectorAll('#player-names-section .player-input-group')];
    const names  = groups.map((g, i) => { const inp = g.querySelector('input'); return inp.value.trim() || inp.placeholder; });
    const icons  = groups.map(g => {
      const btns = [...g.querySelectorAll('.icon-pick-btn')];
      const idx  = btns.findIndex(b => b.classList.contains('selected'));
      return VIKING_ICONS[idx >= 0 ? idx : 0];
    });
    startLocalGame(count, names, icons);
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
    const iconsHtml = VIKING_ICONS.map((ic, j) =>
      `<button type="button" class="icon-pick-btn${j === i % VIKING_ICONS.length ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`
    ).join('');
    g.innerHTML = `
      <div class="player-color-dot" style="background:${PLAYER_COLORS[i]}"></div>
      <div class="player-input-col">
        <input type="text" placeholder="${defaults[i]}" maxlength="20">
        <div class="icon-picker">${iconsHtml}</div>
      </div>`;
    g.querySelectorAll('.icon-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        g.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    section.appendChild(g);
  }
}

// ── Online config screen ──────────────────────────────────────
function initOnlineScreen() {
  document.getElementById('ws-url').value = DEFAULT_WS_URL;

  const onlinePicker = document.getElementById('online-icon-picker');
  if (onlinePicker) {
    onlinePicker.innerHTML = VIKING_ICONS.map((ic, i) =>
      `<button type="button" class="icon-pick-btn${i === 0 ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`
    ).join('');
    onlinePicker.querySelectorAll('.icon-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onlinePicker.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  document.getElementById('back-to-mode-from-online').addEventListener('click', () => showScreen('mode-screen'));

  document.getElementById('btn-create-room').addEventListener('click', async () => {
    const name = document.getElementById('online-name').value.trim() || 'Jogador';
    const url  = document.getElementById('ws-url').value.trim();
    const icon = document.querySelector('#online-icon-picker .icon-pick-btn.selected')?.dataset.icon || VIKING_ICONS[0];
    setOnlineStatus('Conectando...', false);
    try { await connectWS(url); createRoom(name, icon); }
    catch (e) { setOnlineStatus('❌ ' + e.message, true); }
  });

  document.getElementById('btn-join-room').addEventListener('click', async () => {
    const name = document.getElementById('online-name').value.trim() || 'Jogador';
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    const url  = document.getElementById('ws-url').value.trim();
    const icon = document.querySelector('#online-icon-picker .icon-pick-btn.selected')?.dataset.icon || VIKING_ICONS[0];
    if (!code) { setOnlineStatus('❌ Digite o código da sala.', true); return; }
    setOnlineStatus('Conectando...', false);
    try { await connectWS(url); joinRoom(code, name, icon); }
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

  const readyBtn = document.getElementById('lobby-ready-btn');
  readyBtn.style.display = '';
  readyBtn.onclick = () => {
    sendToServer({ type: 'player_ready' });
    // Feedback visual imediato (servidor confirma/corrige via player_update)
    const nowReady = !readyBtn.classList.contains('active');
    readyBtn.textContent = nowReady ? '✓ Pronto!' : 'Marcar como Pronto';
    readyBtn.classList.toggle('active', nowReady);
  };

  // Event delegation para botões de kick
  document.getElementById('lobby-player-list').onclick = e => {
    const btn = e.target.closest('.btn-kick');
    if (btn) sendToServer({ type: 'kick_player', targetIdx: +btn.dataset.idx });
  };

  // Botão cancelar pronto dentro do overlay de contagem regressiva
  const cancelReadyBtn = document.getElementById('btn-cancel-ready');
  if (cancelReadyBtn) cancelReadyBtn.onclick = () => sendToServer({ type: 'player_ready' });

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
      <div class="lp-avatar" style="background:${PLAYER_COLORS[i]}">${p.icon || p.name[0].toUpperCase()}</div>
      <div class="lp-info">
        <span class="lp-name">${p.name}</span>
        ${i === 0 ? '<span class="lp-badge host">host</span>' : ''}
        ${isMe    ? '<span class="lp-badge you">você</span>'  : ''}
        ${p.ready ? '<span class="lp-badge ready">✓ pronto</span>' : ''}
      </div>`;

    let rightHtml = '';
    if (isHost && !isMe && i !== 0) {
      rightHtml = `<button class="btn-kick" data-idx="${i}" title="Remover jogador">✕</button>`;
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

  // Update standalone ready button
  const me = players.find(p => p.sessionId === mySessionId);
  const readyBtn = document.getElementById('lobby-ready-btn');
  if (readyBtn && me) {
    readyBtn.textContent = me.ready ? '✓ Pronto!' : 'Marcar como Pronto';
    readyBtn.className = 'btn-ready-main' + (me.ready ? ' active' : '');
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
  playSound('countdown');
  _cdInterval = setInterval(() => {
    remaining--;
    num.textContent = remaining;
    if (remaining > 0) playSound('countdown');
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
