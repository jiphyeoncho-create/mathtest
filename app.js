// 쌓기나무 마스터: 메인 게임 로직 (최종 수정 기획안 완벽 반영)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. Firebase Config
// ==========================================
const firebaseConfig = window.__FIREBASE_CONFIG__ || {
  apiKey: "AIzaSyAFFAvwM5DznWnLmVbt6RdPKnJVPqII7vM",
  authDomain: "game-5364a.firebaseapp.com",
  projectId: "game-5364a",
  storageBucket: "game-5364a.firebasestorage.app",
  messagingSenderId: "241580484950",
  appId: "1:241580484950:web:996455c6366b095b9f4ef7"
};

let app, auth, db;
let isFirebaseActive = false;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseActive = true;
  }
} catch (e) {
  console.warn("Firebase Local Storage Fallback Mode:", e);
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

  toScreen(gx, gy, gz) {
    const originX = this.canvas.width / 2;
    const offsetY = this.gridSize === 4 ? 40 : 30;
    const originY = this.canvas.height / 2 + offsetY;
    const sx = originX + (gx - gy) * (this.tileWidth / 2);
    const sy = originY + (gx + gy) * (this.tileHeight / 2) - gz * this.cubeHeight;
    return { x: sx, y: sy };
  }

  drawCube(gx, gy, gz, color = '#6366f1') {
    const { x, y } = this.toScreen(gx, gy, gz);
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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
  }

  drawGridFloorWithAxis() {
    const size = this.gridSize;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const { x: sx, y: sy } = this.toScreen(x, y, 0);
        const w = this.tileWidth / 2;
        const h = this.tileHeight / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(sx + w, sy - h);
        this.ctx.lineTo(sx, sy - 2 * h);
        this.ctx.lineTo(sx - w, sy - h);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        this.ctx.stroke();
      }
    }

    // 사진 속 교과서 표준 방향 라벨 렌더링
    // 1. [앞] 라벨 (왼쪽 아래 방향)
    const frontPos = this.toScreen(0, size - 1, 0);
    const ctx = this.ctx;
    
    ctx.save();
    // [앞] 분홍색 배지
    ctx.fillStyle = '#fce7f3';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(frontPos.x - 30, frontPos.y + 14, 46, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 13px Jua, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('앞 ➔', frontPos.x - 7, frontPos.y + 30);

    // 2. [옆] 라벨 (오른쪽 아래 방향)
    const sidePos = this.toScreen(size - 1, size - 1, 0);
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#d97706';
    ctx.beginPath();
    ctx.roundRect(sidePos.x + 8, sidePos.y + 10, 46, 22, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#92400e';
    ctx.fillText('옆 ➔', sidePos.x + 31, sidePos.y + 26);

    // 3. 층수 라벨 (1층, 2층, 3층...)
    for (let z = 0; z < size; z++) {
      const p = this.toScreen(0, 0, z);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '11px Jua, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${z + 1}층 ➔`, p.x - (this.tileWidth / 2) - 8, p.y - 8);
    }
    ctx.restore();
  }

  renderStructure(grid) {
    this.clear();
    this.drawGridFloorWithAxis();
    const size = this.gridSize;

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

// 2D Projection Views Renderer (사진속 교과서 표준 삼면도)
class ProjectionRenderer {
  static drawViews(grid, targetCanvasIds = ['view-top', 'view-front', 'view-side'], size = 3) {
    const topCanvas = document.getElementById(targetCanvasIds[0]);
    const frontCanvas = document.getElementById(targetCanvasIds[1]);
    const sideCanvas = document.getElementById(targetCanvasIds[2]);

    if (!topCanvas || !frontCanvas || !sideCanvas) return;

    // 1. 위에서 본 모양 (아래: [앞], 오른쪽: [옆])
    this.drawGrid2D(topCanvas, (r, c) => grid[r][c] > 0, size);
    
    // 2. 앞에서 본 모양 (열 c: 0..size-1 왼쪽➔오른쪽 최고층)
    const frontView = Array(size).fill(0);
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) {
        frontView[c] = Math.max(frontView[c], grid[r][c]);
      }
    }
    this.drawElevation2D(frontCanvas, frontView, size);

    // 3. 옆(오른쪽)에서 본 모양 (앞쪽 r=size-1 ➔ 뒤쪽 r=0 방향)
    const sideView = Array(size).fill(0);
    for (let i = 0; i < size; i++) {
      const r = size - 1 - i; // i=0: 앞쪽 줄, i=size-1: 뒤쪽 줄
      for (let c = 0; c < size; c++) {
        sideView[i] = Math.max(sideView[i], grid[r][c]);
      }
    }
    this.drawElevation2D(sideCanvas, sideView, size);
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
    // Top View (위)
    const top = Array(size).fill().map(() => Array(size).fill(false));
    for (let r=0; r<size; r++) for (let c=0; c<size; c++) if (grid[r][c] > 0) top[r][c] = true;

    // Front View (앞: 열 c별 높이)
    const front = Array(size).fill().map(() => Array(size).fill(false));
    for (let c=0; c<size; c++) {
      let maxH = 0;
      for (let r=0; r<size; r++) maxH = Math.max(maxH, grid[r][c]);
      for (let h=0; h<maxH; h++) front[size - 1 - h][c] = true;
    }

    // Side View (옆: 앞쪽 r=size-1 ➔ 뒤쪽 r=0 순으로 열 i에 채움)
    const side = Array(size).fill().map(() => Array(size).fill(false));
    for (let i=0; i<size; i++) {
      const r = size - 1 - i;
      let maxH = 0;
      for (let c=0; c<size; c++) maxH = Math.max(maxH, grid[r][c]);
      for (let h=0; h<maxH; h++) side[size - 1 - h][i] = true;
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
    // [미니게임 1] 입체모형 보고 (위/앞/옆) 3x3 모눈종이에 그리기 (40초, 가로 3열 배치)
    // ========================================================
    document.getElementById('game-title').textContent = '미니게임 1: (위/앞/옆) 3x3 모눈종이에 모양 그리기';
    gamePrompt.innerHTML = '🎨 3D 입체도형의 <strong>[앞]과 [옆] 방향</strong>을 참고해 3x3 모눈종이를 클릭해 칠해보세요!';
    
    renderer = new IsoCubeRenderer(canvas, 3);
    const { grid, total } = generateRandomStructure(4, 9, 3);
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

// 미니게임 1 모눈종이 3x3 칠하기 UI 초기화
function initPaperGridUI(grid, size = 3) {
  ['top', 'front', 'side'].forEach(view => {
    state.paperState[view] = Array(size).fill().map(() => Array(size).fill(false));
    const container = document.getElementById(`paper-${view}`);
    container.innerHTML = '';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'paper-cell';
        cell.onclick = () => {
          sound.click();
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

  ['top', 'front', 'side'].forEach(view => {
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

  if (isFirebaseActive && db) {
    try {
      await addDoc(collection(db, "leaderboard"), record);
    } catch (e) {
      console.warn("Firestore save error:", e);
    }
  }
}

async function renderHallOfFame() {
  const tbody = document.getElementById('hof-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">기록 로딩 중...</td></tr>';

  let records = [];

  if (isFirebaseActive && db) {
    try {
      const q = query(collection(db, "leaderboard"), orderBy("timeSec", "asc"), limit(15));
      const querySnapshot = await getDocs(q);
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
// 9. Auth & Global Init
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

  btnLoginModal.onclick = () => modalAuth.classList.remove('hidden');

  if (isFirebaseActive && auth) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        state.user.uid = user.uid;
        state.user.name = user.displayName || nicknameInput.value || '익명 탐험가';
        document.getElementById('auth-logged-out-view').classList.add('hidden');
        document.getElementById('auth-logged-in-view').classList.remove('hidden');
        document.getElementById('user-display-name').textContent = state.user.name;
        document.getElementById('user-email-text').textContent = user.isAnonymous ? '익명 회원' : (user.email || 'Google 계정');
        document.getElementById('auth-btn-text').textContent = state.user.name;
      } else {
        document.getElementById('auth-logged-out-view').classList.remove('hidden');
        document.getElementById('auth-logged-in-view').classList.add('hidden');
        document.getElementById('auth-btn-text').textContent = '로그인';
      }
    });

    btnGoogle.onclick = async () => {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
        modalAuth.classList.add('hidden');
      } catch (e) {
        alert("Google 로그인 에러: " + e.message);
      }
    };

    btnAnon.onclick = async () => {
      try {
        await signInAnonymously(auth);
        modalAuth.classList.add('hidden');
      } catch (e) {
        alert("익명 로그인 에러: " + e.message);
      }
    };

    btnLogout.onclick = () => {
      signOut(auth);
      modalAuth.classList.add('hidden');
    };
  } else {
    btnAnon.onclick = () => {
      modalAuth.classList.add('hidden');
      document.getElementById('auth-btn-text').textContent = state.user.name;
    };
    btnGoogle.onclick = () => {
      alert("Firebase Config를 설정하면 Google 로그인을 사용할 수 있습니다!\n(현재는 로컬 프로필 모드로 작동합니다)");
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateStatsUI();

  document.querySelectorAll('.minigame-card').forEach(card => {
    card.onclick = () => {
      const gType = parseInt(card.dataset.game, 10);
      startMiniGame(gType);
    };
  });

  document.getElementById('btn-start-boss').onclick = startBossRaid;

  document.querySelectorAll('.btn-back-dashboard').forEach(btn => {
    btn.onclick = () => {
      sound.click();
      clearInterval(state.gameTimer);
      clearInterval(state.boss.timerInterval);
      showScreen('screen-dashboard');
    };
  });

  document.getElementById('btn-open-hof').onclick = () => {
    sound.click();
    renderHallOfFame();
    document.getElementById('modal-hof').classList.remove('hidden');
  };

  document.getElementById('btn-how-to-play').onclick = () => {
    sound.click();
    document.getElementById('modal-guide').classList.remove('hidden');
  };

  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.onclick = (e) => {
      e.target.closest('.modal-overlay').classList.add('hidden');
    };
  });

  setupAuthListeners();
});
