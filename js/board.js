'use strict';

// Returns pixel center { x, y } for square index.
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

// SVG path for the snake body (cubic bezier at corners).
function snakePath() {
  const { padX: xL, w, padY, yStep, curveR: r } = BD;
  const xR = w - xL;
  const Y  = dr => padY + dr * yStep;  // dr 0=top, 3=bottom
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
}

function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.width  = BD.w + 'px';
  board.style.height = BD.h + 'px';

  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', BD.w);
  svg.setAttribute('height', BD.h);
  Object.assign(svg.style, {
    position: 'absolute', top: '0', left: '0',
    overflow: 'visible', pointerEvents: 'none',
  });

  const pd = snakePath();
  mkPath(svg, NS, pd, '#05091a', BD.strokeW + 14);       // drop shadow
  mkPath(svg, NS, pd, '#192b56', BD.strokeW);             // body
  mkPath(svg, NS, pd, '#243d7a', BD.strokeW - 20, 0.4);  // highlight

  // Teleport connector lines
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

    // Arrowhead at destination
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const ux = dx/len, uy = dy/len, sz = 8;
    const ax = b.x - ux*sz, ay = b.y - uy*sz;
    const px = -uy*sz*0.5, py = ux*sz*0.5;
    const arrow = document.createElementNS(NS, 'polygon');
    arrow.setAttribute('points', `${b.x},${b.y} ${ax+px},${ay+py} ${ax-px},${ay-py}`);
    arrow.setAttribute('fill', '#e8891a');
    arrow.setAttribute('opacity', '0.8');
    svg.appendChild(arrow);
  });

  board.appendChild(svg);

  // Square divs
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { x, y } = squareCenter(i);
    const sp  = SPECIALS[i];
    const div = document.createElement('div');
    div.id        = `sq-${i}`;
    div.className = `square ${squareClass(i)}`;
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
      ${label ? `<span class="sq-label">${label}</span>` : ''}
      <div class="tokens" id="tk-${i}"></div>`;
    board.appendChild(div);
  }
}

function refreshTokens() {
  document.querySelectorAll('.tokens').forEach(el => el.innerHTML = '');
  state.players.forEach((p, i) => {
    const cont = document.getElementById(`tk-${p.pos}`);
    if (!cont) return;
    const tok = document.createElement('div');
    tok.className = 'token';
    tok.style.background = p.color;
    tok.title = p.name;
    cont.appendChild(tok);
  });
}
