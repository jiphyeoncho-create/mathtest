# 🎲 쌓기나무 마스터: 공간과 입체 보스 레이드 🏆

초등학교 6학년 수학 『공간과 입체(쌓기나무)』 단원을 학습할 수 있는 **게이머블 교수학습 웹 애플리케이션**입니다.

---

## 🌟 주요 기능

1. **미니게임 3종 (20~30초 타임어택)**
   - **미니게임 1 (위/앞/옆 관찰)**: 2D 삼면도를 통해 쌓기나무 전체 개수 맞추기.
   - **미니게임 2 (층별 & 최소/최대)**: 1층 개수 및 전체 개수 퀴즈.
   - **미니게임 3 (3D 입체 빌더)**: 제시된 모양을 보고 3D 그리드에서 똑같이 쌓기나무 만들기.
2. **골드 시스템 & 보스전**
   - 미니게임 성공 시 골드 획득!
   - 150 Gold로 **[공간지각 대마왕]** 보스 레이드 진입.
3. **보스 레이드 (10문제 타임어택)**
   - 연산 게임이 아닌, **쌓기나무 공간지각 종합 10문제 연속 타임어택**.
   - 완주 소요 시간과 정답 수를 측정.
4. **명예의 전당 (Hall of Fame)**
   - 보스 클리어 소요 시간, 정답 수, 골드, 미니게임 클리어 수 저장.
   - **Firebase Authentication (Google / 익명 로그인)** 및 **Cloud Firestore** 실시간 데이터베이스 연동 (로컬 스토리지 Fallback 지원).

---

## 🛠️ 기술 스택
- **Frontend**: HTML5, CSS3 (Glassmorphism & Neon UI), JavaScript (ES6+ Vanilla Canvas 3D Isometric Engine)
- **Database & Auth**: Firebase Auth (Google Sign-In, Anonymous), Cloud Firestore
- **Deployment**: Vercel

---

## 🚀 GitHub 및 Firebase / Vercel 연동 방법 Guide

### 1. Firebase 콘솔 설정
1. [Firebase Console](https://console.firebase.google.com/)에 접속하여 새 프로젝트를 생성합니다.
2. **Authentication (인증)** 설정:
   - `Google 로그인`과 `익명 로그인(Anonymous)`을 사용 설정(Enable)합니다.
3. **Firestore Database** 생성:
   - 테스트 모드로 생성 후 `leaderboard` 컬렉션을 준비합니다.
4. **앱 등록 및 설정값 복사**:
   - 웹 앱(`</>`) 등록 후 발행된 `firebaseConfig` 스크립트를 [app.js](app.js) 상단의 `firebaseConfig` 객체에 붙여넣습니다.

### 2. GitHub에 프로젝트 올리기
터미널에서 아래 명령어로 저장소를 생성하고 푸시합니다:
```bash
git init
git add .
git commit -m "Feat: 초등 6학년 수학 쌓기나무 마스터 교수학습 앱 완성"
git branch -M main
git remote add origin https://github.com/사용자이름/stacking-cubes-math6.git
git push -u origin main
```

### 3. Vercel로 무료 배포하기
1. [Vercel](https://vercel.com/) 로그인 후 **"Add New Project"**를 선택합니다.
2. GitHub 저장소(`stacking-cubes-math6`)를 임포트(Import)합니다.
3. Framework Preset을 **Other** 또는 **HTML/CSS/JS**로 설정하고 **Deploy** 버튼을 누릅니다.
4. 완료되면 발급된 `.vercel.app` URL로 누구나 접속하여 게임을 플레이할 수 있습니다!
