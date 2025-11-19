# GravityEase 로컬 PWA 동작 플로우 & 수정 계획

## 1. 전체 동작 플로우 정리

### 1-1. 측정 시작 플로우
- **시작 버튼 클릭 → `startTherapy()`**
  - iOS 등에서 센서 권한 필요하면 `SensorManager.requestPermission()` 호출
  - 권한 허용 시 `TherapyManager.start()` 호출

- **`TherapyManager.start()`**
  - `AppState.phase = 'preparing'`
  - `AppState.isMeasuring = true`
  - 100ms마다 `processAngle(AppState.currentAngle)` 호출하는 interval 시작

### 1-2. 각도 & phase 전환 로직 (`TherapyManager.processAngle`)
- **phase: `preparing`**
  - 기기 각도 **0~2도** 범위에서 2초 이상 유지 → `phase = 'horizontal'`

- **phase: `horizontal`**
  - 각도가 0~2도 범위를 벗어나면 다시 `preparing`
  - 각도가 **-1 ~ -15도** 범위에 진입하면 → `phase = 'therapy'`

- **phase: `therapy` (유효각도 구간)**
  - 처음 유효각도 범위(-1 ~ -15도)에 진입할 때:
    - `AppState.currentSessionAngle = 현재 각도`
    - `AppState.currentSessionStartTime = now`
  - 같은 각도 근처에서 계속 유지 → 시간만 누적
  - 각도가 바뀌거나(다른 각도) / 유효각도 범위에서 벗어날 때:
    - `duration = now - AppState.currentSessionStartTime`
    - **10초 이상(`>= 10000ms`)**이면 `completeCurrentSession(angle, duration)` 호출

### 1-3. 세션 완료/저장 로직 (`completeCurrentSession`)
- **입력:** `angle`, `duration(ms)`
- 내부 처리:
  - `durationSeconds = Math.floor(duration / 1000)`
  - 오늘 세션 UI용으로 `AppState.todaySessions.push({ angle, duration: durationSeconds, ... })`
  - `updateCurrentSessionDisplay()` 호출 → 현재 세션 타이머/각도 표시 갱신
  - `updateSessionList()` 호출 → "오늘의 세션" 리스트 갱신
  - **로컬 DB(localStorage) 저장:**
    - `if (AppState.currentUser) { API.saveRecord(angle, durationSeconds) }`

### 1-4. 로컬 스토리지 저장 (`API.saveRecord`)
- 스토리지 키
  - `gravityease_sessions` (세션 개별 기록)
  - `gravityease_daily_stats` (일일 요약 통계)
- `saveRecord(angle, duration)` 로직
  - `gravityease_sessions` 배열을 불러옴
  - `sessionDate`, `sessionTime`, `durationSeconds`, `angle` 등을 가진 record push
  - 다시 `gravityease_sessions`에 저장
  - 같은 날짜 기준으로 `updateDailyStats` 호출 → `gravityease_daily_stats` 업데이트

### 1-5. "오늘의 세션" 영역 표시 (`updateSessionList`)
- `todayMeasurements = API.getTodayMeasurements()`
  - `gravityease_sessions`에서 오늘 날짜(`sessionDate === today`) 데이터만 필터
- `todaySession = API.getTodaySession()`
  - `gravityease_daily_stats`에서 오늘 날짜 통계 가져옴
- **오늘 데이터가 없을 때 (`todayMeasurements.length === 0`)**
  - `API.getLastSession()`으로 마지막 세션 정보를 가져와 보여주려 함
  - 없으면 "아직 완료된 세션이 없습니다" 문구 표시
  - 평균각도, 총 시간은 0으로 세팅
- **오늘 데이터가 있을 때**
  - 각 세션을 `sessionTime` 기준 내림차순 정렬
  - 각 세션에 대해 (시간, 각도, 소요시간)을 카드 형태로 렌더링
  - 총 시간 / 평균 각도 계산해서 상단 요약 표시

### 1-6. 기록 버튼(History) 모달 플로우
- 헤더의 기록 버튼(`id="navHistory"`) 클릭 시:
  - `showHistoryModal()` 호출 → 전체 화면 오버레이 모달 생성
  - 모달 내부에서 `loadHistoryData()` 호출

- `loadHistoryData()`
  - `gravityease_sessions` 전체를 로드
  - `sessionDate` 기준으로 그룹화 (날짜별 블록)
  - 각 날짜마다 세션 리스트를 (시간, 각도, 소요시간) 형태로 렌더링
  - 데이터 없으면 "아직 기록된 세션이 없습니다" 메시지 표시

---

## 2. 핵심 기능 요약

- **역경사 중력 이완요법 안내**  
  - 센서로 기기 각도를 측정하고, 준비 → 수평 → 이완(therapy) 단계로 안내
  - Web Speech API를 활용해 수평 진입, 각도 안내, 위험 각도 경고를 음성으로 제공

- **세션 측정 및 기록**  
  - 유효각도(-1 ~ -15도) 구간에서 일정 시간 이상 유지된 구간을 "세션"으로 간주
  - 각 세션의 각도·지속 시간·시각을 로컬(localStorage)에 저장
  - 당일 세션은 "오늘의 세션" 카드 리스트로, 과거 세션은 기록 모달에서 확인

- **모바일 친화 UI & PWA**  
  - 모바일 터치 이벤트(`click` + `touchend`)를 모두 처리해 버튼 오작동 최소화
  - 홈 화면에 설치 가능한 PWA로 동작, Netlify에서 정적 호스팅

---

## 3. 기술 스택 (Tech Stack)

- **프론트엔드 빌드/런타임**  
  - Vite 기반 번들링
  - 순수 JavaScript + DOM 조작

- **UI / 스타일링**  
  - TailwindCSS 스타일의 유틸리티 클래스 기반 레이아웃/디자인
  - 반응형 모바일 레이아웃(헤더, 카드형 섹션, 모달)

- **PWA / 배포**  
  - PWA로 동작 (설치 가능 웹앱)
  - Netlify를 통한 정적 호스팅 및 배포 자동화

- **사용 웹 API**  
  - `DeviceOrientationEvent` : 기기 각도(β축) 측정
  - Wake Lock API : 세션 중 화면 꺼짐 방지
  - Web Speech API : 한국어 음성 안내 출력
  - `localStorage` : 세션·통계·설정 데이터 영구 저장

---

## 4. 데이터 & 로컬 스토리지 구조

- **로컬 스토리지 키**  
  - `gravityease_sessions`  
    - 개별 세션 기록 배열
    - 필드 예시: `id`, `userId`, `angle`, `durationSeconds`, `sessionDate`, `sessionTime`, `createdAt`
  - `gravityease_daily_stats`  
    - 날짜별 누적 통계 맵
    - 필드 예시: `totalDurationSeconds`, `sessionCount`, `averageAngle`, `lastUpdated`
  - `gravityease_settings`  
    - 사용자 설정(음성 피드백, 알림 사용 여부, 알람 시간 등)

- **주요 모듈 요약 (`app.js` 내)**  
  - `SensorManager` : 센서 초기화/권한 요청/각도 필터링 및 상태 반영
  - `TherapyManager` : phase 전환(준비 → 수평 → 이완), 세션 시작/종료 관리
  - `VoiceManager` : 음성 합성 초기화 및 안내 멘트 관리
  - `API` : localStorage 기반 세션/통계/설정 CRUD 헬퍼
  - `updateSessionList` · 기록 모달 : 저장된 세션을 UI로 렌더링

이 문서는 GravityEase 로컬 PWA의 **핵심 기능 구조와 스택을 빠르게 파악하기 위한 개요 문서**로 사용한다.
