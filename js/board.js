'use strict';

function squareCenter(idx) {
  const logRow = Math.floor(idx / BD.cols);
  const logCol = idx % BD.cols;
  const dispRow = (BD.rows - 1) - logRow;
  const dispCol = (logRow % 2 === 0) ? logCol : (BD.cols - 1 - logCol);
  return {
    x: BD.padX + dispCol * BD.xStep,
    y: BD.padY + dispRow * BD.yStep,
  };
}

function squareClass(idx) {
  if (idx === 0)            return 'sq-start';
  if (idx === BOARD_SIZE-1) return 'sq-end';
  const sp = SPECIALS[idx];
  return sp ? `sq-${sp.type}` : 'sq-normal';
}

function snakePath() {
  const { padX: xL, w, padY, yStep, curveR: r } = BD;
  const xR = w - xL;
  const Y  = dr => padY + dr * yStep;
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
  p.setAttribute('d', d); p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', sw);
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  if (opacity != null && opacity < 1) p.setAttribute('opacity', opacity);
  svg.appendChild(p);
}

function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.width  = BD.w + 'px';
  board.style.height = BD.h + 'px';

  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', BD.w); svg.setAttribute('height', BD.h);
  Object.assign(svg.style, { position:'absolute', top:'0', left:'0', overflow:'visible', pointerEvents:'none' });

  const pd = snakePath();
  mkPath(svg, NS, pd, '#02040d', BD.strokeW + 22);
  mkPath(svg, NS, pd, '#05091a', BD.strokeW + 12);
  mkPath(svg, NS, pd, '#0d1b46', BD.strokeW);
  mkPath(svg, NS, pd, '#1a2f6e', BD.strokeW - 14);
  mkPath(svg, NS, pd, '#243d7a', BD.strokeW - 28, 0.35);

  // Teleport lines
  Object.entries(SPECIALS).forEach(([from, sp]) => {
    if (sp.type !== 'teleport') return;
    const a = squareCenter(+from), b = squareCenter(sp.value);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('stroke', '#e8891a'); line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-dasharray', '7 5'); line.setAttribute('opacity', '0.8');
    svg.appendChild(line);
    const dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx,dy);
    const ux = dx/len, uy = dy/len, sz = 8;
    const ax = b.x-ux*sz, ay = b.y-uy*sz;
    const px = -uy*sz*0.5, py = ux*sz*0.5;
    const arrow = document.createElementNS(NS, 'polygon');
    arrow.setAttribute('points', `${b.x},${b.y} ${ax+px},${ay+py} ${ax-px},${ay-py}`);
    arrow.setAttribute('fill', '#e8891a'); arrow.setAttribute('opacity', '0.8');
    svg.appendChild(arrow);
  });
  board.appendChild(svg);

  // Square divs (no token containers — tokens are board-level)
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { x, y } = squareCenter(i);
    const sp  = SPECIALS[i];
    const div = document.createElement('div');
    div.id = `sq-${i}`; div.className = `square ${squareClass(i)}`;
    div.style.left = (x - BD.sqSz/2) + 'px';
    div.style.top  = (y - BD.sqSz/2) + 'px';
    if (sp) div.title = sp.desc;
    let icon='', label='';
    if (i === 0)               { icon='🏁'; label='INÍCIO'; }
    else if (i===BOARD_SIZE-1) { icon='🏆'; label='FIM'; }
    else if (sp)               { icon=sp.icon; label=sp.label; }
    div.innerHTML = `
      <span class="sq-num">${i}</span>
      ${icon  ? `<span class="sq-icon">${icon}</span>`   : ''}
      ${label ? `<span class="sq-label">${label}</span>` : ''}`;
    board.appendChild(div);
  }
}

// Creates one persistent token element per player (enables CSS transition animation).
function initTokens() {
  document.querySelectorAll('.board-token').forEach(el => el.remove());
  const board = document.getElementById('board');
  state.players.forEach((p, i) => {
    const tok = document.createElement('div');
    tok.className = 'board-token';
    tok.id        = `btoken-${i}`;
    tok.textContent = p.name[0].toUpperCase();
    tok.title       = p.name;
    tok.style.background = p.color;
    board.appendChild(tok);
  });
}

// Spawn burst particles on a square
function spawnParticles(squareIdx, color) {
  const board = document.getElementById('board');
  const { x, y } = squareCenter(squareIdx);
  const count = 12;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (i / count) * Math.PI * 2;
    const dist  = 28 + Math.random() * 34;
    const tx    = Math.cos(angle) * dist;
    const ty    = Math.sin(angle) * dist;
    p.style.cssText = `left:${x}px;top:${y}px;background:${color};--tx:${tx}px;--ty:${ty}px`;
    board.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}

// Bounce-land animation on a token
function triggerTokenLand(pIdx) {
  const tok = document.getElementById(`btoken-${pIdx}`);
  if (!tok) return;
  tok.classList.remove('landing');
  void tok.offsetWidth;
  tok.classList.add('landing');
  tok.addEventListener('animationend', () => tok.classList.remove('landing'), { once: true });
}

// Pop-highlight a square on landing
function highlightSquare(idx) {
  const sq = document.getElementById(`sq-${idx}`);
  if (!sq) return;
  sq.classList.remove('sq-highlight');
  void sq.offsetWidth;
  sq.classList.add('sq-highlight');
  sq.addEventListener('animationend', () => sq.classList.remove('sq-highlight'), { once: true });
}

// Scale the board to fill its wrapper without scrollbar
function fitBoard() {
  const wrapper = document.getElementById('board-wrapper');
  const board   = document.getElementById('board');
  if (!wrapper || !board) return;
  const legend  = document.getElementById('legend');
  const legendH = legend ? legend.offsetHeight + 10 : 44;
  const aw = wrapper.clientWidth;
  const ah = wrapper.clientHeight - legendH;
  if (aw <= 0 || ah <= 0) return;
  const scale = Math.min(aw / BD.w, ah / BD.h);
  board.style.zoom = Math.max(0.3, scale).toFixed(4);
}

// Updates token positions (CSS transitions handle the animation).
function refreshTokens() {
  // Group players sharing a square for offset calculation
  const byPos = {};
  state.players.forEach((_, i) => {
    const pos = state.players[i].pos;
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push(i);
  });

  const size = 28;
  state.players.forEach((p, i) => {
    const tok = document.getElementById(`btoken-${i}`);
    if (!tok) return;
    const { x, y } = squareCenter(p.pos);
    const group     = byPos[p.pos];
    const localIdx  = group.indexOf(i);
    const count     = group.length;

    let ox = 0, oy = 0;
    if (count > 1) {
      const angle = (localIdx / count) * Math.PI * 2 - Math.PI / 2;
      const r     = count === 2 ? 12 : 16;
      ox = Math.cos(angle) * r;
      oy = Math.sin(angle) * r;
    }
    tok.style.left = (x + ox - size / 2) + 'px';
    tok.style.top  = (y + oy - size / 2) + 'px';
  });
}
