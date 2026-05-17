'use strict';

let socket   = null;
let myIdx    = null;
let isOnline = false;
let myIcon   = '⚔️';
const mySessionId = Math.random().toString(36).substr(2, 9);

function connectWS(serverUrl) {
  return new Promise((resolve, reject) => {
    try { socket = new WebSocket(serverUrl); }
    catch { reject(new Error('URL inválida.')); return; }

    const timeout = setTimeout(() => { socket.close(); reject(new Error('Tempo esgotado.')); }, 8000);
    socket.onopen    = () => { clearTimeout(timeout); resolve(); };
    socket.onerror   = () => { clearTimeout(timeout); reject(new Error('Servidor inacessível.')); };
    socket.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } handleServerMessage(m); };
    socket.onclose   = () => { if (isOnline && !state.over) log('⚠️ Conexão encerrada.', 'system'); };
  });
}

function sendToServer(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}

function createRoom(name, icon) { myIcon = icon || '⚔️'; sendToServer({ type: 'create_room', name, icon: myIcon, sessionId: mySessionId }); }
function joinRoom(code, name, icon) { myIcon = icon || '⚔️'; sendToServer({ type: 'join_room', code, name, icon: myIcon, sessionId: mySessionId }); }

// ── Incoming ─────────────────────────────────────────────────
function handleServerMessage(msg) {
  switch (msg.type) {

    case 'room_created':
      myIdx = msg.playerIdx;
      showLobby(msg.code, msg.players);
      break;

    case 'room_joined':
      myIdx = msg.playerIdx;
      showLobby(msg.code, msg.players);
      break;

    case 'player_update': {
      // Re-sync myIdx in case of kick/leave reshuffling
      const me = msg.players.find(p => p.sessionId === mySessionId);
      if (me) myIdx = me.idx;
      updateLobbyPlayers(msg.players);
      break;
    }

    case 'game_start':
      cancelLobbyCountdown();
      startOnlineGame(msg.players);
      break;

    case 'countdown_start':
      startLobbyCountdown(msg.seconds);
      break;

    case 'countdown_cancel':
      cancelLobbyCountdown();
      break;

    case 'game_action':
      if (msg.fromIdx !== myIdx) applyRemoteAction(msg);
      break;

    case 'kicked':
      cancelLobbyCountdown();
      if (socket) socket.close();
      alert('Você foi removido da sala pelo host.');
      showScreen('mode-screen');
      break;

    case 'player_left':
      if (document.getElementById('lobby-screen').classList.contains('active')) {
        updateLobbyPlayers(msg.players);
      } else {
        log('⚠️ Um jogador desconectou.', 'system');
      }
      break;

    case 'error':
      setOnlineStatus('❌ ' + msg.message, true);
      break;
  }
}

// ── Remote game action ────────────────────────────────────────
async function applyRemoteAction(msg) {
  if (state.over || state.rolling) return;
  state.rolling = true;

  const p = state.players[state.current];
  if (msg.action === 'skip') {
    p.skipTurns = 0;
    openRollOverlay(p.name, p.color, p.icon);
    await delay(300);
    setOverlayEvent(`⏸ ${p.name} perdeu a vez!`, 'skip');
    log(`⏸ ${p.name} perdeu a vez!`, 'skip', state.current);
    playSound('skip');
    showOverlayContinue();
    await waitForRollContinue(true);
    state.rolling = false;
    nextTurn();
    return;
  }
  if (msg.action === 'roll') await processTurn(msg.value);
}
