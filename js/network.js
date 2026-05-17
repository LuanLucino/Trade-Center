'use strict';

let socket   = null;
let myIdx    = null;
let isOnline = false;

// Opens a WebSocket connection. Returns a Promise.
function connectWS(serverUrl) {
  return new Promise((resolve, reject) => {
    try { socket = new WebSocket(serverUrl); }
    catch (e) { reject(new Error('URL inválida.')); return; }

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Tempo esgotado ao conectar.'));
    }, 8000);

    socket.onopen = () => { clearTimeout(timeout); resolve(); };
    socket.onerror = () => { clearTimeout(timeout); reject(new Error('Servidor inacessível.')); };
    socket.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handleServerMessage(msg);
    };
    socket.onclose = () => {
      if (isOnline && !state.over) {
        log('⚠️ Conexão com o servidor encerrada.', 'system');
      }
    };
  });
}

function sendToServer(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function createRoom(name) {
  sendToServer({ type: 'create_room', name });
}

function joinRoom(code, name) {
  sendToServer({ type: 'join_room', code, name });
}

// ── Incoming messages from server ────────────────────────────
function handleServerMessage(msg) {
  switch (msg.type) {

    case 'room_created':
      myIdx = msg.playerIdx;
      showLobby(msg.code, msg.players, true);
      break;

    case 'room_joined':
      myIdx = msg.playerIdx;
      updateLobbyPlayers(msg.players);
      break;

    case 'player_update':
      updateLobbyPlayers(msg.players);
      break;

    case 'game_start':
      startOnlineGame(msg.players);
      break;

    case 'game_action':
      // Only apply if action came from another player
      if (msg.fromIdx !== myIdx) applyRemoteAction(msg);
      break;

    case 'player_left':
      log(`⚠️ Um jogador desconectou.`, 'system');
      if (document.getElementById('lobby-screen').classList.contains('active')) {
        updateLobbyPlayers(msg.players);
      }
      break;

    case 'error':
      setOnlineStatus('❌ ' + msg.message, true);
      break;
  }
}

// Called when another player sends a game action.
async function applyRemoteAction(msg) {
  if (state.over || state.rolling) return;
  state.rolling = true;

  const p = state.players[state.current];

  if (msg.action === 'skip') {
    p.skipNext = false;
    log(`⏸ ${p.name} perdeu a vez!`, 'skip');
    await delay(700);
    state.rolling = false;
    nextTurn();
    return;
  }

  if (msg.action === 'roll') {
    await processTurn(msg.value);
  }
}
