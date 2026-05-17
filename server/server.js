const WebSocket = require('ws');
const crypto    = require('crypto');

const PORT = process.env.PORT || 8080;
const wss  = new WebSocket.Server({ port: PORT });

// rooms: Map<code, { players: [{ws, name}] }>
const rooms = new Map();

function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function roomSnapshot(room) {
  return room.players.map((p, i) => ({ name: p.name, idx: i }));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  });
}

function broadcastExcept(room, senderWs, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws !== senderWs && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  });
}

wss.on('connection', ws => {
  ws.roomCode  = null;
  ws.playerIdx = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create_room': {
        let code;
        do { code = genCode(); } while (rooms.has(code));

        const room = { players: [{ ws, name: msg.name || 'Jogador 1' }] };
        rooms.set(code, room);
        ws.roomCode  = code;
        ws.playerIdx = 0;

        ws.send(JSON.stringify({
          type: 'room_created',
          code,
          playerIdx: 0,
          players: roomSnapshot(room),
        }));
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada.' }));
          return;
        }
        if (room.players.length >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala cheia (máx. 4 jogadores).' }));
          return;
        }
        const idx = room.players.length;
        room.players.push({ ws, name: msg.name || `Jogador ${idx + 1}` });
        ws.roomCode  = code;
        ws.playerIdx = idx;

        const players = roomSnapshot(room);
        // Confirm to new player
        ws.send(JSON.stringify({ type: 'room_joined', playerIdx: idx, players }));
        // Notify everyone (including new player) about updated list
        broadcast(room, { type: 'player_update', players });
        break;
      }

      case 'start_game': {
        const room = rooms.get(ws.roomCode);
        if (!room || ws.playerIdx !== 0) return;  // host only
        if (room.players.length < 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'São necessários pelo menos 2 jogadores.' }));
          return;
        }
        broadcast(room, { type: 'game_start', players: roomSnapshot(room) });
        break;
      }

      case 'game_action': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        // Relay the action to all OTHER players with sender index
        broadcastExcept(room, ws, { ...msg, fromIdx: ws.playerIdx });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    const leavingIdx = ws.playerIdx;
    room.players = room.players.filter(p => p.ws !== ws);

    if (room.players.length === 0) {
      rooms.delete(ws.roomCode);
      return;
    }

    // Re-assign indices after removal
    room.players.forEach((p, i) => { p.ws.playerIdx = i; });

    broadcast(room, {
      type: 'player_left',
      disconnectedIdx: leavingIdx,
      players: roomSnapshot(room),
    });
  });
});

console.log(`Trade Center server running on port ${PORT}`);
