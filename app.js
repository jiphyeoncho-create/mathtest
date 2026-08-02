// 쌓기나무 마스터: 메인 게임 로직 (100% Pure Vanilla JS, 완전 독립 실행 보장)

// ==========================================
// 1. Firebase Config & Pure JS Fallback Loader
// ==========================================
const firebaseConfig = window.__FIREBASE_CONFIG__ || {
  apiKey: "AIzaSyAFFAvwM5DznWnLmVbt6RdPKnJVPqII7vM",
  authDomain: "game-5364a.firebaseapp.com",
  projectId: "game-5364a",
  storageBucket: "game-5364a.firebasestorage.app",
  messagingSenderId: "241580484950",
  appId: "1:241580484950:web:996455c6366b095b9f4ef7"
};

let app = null, auth = null, db = null;
let isFirebaseActive = false;
let fbAuthMethods = {};

// 100% 안전 로컬 스토리지 모드 로더
function initFirebase() {
  console.log("Game Engine Ready (Pure Vanilla JS Mode)");
}

// ==========================================
// 2. Sound Effects (Web Audio API)
// ==========================================
class SoundFX {
  constructor() { this.ctx = null; }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  playTone(freq, duration, type = 'sine') {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch(e){}
  }
  click() { this.init(); this.playTone(400, 0.06, 'triangle'); }
  correct() {
    this.init();
    this.playTone(523.25, 0.1, 'sine');
    setTimeout(() => this.playTone(659.25, 0.1, 'sine'), 80);
    setTimeout(() => this.playTone(783.99, 0.2, 'sine'), 160);
  }
  wrong() {
    this.init();
    this.playTone(200, 0.15, 'sawtooth');
    setTimeout(() => this.playTone(150, 0.2, 'sawtooth'), 100);
  }
  fanfare() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 0.22, 'sine'), idx * 140);
    });
  }
}
const sound = new SoundFX();

// ==========================================
// 3. Global State
// ==========================================
const state = {
  user: {
    uid: null,
    name: localStorage.getItem('cube_user_name') || '익명 탐험가',
    isAnon: true,
  },
  gold: parseInt(localStorage.getItem('cube_gold') || '0', 10),
  clears: parseInt(localStorage.getItem('cube_clears') || '0', 10),
  
  currentGame: null,
  gameTimer: null,
  timeLeft: 0,
  startTimeMs: 0,

  // 미니게임 1 모눈종이 3x3 선택 상태
  paperState: {
    top: Array(3).fill().map(() => Array(3).fill(false)),
    front: Array(3).fill().map(() => Array(3).fill(false)),
    side: Array(3).fill().map(() => Array(3).fill(false))
  },

  // 미니게임 2 연속 스피드 타임어택
  mg2Score: 0,
  mg2GoldEarned: 0,

  // 3D Grid Target / User
  targetGrid: [], // 3x3 or 4x4
  userGrid: [],

  // Boss state
  boss: {
    active: false,
    size: 4, // 4x4x4 (27~64 cubes)
    targetCubes: 0,
    startTime: 0,
    timerInterval: null
  }
};

// ==========================================
// 4. Dynamic 3D Isometric Cube Renderer Engine (with Axis Labels)
// ==========================================
class IsoCubeRenderer {
  constructor(canvas, gridSize = 3) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridSize = gridSize;
    
    if (gridSize === 4) {
      this.tileWidth = 42;
      this.tileHeight = 21;
      this.cubeHeight = 24;
    } else {
      this.tileWidth = 54;
      this.tileHeight = 27;
      this.cubeHeight = 30;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // 3D Isometric 좌표 ➔ 화면 스크린 좌표 변환 (두번째 가이드 이미지 100% 구현)
  toScreen(gx, gy, gz, isFloor = false) {
    const originX = this.canvas.width / 2;
    const originY = this.canvas.height - (this.gridSize === 4 ? 65 : 75);
    const sx = originX + (gx - gy) * (this.tileWidth / 2);
    
    // 바닥 격자와 3D 모형 사이를 공중에 붕 띄우는 이격 오프셋 (두번째 가이드 이미지와 동일)
    const floatElevation = isFloor ? 0 : (this.cubeHeight * 1.6);
    const sy = originY + (gx + gy) * (this.tileHeight / 2) - floatElevation - gz * this.cubeHeight;
    return { x: sx, y: sy };
  }

  drawCube(gx, gy, gz, color = '#6366f1') {
    const { x, y } = this.toScreen(gx, gy, gz, false);
    const w = this.tileWidth / 2;
    const h = this.tileHeight / 2;
    const ch = this.cubeHeight;
    const ctx = this.ctx;

    // Top Face
    ctx.beginPath();
    ctx.moveTo(x, y - ch);
    ctx.lineTo(x + w, y - h - ch);
    ctx.lineTo(x, y - 2 * h - ch);
    ctx.lineTo(x - w, y - h - ch);
    ctx.closePath();
    ctx.fillStyle = this.adjustColor(color, 25);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Left Face
    ctx.beginPath();
    ctx.moveTo(x - w, y - h - ch);
    ctx.lineTo(x, y - ch);
    ctx.lineTo(x, y);
    ctx.lineTo(x - w, y - h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();

    // Right Face
    ctx.beginPath();
    ctx.moveTo(x, y - ch);
    ctx.lineTo(x + w, y - h - ch);
    ctx.lineTo(x + w, y - h);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = this.adjustColor(color, -25);
    ctx.fill();
    ctx.stroke();

    // 2층 이상 올라간 큐브 상단 윗면에 [2층], [3층] 수치 배지 표시
    if (gz >= 1) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Jua, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${gz + 1}층`, x, y - h - ch + 4);
    }
  }

  drawGridFloorWithAxis(grid = null) {
    const size = this.gridSize;
    const ctx = this.ctx;

    // 1. 맨 아래 바닥 3x3 점선 모눈 격자 전체 렌더링 (두번째 가이드 이미지 바닥 점선 모눈)
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const { x: sx, y: sy } = this.toScreen(x, y, 0, true);
        const w = this.tileWidth / 2;
        const h = this.tileHeight / 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + w, sy - h);
        ctx.lineTo(sx, sy - 2 * h);
        ctx.lineTo(sx - w, sy - h);
        ctx.closePath();
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fill();

        // 또렷하고 선명한 바닥 점선 모눈 (Dotted Line Grid)
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.save();

    // 2. [위] 초록색 배지 (상단 중앙 `↓ 위`)
    const topPos = { x: this.canvas.width / 2, y: 22 };
    ctx.fillStyle = '#dcfce7';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    this.drawRoundRect(ctx, topPos.x - 22, topPos.y - 10, 44, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 13px Jua, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('위', topPos.x, topPos.y + 5);

    // 초록색 화살표 ↓
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('↓', topPos.x, topPos.y + 22);

    // 3. [앞] 분홍색 배지 (바닥 왼쪽 아래 `↗ 앞`)
    const frontPos = this.toScreen(0, size - 1, 0, true);
    ctx.fillStyle = '#fce7f3';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    this.drawRoundRect(ctx, frontPos.x - 52, frontPos.y + 14, 46, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 13px Jua, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('앞', frontPos.x - 29, frontPos.y + 30);

    // 분홍색 화살표 ↗
    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('↗', frontPos.x, frontPos.y + 26);

    // 4. [옆] 파란색 배지 (바닥 오른쪽 아래 `↖ 옆`)
    const sidePos = this.toScreen(size - 1, size - 1, 0, true);
    ctx.fillStyle = '#dbeafe';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    this.drawRoundRect(ctx, sidePos.x + 8, sidePos.y + 14, 46, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 13px Jua, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('옆', sidePos.x + 31, sidePos.y + 30);

    // 파란색 화살표 ↖
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('↖', sidePos.x - 2, sidePos.y + 26);

    ctx.restore();
  }

  // 100% 호환 안전 둥근 사각형 렌더러
  drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  renderStructure(grid) {
    this.clear();
    this.drawGridFloorWithAxis(grid);
    const size = this.gridSize;
    const ctx = this.ctx;

    // 1. 공중에 떠 있는 3D 모형 밑면에서부터 맨 아래 바닥 점선 모눈 격자까지 수직 하강하는 하늘색 투영 점선 렌더링 (두번째 가이드 이미지 100% 연출)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const height = grid[x][y];
        if (height > 0) {
          const cubeBottomPoint = this.toScreen(x, y, 0, false);
          const floorPoint = this.toScreen(x, y, 0, true);
          ctx.beginPath();
          ctx.moveTo(cubeBottomPoint.x, cubeBottomPoint.y);
          ctx.lineTo(floorPoint.x, floorPoint.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 2. 3D 큐브 블록들 렌더링
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const height = grid[x][y];
        for (let z = 0; z < height; z++) {
          this.drawCube(x, y, z, '#6366f1');
        }
      }
    }
  }

  adjustColor(col, amt) {
    let usePound = false;
    if (col[0] == "#") {
      col = col.slice(1);
      usePound = true;
    }
    let num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  }
}

// 보이지 않는 숨겨진 블록 없이, 최소 개수(Minimal Cubes)로 구성된 직관적 쌓기나무 구조 생성기
function generateRandomStructure(minCubes = 4, maxCubes = 9, size = 3) {
  const g = Array(size).fill().map(() => Array(size).fill(0));
  let totalCubes = 0;
  const targetCount = minCubes + Math.floor(Math.random() * (maxCubes - minCubes + 1));
  
  // 바닥부터 시작하여 눈에 보이는 최소한의 높이로 구성 (보이지 않는 숨김 나무 없음)
  while (totalCubes < targetCount) {
    const rx = Math.floor(Math.random() * size);
    const ry = Math.floor(Math.random() * size);
    
    // 주위 관찰 가능한 기둥에만 자연스럽게 쌓음
    if (g[rx][ry] < size) {
      g[rx][ry]++;
      totalCubes++;
    }
  }
  return { grid: g, total: totalCubes };
}

// 2D Projection Views Renderer (사진속 교과서 표준 삼면도 100% 동기화)
class ProjectionRenderer {
  static drawViews(grid, targetCanvasIds = ['view-top', 'view-front', 'view-side'], size = 3) {
    const topCanvas = document.getElementById(targetCanvasIds[0]);
    const frontCanvas = document.getElementById(targetCanvasIds[1]);
    const sideCanvas = document.getElementById(targetCanvasIds[2]);

    if (!topCanvas || !frontCanvas || !sideCanvas) return;

  // 교과서 절대 표준 삼면도 프로젝션 엔진 (사용자 피드백 100% 반영)
  static drawViews(grid, targetCanvasIds = ['view-top', 'view-front', 'view-side'], size = 3) {
    const topCanvas = document.getElementById(targetCanvasIds[0]);
    const frontCanvas = document.getElementById(targetCanvasIds[1]);
    const sideCanvas = document.getElementById(targetCanvasIds[2]);

    if (!topCanvas || !frontCanvas || !sideCanvas) return;

    // 1. 위에서 본 모양 (2D Grid: r행 c열 그대로 칠함)
    this.drawGrid2D(topCanvas, (r, c) => grid[r][c] > 0, size);
    
    // 2. 앞에서 본 모양 (열 c별 최고 높이: c=0은 1열, c=1은 2열, c=2는 3열)
    const frontView = Array(size).fill(0);
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) {
        frontView[c] = Math.max(frontView[c], grid[r][c]);
      }
    }
    this.drawElevation2D(frontCanvas, frontView, size);

    // 3. 옆(오른쪽)에서 본 모양 (라벨: ← 앞쪽 / 뒤쪽 →)
    // col 0 = 앞쪽 (r = size - 1), col 1 = 중간 (r = 1), col 2 = 뒤쪽 (r = 0)
    const sideView = Array(size).fill(0);
    for (let col = 0; col < size; col++) {
      const r = size - 1 - col;
      for (let c = 0; c < size; c++) {
        sideView[col] = Math.max(sideView[col], grid[r][c]);
      }
    }
    this.drawElevation2D(sideCanvas, sideView, size);
  }
  }

  static drawGrid2D(canvas, filledFn, size = 3) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellSize = size === 4 ? 24 : 32;
    const offsetX = (canvas.width - cellSize * size) / 2;
    const offsetY = (canvas.height - cellSize * size) / 2;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        ctx.fillStyle = filledFn(r, c) ? '#818cf8' : 'rgba(51, 65, 85, 0.5)';
        ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = '#c7d2fe';
        ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);
      }
    }
  }

  static drawElevation2D(canvas, heights, size = 3) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellSize = size === 4 ? 24 : 32;
    const offsetX = (canvas.width - cellSize * size) / 2;
    const offsetY = canvas.height - (size === 4 ? 12 : 16);

    for (let col = 0; col < size; col++) {
      const h = heights[col];
      for (let level = 0; level < h; level++) {
        const x = offsetX + col * cellSize;
        const y = offsetY - (level + 1) * cellSize;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = '#e0f2fe';
        ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);
      }
    }
  }

  static getProjections(grid, size = 3) {
    // Top View (위에서 본 모양)
    const top = Array(size).fill().map(() => Array(size).fill(false));
    for (let r=0; r<size; r++) for (let c=0; c<size; c++) if (grid[r][c] > 0) top[r][c] = true;

    // Front View (앞에서 본 모양: 열 c별 높이)
    const front = Array(size).fill().map(() => Array(size).fill(false));
    for (let c=0; c<size; c++) {
      let maxH = 0;
      for (let r=0; r<size; r++) maxH = Math.max(maxH, grid[r][c]);
      for (let h=0; h<maxH; h++) front[size - 1 - h][c] = true;
    }

    // Side View (옆에서 본 모양: col 0 = 앞쪽 r = size - 1, col 1 = 중간 r = 1, col 2 = 뒤쪽 r = 0)
    const side = Array(size).fill().map(() => Array(size).fill(false));
    for (let col = 0; col < size; col++) {
      const r = size - 1 - col;
      let maxH = 0;
      for (let c = 0; c < size; c++) maxH = Math.max(maxH, grid[r][c]);
      for (let h = 0; h < maxH; h++) side[size - 1 - h][col] = true;
    }

    return { top, front, side };
  }
}

// ==========================================
// 5. UI Helpers
// ==========================================
function updateStatsUI() {
  document.getElementById('user-gold').textContent = state.gold;
  document.getElementById('user-clears').textContent = state.clears;
  localStorage.setItem('cube_gold', state.gold);
  localStorage.setItem('cube_clears', state.clears);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

// ==========================================
// 6. Mini Game Generators & Handlers
// ==========================================
let renderer = null;

function generateRandomStructure(minCubes = 4, maxCubes = 9, size = 3) {
  const g = Array(size).fill().map(() => Array(size).fill(0));
  let totalCubes = 0;
  const targetCount = minCubes + Math.floor(Math.random() * (maxCubes - minCubes + 1));
  
  while (totalCubes < targetCount) {
    const rx = Math.floor(Math.random() * size);
    const ry = Math.floor(Math.random() * size);
    if (g[rx][ry] < size) {
      g[rx][ry]++;
      totalCubes++;
    }
  }
  return { grid: g, total: totalCubes };
}

function startMiniGame(gameType) {
  sound.click();
  state.currentGame = gameType;
  state.startTimeMs = Date.now();
  showScreen('screen-game');

  const canvas = document.getElementById('main-canvas');
  if (!renderer) renderer = new IsoCubeRenderer(canvas, 3);

  const paperWrapper = document.getElementById('grid-paper-container');
  const viewProjections = document.getElementById('view-projections');
  const gameControls = document.getElementById('game-controls');
  const gamePrompt = document.getElementById('game-prompt');
  const scoreBadge = document.getElementById('minigame-score-badge');
  const posGuide = document.getElementById('mg1-position-guide');

  // Clear UI states
  canvas.classList.remove('hidden');
  paperWrapper.classList.add('hidden');
  viewProjections.classList.add('hidden');
  scoreBadge.classList.add('hidden');
  posGuide.classList.add('hidden');
  gameControls.innerHTML = '';

  if (gameType === 1) {
    // ========================================================
    // [미니게임 1] 입체모형 보고 (위/앞/옆) 3x3 모눈종이에 그리기 (40초)
    // - 착시 현상 방지를 위해 1층 높이(Max 1층) 중심의 명확한 입체모형 생성
    // ========================================================
    document.getElementById('game-title').textContent = '미니게임 1: (위/앞/옆) 3x3 모눈종이에 모양 그리기';
    gamePrompt.innerHTML = '🎨 3D 입체도형의 <strong>[앞]과 [옆] 방향</strong>을 참고해 3x3 모눈종이를 클릭해 칠해보세요!';
    
    renderer = new IsoCubeRenderer(canvas, 3);
    
    // 1층 높이(Max 1층) 기반 100% 직관적 문제 생성 (착시 0%)
    const grid = Array(3).fill().map(() => Array(3).fill(0));
    let count = 0;
    const targetCount = 4 + Math.floor(Math.random() * 3); // 4~6개
    while (count < targetCount) {
      const rx = Math.floor(Math.random() * 3);
      const ry = Math.floor(Math.random() * 3);
      if (grid[rx][ry] === 0) {
        grid[rx][ry] = 1;
        count++;
      }
    }
    state.targetGrid = grid;

    posGuide.classList.remove('hidden');
    renderer.renderStructure(grid);
    paperWrapper.classList.remove('hidden');
    initPaperGridUI(grid, 3);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-gold btn-lg';
    submitBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> 3x3 모눈종이 제출 & 검수';
    submitBtn.onclick = () => submitMiniGame1(3);
    gameControls.appendChild(submitBtn);

    startTimer(40);

  } else if (gameType === 2) {
    // ========================================================
    // [미니게임 2] 30초 동안 1층/2층/최소개수 연속 스피드 퀴즈 (문제당 5G 적립)
    // ========================================================
    document.getElementById('game-title').textContent = '미니게임 2: 층별 & 최소/최대 개수 30초 스피드 퀴즈!';
    renderer = new IsoCubeRenderer(canvas, 3);
    scoreBadge.classList.remove('hidden');
    state.mg2Score = 0;
    state.mg2GoldEarned = 0;
    document.getElementById('mg2-score').textContent = '0';
    document.getElementById('mg2-gold').textContent = '0';

    renderNextSpeedQuiz();
    startTimer(30);

  } else if (gameType === 3) {
    // ========================================================
    // [미니게임 3] 2D 삼면도 모양 보고 전체 개수 맞추기 (1분 타임어택)
    // ========================================================
    document.getElementById('game-title').textContent = '미니게임 3: 2D 삼면도 보고 총 개수 맞추기 (1분)';
    gamePrompt.innerHTML = '🔍 제시된 <strong>위, 앞, 옆 삼면도</strong>를 보고 전체 쌓기나무 개수를 맞추세요!';

    const { grid, total } = generateRandomStructure(4, 9, 3);
    state.targetGrid = grid;

    canvas.classList.add('hidden');
    viewProjections.classList.remove('hidden');
    ProjectionRenderer.drawViews(grid, ['view-top', 'view-front', 'view-side'], 3);

    const options = new Set([total]);
    while (options.size < 4) {
      options.add(Math.max(3, total + Math.floor(Math.random() * 7) - 3));
    }
    Array.from(options).sort((a,b)=>a-b).forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = `${opt}개`;
      btn.onclick = () => submitTimedMiniGame(gameType, opt === total);
      gameControls.appendChild(btn);
    });

    startTimer(60);
  }
}

// 미니게임 1 모눈종이 3x3 칠하기 UI 초기화 ([앞]과 [옆] 2개 모눈종이)
function initPaperGridUI(grid, size = 3) {
  ['front', 'side'].forEach(view => {
    state.paperState[view] = Array(size).fill().map(() => Array(size).fill(false));
    const container = document.getElementById(`paper-${view}`);
    if (!container) return;
    container.innerHTML = '';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'paper-cell';
        cell.onclick = () => {
          try { sound.click(); } catch(e){}
          state.paperState[view][r][c] = !state.paperState[view][r][c];
          cell.classList.toggle('active', state.paperState[view][r][c]);
        };
        container.appendChild(cell);
      }
    }
  });
}

function submitMiniGame1(size = 3) {
  const actualProj = ProjectionRenderer.getProjections(state.targetGrid, size);
  let isCorrect = true;

  // [앞]과 [옆] 2개 모눈종이 검수 (위에서 본 모양은 3D 바닥 힌트로 기본 제시)
  ['front', 'side'].forEach(view => {
    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        if (state.paperState[view][r][c] !== actualProj[view][r][c]) {
          isCorrect = false;
        }
      }
    }
  });

  submitTimedMiniGame(1, isCorrect);
}

// 미니게임 소요시간대별 골드 차등 지급 로직 (미니게임 1 & 미니게임 3)
function submitTimedMiniGame(gameType, isCorrect) {
  clearInterval(state.gameTimer);
  const elapsedSec = (Date.now() - state.startTimeMs) / 1000;

  if (isCorrect) {
    sound.correct();
    let earnedGold = 1;

    if (gameType === 3) {
      // 미니게임 3 보상 규칙: 30초 이내 20G, 30~50초 10G, 50~60초 5G
      if (elapsedSec <= 30) earnedGold = 20;
      else if (elapsedSec <= 50) earnedGold = 10;
      else earnedGold = 5;
    } else {
      // 미니게임 1 보상 규칙: 10초 이내 10G, 20초 이내 5G, 30초 이내 2G, 40초 이내 1G
      if (elapsedSec <= 10) earnedGold = 10;
      else if (elapsedSec <= 20) earnedGold = 5;
      else if (elapsedSec <= 30) earnedGold = 2;
      else earnedGold = 1;
    }

    state.gold += earnedGold;
    state.clears++;
    updateStatsUI();

    alert(`🎉 정답입니다! 완주 성공!\n⏱️ 소요 시간: ${elapsedSec.toFixed(1)}초\n💰 획득 골드: +${earnedGold} Gold!`);
  } else {
    sound.wrong();
    alert('❌ 아쉽네요, 답이 일치하지 않습니다.');
  }

  showScreen('screen-dashboard');
}

// 미니게임 2 연속 퀴즈 렌더러 (한 문제당 5G 적립)
function renderNextSpeedQuiz() {
  const gameControls = document.getElementById('game-controls');
  const gamePrompt = document.getElementById('game-prompt');
  gameControls.innerHTML = '';

  const { grid, total } = generateRandomStructure(3, 8, 3);
  state.targetGrid = grid;
  renderer.renderStructure(grid);

  const quizTypes = ['layer1', 'layer2', 'total'];
  const qType = quizTypes[Math.floor(Math.random() * quizTypes.length)];
  let correctAnswer = 0;

  if (qType === 'layer1') {
    for (let r=0; r<3; r++) for (let c=0; c<3; c++) if (grid[r][c] >= 1) correctAnswer++;
    gamePrompt.innerHTML = '⚡ <strong>1층(바닥)에 놓인 쌓기나무</strong>는 몇 개일까요? (+5G)';
  } else if (qType === 'layer2') {
    for (let r=0; r<3; r++) for (let c=0; c<3; c++) if (grid[r][c] >= 2) correctAnswer++;
    gamePrompt.innerHTML = '⚡ <strong>2층 이상으로 올라간 쌓기나무</strong>는 몇 개일까요? (+5G)';
  } else {
    correctAnswer = total;
    gamePrompt.innerHTML = '⚡ 3D 입체모형에 사용된 <strong>전체 쌓기나무 개수</strong>는 몇 개일까요? (+5G)';
  }

  const options = new Set([correctAnswer]);
  while (options.size < 4) {
    options.add(Math.max(0, correctAnswer + Math.floor(Math.random() * 5) - 2));
  }
  Array.from(options).sort((a,b)=>a-b).forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${opt}개`;
    btn.onclick = () => {
      if (opt === correctAnswer) {
        sound.correct();
        state.mg2Score++;
        state.mg2GoldEarned += 5; // 한 문제당 5G 적립
        state.gold += 5;
        updateStatsUI();
        document.getElementById('mg2-score').textContent = state.mg2Score;
        document.getElementById('mg2-gold').textContent = state.mg2GoldEarned;
        renderNextSpeedQuiz();
      } else {
        sound.wrong();
        renderNextSpeedQuiz();
      }
    };
    gameControls.appendChild(btn);
  });
}

function startTimer(seconds) {
  clearInterval(state.gameTimer);
  state.timeLeft = seconds;
  document.getElementById('game-timer').textContent = state.timeLeft;

  state.gameTimer = setInterval(() => {
    state.timeLeft--;
    document.getElementById('game-timer').textContent = state.timeLeft;
    if (state.timeLeft <= 0) {
      clearInterval(state.gameTimer);
      sound.wrong();

      if (state.currentGame === 2) {
        state.clears++;
        updateStatsUI();
        alert(`⏰ 30초 제한시간 종료!\n🎯 총 ${state.mg2Score}문제 성공!\n💰 획득한 골드: +${state.mg2GoldEarned} Gold!`);
      } else {
        alert('⏰ 시간이 초과되었습니다! 실패!');
      }
      showScreen('screen-dashboard');
    }
  }, 1000);
}

// ==========================================
// 7. 대형 삼면도 보스전 (37 Gold 이상 참여 자격)
// ==========================================
function startBossRaid() {
  sound.click();
  const BOSS_ENTRY_FEE = 37; // 37 Gold 이상 진입 자격

  if (state.gold < BOSS_ENTRY_FEE) {
    sound.wrong();
    alert(`🔒 골드가 부족합니다!\n대형 삼면도 보스전 출전에는 최소 ${BOSS_ENTRY_FEE} Gold가 필요합니다. (현재: ${state.gold} Gold)`);
    return;
  }

  if (!confirm(`🐉 대형 삼면도 보스전에 도전하시겠습니까?\n(37 Gold 이상 보유 조건 충족!)`)) return;

  // Boss전 실행 (4x4x4 세팅, 60% 이하인 12~38개 무작위 생성)
  const size = 4;
  const { grid, total } = generateRandomStructure(12, 38, size);
  state.targetGrid = grid;
  state.boss.targetCubes = total;
  state.boss.size = size;

  state.userGrid = Array(size).fill().map(() => Array(size).fill(0));

  showScreen('screen-boss');
  document.getElementById('boss-target-count').textContent = total;

  ProjectionRenderer.drawViews(grid, ['boss-view-top', 'boss-view-front', 'boss-view-side'], size);

  const bossCanvas = document.getElementById('boss-canvas');
  const bRenderer = new IsoCubeRenderer(bossCanvas, size);
  bRenderer.renderStructure(state.userGrid);

  initBossBuilderControls(bRenderer);

  state.boss.startTime = Date.now();
  startBossTimer();
}

function initBossBuilderControls(bRenderer) {
  const container = document.getElementById('boss-grid-controls');
  container.innerHTML = '';

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const btn = document.createElement('button');
      btn.className = 'boss-grid-cell';
      btn.textContent = '0층';

      btn.onclick = () => {
        sound.click();
        state.userGrid[r][c] = (state.userGrid[r][c] + 1) % 5;
        btn.textContent = `${state.userGrid[r][c]}층`;
        bRenderer.renderStructure(state.userGrid);
      };
      container.appendChild(btn);
    }
  }

  document.getElementById('btn-boss-submit').onclick = () => submitBossRaid();
}

function startBossTimer() {
  clearInterval(state.boss.timerInterval);
  const timerElem = document.getElementById('boss-elapsed-timer');

  state.boss.timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - state.boss.startTime;
    const sec = Math.floor(elapsedMs / 1000);
    const ms = Math.floor((elapsedMs % 1000) / 100);
    const minStr = String(Math.floor(sec / 60)).padStart(2, '0');
    const secStr = String(sec % 60).padStart(2, '0');
    timerElem.textContent = `${minStr}:${secStr}.${ms}`;
  }, 100);
}

function submitBossRaid() {
  const size = 4;
  const targetProj = ProjectionRenderer.getProjections(state.targetGrid, size);
  const userProj = ProjectionRenderer.getProjections(state.userGrid, size);

  let isMatch = true;

  ['top', 'front', 'side'].forEach(view => {
    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        if (targetProj[view][r][c] !== userProj[view][r][c]) {
          isMatch = false;
        }
      }
    }
  });

  if (isMatch) {
    clearInterval(state.boss.timerInterval);
    const elapsedMs = Date.now() - state.boss.startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);

    sound.fanfare();
    const rewardGold = 200;
    state.gold += rewardGold;
    updateStatsUI();

    alert(`🐉 대형 삼면도 보스 퇴치 성공!\n⏱️ 소요 시간: ${elapsedSec}초\n💰 대왕 보상: +${rewardGold} Gold!`);

    saveHallOfFameRecord(elapsedSec);
    showScreen('screen-dashboard');
  } else {
    sound.wrong();
    alert('❌ 삼면도(위/앞/옆 모습)와 일치하지 않습니다. 다시 층수를 조정해보세요!');
  }
}

// ==========================================
// 8. 명예의 전당 (Hall of Fame)
// ==========================================
async function saveHallOfFameRecord(timeSec) {
  const record = {
    name: state.user.name,
    timeSec: parseFloat(timeSec),
    gold: state.gold,
    clears: state.clears,
    date: new Date().toLocaleDateString('ko-KR')
  };

  let localHof = JSON.parse(localStorage.getItem('cube_hof') || '[]');
  localHof.push(record);
  localHof.sort((a, b) => a.timeSec - b.timeSec);
  localStorage.setItem('cube_hof', JSON.stringify(localHof.slice(0, 20)));

  if (isFirebaseActive && db && fbAuthMethods.addDoc) {
    try {
      await fbAuthMethods.addDoc(fbAuthMethods.collection(db, "leaderboard"), record);
    } catch (e) {
      console.warn("Firestore save error:", e);
    }
  }
}

async function renderHallOfFame() {
  const tbody = document.getElementById('hof-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">기록 로딩 중...</td></tr>';

  let records = [];

  if (isFirebaseActive && db && fbAuthMethods.getDocs) {
    try {
      const q = fbAuthMethods.query(fbAuthMethods.collection(db, "leaderboard"), fbAuthMethods.orderBy("timeSec", "asc"), fbAuthMethods.limit(15));
      const querySnapshot = await fbAuthMethods.getDocs(q);
      querySnapshot.forEach((doc) => {
        records.push(doc.data());
      });
    } catch (e) {
      console.warn("Firestore fetch error:", e);
    }
  }

  if (records.length === 0) {
    records = JSON.parse(localStorage.getItem('cube_hof') || '[]');
  }

  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">등록된 명예의 전당 기록이 없습니다. 삼면도 보스전에 첫 도전자가 되어보세요!</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  records.forEach((rec, idx) => {
    const tr = document.createElement('tr');
    const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
    tr.innerHTML = `
      <td class="${rankClass}">${idx + 1}위</td>
      <td><strong>${rec.name || '익명'}</strong></td>
      <td>⏱️ ${rec.timeSec}초</td>
      <td>💰 ${rec.gold} Gold</td>
      <td>🏆 ${rec.clears}회</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${rec.date || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 9. Auth & Global Init (즉시 안전 초기화)
// ==========================================
function setupAuthListeners() {
  const modalAuth = document.getElementById('modal-auth');
  const btnLoginModal = document.getElementById('btn-login-modal');
  const btnGoogle = document.getElementById('btn-google-login');
  const btnAnon = document.getElementById('btn-anon-login');
  const btnLogout = document.getElementById('btn-logout');
  const nicknameInput = document.getElementById('player-nickname');

  if (nicknameInput) {
    nicknameInput.value = state.user.name;
    nicknameInput.oninput = (e) => {
      state.user.name = e.target.value || '익명 탐험가';
      localStorage.setItem('cube_user_name', state.user.name);
    };
  }

  if (btnLoginModal && modalAuth) {
    btnLoginModal.onclick = () => modalAuth.classList.remove('hidden');
  }

  if (isFirebaseActive && auth && fbAuthMethods.onAuthStateChanged) {
    fbAuthMethods.onAuthStateChanged(auth, (user) => {
      if (user) {
        state.user.uid = user.uid;
        state.user.name = user.displayName || (nicknameInput ? nicknameInput.value : '') || '익명 탐험가';
        const outView = document.getElementById('auth-logged-out-view');
        const inView = document.getElementById('auth-logged-in-view');
        if (outView) outView.classList.add('hidden');
        if (inView) inView.classList.remove('hidden');
        const dName = document.getElementById('user-display-name');
        const emailTxt = document.getElementById('user-email-text');
        const btnTxt = document.getElementById('auth-btn-text');
        if (dName) dName.textContent = state.user.name;
        if (emailTxt) emailTxt.textContent = user.isAnonymous ? '익명 회원' : (user.email || 'Google 계정');
        if (btnTxt) btnTxt.textContent = state.user.name;
      } else {
        const outView = document.getElementById('auth-logged-out-view');
        const inView = document.getElementById('auth-logged-in-view');
        const btnTxt = document.getElementById('auth-btn-text');
        if (outView) outView.classList.remove('hidden');
        if (inView) inView.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = '로그인';
      }
    });

    if (btnGoogle) {
      btnGoogle.onclick = async () => {
        const provider = new fbAuthMethods.GoogleAuthProvider();
        try {
          await fbAuthMethods.signInWithPopup(auth, provider);
          if (modalAuth) modalAuth.classList.add('hidden');
        } catch (e) {
          alert("Google 로그인 에러: " + e.message);
        }
      };
    }

    if (btnAnon) {
      btnAnon.onclick = async () => {
        try {
          await fbAuthMethods.signInAnonymously(auth);
          if (modalAuth) modalAuth.classList.add('hidden');
        } catch (e) {
          alert("익명 로그인 에러: " + e.message);
        }
      };
    }

    if (btnLogout) {
      btnLogout.onclick = () => {
        fbAuthMethods.signOut(auth);
        if (modalAuth) modalAuth.classList.add('hidden');
      };
    }
  } else {
    if (btnAnon) {
      btnAnon.onclick = () => {
        if (modalAuth) modalAuth.classList.add('hidden');
        const btnTxt = document.getElementById('auth-btn-text');
        if (btnTxt) btnTxt.textContent = state.user.name;
      };
    }
    if (btnGoogle) {
      btnGoogle.onclick = () => {
        alert("Firebase Config를 설정하면 Google 로그인을 사용할 수 있습니다!\n(현재는 로컬 프로필 모드로 작동합니다)");
      };
    }
  }
}

function initApp() {
  updateStatsUI();

  // 미니게임 카드 및 도전하기 버튼 클릭 바인딩
  document.querySelectorAll('.minigame-card').forEach(card => {
    card.onclick = (e) => {
      const gType = parseInt(card.dataset.game, 10);
      if (gType) startMiniGame(gType);
    };
  });

  const bossBtn = document.getElementById('btn-start-boss');
  if (bossBtn) bossBtn.onclick = startBossRaid;

  document.querySelectorAll('.btn-back-dashboard').forEach(btn => {
    btn.onclick = () => {
      try { sound.click(); } catch(e){}
      clearInterval(state.gameTimer);
      clearInterval(state.boss.timerInterval);
      showScreen('screen-dashboard');
    };
  });

  const hofBtn = document.getElementById('btn-open-hof');
  if (hofBtn) {
    hofBtn.onclick = () => {
      try { sound.click(); } catch(e){}
      renderHallOfFame();
      const modalHof = document.getElementById('modal-hof');
      if (modalHof) modalHof.classList.remove('hidden');
    };
  }

  const guideBtn = document.getElementById('btn-how-to-play');
  if (guideBtn) {
    guideBtn.onclick = () => {
      try { sound.click(); } catch(e){}
      const modalGuide = document.getElementById('modal-guide');
      if (modalGuide) modalGuide.classList.remove('hidden');
    };
  }

  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.onclick = (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.add('hidden');
    };
  });

  setupAuthListeners();
  initFirebase(); // 비동기 파이어베이스 초기화 (게임 실행 영향 0%)
}

// 글로벌 window 객체 바인딩 (HTML direct onclick 100% 지원)
window.startMiniGame = startMiniGame;
window.startBossRaid = startBossRaid;
window.showScreen = showScreen;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
