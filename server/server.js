const WebSocket = require('ws');
const crypto    = require('crypto');

const PORT = process.env.PORT || 8080;
const wss  = new WebSocket.Server({ port: PORT });

function genCode() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }

class Room {
  constructor() {
    this.players = []; // { ws, name, sessionId, ready }
    this.timer   = null;
  }

  snapshot() {
    return this.players.map((p, i) => ({
      idx: i, name: p.name, sessionId: p.sessionId, ready: p.ready,
    }));
  }

  send(ws, msg) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

  broadcast(msg) {
    const d = JSON.stringify(msg);
    this.players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(d); });
  }

  broadcastExcept(senderWs, msg) {
    const d = JSON.stringify(msg);
    this.players.forEach(p => {
      if (p.ws !== senderWs && p.ws.readyState === WebSocket.OPEN) p.ws.send(d);
    });
  }

  checkReady() {
    const allReady = this.players.length >= 1 && this.players.every(p => p.ready);
    if (allReady) this.startCountdown();
    else          this.cancelCountdown();
  }

  startCountdown() {
    if (this.timer) return;
    this.broadcast({ type: 'countdown_start', seconds: 5 });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.broadcast({ type: 'game_start', players: this.snapshot() });
    }, 5000);
  }

  cancelCountdown(notify = true) {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    if (notify) this.broadcast({ type: 'countdown_cancel' });
  }

  remove(ws) {
    const idx = ws.playerIdx;
    this.players = this.players.filter(p => p.ws !== ws);
    this.players.forEach((p, i) => { p.ws.playerIdx = i; });
    this.players.forEach(p => { p.ready = false; }); // reset ready on any change
    this.cancelCountdown();
    return idx;
  }
}

const rooms = new Map();

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
        const room = new Room();
        room.players.push({ ws, name: msg.name || 'Jogador 1', sessionId: msg.sessionId, ready: false });
        rooms.set(code, room);
        ws.roomCode = code; ws.playerIdx = 0;
        room.send(ws, { type: 'room_created', code, playerIdx: 0, players: room.snapshot() });
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room)                  { room?.send(ws, { type: 'error', message: 'Sala não encontrada.' }); ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada.' })); return; }
        if (room.players.length >= 4){ ws.send(JSON.stringify({ type: 'error', message: 'Sala cheia (máx. 4).' })); return; }
        const idx = room.players.length;
        room.players.push({ ws, name: msg.name || `Jogador ${idx+1}`, sessionId: msg.sessionId, ready: false });
        ws.roomCode = code; ws.playerIdx = idx;
        room.send(ws, { type: 'room_joined', code, playerIdx: idx, players: room.snapshot() });
        room.broadcast({ type: 'player_update', players: room.snapshot() });
        break;
      }

      case 'player_ready': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        room.players[ws.playerIdx].ready = !room.players[ws.playerIdx].ready;
        room.broadcast({ type: 'player_update', players: room.snapshot() });
        room.checkReady();
        break;
      }

      case 'kick_player': {
        const room = rooms.get(ws.roomCode);
        if (!room || ws.playerIdx !== 0) return;
        const target = room.players[msg.targetIdx];
        if (!target || msg.targetIdx === 0) return;
        room.send(target.ws, { type: 'kicked' });
        target.ws.roomCode = null;
        room.remove(target.ws);
        room.broadcast({ type: 'player_update', players: room.snapshot() });
        break;
      }

      case 'game_action': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        room.broadcastExcept(ws, { ...msg, fromIdx: ws.playerIdx });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const leavingIdx = room.remove(ws);
    if (room.players.length === 0) { rooms.delete(ws.roomCode); return; }
    room.broadcast({ type: 'player_update', players: room.snapshot(), disconnectedIdx: leavingIdx });
  });
});

console.log(`Trade Center server on port ${PORT}`);
