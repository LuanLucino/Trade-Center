'use strict';

// ── State ────────────────────────────────────────────────────
let state = { players:[], current:0, rolling:false, over:false };

// ── Entry point ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initModeScreen();
  initOnlineScreen();
  if (localStorage.getItem('tc_muted') === '1') {
    const btn = document.getElementById('mute-btn');
    if (btn) { btn.textContent = '🔇'; btn.classList.add('muted'); }
  }
  document.getElementById('roll-btn').addEventListener('click', onRoll);

  // Volume slider
  const volSlider = document.getElementById('volume-slider');
  const volPct    = document.getElementById('vol-pct');
  if (volSlider) {
    const sv = parseFloat(localStorage.getItem('tc_volume') || '1');
    volSlider.value = Math.round(sv * 100);
    if (volPct) volPct.textContent = Math.round(sv * 100) + '%';
    const updateSlider = () => {
      const pct = (volSlider.value / volSlider.max) * 100;
      volSlider.style.background = `linear-gradient(to right,#f0c040 0%,#f0c040 ${pct}%,#2e2a16 ${pct}%,#2e2a16 100%)`;
    };
    updateSlider();
    volSlider.addEventListener('input', () => {
      const v = parseInt(volSlider.value) / 100;
      if (volPct) volPct.textContent = volSlider.value + '%';
      setMasterVolume(v);
      updateSlider();
    });
  }
  document.getElementById('play-again-btn').addEventListener('click', () => {
    isOnline = false;
    myIdx    = null;
    if (socket) { socket.close(); socket = null; }
    showScreen('mode-screen');
  });
  window.addEventListener('resize', () => {
    if (document.getElementById('game-screen')?.classList.contains('active')) fitBoard();
  });
});

// ── Local game ───────────────────────────────────────────────
function startLocalGame(numPlayers, names, icons) {
  isOnline = false;
  myIdx    = null;
  initGame(names.slice(0, numPlayers), icons);
}

// ── Online game ───────────────────────────────────────────────
function startOnlineGame(serverPlayers) {
  isOnline = true;
  initGame(serverPlayers.map(p => p.name), serverPlayers.map(p => p.icon));
  log(`Você é ${state.players[myIdx].name}. Boa sorte!`, 'system');
}

// ── Common initializer ────────────────────────────────────────
function initGame(names, icons = []) {
  state = {
    players: names.map((name, i) => ({
      name, color: PLAYER_COLORS[i],
      icon: icons[i] || VIKING_ICONS[i % VIKING_ICONS.length],
      pos: 0, skipTurns: 0, pendingSteps: 0, finished: false,
    })),
    current: 0, rolling: false, over: false,
  };
  showScreen('game-screen');
  initLog();
  buildBoard();
  requestAnimationFrame(fitBoard);
  initTokens();
  refreshTokens();
  buildPlayersPanel();
  setDiceFace(6);
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

  if (p.skipTurns > 0) {
    p.skipTurns--;
    if (isOnline) sendToServer({ type: 'game_action', action: 'skip' });
    openRollOverlay(p.name, p.color, p.icon);
    await delay(300);
    if (p.skipTurns === 0 && p.pendingSteps > 0) {
      const steps = p.pendingSteps;
      p.pendingSteps = 0;
      p.pos = Math.min(p.pos + steps, BOARD_SIZE - 1);
      refreshTokens(); refreshPlayersPanel();
      setOverlayEvent(`↩️ 3ª passagem! Avança ${steps} casa!`, 'vaievolta');
      log(`↩️ ${p.name}: 3ª passagem, avança ${steps}!`, 'vaievolta', state.current);
      playSound('bonus');
      triggerTokenLand(state.current);
      highlightSquare(p.pos);
    } else if (p.pendingSteps > 0) {
      setOverlayEvent(`↩️ Vai e Volta — 2ª passagem...`, 'vaievolta');
      log(`↩️ ${p.name}: 2ª passagem`, 'vaievolta', state.current);
      playSound('skip');
    } else {
      const rem = p.skipTurns;
      const msg = rem > 0
        ? `🏰 ${p.name} está preso! ${rem} rodada${rem !== 1 ? 's' : ''} restante${rem !== 1 ? 's' : ''}.`
        : `⏸ ${p.name} perdeu a vez!`;
      setOverlayEvent(msg, 'skip');
      log(msg, 'skip', state.current);
      playSound('skip');
    }
    showOverlayContinue();
    await waitForRollContinue();
    state.rolling = false;
    nextTurn();
    return;
  }

  const val = rollDice();
  if (isOnline) sendToServer({ type: 'game_action', action: 'roll', value: val });
  playSound('roll');
  await processTurn(val);
}

// processTurn is shared between local and remote-action paths.
async function processTurn(val) {
  const p = state.players[state.current];
  openRollOverlay(p.name, p.color, p.icon);

  await animateDice(val);

  showOverlayRollValue(val);
  log(`${p.name} tirou ${DICE_FACES[val-1]} (${val})`, 'move', state.current);

  const again = await applyMove(state.current, val);
  state.rolling = false;

  if (!state.over) {
    const isMyTurn = !isOnline || myIdx === state.current;
    showOverlayContinue();
    await waitForRollContinue(!isMyTurn);
    if (again) updateUI(true);
    else       nextTurn();
  }
}

async function applyMove(pIdx, steps) {
  const p = state.players[pIdx];
  p.pos = Math.min(p.pos + steps, BOARD_SIZE - 1);
  refreshTokens();
  refreshPlayersPanel();
  await delay(400);
  triggerTokenLand(pIdx);
  highlightSquare(p.pos);

  if (p.pos === BOARD_SIZE - 1) {
    p.finished = true;
    spawnParticles(p.pos, '#f0c040');
    setOverlayEvent(`🏆 ${p.name} chegou ao FIM!`, 'finish');
    log(`🏆 ${p.name} chegou ao FIM!`, 'finish', pIdx);
    refreshTokens();
    refreshPlayersPanel();
    checkWin(pIdx);
    return false;
  }

  const sp = SPECIALS[p.pos];
  if (sp) return applySpecial(pIdx, sp, p.pos);
  return false;
}

const SPECIAL_COLORS = {
  bonus: '#27ae60', penalty: '#e74c3c', teleport: '#8e44ad',
  skip: '#d68910', rollagain: '#3498db',
  amusement: '#cc2200',
  waterpark: '#0077cc', tunnelvision: '#222266', escalada: '#3d6b20',
  covil: '#8b2a00', cordabamba: '#8b5e00', castle: '#660099',
  vaievolta: '#1a3d99', luckbox: '#993300',
};

async function applySpecial(pIdx, sp, landedOn) {
  const p = state.players[pIdx];
  await delay(200);

  if (SQUARE_SOUNDS[landedOn]) {
    playSquareSound(SQUARE_SOUNDS[landedOn]);
  } else {
    playSound(sp.type);
  }
  spawnParticles(landedOn, SPECIAL_COLORS[sp.type] || '#f0c040');

  switch (sp.type) {
    case 'bonus': {
      setOverlayEvent(`✅ ${sp.desc}`, 'bonus');
      log(`✅ ${p.name}: ${sp.desc}`, 'bonus', pIdx);
      const dest = Math.min(landedOn + sp.value, BOARD_SIZE - 1);
      p.pos = dest;
      refreshTokens();
      refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx);
      highlightSquare(dest);
      if (dest === BOARD_SIZE - 1) {
        p.finished = true;
        spawnParticles(dest, '#f0c040');
        setOverlayEvent(`🏆 ${p.name} chegou ao FIM!`, 'finish');
        log(`🏆 ${p.name} chegou ao FIM!`, 'finish', pIdx);
        checkWin(pIdx);
      }
      return false;
    }
    case 'penalty': {
      setOverlayEvent(`❌ ${sp.desc}`, 'penalty');
      log(`❌ ${p.name}: ${sp.desc}`, 'penalty', pIdx);
      p.pos = Math.max(0, landedOn + sp.value);
      refreshTokens();
      refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx);
      highlightSquare(p.pos);
      return false;
    }
    case 'teleport': {
      setOverlayEvent(`✈️ ${sp.desc}`, 'teleport');
      log(`✈️ ${p.name}: ${sp.desc}`, 'teleport', pIdx);
      p.pos = sp.value;
      refreshTokens();
      refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx);
      highlightSquare(p.pos);
      return false;
    }
    case 'skip': {
      setOverlayEvent(`⛔ ${sp.desc}`, 'skip');
      log(`⛔ ${p.name}: ${sp.desc}`, 'skip', pIdx);
      p.skipNext = true;
      refreshPlayersPanel();
      return false;
    }
    case 'rollagain': {
      setOverlayEvent(`🎲 ${sp.desc}`, 'rollagain');
      log(`🎲 ${p.name}: ${sp.desc}`, 'rollagain', pIdx);
      return true;
    }
    case 'amusement': {
      setOverlayEvent(`🎢 ${sp.desc}`, 'amusement');
      log(`🎢 ${p.name}: ${sp.desc}`, 'amusement', pIdx);
      p.pos = sp.value;
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'waterpark': {
      setOverlayEvent(`🌊 ${sp.desc}`, 'waterpark');
      log(`🌊 ${p.name}: ${sp.desc}`, 'waterpark', pIdx);
      p.pos = sp.value;
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'tunnelvision': {
      setOverlayEvent(`🌑 Visão no Fim do Túnel! Tela ficando escura...`, 'tunnelvision');
      log(`🌑 ${p.name}: entrou no túnel!`, 'tunnelvision', pIdx);
      setOverlayDarkMode(true);
      await delay(700);
      const isMe = !isOnline || myIdx === pIdx;
      const tvDelta = isMe ? await (async () => {
        const ch = await showOverlayChoices('⬆️ Avançar 1', '⬇️ Recuar 1');
        if (isOnline) sendToServer({ type: 'game_action', action: 'choice', value: ch === 'a' ? 1 : -1 });
        return ch === 'a' ? 1 : -1;
      })() : (Math.random() < 0.5 ? 1 : -1);
      setOverlayDarkMode(false);
      p.pos = Math.max(0, Math.min(BOARD_SIZE - 1, p.pos + tvDelta));
      setOverlayEvent(`${tvDelta > 0 ? '⬆️ Avançou' : '⬇️ Recuou'} 1 casa!`, tvDelta > 0 ? 'bonus' : 'penalty');
      log(`${tvDelta > 0 ? '⬆️' : '⬇️'} ${p.name}: escolheu ${tvDelta > 0 ? 'avançar' : 'recuar'} 1.`, tvDelta > 0 ? 'bonus' : 'penalty', pIdx);
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'escalada': {
      setOverlayEvent(`🧗 A Escalada! Role o dado para fugir do ogro...`, 'escalada');
      log(`🧗 ${p.name}: tentou a escalada!`, 'escalada', pIdx);
      await delay(500);
      showOverlayRollValue('');
      const climbVal = rollDice();
      playSound('roll');
      await animateDice(climbVal);
      showOverlayRollValue(climbVal);
      await delay(400);
      if (climbVal >= 4) {
        p.pos = Math.min(p.pos + 3, BOARD_SIZE - 1);
        setOverlayEvent(`🎉 Parkour completo! Avança 3 casas!`, 'bonus');
        log(`🎉 ${p.name}: escapou do ogro! +3.`, 'bonus', pIdx);
        spawnParticles(p.pos, SPECIAL_COLORS.bonus);
      } else {
        p.pos = sp.value;
        setOverlayEvent(`💀 Escorregou! Caiu no Covil do Ogro (casa ${sp.value})!`, 'penalty');
        log(`💀 ${p.name}: caiu no covil!`, 'penalty', pIdx);
        spawnParticles(p.pos, SPECIAL_COLORS.covil);
      }
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'covil': {
      setOverlayEvent(`👹 ${sp.desc}`, 'covil');
      log(`👹 ${p.name}: ${sp.desc}`, 'covil', pIdx);
      p.pos = Math.max(0, p.pos + sp.value);
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'cordabamba': {
      setOverlayEvent(`🎪 Corda Bamba! Escolha como atravessar.`, 'cordabamba');
      log(`🎪 ${p.name}: chegou na Corda Bamba!`, 'cordabamba', pIdx);
      await delay(400);
      const isCordaMe = !isOnline || myIdx === pIdx;
      const ropeChoice = isCordaMe
        ? await showOverlayChoices('🎲 Jogar Dado (1-3 cai -6, 4-6 avança)', '🎪 Arriscar na Corda (50/50)')
        : (Math.random() < 0.5 ? 'a' : 'b');
      if (isCordaMe && isOnline) sendToServer({ type: 'game_action', action: 'choice', value: ropeChoice });
      if (ropeChoice === 'a') {
        showOverlayRollValue('');
        const ropeRoll = rollDice();
        playSound('roll');
        await animateDice(ropeRoll);
        showOverlayRollValue(ropeRoll);
        await delay(400);
        if (ropeRoll <= 3) {
          p.pos = Math.max(0, p.pos - 6);
          setOverlayEvent(`😱 Caiu da corda! Volta 6 casas!`, 'penalty');
          log(`😱 ${p.name}: caiu da corda! -6.`, 'penalty', pIdx);
        } else {
          p.pos = Math.min(p.pos + ropeRoll, BOARD_SIZE - 1);
          setOverlayEvent(`🎉 Atravessou! Avança ${ropeRoll} casas!`, 'bonus');
          log(`🎉 ${p.name}: atravessou a corda! +${ropeRoll}.`, 'bonus', pIdx);
        }
      } else {
        setOverlayEvent(`🎪 Andando na corda bamba...`, 'cordabamba');
        await delay(900);
        if (Math.random() < 0.5) {
          p.pos = Math.min(p.pos + 3, BOARD_SIZE - 1);
          setOverlayEvent(`🏅 Equilibrista incrível! Avança 3!`, 'bonus');
          log(`🏅 ${p.name}: cruzou a corda! +3.`, 'bonus', pIdx);
        } else {
          p.pos = Math.max(0, 19);
          setOverlayEvent(`😱 Caiu! Vai para a casa 19 (antes do Covil)!`, 'penalty');
          log(`😱 ${p.name}: caiu da corda! Casa 19.`, 'penalty', pIdx);
        }
      }
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'castle': {
      setOverlayEvent(`🏰 ${sp.desc}`, 'castle');
      log(`🏰 ${p.name}: ${sp.desc}`, 'castle', pIdx);
      p.skipTurns = sp.value;
      refreshPlayersPanel();
      return false;
    }
    case 'vaievolta': {
      setOverlayEvent(`↩️ Vai e Volta! Recuando 1 — 3 passagens!`, 'vaievolta');
      log(`↩️ ${p.name}: Vai e Volta ativado!`, 'vaievolta', pIdx);
      p.pos = Math.max(0, p.pos - 1);
      p.skipTurns    = 2;
      p.pendingSteps = 1;
      refreshTokens(); refreshPlayersPanel();
      await delay(350);
      triggerTokenLand(pIdx); highlightSquare(p.pos);
      return false;
    }
    case 'luckbox': {
      setOverlayEvent(`🎴 Luck Box! Escolha uma carta...`, 'luckbox');
      log(`🎴 ${p.name}: abriu a Luck Box!`, 'luckbox', pIdx);
      await delay(400);
      const lbCards = buildLuckBoxCards();
      const isLbMe = !isOnline || myIdx === pIdx;
      const lbCard = isLbMe ? await showOverlayCards(lbCards) : lbCards[Math.floor(Math.random() * lbCards.length)];
      if (isLbMe && isOnline) sendToServer({ type: 'game_action', action: 'choice', value: lbCards.indexOf(lbCard) });
      setOverlayEvent(`${lbCard.icon} ${lbCard.desc}`, lbCard.good ? 'bonus' : 'penalty');
      log(`${lbCard.icon} ${p.name}: ${lbCard.desc}`, lbCard.good ? 'bonus' : 'penalty', pIdx);
      return await applyLuckBoxCard(pIdx, lbCard);
    }
  }
  return false;
}

function buildLuckBoxCards() {
  return [
    { icon: '⬆️', desc: 'Avança 5 casas!',     good: true,  action: 'advance',   value: 5  },
    { icon: '🎲', desc: 'Role de novo!',         good: true,  action: 'rollagain'             },
    { icon: '✨', desc: 'Teleporte: casa 42!',   good: true,  action: 'teleport',  value: 42 },
    { icon: '⬇️', desc: 'Volta 5 casas!',       good: false, action: 'back',      value: -5 },
    { icon: '⛔', desc: 'Perde a vez!',          good: false, action: 'skip'                  },
    { icon: '👹', desc: 'Vai para o Covil!',     good: false, action: 'teleport',  value: 20 },
  ].sort(() => Math.random() - 0.5);
}

async function applyLuckBoxCard(pIdx, card) {
  const p = state.players[pIdx];
  switch (card.action) {
    case 'advance':  p.pos = Math.min(p.pos + card.value, BOARD_SIZE - 1); break;
    case 'back':     p.pos = Math.max(0, p.pos + card.value);              break;
    case 'teleport': p.pos = card.value;                                    break;
    case 'skip':     p.skipTurns = 1;                                       break;
    case 'rollagain': return true;
  }
  refreshTokens(); refreshPlayersPanel();
  await delay(350);
  triggerTokenLand(pIdx); highlightSquare(p.pos);
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

function checkWin(pIdx) {
  if (state.over) return;
  state.over = true;
  const winner = state.players[pIdx];
  playSound('win');
  setTimeout(() => {
    closeRollOverlay();
    showWinScreen(`${winner.name} chegou ao FIM primeiro e venceu! 🏆`);
  }, 1600);
}
