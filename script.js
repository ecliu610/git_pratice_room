const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const boardCanvas = document.getElementById("board");
const boardCtx = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");
const effectEl = document.getElementById("effectText");

const championEl = document.getElementById("champion");
const startBtn = document.getElementById("startBtn");

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

const PIECES = Object.keys(SHAPES);

const CHAMPIONS = {
  garen: {
    name: "Garen",
    effect: "Demacian Resolve: Every 8th line grants +50 bonus score.",
    speedMul: 1,
    bonus: (state) => {
      if (state.lines > 0 && state.lines % 8 === 0) {
        state.score += 50;
      }
    },
    palette: ["#7ed6ff", "#63b3ff", "#53a2ff", "#2d7eff"],
  },
  ahri: {
    name: "Ahri",
    effect: "Charm Burst: Double score on 2+ line clears.",
    speedMul: 1,
    bonus: (state, cleared, gained) => {
      if (cleared >= 2) {
        state.score += gained;
      }
    },
    palette: ["#ff9ad6", "#ff84d7", "#e665cd", "#b84fd9"],
  },
  yasuo: {
    name: "Yasuo",
    effect: "Wind Tempo: Pieces drop 12% faster for high-pressure play.",
    speedMul: 1.12,
    bonus: () => {},
    palette: ["#87f1ff", "#67d9ff", "#4bc5ff", "#2a9df4"],
  },
};

const state = {
  grid: [],
  piece: null,
  nextPiece: null,
  score: 0,
  lines: 0,
  level: 1,
  running: false,
  paused: false,
  dropTimer: 0,
  lastTime: 0,
  champion: CHAMPIONS.garen,
};

function makeEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const kind = PIECES[Math.floor(Math.random() * PIECES.length)];
  return {
    kind,
    shape: SHAPES[kind].map((row) => [...row]),
    x: Math.floor(COLS / 2) - 1,
    y: -1,
  };
}

function resetGame() {
  state.grid = makeEmptyGrid();
  state.piece = randomPiece();
  state.nextPiece = randomPiece();
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.running = true;
  state.paused = false;
  state.dropTimer = 0;
  state.lastTime = 0;
  state.champion = CHAMPIONS[championEl.value];

  effectEl.textContent = `${state.champion.name}: ${state.champion.effect}`;
  statusEl.textContent = "Game live. Keep the board clean.";
  updateHud();
  draw();
}

function rotate(shape) {
  return shape[0].map((_, i) => shape.map((row) => row[i]).reverse());
}

function collides(piece, dx = 0, dy = 0, newShape = piece.shape) {
  for (let y = 0; y < newShape.length; y++) {
    for (let x = 0; x < newShape[y].length; x++) {
      if (!newShape[y][x]) {
        continue;
      }
      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) {
        return true;
      }
      if (ny >= 0 && state.grid[ny][nx]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece() {
  const { piece } = state;
  piece.shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) {
        return;
      }
      const gy = piece.y + y;
      const gx = piece.x + x;
      if (gy >= 0) {
        state.grid[gy][gx] = piece.kind;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (state.grid[y].every((cell) => cell !== 0)) {
      state.grid.splice(y, 1);
      state.grid.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }

  if (!cleared) {
    return;
  }

  const points = [0, 100, 300, 500, 800];
  const gained = points[cleared] * state.level;
  state.score += gained;
  state.lines += cleared;
  state.level = Math.min(15, Math.floor(state.lines / 10) + 1);
  state.champion.bonus(state, cleared, gained);
  updateHud();
}

function spawnNext() {
  state.piece = state.nextPiece;
  state.piece.x = Math.floor(COLS / 2) - 1;
  state.piece.y = -1;
  state.nextPiece = randomPiece();
  if (collides(state.piece)) {
    state.running = false;
    statusEl.textContent = "Defeat. Press Start New Game to try again.";
  }
}

function softDrop() {
  if (!state.running || state.paused) {
    return;
  }
  if (!collides(state.piece, 0, 1)) {
    state.piece.y++;
    state.score += 1;
    updateHud();
    return;
  }
  lockPiece();
}

function hardDrop() {
  if (!state.running || state.paused) {
    return;
  }
  let steps = 0;
  while (!collides(state.piece, 0, 1)) {
    state.piece.y++;
    steps++;
  }
  state.score += steps * 2;
  lockPiece();
}

function lockPiece() {
  mergePiece();
  clearLines();
  spawnNext();
  draw();
}

function move(dx) {
  if (!state.running || state.paused) {
    return;
  }
  if (!collides(state.piece, dx, 0)) {
    state.piece.x += dx;
    draw();
  }
}

function tryRotate() {
  if (!state.running || state.paused) {
    return;
  }
  const rotated = rotate(state.piece.shape);
  if (!collides(state.piece, 0, 0, rotated)) {
    state.piece.shape = rotated;
  } else if (!collides(state.piece, -1, 0, rotated)) {
    state.piece.x -= 1;
    state.piece.shape = rotated;
  } else if (!collides(state.piece, 1, 0, rotated)) {
    state.piece.x += 1;
    state.piece.shape = rotated;
  }
  draw();
}

function dropIntervalMs() {
  const base = Math.max(120, 900 - (state.level - 1) * 60);
  return base / state.champion.speedMul;
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  linesEl.textContent = String(state.lines);
  levelEl.textContent = String(state.level);
}

function colorForCell(cell, row) {
  if (!cell) {
    return null;
  }
  const palette = state.champion.palette;
  return palette[row % palette.length];
}

function drawCell(ctx, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.strokeStyle = "rgba(7, 16, 35, 0.65)";
  ctx.strokeRect(x * size, y * size, size, size);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = state.grid[y][x];
      if (cell) {
        drawCell(boardCtx, x, y, colorForCell(cell, y), BLOCK);
      }
    }
  }

  if (!state.piece) {
    return;
  }

  state.piece.shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) {
        return;
      }
      const dx = state.piece.x + x;
      const dy = state.piece.y + y;
      if (dy >= 0) {
        drawCell(boardCtx, dx, dy, colorForCell(state.piece.kind, dy), BLOCK);
      }
    });
  });
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!state.nextPiece) {
    return;
  }
  const shape = state.nextPiece.shape;
  const size = 30;
  const startX = Math.floor((nextCanvas.width - shape[0].length * size) / 2 / size);
  const startY = Math.floor((nextCanvas.height - shape.length * size) / 2 / size);

  shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        drawCell(nextCtx, startX + x, startY + y, colorForCell(state.nextPiece.kind, y), size);
      }
    });
  });
}

function draw() {
  drawBoard();
  drawNext();
}

function togglePause() {
  if (!state.running) {
    return;
  }
  state.paused = !state.paused;
  statusEl.textContent = state.paused ? "Paused." : "Back in the fight.";
}

function update(time = 0) {
  const delta = time - state.lastTime;
  state.lastTime = time;

  if (state.running && !state.paused) {
    state.dropTimer += delta;
    if (state.dropTimer >= dropIntervalMs()) {
      state.dropTimer = 0;
      softDrop();
    }
    draw();
  }

  requestAnimationFrame(update);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowdown", "arrowup", " ", "p"].includes(key) || event.key === " ") {
    event.preventDefault();
  }

  switch (event.key) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "ArrowUp":
      tryRotate();
      break;
    case " ":
      hardDrop();
      break;
    case "p":
    case "P":
      togglePause();
      break;
    default:
      break;
  }
});

startBtn.addEventListener("click", resetGame);
championEl.addEventListener("change", () => {
  state.champion = CHAMPIONS[championEl.value];
  effectEl.textContent = `${state.champion.name}: ${state.champion.effect}`;
  draw();
});

effectEl.textContent = `${state.champion.name}: ${state.champion.effect}`;
draw();
requestAnimationFrame(update);
