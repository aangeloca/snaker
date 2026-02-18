const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const levelEl = document.getElementById("level");
const comboEl = document.getElementById("combo");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");
const saveScoreBtn = document.getElementById("saveScoreBtn");
const nameForm = document.getElementById("nameForm");
const playerNameInput = document.getElementById("playerName");
const leaderboardList = document.getElementById("leaderboardList");
const restartBtn = document.getElementById("restartBtn");

const tile = 28;
const rows = canvas.height / tile;
const cols = canvas.width / tile;

const BEST_KEY = "snake-rush-best";
const LEADERBOARD_KEY = "snake-rush-leaderboard";
const MAX_LEADERBOARD = 10;

let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
let leaderboard = readJsonStorage(LEADERBOARD_KEY, []);
let snake;
let dir;
let pendingDir;
let food;
let bonusFood;
let powerups;
let score;
let level;
let combo;
let comboUntil;
let speed;
let baseSpeed;
let lastTick;
let running = false;
let paused = false;
let gameOver = false;
let particles = [];
let effects = {
  slowUntil: 0,
  fastUntil: 0,
  invertUntil: 0,
  shieldUntil: 0,
};

const FOOD_TYPES = {
  normal: { color: "#00e6a8", value: 10, grow: 1, chance: 0.75 },
  turbo: { color: "#00c2ff", value: 25, grow: 2, chance: 0.2 },
  danger: { color: "#ff5e7e", value: 40, grow: 1, chance: 0.05 },
};

const POWERUP_TYPES = {
  good_slow: { color: "#73d7ff", good: true, label: "Freeze" },
  good_shield: { color: "#9effaf", good: true, label: "Shield" },
  good_grow: { color: "#59ffc9", good: true, label: "Grow+" },
  bad_bomb: { color: "#ff4d5f", good: false, label: "Bomba" },
  bad_fast: { color: "#ff8f3f", good: false, label: "Speed+" },
  bad_invert: { color: "#cf84ff", good: false, label: "Invert" },
};

bestScoreEl.textContent = bestScore;

function randomCell() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
  };
}

function isOccupied(cell) {
  return snake.some((seg) => seg.x === cell.x && seg.y === cell.y);
}

function isPowerupCell(cell) {
  return powerups.some((item) => item.x === cell.x && item.y === cell.y);
}

function spawnFood() {
  const roll = Math.random();
  let sum = 0;
  let pickedType = "normal";

  Object.entries(FOOD_TYPES).forEach(([type, item]) => {
    sum += item.chance;
    if (roll <= sum && pickedType === "normal") pickedType = type;
  });

  let cell = randomCell();
  while (isOccupied(cell) || isPowerupCell(cell)) {
    cell = randomCell();
  }

  return { ...cell, type: pickedType };
}

function spawnPowerup(type) {
  let cell = randomCell();
  while (
    isOccupied(cell) ||
    (food && food.x === cell.x && food.y === cell.y) ||
    (bonusFood && bonusFood.x === cell.x && bonusFood.y === cell.y) ||
    isPowerupCell(cell)
  ) {
    cell = randomCell();
  }

  return { ...cell, type, ttl: performance.now() + 9000 };
}

function maybeSpawnPowerup() {
  if (powerups.length >= 3 || Math.random() > 0.25) return;

  const allTypes = Object.keys(POWERUP_TYPES);
  const type = allTypes[Math.floor(Math.random() * allTypes.length)];
  powerups.push(spawnPowerup(type));
}

function spawnParticles(x, y, color) {
  for (let i = 0; i < 10; i += 1) {
    particles.push({
      x,
      y,
      dx: (Math.random() - 0.5) * 2,
      dy: (Math.random() - 0.5) * 2,
      life: 25 + Math.random() * 15,
      color,
    });
  }
}

function updateLeaderboard() {
  leaderboardList.innerHTML = "";

  if (!leaderboard.length) {
    const li = document.createElement("li");
    li.textContent = "Sem pontuações ainda.";
    leaderboardList.appendChild(li);
    return;
  }

  leaderboard.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score}`;
    leaderboardList.appendChild(li);
  });
}

function saveScore() {
  const rawName = playerNameInput.value.trim();
  const name = rawName || "Jogador";

  if (!gameOver) return;

  leaderboard.push({ name, score });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, MAX_LEADERBOARD);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));

  saveScoreBtn.classList.add("hidden");
  nameForm.classList.add("hidden");
  updateLeaderboard();
}

function resetGame() {
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
  ];
  dir = { x: 1, y: 0 };
  pendingDir = { ...dir };
  powerups = [];
  food = spawnFood();
  bonusFood = null;
  score = 0;
  combo = 1;
  comboUntil = 0;
  level = 1;
  baseSpeed = 140;
  speed = baseSpeed;
  lastTick = performance.now();
  particles = [];
  paused = false;
  gameOver = false;
  effects = {
    slowUntil: 0,
    fastUntil: 0,
    invertUntil: 0,
    shieldUntil: 0,
  };
  saveScoreBtn.classList.add("hidden");
  nameForm.classList.add("hidden");
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  comboEl.textContent = `x${combo}`;
  bestScoreEl.textContent = bestScore;
}

function setOverlay(title, text, buttonText = "Jogar") {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  startBtn.textContent = buttonText;
  overlayEl.classList.add("show");
}

function hideOverlay() {
  overlayEl.classList.remove("show");
}

function startGame() {
  resetGame();
  running = true;
  hideOverlay();
  requestAnimationFrame(loop);
}

function endGame() {
  gameOver = true;
  running = false;

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(BEST_KEY, String(bestScore));
  }

  updateHUD();
  setOverlay(
    "Fim de jogo 💥",
    `Você fez ${score} pontos no nível ${level}. Salve seu nome no ranking!`,
    "Recomeçar"
  );

  saveScoreBtn.classList.remove("hidden");
  nameForm.classList.remove("hidden");
  playerNameInput.value = "";
  playerNameInput.focus();
}

function levelUpIfNeeded() {
  const nextLevel = Math.floor(score / 140) + 1;
  if (nextLevel > level) {
    level = nextLevel;
    baseSpeed = Math.max(72, 140 - (level - 1) * 8);
    spawnParticles(snake[0].x * tile + tile / 2, snake[0].y * tile + tile / 2, "#ffffff");
  }
}

function applyPowerup(type, head) {
  const now = performance.now();

  if (type === "good_slow") {
    effects.slowUntil = now + 5000;
    score += 20;
  }

  if (type === "good_shield") {
    effects.shieldUntil = now + 6000;
    score += 25;
  }

  if (type === "good_grow") {
    snake.push({ ...snake[snake.length - 1] });
    snake.push({ ...snake[snake.length - 1] });
    score += 20;
  }

  if (type === "bad_bomb") {
    if (snake.length > 4) {
      snake.pop();
      snake.pop();
    }
    score = Math.max(0, score - 20);
  }

  if (type === "bad_fast") {
    effects.fastUntil = now + 4000;
    score = Math.max(0, score - 10);
  }

  if (type === "bad_invert") {
    effects.invertUntil = now + 4000;
    score = Math.max(0, score - 10);
  }

  spawnParticles(head.x * tile + tile / 2, head.y * tile + tile / 2, POWERUP_TYPES[type].color);
}

function computeSpeed(now) {
  speed = baseSpeed;

  if (now < effects.slowUntil) speed += 35;
  if (now < effects.fastUntil) speed = Math.max(50, speed - 35);
}

function move() {
  dir = pendingDir;
  const now = performance.now();

  const head = {
    x: (snake[0].x + dir.x + cols) % cols,
    y: (snake[0].y + dir.y + rows) % rows,
  };

  const hitSelf = snake.some((seg) => seg.x === head.x && seg.y === head.y);

  if (hitSelf) {
    if (now < effects.shieldUntil) {
      effects.shieldUntil = 0;
      spawnParticles(head.x * tile + tile / 2, head.y * tile + tile / 2, "#9effaf");
    } else {
      endGame();
      return;
    }
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    const type = FOOD_TYPES[food.type];
    score += type.value * combo;
    combo = Math.min(8, combo + 1);
    comboUntil = now + 2600;
    spawnParticles(head.x * tile + tile / 2, head.y * tile + tile / 2, type.color);

    for (let i = 1; i < type.grow; i += 1) {
      snake.push({ ...snake[snake.length - 1] });
    }

    food = spawnFood();

    if (Math.random() < 0.2 && !bonusFood) {
      bonusFood = { ...spawnFood(), ttl: now + 6000 };
    }

    maybeSpawnPowerup();
    levelUpIfNeeded();
  } else if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
    score += 80;
    combo = Math.min(8, combo + 2);
    comboUntil = now + 3000;
    spawnParticles(head.x * tile + tile / 2, head.y * tile + tile / 2, "#ffe87d");
    bonusFood = null;
    levelUpIfNeeded();
  } else {
    const powerIndex = powerups.findIndex((item) => item.x === head.x && item.y === head.y);

    if (powerIndex >= 0) {
      const [picked] = powerups.splice(powerIndex, 1);
      applyPowerup(picked.type, head);
      levelUpIfNeeded();
    } else {
      snake.pop();
    }
  }

  if (bonusFood && now > bonusFood.ttl) bonusFood = null;
  powerups = powerups.filter((item) => now < item.ttl);
  if (now > comboUntil) combo = 1;

  computeSpeed(now);
  updateHUD();
}

function drawRoundedRect(x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCell(x, y, color, radius = 6) {
  const px = x * tile;
  const py = y * tile;
  ctx.fillStyle = color;
  ctx.beginPath();
  drawRoundedRect(px + 2, py + 2, tile - 4, tile - 4, radius);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  snake.forEach((segment, index) => {
    const ratio = Math.max(0.45, 1 - index * 0.025);
    const g = Math.floor(200 * ratio) + 30;
    drawCell(segment.x, segment.y, `rgb(0, ${g}, 160)`, 8);
  });

  drawCell(food.x, food.y, FOOD_TYPES[food.type].color, 14);

  if (bonusFood) drawCell(bonusFood.x, bonusFood.y, "#ffe87d", 14);

  powerups.forEach((item) => {
    const radius = POWERUP_TYPES[item.type].good ? 14 : 4;
    drawCell(item.x, item.y, POWERUP_TYPES[item.type].color, radius);
  });

  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    p.x += p.dx;
    p.y += p.dy;
    p.life -= 1;
    ctx.globalAlpha = p.life / 35;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  });
}

function loop(ts) {
  if (!running) return;

  if (!paused && ts - lastTick >= speed) {
    move();
    lastTick = ts;
  }

  render();

  if (!gameOver) requestAnimationFrame(loop);
}

function getDirectionForKey(key) {
  const invert = performance.now() < effects.invertUntil;
  const normalMap = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };
  const invertMap = {
    arrowup: { x: 0, y: 1 },
    w: { x: 0, y: 1 },
    arrowdown: { x: 0, y: -1 },
    s: { x: 0, y: -1 },
    arrowleft: { x: 1, y: 0 },
    a: { x: 1, y: 0 },
    arrowright: { x: -1, y: 0 },
    d: { x: -1, y: 0 },
  };

  return invert ? invertMap[key] : normalMap[key];
}

function updateDirection(next) {
  if (!next) return;
  if ((next.x !== 0 && next.x === -dir.x) || (next.y !== 0 && next.y === -dir.y)) return;
  pendingDir = next;
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === " " && running && !gameOver) {
    paused = !paused;
    if (paused) {
      setOverlay("Pausado ⏸", "Respire fundo e clique em continuar.", "Continuar");
    } else {
      hideOverlay();
    }
    return;
  }

  if (key === "r") {
    startGame();
    return;
  }

  if (!running) return;

  updateDirection(getDirectionForKey(key));
});

startBtn.addEventListener("click", () => {
  if (!running || gameOver) {
    startGame();
  } else if (paused) {
    paused = false;
    hideOverlay();
  }
});

saveScoreBtn.addEventListener("click", saveScore);
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveScore();
});

restartBtn.addEventListener("click", startGame);

document.querySelectorAll(".arrow").forEach((button) => {
  button.addEventListener("click", () => {
    updateDirection(getDirectionForKey(button.dataset.dir === "up"
      ? "arrowup"
      : button.dataset.dir === "down"
        ? "arrowdown"
        : button.dataset.dir === "left"
          ? "arrowleft"
          : "arrowright"));
  });
});

updateLeaderboard();
setOverlay("Snake Rush", "Clique em jogar para começar. Use setas ou WASD para se mover.");
render();
