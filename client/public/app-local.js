(function() {
    'use strict';
    
    // Local Storage Keys
    const STORAGE_KEYS = {
        SESSIONS: 'gravityease_sessions',
        SETTINGS: 'gravityease_settings',
        DAILY_STATS: 'gravityease_daily_stats'
    };

    // Application State
    const AppState = {
        currentAngle: 0,
        isVoiceEnabled: true,
        isMeasuring: false,
        sensorSupported: false,
        phase: 'ready',
        horizontalStartTime: null,
        currentTherapyAngle: null,
        therapyStartTime: null,
        angleHoldStartTime: null,
        lastAnnouncedAngle: null,
        currentSessionAngle: null,
        currentSessionStartTime: null,
        todaySessions: [],
        calibrationOffset: 0,
        horizontalMessageCompleted: false,
        isInTherapyRange: false,
        recordedSessions: new Set(),
        sessionCompleted: false,
        initialAnnouncementCompleted: false,
        initialHorizontalAnnounced: false,
        wakeLock: null,
        isBackgroundPrevented: false,
        angleBuffer: [],
        bufferSize: 5,
        lastStableAngle: 0,
        angleStabilityThreshold: 0.5,
        rawAngleHistory: []
    };

    // DOM Elements
    const elements = {
        currentAngle: document.getElementById('currentAngle'),
        voiceToggle: document.getElementById('voiceToggle'),
        angleStatus: document.getElementById('angleStatus'),
        startBtn: document.getElementById('startBtn'),
        pauseBtn: document.getElementById('pauseBtn'),
        permissionModal: document.getElementById('permissionModal'),
        completionModal: document.getElementById('completionModal'),
        currentSessionAngle: document.getElementById('currentSessionAngle'),
        currentSessionTime: document.getElementById('currentSessionTime'),
        sessionList: document.getElementById('sessionList'),
        totalSessionTime: document.getElementById('totalSessionTime'),
        averageAngle: document.getElementById('averageAngle')
    };

    // Local Storage API
    const LocalStorage = {
        saveSession(angle, duration) {
            const sessions = this.getSessions();
            const today = new Date().toISOString().split('T')[0];
            const time = new Date().toTimeString().split(' ')[0];
            
            const session = {
                id: Date.now(),
                angle: parseFloat(angle),
                durationSeconds: duration,
                sessionDate: today,
                sessionTime: time,
                timestamp: new Date().toISOString()
            };
            
            sessions.push(session);
            localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
            this.updateDailyStats(today);
            return session;
        },

        getSessions() {
            const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
            return data ? JSON.parse(data) : [];
        },

        getTodaySessions() {
            const today = new Date().toISOString().split('T')[0];
            return this.getSessions().filter(session => session.sessionDate === today);
        },

        updateDailyStats(date) {
            const todaySessions = this.getTodaySessions();
            const totalDuration = todaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
            const avgAngle = todaySessions.length > 0 
                ? todaySessions.reduce((sum, s) => sum + s.angle, 0) / todaySessions.length 
                : 0;

            const stats = {
                date,
                totalDurationSeconds: totalDuration,
                sessionCount: todaySessions.length,
                averageAngle: Math.round(avgAngle),
                lastUpdated: new Date().toISOString()
            };

            const allStats = this.getDailyStats();
            allStats[date] = stats;
            localStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(allStats));
        },

        getDailyStats() {
            const data = localStorage.getItem(STORAGE_KEYS.DAILY_STATS);
            return data ? JSON.parse(data) : {};
        },

        getTodayStats() {
            const today = new Date().toISOString().split('T')[0];
            const stats = this.getDailyStats();
            return stats[today] || {
                totalDurationSeconds: 0,
                sessionCount: 0,
                averageAngle: 0
            };
        }
    };

    // 센서 관리자 (기존 코드 유지)
    const SensorManager = {
        init() {
            if (typeof DeviceOrientationEvent !== 'undefined') {
                if (DeviceOrientationEvent.requestPermission) {
                    // iOS 13+ 권한 요청 필요
                    AppState.sensorSupported = false;
                } else {
                    // Android 또는 이전 iOS
                    AppState.sensorSupported = true;
                    this.startListening();
                }
            } else {
                console.log('DeviceOrientationEvent not supported');
                AppState.sensorSupported = false;
            }
        },

        async requestPermission() {
            if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
                try {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    if (permission === 'granted') {
                        AppState.sensorSupported = true;
                        this.startListening();
                        console.log('센서 권한 허용됨');
                    } else {
                        console.log('센서 권한 거부됨');
                        AppState.sensorSupported = false;
                    }
                } catch (error) {
                    console.error('센서 권한 요청 실패:', error);
                    AppState.sensorSupported = false;
                }
            }
        },

        startListening() {
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
        },

        handleOrientation(event) {
            if (!AppState.sensorSupported) return;
            
            const beta = event.beta || 0;
            let angle = Math.round(beta + AppState.calibrationOffset);
            
            // 각도 범위 제한 (-90 ~ 90)
            angle = Math.max(-90, Math.min(90, angle));
            
            // 평활화 처리
            AppState.angleBuffer.push(angle);
            if (AppState.angleBuffer.length > AppState.bufferSize) {
                AppState.angleBuffer.shift();
            }
            
            // 평균 계산
            const smoothedAngle = AppState.angleBuffer.reduce((sum, a) => sum + a, 0) / AppState.angleBuffer.length;
            AppState.currentAngle = Math.round(smoothedAngle);
        }
    };

    // 음성 관리자 (기존 코드 유지)
    const VoiceManager = {
        synthesis: null,
        
        initVoice() {
            if ('speechSynthesis' in window) {
                this.synthesis = window.speechSynthesis;
            }
        },
        
        speak(text) {
            if (!AppState.isVoiceEnabled || !this.synthesis) return;
            
            this.synthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ko-KR';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            this.synthesis.speak(utterance);
        }
    };

    // UI 업데이트 함수들
    function updateAngleDisplay() {
        if (elements.currentAngle) {
            elements.currentAngle.textContent = AppState.currentAngle + '°';
        }
        
        if (elements.angleStatus) {
            const statusElement = elements.angleStatus;
            const dot = statusElement.querySelector('div');
            const span = statusElement.querySelector('span');
            
            if (AppState.isMeasuring) {
                if (AppState.phase === 'horizontal') {
                    dot.className = 'w-2 h-2 bg-yellow-400 rounded-full mr-2';
                    span.textContent = '수평 유지 중';
                } else if (AppState.phase === 'therapy') {
                    dot.className = 'w-2 h-2 bg-green-400 rounded-full mr-2';
                    span.textContent = '이완요법 진행 중';
                }
            } else {
                dot.className = 'w-2 h-2 bg-gray-400 rounded-full mr-2';
                span.textContent = '측정 대기 중';
            }
        }
    }

    function updateCurrentSessionDisplay() {
        if (AppState.currentSessionAngle !== null) {
            elements.currentSessionAngle.textContent = `${AppState.currentSessionAngle}도`;
        } else {
            elements.currentSessionAngle.textContent = '- 0도';
        }
        
        if (AppState.currentSessionStartTime) {
            const elapsed = Math.floor((Date.now() - AppState.currentSessionStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            elements.currentSessionTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            elements.currentSessionTime.textContent = '00:00';
        }
    }

    async function updateSessionList() {
        const todayStats = LocalStorage.getTodayStats();
        const todaySessions = LocalStorage.getTodaySessions();
        
        // 총 시간 표시
        const totalMinutes = Math.floor(todayStats.totalDurationSeconds / 60);
        const totalSeconds = todayStats.totalDurationSeconds % 60;
        elements.totalSessionTime.textContent = `${totalMinutes.toString().padStart(2, '0')}:${totalSeconds.toString().padStart(2, '0')}`;
        
        // 평균 각도 표시
        elements.averageAngle.textContent = todayStats.averageAngle || '0';
        
        // 세션 리스트 표시
        elements.sessionList.innerHTML = '';
        
        if (todaySessions.length === 0) {
            elements.sessionList.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">아직 기록된 세션이 없습니다</div>';
            return;
        }
        
        todaySessions.reverse().forEach((session, index) => {
            const minutes = Math.floor(session.durationSeconds / 60);
            const seconds = session.durationSeconds % 60;
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const sessionElement = document.createElement('div');
            sessionElement.className = 'flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200';
            sessionElement.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span class="text-xs font-semibold text-blue-600">${todaySessions.length - index}</span>
                    </div>
                    <div>
                        <div class="font-medium text-gray-900">${session.angle}도</div>
                        <div class="text-xs text-gray-500">${session.sessionTime.substring(0, 5)}</div>
                    </div>
                </div>
                <div class="text-sm font-medium text-gray-600">${timeStr}</div>
            `;
            elements.sessionList.appendChild(sessionElement);
        });
    }

    // 이벤트 리스너 초기화
    function initEventListeners() {
        // 음성 토글
        if (elements.voiceToggle) {
            elements.voiceToggle.addEventListener('click', () => {
                AppState.isVoiceEnabled = !AppState.isVoiceEnabled;
                updateVoiceToggleUI();
                VoiceManager.speak(AppState.isVoiceEnabled ? '음성 안내가 켜졌습니다' : '음성 안내가 꺼졌습니다');
            });
        }

        // 시작/종료 버튼
        if (elements.startBtn) {
            elements.startBtn.addEventListener('click', startTherapy);
        }
        
        if (elements.pauseBtn) {
            elements.pauseBtn.addEventListener('click', stopTherapy);
        }

        // 모달 버튼들
        const requestPermissionBtn = document.getElementById('requestPermissionBtn');
        if (requestPermissionBtn) {
            requestPermissionBtn.addEventListener('click', async () => {
                elements.permissionModal.classList.add('hidden');
                await SensorManager.requestPermission();
            });
        }

        const closePermissionModal = document.getElementById('closePermissionModal');
        if (closePermissionModal) {
            closePermissionModal.addEventListener('click', () => {
                elements.permissionModal.classList.add('hidden');
            });
        }

        const closeCompletionModal = document.getElementById('closeCompletionModal');
        if (closeCompletionModal) {
            closeCompletionModal.addEventListener('click', () => {
                elements.completionModal.classList.add('hidden');
            });
        }
    }

    function updateVoiceToggleUI() {
        if (!elements.voiceToggle) return;
        
        const iconDiv = elements.voiceToggle.querySelector('div');
        const icon = iconDiv.querySelector('svg');
        const span = elements.voiceToggle.querySelector('span');
        
        if (AppState.isVoiceEnabled) {
            elements.voiceToggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-green-100 text-green-700 border border-green-300';
            iconDiv.className = 'w-6 h-6 bg-green-200 rounded-full flex items-center justify-center';
            icon.setAttribute('class', 'w-3 h-3 text-green-700');
        } else {
            elements.voiceToggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-gray-100 text-gray-700 border border-gray-200';
            iconDiv.className = 'w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center';
            icon.setAttribute('class', 'w-3 h-3 text-gray-600');
        }
    }

    function startTherapy() {
        if (!AppState.sensorSupported) {
            elements.permissionModal.classList.remove('hidden');
            return;
        }
        
        AppState.isMeasuring = true;
        AppState.phase = 'preparing';
        AppState.currentSessionStartTime = Date.now();
        updateButtonStates();
        VoiceManager.speak('이완요법을 시작합니다');
    }

    async function stopTherapy() {
        if (!AppState.isMeasuring) return;
        
        AppState.isMeasuring = false;
        AppState.phase = 'ready';
        
        // 세션 저장 (1분 이상인 경우만)
        if (AppState.currentSessionStartTime && AppState.currentSessionAngle !== null) {
            const duration = Math.floor((Date.now() - AppState.currentSessionStartTime) / 1000);
            if (duration >= 60) {
                LocalStorage.saveSession(AppState.currentSessionAngle, duration);
                VoiceManager.speak('세션이 저장되었습니다');
            }
        }
        
        // 상태 초기화
        AppState.currentSessionAngle = null;
        AppState.currentSessionStartTime = null;
        
        updateButtonStates();
        updateCurrentSessionDisplay();
        await updateSessionList();
    }

    function updateButtonStates() {
        if (AppState.isMeasuring) {
            elements.startBtn.disabled = true;
            elements.startBtn.style.backgroundColor = '#d1d5db';
            elements.startBtn.style.color = '#9ca3af';
            
            elements.pauseBtn.disabled = false;
            elements.pauseBtn.style.backgroundColor = '#ef4444';
            elements.pauseBtn.style.color = 'white';
        } else {
            elements.startBtn.disabled = false;
            elements.startBtn.style.backgroundColor = '#3b82f6';
            elements.startBtn.style.color = 'white';
            
            elements.pauseBtn.disabled = true;
            elements.pauseBtn.style.backgroundColor = '#f3f4f6';
            elements.pauseBtn.style.color = '#9ca3af';
        }
    }

    function updateCurrentDate() {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = now.getMonth() + 1;
        const day = now.getDate();
        
        const currentDateElement = document.getElementById('currentDate');
        if (currentDateElement) {
            currentDateElement.textContent = `${year}년 ${month}월 ${day}일`;
        }
    }

    // 앱 초기화
    async function initApp() {
        try {
            SensorManager.init();
            VoiceManager.initVoice();
            
            updateCurrentDate();
            updateVoiceToggleUI();
            updateCurrentSessionDisplay();
            await updateSessionList();
            initEventListeners();
            
            // 각도 업데이트 시작
            setInterval(updateAngleDisplay, 100);
            setInterval(updateCurrentSessionDisplay, 1000);
            
            console.log('로컬 PWA 초기화 완료');
        } catch (error) {
            console.error('앱 초기화 실패:', error);
        }
    }

    // 앱 시작
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
