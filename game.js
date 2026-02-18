const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('scoreVal');
const hiEl = document.getElementById('hiVal');
const levelEl = document.getElementById('levelVal');
const livesEl = document.getElementById('livesVal');
const startBtn = document.getElementById('startBtn');

const W = 400, H = 600;
canvas.width = W;
canvas.height = H;
document.getElementById('gameContainer').style.width = W + 'px';
document.getElementById('gameContainer').style.height = H + 'px';

// ---- State ----
let state = 'title'; // title | playing | gameover
let score = 0, hiScore = 0, lives = 3, level = 1;
let frame = 0;
let lastTime = 0;

const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'KeyZ') && state === 'title') startGame();
});
document.addEventListener('keyup', e => keys[e.code] = false);
startBtn.addEventListener('click', startGame);

// ---- Images ----
const imgs = {
  player:      Object.assign(new Image(), { src: 'images/player.png' }),
  enemyNormal: Object.assign(new Image(), { src: 'images/enemy_normal.png' }),
  enemyHeavy:  Object.assign(new Image(), { src: 'images/enemy_heavy.png' })
};

// ---- Stars ----
const stars = Array.from({length: 100}, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  s: Math.random() * 1.5 + 0.3,
  sp: Math.random() * 1.5 + 0.3
}));

// ---- Game Objects ----
let player, bullets, enemies, enemyBullets, particles, explosions;

function startGame() {
  score = 0;
  lives = 3;
  level = 1;
  frame = 0;
  bullets = [];
  enemies = [];
  enemyBullets = [];
  particles = [];
  explosions = [];
  player = createPlayer();
  overlay.style.display = 'none';
  state = 'playing';
  updateUI();
}

function createPlayer() {
  return {
    x: W / 2, y: H - 70,
    w: 28, h: 28,
    speed: 4,
    shotCooldown: 0,
    invincible: 0,
    rapidFire: false
  };
}

// ---- Drawing helpers ----
const PLAYER_DW = 52, PLAYER_DH = 52;

function drawShip(x, y) {
  ctx.save();
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 16;
  ctx.drawImage(imgs.player, x - PLAYER_DW/2, y - PLAYER_DH/2, PLAYER_DW, PLAYER_DH);
  ctx.restore();
}

const ENEMY_NORMAL_DW = 44, ENEMY_NORMAL_DH = 44;
const ENEMY_HEAVY_DW  = 56, ENEMY_HEAVY_DH  = 56;

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.type === 0) {
    ctx.rotate(Math.PI); // 生成画像が上向きなので下向きに反転
    ctx.shadowColor = '#f44';
    ctx.shadowBlur = 14;
    ctx.drawImage(imgs.enemyNormal,
      -ENEMY_NORMAL_DW/2, -ENEMY_NORMAL_DH/2,
      ENEMY_NORMAL_DW, ENEMY_NORMAL_DH);
  } else if (e.type === 1) {
    ctx.rotate(Math.PI); // 同上
    ctx.shadowColor = '#a4f';
    ctx.shadowBlur = 18;
    ctx.drawImage(imgs.enemyHeavy,
      -ENEMY_HEAVY_DW/2, -ENEMY_HEAVY_DH/2,
      ENEMY_HEAVY_DW, ENEMY_HEAVY_DH);
  } else {
    // Boss (画像なし・ポリゴン維持)
    ctx.rotate(Math.PI);
    ctx.fillStyle = '#fa0';
    ctx.shadowColor = '#f80';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(0, -e.h/2);
    ctx.lineTo(-e.w/2, -e.h/6);
    ctx.lineTo(-e.w/2, e.h/2);
    ctx.lineTo(0, e.h/3);
    ctx.lineTo(e.w/2, e.h/2);
    ctx.lineTo(e.w/2, -e.h/6);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-Math.PI); // HPバーは回転なしで描く
    ctx.fillStyle = '#333';
    ctx.fillRect(-e.w/2, -e.h/2 - 8, e.w, 4);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(-e.w/2, -e.h/2 - 8, e.w * (e.hp / e.maxHp), 4);
  }
  ctx.restore();
}

function spawnExplosion(x, y, count, col) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 0.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: Math.random() * 0.04 + 0.02,
      size: Math.random() * 3 + 1,
      col
    });
  }
  explosions.push({ x, y, r: 0, maxR: count * 2, life: 1 });
}

// ---- Enemy spawning ----
function spawnEnemy() {
  const t = Math.random();
  let type = 0;
  if (level >= 3 && t > 0.65) type = 1;
  const w = type === 0 ? 22 : 30;
  const h = type === 0 ? 22 : 28;
  enemies.push({
    x: Math.random() * (W - 40) + 20,
    y: -h,
    w, h,
    type,
    hp: type === 0 ? 1 : 3,
    maxHp: type === 0 ? 1 : 3,
    speed: (Math.random() * 0.8 + 0.6) + level * 0.1,
    shootTimer: Math.floor(Math.random() * 90) + 30,
    angle: 0,
    waveOffset: Math.random() * Math.PI * 2
  });
}

function spawnBoss() {
  enemies.push({
    x: W / 2, y: -50,
    w: 60, h: 50,
    type: 2,
    hp: 30 + level * 10,
    maxHp: 30 + level * 10,
    speed: 0.8,
    shootTimer: 60,
    angle: 0,
    dir: 1,
    phase: 0
  });
}

// ---- Update ----
function update(dt) {
  frame++;

  // Stars
  for (const s of stars) {
    s.y += s.sp;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }

  if (state !== 'playing') return;

  // Player movement
  const spd = player.speed;
  if (keys['ArrowLeft']  || keys['KeyA']) player.x -= spd;
  if (keys['ArrowRight'] || keys['KeyD']) player.x += spd;
  if (keys['ArrowUp']    || keys['KeyW']) player.y -= spd;
  if (keys['ArrowDown']  || keys['KeyS']) player.y += spd;
  player.x = Math.max(player.w/2, Math.min(W - player.w/2, player.x));
  player.y = Math.max(player.h/2, Math.min(H - player.h/2, player.y));

  // Shooting
  const rapid = keys['KeyX'] || keys['ShiftLeft'] || keys['ShiftRight'];
  const cooldown = rapid ? 6 : 14;
  if (player.shotCooldown > 0) player.shotCooldown--;
  if ((keys['Space'] || keys['KeyZ']) && player.shotCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - player.h/2, speed: 10, w: 3, h: 10 });
    if (rapid) {
      bullets.push({ x: player.x - 8, y: player.y - player.h/4, speed: 10, w: 2, h: 8 });
      bullets.push({ x: player.x + 8, y: player.y - player.h/4, speed: 10, w: 2, h: 8 });
    }
    player.shotCooldown = cooldown;
  }

  // Player invincibility
  if (player.invincible > 0) player.invincible--;

  // Player bullets
  bullets = bullets.filter(b => b.y > -b.h);
  for (const b of bullets) b.y -= b.speed;

  // Spawn enemies
  const spawnRate = Math.max(20, 90 - level * 6);
  const bossLevel = level % 5 === 0;
  if (!bossLevel && frame % spawnRate === 0) spawnEnemy();
  if (bossLevel && enemies.length === 0 && frame % 300 === 0) spawnBoss();

  // Enemies
  for (const e of enemies) {
    if (e.type === 2) {
      // Boss movement
      e.x += e.dir * e.speed;
      e.y += (80 - e.y) * 0.01;
      if (e.x > W - e.w/2 || e.x < e.w/2) e.dir *= -1;
    } else {
      e.y += e.speed;
      e.x += Math.sin(frame * 0.05 + e.waveOffset) * 0.8;
    }

    // Enemy shoot
    e.shootTimer--;
    if (e.shootTimer <= 0) {
      const rate = e.type === 2 ? 40 : (Math.max(20, 80 - level * 4));
      e.shootTimer = rate;
      if (e.type === 2) {
        // Boss spray
        for (let a = -2; a <= 2; a++) {
          const angle = Math.PI/2 + a * 0.3;
          enemyBullets.push({ x: e.x, y: e.y + e.h/2, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5 });
        }
      } else {
        // Aim at player
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        enemyBullets.push({ x: e.x, y: e.y, vx: dx/dist * 2, vy: dy/dist * 2 });
      }
    }
  }

  // Bullet vs Enemy collision
  for (const b of bullets) {
    for (const e of enemies) {
      if (Math.abs(b.x - e.x) < e.w/2 && Math.abs(b.y - e.y) < e.h/2) {
        b.hit = true;
        e.hp--;
        spawnExplosion(b.x, b.y, 6, e.type === 2 ? '#fa0' : '#f80');
        if (e.hp <= 0) {
          e.dead = true;
          const pts = e.type === 0 ? 100 : e.type === 1 ? 300 : 1000 + level * 200;
          score += pts;
          spawnExplosion(e.x, e.y, e.type === 2 ? 60 : 20, e.type === 0 ? '#f44' : e.type === 1 ? '#a4f' : '#fa0');
          updateUI();
        }
      }
    }
  }
  bullets = bullets.filter(b => !b.hit);
  enemies = enemies.filter(e => !e.dead && e.y < H + e.h);

  // Enemy bullets movement
  for (const b of enemyBullets) {
    b.x += b.vx;
    b.y += b.vy;
  }
  enemyBullets = enemyBullets.filter(b => b.x > 0 && b.x < W && b.y > 0 && b.y < H);

  // Enemy bullet vs Player
  if (player.invincible <= 0) {
    for (const b of enemyBullets) {
      if (Math.abs(b.x - player.x) < player.w/2 - 4 && Math.abs(b.y - player.y) < player.h/2 - 4) {
        b.hit = true;
        playerHit();
      }
    }
  }
  enemyBullets = enemyBullets.filter(b => !b.hit);

  // Enemy vs Player collision
  if (player.invincible <= 0) {
    for (const e of enemies) {
      if (Math.abs(e.x - player.x) < (e.w + player.w)/2 - 6 && Math.abs(e.y - player.y) < (e.h + player.h)/2 - 6) {
        e.dead = true;
        playerHit();
        spawnExplosion(e.x, e.y, 20, '#f44');
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }

  // Particles
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.vx *= 0.97;
    p.vy *= 0.97;
  }
  particles = particles.filter(p => p.life > 0);

  // Explosions ring
  for (const ex of explosions) {
    ex.r += 3;
    ex.life -= 0.07;
  }
  explosions = explosions.filter(ex => ex.life > 0);

  // Level up
  if (score >= level * 2000) {
    level++;
    updateUI();
  }
}

function playerHit() {
  lives--;
  spawnExplosion(player.x, player.y, 40, '#4af');
  player.invincible = 120;
  updateUI();
  if (lives <= 0) {
    state = 'gameover';
    if (score > hiScore) hiScore = score;
    showGameOver();
  }
}

function showGameOver() {
  overlay.innerHTML = `
    <h1>GAME OVER</h1>
    <div class="score-display">SCORE: ${score}</div>
    <p>HI-SCORE: ${hiScore}</p>
    <p>LEVEL: ${level}</p>
    <button id="startBtn">RETRY</button>
  `;
  overlay.style.display = 'flex';
  document.getElementById('startBtn').addEventListener('click', startGame);
}

function updateUI() {
  scoreEl.textContent = score;
  hiEl.textContent = hiScore;
  levelEl.textContent = level;
  livesEl.innerHTML = Array.from({length: Math.max(0, lives)}, () => '<span class="heart">♥</span>').join('');
}

// ---- Draw ----
function draw() {
  ctx.fillStyle = '#050510';
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (const s of stars) {
    ctx.globalAlpha = 0.4 + s.s * 0.3;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  if (state === 'playing' || state === 'gameover') {
    // Explosions ring
    for (const ex of explosions) {
      ctx.globalAlpha = ex.life * 0.4;
      ctx.strokeStyle = '#ff8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.col;
      ctx.shadowColor = p.col;
      ctx.shadowBlur = 4;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Enemy bullets
    for (const b of enemyBullets) {
      ctx.fillStyle = '#f88';
      ctx.shadowColor = '#f00';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI*2);
      ctx.fill();
    }

    // Player bullets
    ctx.shadowBlur = 12;
    for (const b of bullets) {
      ctx.fillStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.fillRect(b.x - b.w/2, b.y, b.w, b.h);
    }
    ctx.shadowBlur = 0;

    // Enemies
    for (const e of enemies) drawEnemy(e);

    // Player (flicker if invincible)
    if (player.invincible <= 0 || Math.floor(player.invincible / 6) % 2 === 0) {
      // Engine glow (画像の後ろに描画)
      ctx.save();
      ctx.globalAlpha = 0.65 + Math.sin(frame * 0.3) * 0.2;
      ctx.fillStyle = '#48f';
      ctx.shadowColor = '#0af';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + PLAYER_DH/2 - 6, 8, 14 + Math.sin(frame*0.4)*3, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      // 無敵中は青白く光らせる
      if (player.invincible > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 28;
        drawShip(player.x, player.y);
        ctx.restore();
      } else {
        drawShip(player.x, player.y);
      }
    }
  }
}

// ---- Loop ----
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 16.67, 3);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

updateUI();
requestAnimationFrame(loop);
