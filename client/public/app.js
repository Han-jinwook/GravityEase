(function() {
    'use strict';
    
    // Application State
    const AppState = {
        currentAngle: 0,
        isVoiceEnabled: true,
        isMeasuring: false,
        sensorSupported: false,
        phase: 'ready', // 'ready', 'preparing', 'horizontal', 'therapy'
        horizontalStartTime: null,
        currentTherapyAngle: null,
        therapyStartTime: null,
        angleHoldStartTime: null,
        lastAnnouncedAngle: null,

        currentSessionAngle: null,
        currentSessionStartTime: null,
        todaySessions: [],
        calibrationOffset: 0,
        currentUser: null,
        horizontalMessageCompleted: false,
        isInTherapyRange: false,
        recordedSessions: new Set(), // 이미 기록된 세션을 추적
        sessionCompleted: false, // 현재 세션 완료 여부
        initialAnnouncementCompleted: false, // 첫 멘트 완료 여부
        initialHorizontalAnnounced: false, // 최초 수평 멘트 완료 여부
        wakeLock: null, // 화면 꺼짐 방지
        isBackgroundPrevented: false, // 백그라운드 방지 상태
        
        // 센서 정확도 개선
        angleBuffer: [], // 각도 평활화를 위한 버퍼
        bufferSize: 5, // 평활화 샘플 수
        lastStableAngle: 0, // 마지막 안정된 각도
        angleStabilityThreshold: 0.5, // 안정도 임계값
        rawAngleHistory: [] // 원시 각도 기록
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
        averageAngle: document.getElementById('averageAngle'),
        navHistoryBtn: document.getElementById('navHistoryBtn')

    };

    // Local Storage Keys
    const STORAGE_KEYS = {
        SESSIONS: 'gravityease_sessions',
        SETTINGS: 'gravityease_settings',
        DAILY_STATS: 'gravityease_daily_stats'
    };

    // API Helper (로컬 버전)
    const API = {
        async getCurrentUser() {
            // 로컬 사용자 - 항상 기본 사용자 반환
            return {
                id: 'local_user',
                name: '로컬 사용자',
                email: 'local@gravityease.app'
            };
        },

        async saveRecord(angle, duration) {
            try {
                const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
                const today = new Date().toISOString().split('T')[0];
                const time = new Date().toTimeString().split(' ')[0];
                
                const record = {
                    id: Date.now(),
                    userId: 'local_user',
                    angle: parseFloat(angle),
                    durationSeconds: duration,
                    sessionDate: today,
                    sessionTime: time,
                    createdAt: new Date().toISOString()
                };
                
                sessions.push(record);
                localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
                
                // 일일 통계 업데이트
                this.updateDailyStats(today);
                
                return record;
            } catch (error) {
                console.error('Error saving record:', error);
                return null;
            }
        },

        async getStats() {
            try {
                const stats = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_STATS) || '{}');
                return stats;
            } catch (error) {
                console.error('Error fetching stats:', error);
                return {};
            }
        },

        async getUserSettings() {
            try {
                const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
                return {
                    voiceFeedback: settings.voiceFeedback !== false,
                    notifications: settings.notifications !== false,
                    alarmTime: settings.alarmTime || '07:00'
                };
            } catch (error) {
                console.error('Error fetching settings:', error);
                return { voiceFeedback: true, notifications: true, alarmTime: '07:00' };
            }
        },

        async updateUserSettings(settings) {
            try {
                localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
                return settings;
            } catch (error) {
                console.error('Error updating settings:', error);
                return null;
            }
        },

        async getTodaySession() {
            try {
                const today = new Date().toISOString().split('T')[0];
                const stats = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_STATS) || '{}');
                return stats[today] || { totalDurationSeconds: 0, sessionCount: 0, averageAngle: 0 };
            } catch (error) {
                console.error('Error fetching today session:', error);
                return { totalDurationSeconds: 0, sessionCount: 0, averageAngle: 0 };
            }
        },

        async getTodayMeasurements() {
            try {
                const today = new Date().toISOString().split('T')[0];
                const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
                return sessions.filter(session => session.sessionDate === today);
            } catch (error) {
                console.error('Error fetching today measurements:', error);
                return [];
            }
        },

        async getLastSession() {
            try {
                const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
                return sessions.length > 0 ? sessions[sessions.length - 1] : null;
            } catch (error) {
                console.error('Error fetching last session:', error);
                return null;
            }
        },

        // 일일 통계 업데이트 함수 추가
        updateDailyStats(date) {
            try {
                const sessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
                const todaySessions = sessions.filter(s => s.sessionDate === date);
                
                const totalDuration = todaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
                const avgAngle = todaySessions.length > 0 
                    ? Math.round(todaySessions.reduce((sum, s) => sum + s.angle, 0) / todaySessions.length)
                    : 0;

                const stats = JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_STATS) || '{}');
                stats[date] = {
                    totalDurationSeconds: totalDuration,
                    sessionCount: todaySessions.length,
                    averageAngle: avgAngle,
                    lastUpdated: new Date().toISOString()
                };
                
                localStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(stats));
            } catch (error) {
                console.error('Error updating daily stats:', error);
            }
        }
    };

    // Wake Lock Management - 화면 꺼짐 방지
    const WakeLockManager = {
        async requestWakeLock() {
            if ('wakeLock' in navigator) {
                try {
                    AppState.wakeLock = await navigator.wakeLock.request('screen');
                    console.log('화면 꺼짐 방지 활성화됨');
                    
                    AppState.wakeLock.addEventListener('release', () => {
                        console.log('화면 꺼짐 방지 해제됨');
                    });
                    
                    return true;
                } catch (err) {
                    console.error('화면 꺼짐 방지 실패:', err);
                    return false;
                }
            } else {
                console.log('Wake Lock API 지원하지 않음');
                return false;
            }
        },

        async releaseWakeLock() {
            if (AppState.wakeLock) {
                try {
                    await AppState.wakeLock.release();
                    AppState.wakeLock = null;
                    console.log('화면 꺼짐 방지 수동 해제');
                } catch (err) {
                    console.error('화면 꺼짐 방지 해제 실패:', err);
                }
            }
        },

        // 화면이 다시 보일 때 Wake Lock 재요청
        async handleVisibilityChange() {
            if (document.visibilityState === 'visible' && AppState.isMeasuring) {
                await this.requestWakeLock();
            }
        }
    };

    // 백그라운드 실행 방지
    const BackgroundManager = {
        keepAliveInterval: null,
        backgroundWarningShown: false,

        preventBackground() {
            // Page Visibility API로 백그라운드 상태 감지
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden' && AppState.isMeasuring) {
                    console.log('앱이 백그라운드로 전환됨 - 측정 중 경고');
                    this.handleBackgroundTransition();
                } else if (document.visibilityState === 'visible' && AppState.isMeasuring) {
                    console.log('앱이 다시 활성화됨');
                    this.handleForegroundTransition();
                    WakeLockManager.handleVisibilityChange();
                }
            });

            // 브라우저 페이지 언로드 시 경고
            window.addEventListener('beforeunload', (e) => {
                if (AppState.isMeasuring) {
                    e.preventDefault();
                    e.returnValue = '이완요법이 진행 중입니다. 정말 종료하시겠습니까?';
                    return e.returnValue;
                }
            });

            // 포커스 관련 이벤트
            window.addEventListener('blur', () => {
                if (AppState.isMeasuring) {
                    console.log('창 포커스 잃음 - 측정 중');
                }
            });

            window.addEventListener('focus', () => {
                if (AppState.isMeasuring) {
                    console.log('창 포커스 복원 - 측정 중');
                }
            });
        },

        handleBackgroundTransition() {
            // 백그라운드 전환 시 Keep-Alive 신호 시작
            this.startKeepAlive();
            
            // 사용자에게 경고 음성 안내 (한 번만)
            if (!this.backgroundWarningShown) {
                setTimeout(() => {
                    if (document.visibilityState === 'hidden' && AppState.isMeasuring) {
                        VoiceManager.speak('화면을 켜두세요. 백그라운드에서는 측정이 정확하지 않을 수 있습니다.');
                    }
                }, 1000);
                this.backgroundWarningShown = true;
            }
        },

        handleForegroundTransition() {
            // 포그라운드 복원 시 Keep-Alive 중단
            this.stopKeepAlive();
            this.backgroundWarningShown = false;
        },

        startKeepAlive() {
            if (this.keepAliveInterval) return;
            
            // 30초마다 화면 활성화를 위한 더미 작업 실행
            this.keepAliveInterval = setInterval(() => {
                if (AppState.isMeasuring && document.visibilityState === 'hidden') {
                    // 더미 DOM 조작으로 브라우저 활성 상태 유지
                    document.title = `측정 중... ${new Date().getSeconds()}초`;
                    
                    // 주기적으로 센서 체크
                    console.log('백그라운드 Keep-Alive - 센서 상태 체크');
                }
            }, 30000);
        },

        stopKeepAlive() {
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
                document.title = '역경사중력이완요법'; // 원래 제목 복원
            }
        }
    };

    // Sensor Management
    const SensorManager = {
        init() {
            console.log('SensorManager.init() called');
            if (typeof DeviceOrientationEvent !== 'undefined') {
                console.log('DeviceOrientationEvent is supported');
                if (DeviceOrientationEvent.requestPermission) {
                    console.log('iOS 13+ permission model detected');
                    // iOS 13+ permission model - don't auto-request, wait for user action
                    AppState.sensorSupported = false;
                } else {
                    console.log('Android/older iOS - starting sensor');
                    // Android and older iOS
                    this.startListening();
                }
            } else {
                console.log('DeviceOrientationEvent not supported - demo mode');
                this.showDemoMode();
            }
        },

        async requestPermission() {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this.startListening();
                    AppState.sensorSupported = true;
                    updateSensorStatus('connected');
                } else {
                    this.showPermissionModal();
                }
            } catch (error) {
                console.error('Permission request failed:', error);
                this.showPermissionModal();
            }
        },

        startListening() {
            window.addEventListener('deviceorientation', (event) => {
                // Use beta for front-back tilt (pitch) - this measures device inclination
                // When phone is flat: beta = 0
                // When phone bottom is raised (negative angle): beta > 0
                // When phone top is raised (positive angle): beta < 0
                let rawAngle = event.beta || 0;
                
                // Invert the angle so that raising the bottom creates negative values
                rawAngle = -rawAngle;
                
                // Apply calibration offset
                rawAngle = rawAngle + AppState.calibrationOffset;
                
                // 센서 노이즈 필터링 및 평활화
                const filteredAngle = this.filterAngle(rawAngle);
                AppState.currentAngle = filteredAngle;
                
                updateAngleDisplay();
            });
            
            AppState.sensorSupported = true;
            updateSensorStatus('connected');
        },

        // 센서 노이즈 필터링 및 평활화
        filterAngle(rawAngle) {
            // 원시 데이터 기록 (디버깅용)
            AppState.rawAngleHistory.push({
                angle: rawAngle,
                timestamp: Date.now()
            });
            
            // 최근 10개 데이터만 유지
            if (AppState.rawAngleHistory.length > 10) {
                AppState.rawAngleHistory.shift();
            }
            
            // 버퍼에 추가
            AppState.angleBuffer.push(rawAngle);
            
            // 버퍼 크기 유지
            if (AppState.angleBuffer.length > AppState.bufferSize) {
                AppState.angleBuffer.shift();
            }
            
            // 이동 평균 계산
            const averageAngle = AppState.angleBuffer.reduce((sum, angle) => sum + angle, 0) / AppState.angleBuffer.length;
            
            // 소수점 한자리로 반올림
            return Math.round(averageAngle * 10) / 10;
        },

        // 센서 정확도 진단
        getDiagnosticInfo() {
            if (AppState.rawAngleHistory.length === 0) return null;
            
            const recent = AppState.rawAngleHistory.slice(-5);
            const angles = recent.map(r => r.angle);
            const avg = angles.reduce((sum, a) => sum + a, 0) / angles.length;
            const variance = angles.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / angles.length;
            const stability = Math.sqrt(variance);
            
            return {
                recentAngles: angles,
                average: Math.round(avg * 10) / 10,
                stability: Math.round(stability * 100) / 100,
                bufferSize: AppState.angleBuffer.length,
                isStable: stability < AppState.angleStabilityThreshold
            };
        },



        showPermissionModal() {
            elements.permissionModal.classList.remove('hidden');
        },

        showDemoMode() {
            updateSensorStatus('demo');
            // Demo mode with simulated angles
            setInterval(() => {
                if (!AppState.sensorSupported) {
                    const demoAngle = -5 + Math.sin(Date.now() / 1000) * 3;
                    AppState.currentAngle = Math.round(demoAngle * 10) / 10;
                    updateAngleDisplay();
                    
                    // Demo mode updates happen continuously
                }
            }, 100);
        },


    };

    // Voice Management
    const VoiceManager = {
        selectedVoice: null,
        
        initVoice() {
            // Wait for voices to load
            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
                
                // Find the best Korean voice
                const koreanVoices = voices.filter(voice => 
                    voice.lang.includes('ko') || voice.lang.includes('KR')
                );
                
                // Prefer neural/premium voices (common names for better quality)
                const premiumVoice = koreanVoices.find(voice => 
                    voice.name.includes('Neural') || 
                    voice.name.includes('Premium') ||
                    voice.name.includes('Enhanced') ||
                    voice.name.includes('Heami') ||
                    voice.name.includes('Yuna')
                );
                
                this.selectedVoice = premiumVoice || koreanVoices[0] || null;
                console.log('Selected voice:', this.selectedVoice?.name);
            };
            
            if (window.speechSynthesis.getVoices().length > 0) {
                loadVoices();
            } else {
                window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
            }
        },

        speak(text, forcePlay = false) {
            if (!forcePlay && (!AppState.isVoiceEnabled || !window.speechSynthesis)) return;
            if (!window.speechSynthesis) return;
            
            window.speechSynthesis.cancel(); // Cancel any ongoing speech
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ko-KR';
            utterance.rate = 1.0; // Natural speed
            utterance.pitch = 1.1; // Slightly higher pitch for clarity
            utterance.volume = 0.9;
            
            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }
            
            window.speechSynthesis.speak(utterance);
        },

        stopSpeaking() {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        },

        announceTherapyStart() {
            this.speak('역경사중력이완요법 준비가 되셨네요! 우선 수평으로 진입해 1분 이상 심폐안정 취하세요!', true);
        },

        announceHorizontalReached() {
            this.speak('수평입니다. 1분 이상 복식호흡이나 명상으로 심신을 안정시킨 후 마이너스 1도에서 15도 사이로 진입해 이완요법을 시작하세요.');
        },

        announceAngle(angle) {
            if (angle >= 0 && angle <= 2) {
                // 최초 수평 멘트가 이미 완료된 후에는 실제 각도만 안내
                if (AppState.initialHorizontalAnnounced) {
                    this.speak(`${angle}도입니다`);
                } else {
                    this.speak('수평입니다');
                }
            } else if (angle < 0) {
                this.speak(`마이너스 ${Math.abs(angle)}도입니다`);
            } else {
                this.speak(`${angle}도입니다`);
            }
        },

        announceCompletion(angle) {
            // 완료 멘트 제거 - 조용히 기록만 처리
        },

        announceDangerousAngle() {
            this.speak('혈압 상승, 기구에서 이탈 등 위험하니 더 내려가지 않도록 주의하세요!');
        }
    };

    // Therapy Management
    const TherapyManager = {
        updateInterval: null,

        async start() {
            console.log('TherapyManager.start() called');
            AppState.phase = 'preparing';
            AppState.isMeasuring = true;
            console.log('AppState.isMeasuring:', AppState.isMeasuring);
            
            // 화면 꺼짐 방지 활성화
            await WakeLockManager.requestWakeLock();
            
            VoiceManager.announceTherapyStart();
            
            // 첫 멘트가 완료될 때까지 각도 안내 차단 (약 8초 예상)
            AppState.initialAnnouncementCompleted = false;
            setTimeout(() => {
                AppState.initialAnnouncementCompleted = true;
            }, 8000);
            
            this.updateInterval = setInterval(() => {
                this.processAngle(AppState.currentAngle);
            }, 100);
            
            updateUserInterface();
        },

        async stop() {
            AppState.phase = 'ready';
            AppState.isMeasuring = false;
            AppState.horizontalStartTime = null;
            AppState.currentTherapyAngle = null;
            AppState.therapyStartTime = null;
            AppState.angleHoldStartTime = null;
            AppState.lastAnnouncedAngle = null;
            AppState.horizontalMessageCompleted = false;
            AppState.isInTherapyRange = false;
            AppState.sessionCompleted = false;
            AppState.initialAnnouncementCompleted = false;
            AppState.initialHorizontalAnnounced = false;
            
            // 화면 꺼짐 방지 해제
            await WakeLockManager.releaseWakeLock();
            
            // Keep-Alive 정리
            BackgroundManager.stopKeepAlive();
            
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
            // 진행 중인 음성 중단
            VoiceManager.stopSpeaking();
            
            // 데일리세션 테이블의 totalDurationSeconds 필드에서 직접 읽기
            if (AppState.currentUser) {
                try {
                    const todaySession = await API.getTodaySession();
                    const totalValidDuration = todaySession.totalDurationSeconds || 0;
                    
                    if (totalValidDuration > 0) {
                        const minutes = Math.floor(totalValidDuration / 60);
                        const seconds = totalValidDuration % 60;
                        
                        let timeMessage = '';
                        if (minutes > 0 && seconds > 0) {
                            timeMessage = `${minutes}분 ${seconds}초`;
                        } else if (minutes > 0) {
                            timeMessage = `${minutes}분`;
                        } else if (seconds > 0) {
                            timeMessage = `${seconds}초`;
                        }
                        
                        VoiceManager.speak(`${timeMessage}간의 이완요법 준비단계 종료되었으니 이제 깊은 이완 숙면 단계로 들어가세요!!`, true);
                    } else {
                        VoiceManager.speak('종료합니다', true);
                    }
                } catch (error) {
                    VoiceManager.speak('종료합니다', true);
                }
            } else {
                VoiceManager.speak('종료합니다', true);
            }
            
            updateUserInterface();
        },

        processAngle(angle) {
            const now = Date.now();
            
            if (AppState.phase === 'preparing') {
                // 첫 멘트 완료 후에만 각도 안내 제공
                if (AppState.initialAnnouncementCompleted) {
                    if (AppState.currentAngle !== AppState.lastAnnouncedAngle) {
                        if (!AppState.angleHoldStartTime) {
                            AppState.angleHoldStartTime = now;
                        } else if (now - AppState.angleHoldStartTime >= 2000) {
                            VoiceManager.announceAngle(AppState.currentAngle);
                            AppState.lastAnnouncedAngle = AppState.currentAngle;
                            AppState.angleHoldStartTime = null;
                        }
                    } else {
                        AppState.angleHoldStartTime = null;
                    }
                }
                
                // 최초 수평 진입 체크 (0도 ~ +2도)
                if (angle >= 0 && angle <= 2) {
                    if (!AppState.horizontalStartTime) {
                        AppState.horizontalStartTime = now;
                    } else if (now - AppState.horizontalStartTime >= 2000) {
                        AppState.phase = 'horizontal';
                        VoiceManager.announceHorizontalReached();
                        AppState.initialHorizontalAnnounced = true; // 최초 수평 멘트 완료 표시
                        // 수평 메시지 재생 시작 표시
                        AppState.horizontalMessageCompleted = false;
                        // 메시지가 완료될 때까지 기다림 (10초로 단축)
                        setTimeout(() => {
                            AppState.horizontalMessageCompleted = true;
                        }, 10000);
                    }
                } else {
                    AppState.horizontalStartTime = null;
                }
            } 
            else if (AppState.phase === 'horizontal') {
                // 수평 범위(0-2도)를 벗어나면 preparing 상태로 복귀
                if (angle < 0 || angle > 2) {
                    AppState.phase = 'preparing';
                    AppState.horizontalStartTime = null;
                }
                
                // 수평 메시지가 완료된 후에만 각도 안내 (실제 각도만 안내)
                if (AppState.horizontalMessageCompleted) {
                    if (AppState.currentAngle !== AppState.lastAnnouncedAngle) {
                        if (!AppState.angleHoldStartTime) {
                            AppState.angleHoldStartTime = now;
                        } else if (now - AppState.angleHoldStartTime >= 2000) {
                            // '수평입니다' 멘트는 더 이상 하지 않고 실제 각도만 안내
                            if (!(angle >= 0 && angle <= 2)) {
                                VoiceManager.announceAngle(AppState.currentAngle);
                            }
                            AppState.lastAnnouncedAngle = AppState.currentAngle;
                            AppState.angleHoldStartTime = null;
                            
                            // 위험한 각도 경고
                            if (angle < -15) {
                                VoiceManager.announceDangerousAngle();
                            }
                        }
                    } else {
                        AppState.angleHoldStartTime = null;
                    }
                }
                
                // 이완요법 각도 범위 진입 (-1 ~ -15도)  
                if (angle >= -15 && angle <= -1) {
                    AppState.phase = 'therapy';
                    AppState.isInTherapyRange = true;
                    
                    // 유효 각도 범위 진입 시 수평 메시지 완료로 설정 (즉시 각도 안내 가능)
                    AppState.horizontalMessageCompleted = true;
                    
                    // 세션 시작 로직
                    const targetAngle = AppState.currentAngle;
                    if (AppState.currentSessionAngle !== targetAngle) {
                        // 이전 세션이 있었다면 기록 처리
                        if (AppState.currentSessionAngle && AppState.currentSessionStartTime) {
                            const prevDuration = now - AppState.currentSessionStartTime;
                            if (prevDuration >= 10000) {
                                this.completeCurrentSession(AppState.currentSessionAngle, prevDuration);
                            }
                        }
                        
                        // 새로운 세션 각도 시작
                        AppState.currentSessionAngle = targetAngle;
                        AppState.currentSessionStartTime = now;
                        AppState.sessionCompleted = false;
                    }
                }
            }
            else if (AppState.phase === 'therapy') {
                // 수평 메시지가 완료된 후에만 각도 안내 (실제 각도만 안내)
                if (AppState.horizontalMessageCompleted) {
                    if (AppState.currentAngle !== AppState.lastAnnouncedAngle) {
                        if (!AppState.angleHoldStartTime) {
                            AppState.angleHoldStartTime = now;
                        } else if (now - AppState.angleHoldStartTime >= 2000) {
                            // '수평입니다' 멘트는 더 이상 하지 않고 실제 각도만 안내
                            if (!(angle >= 0 && angle <= 2)) {
                                VoiceManager.announceAngle(AppState.currentAngle);
                            }
                            AppState.lastAnnouncedAngle = AppState.currentAngle;
                            AppState.angleHoldStartTime = null;
                            
                            // 위험한 각도 경고
                            if (angle < -15) {
                                VoiceManager.announceDangerousAngle();
                            }
                        }
                    } else {
                        AppState.angleHoldStartTime = null;
                    }
                }
                
                // 이완요법 각도 범위 체크 (-1 ~ -15도)  
                if (angle >= -15 && angle <= -1) {
                    AppState.isInTherapyRange = true;
                    
                    const targetAngle = AppState.currentAngle;
                    
                    if (AppState.currentSessionAngle !== targetAngle) {
                        // 이전 세션이 있었다면 기록 처리
                        if (AppState.currentSessionAngle && AppState.currentSessionStartTime) {
                            const prevDuration = now - AppState.currentSessionStartTime;
                            if (prevDuration >= 10000) {
                                this.completeCurrentSession(AppState.currentSessionAngle, prevDuration);
                            }
                        }
                        
                        // 새로운 세션 각도 시작
                        AppState.currentSessionAngle = targetAngle;
                        AppState.currentSessionStartTime = now;
                        AppState.sessionCompleted = false;
                    }
                    
                    // UI 업데이트 (항상 현재 시간 표시)
                    const duration = now - AppState.currentSessionStartTime;
                    this.updateAngleProgress(targetAngle, duration);
                } else {
                    // 이완요법 범위 벗어남 - 세션 종료 및 기록
                    AppState.isInTherapyRange = false;
                    if (AppState.currentSessionAngle && AppState.currentSessionStartTime) {
                        const duration = now - AppState.currentSessionStartTime;
                        // 10초 이상인 경우에만 기록
                        if (duration >= 10000) {
                            this.completeCurrentSession(AppState.currentSessionAngle, duration);
                        }
                        // 세션 초기화
                        AppState.currentSessionAngle = null;
                        AppState.currentSessionStartTime = null;
                        AppState.currentTherapyAngle = null;
                        AppState.therapyStartTime = null;
                        AppState.sessionCompleted = false;
                    }
                    
                    // 상태 전환 로직
                    if (angle >= 0 && angle <= 2) {
                        // 수평 범위로 복귀
                        AppState.phase = 'horizontal';
                    } else if (angle > 2) {
                        // 수평 범위 초과 시 preparing으로
                        AppState.phase = 'preparing';
                        AppState.horizontalStartTime = null;
                    } else {
                        // 0도 미만이지만 유효각도가 아닌 경우 preparing으로
                        AppState.phase = 'preparing';
                        AppState.horizontalStartTime = null;
                    }
                }
            }
        },



        updateAngleProgress(angle, duration) {
            // Legacy function - no longer needed with new session system
        },

        completeCurrentSession(angle, duration) {
            const durationSeconds = Math.floor(duration / 1000);
            const durationMinutes = Math.floor(durationSeconds / 60);
            const remainingSeconds = durationSeconds % 60;
            
            // 오늘의 세션에 기록 (초 단위로 저장) - 즉시 UI 업데이트
            const sessionRecord = {
                angle: angle,
                duration: durationSeconds, // 전체 초 단위로 저장
                timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            };
            AppState.todaySessions.push(sessionRecord);
            
            // 세션 기록 후 현재 세션 초기화
            AppState.currentSessionAngle = null;
            AppState.currentSessionStartTime = null;
            
            // UI 즉시 업데이트
            updateCurrentSessionDisplay();
            updateSessionList();
            
            // 데이터베이스에 비동기로 저장 (UI 업데이트와 분리)
            if (AppState.currentUser) {
                API.saveRecord(angle, durationSeconds).catch(error => {
                    console.error('데이터베이스 저장 실패:', error);
                });
            }
        }
    };

    // UI Update Functions
    function updateAngleDisplay() {
        AppState.currentAngle = Math.round(AppState.currentAngle);
        elements.currentAngle.textContent = `${AppState.currentAngle}°`;
        
        // Update angle status based on therapy phase
        const statusElement = elements.angleStatus;
        const statusDot = statusElement.querySelector('.w-2');
        const statusText = statusElement.querySelector('span');
        
        const currentAngle = AppState.currentAngle;
        
        if (AppState.phase === 'ready') {
            statusDot.className = 'w-2 h-2 bg-gray-400 rounded-full mr-2';
            statusText.textContent = '이완요법 대기 중';
            statusElement.className = 'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600';
        } else if (AppState.phase === 'preparing') {
            statusDot.className = 'w-2 h-2 bg-gray-400 rounded-full mr-2';
            statusText.textContent = '이완요법 대기 중';
            statusElement.className = 'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600';
        } else if (AppState.phase === 'horizontal') {
            statusDot.className = 'w-2 h-2 bg-green-400 rounded-full mr-2';
            statusText.textContent = '수평 상태 - 안정화 중';
            statusElement.className = 'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800';
        } else if (AppState.phase === 'therapy') {
            const currentAngle = AppState.currentAngle;
            
            if (currentAngle >= -15 && currentAngle <= -1) {
                // 유효 각도 범위 내
                statusDot.className = 'w-2 h-2 bg-green-400 rounded-full mr-2';
                statusText.textContent = '유효각도 범위 내';
                statusElement.className = 'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800';
            } else if (currentAngle < -15) {
                // 위험 각도
                statusDot.className = 'w-2 h-2 bg-red-400 rounded-full mr-2';
                statusText.textContent = '위험 각도 - 조심하세요';
                statusElement.className = 'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-red-100 text-red-800';
            }
        }
        
        // Update current session display
        updateCurrentSessionDisplay();
    }

    function updateCurrentSessionDisplay() {
        if (AppState.currentSessionAngle && AppState.currentSessionStartTime) {
            const duration = Date.now() - AppState.currentSessionStartTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            
            elements.currentSessionAngle.textContent = `- ${Math.abs(AppState.currentSessionAngle)}도`;
            elements.currentSessionAngle.className = 'text-2xl font-bold text-blue-600 text-center';
            elements.currentSessionTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            elements.currentSessionTime.className = 'text-2xl font-mono font-bold text-blue-600 text-right';
        } else {
            elements.currentSessionAngle.textContent = '- 0도';
            elements.currentSessionAngle.className = 'text-2xl font-bold text-gray-600 text-center';
            elements.currentSessionTime.textContent = '00:00';
            elements.currentSessionTime.className = 'text-2xl font-mono font-bold text-gray-600 text-right';
        }
    }

    async function updateSessionList() {
        if (!elements.sessionList) return;
        
        elements.sessionList.innerHTML = '';
        
        // 오늘의 세션 정보 표시
        const todayMeasurements = await API.getTodayMeasurements();
        const todaySession = await API.getTodaySession();
        
        if (todayMeasurements.length === 0) {
            // 오늘 세션이 없으면 마지막 세션 정보 표시
            const lastSession = await API.getLastSession();
            if (lastSession && lastSession.sessionDate) {
                const dateStr = formatDateWithDayOfWeek(lastSession.sessionDate);
                const totalMinutes = Math.floor((lastSession.totalDurationSeconds || 0) / 60);
                const avgAngle = lastSession.averageAngle ? Math.round(lastSession.averageAngle) : 0;
                elements.sessionList.innerHTML = `
                    <div class="bg-white rounded-lg border border-gray-100 py-3 px-4">
                        <div class="text-center text-gray-600 mb-2">
                            <div class="font-medium">마지막 세션</div>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-900">${dateStr}</span>
                            <span class="font-semibold text-gray-900">- ${Math.abs(avgAngle)}도</span>
                            <span class="font-semibold text-gray-900">${totalMinutes}분</span>
                        </div>
                    </div>
                `;
            } else {
                elements.sessionList.innerHTML = '<div class="text-center text-gray-500 py-4">아직 완료된 세션이 없습니다</div>';
            }
            // 오늘 데이터가 없을 때는 반드시 평균각도를 0으로 설정
            elements.averageAngle.textContent = '- 0';
            elements.totalSessionTime.textContent = '00:00';
            return;
        }
        
        // 오늘의 세션들을 개별적으로 표시 (그룹화하지 않음)
        let totalSeconds = 0;
        
        // 평균각도 계산을 위한 데이터 준비
        const calcAvgAngle = (sessions) => {
            const totalWeightedAngle = sessions.reduce((sum, session) => {
                return sum + (session.angle * session.duration);
            }, 0);
            
            const totalSeconds = sessions.reduce((sum, session) => 
                sum + session.duration, 0);
            
            return totalSeconds > 0 ? (totalWeightedAngle / totalSeconds) : 0;
        };
        
        // 측정 데이터를 세션 형태로 변환
        const sessions = todayMeasurements.map(m => ({
            angle: parseFloat(m.angle),
            duration: m.durationSeconds
        }));
        
        const averageAngle = calcAvgAngle(sessions);
        
        // 최신 시간 순으로 정렬 (내림차순)
        todayMeasurements.sort((a, b) => {
            const timeA = a.sessionTime;
            const timeB = b.sessionTime;
            return timeB.localeCompare(timeA);
        });

        todayMeasurements.forEach((record) => {
            const angle = parseFloat(record.angle);
            const duration = record.durationSeconds;
            const time = record.sessionTime.substring(0, 5); // HH:MM 형식
            
            totalSeconds += duration;
            
            const sessionDiv = document.createElement('div');
            sessionDiv.className = 'flex justify-between items-center py-3 px-4 bg-white rounded-lg border border-gray-100';
            sessionDiv.innerHTML = `
                <div class="flex items-center justify-between w-full">
                    <span class="text-sm font-medium text-gray-900 pl-1">${time}</span>
                    <span class="font-semibold text-gray-900">${angle}도</span>
                    <span class="font-semibold text-gray-900 pr-1">${Math.floor(duration / 60).toString().padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}</span>
                </div>
            `;
            elements.sessionList.appendChild(sessionDiv);
        });
        
        const totalMinutes = Math.floor(totalSeconds / 60);
        const remainingSeconds = totalSeconds % 60;
        elements.totalSessionTime.textContent = `${totalMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // 평균각도 표시 - 데이터가 없으면 0으로 표시
        if (todayMeasurements.length === 0) {
            elements.averageAngle.textContent = '- 0';
        } else {
            const roundedAngle = Math.round(averageAngle);
            elements.averageAngle.textContent = `${roundedAngle}`;
            
            // 계산된 평균각도를 DB에 저장 (정수로 반올림)
            try {
                const today = new Date().toISOString().split('T')[0];
                await fetch('/api/daily-sessions/update-average', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        date: today,
                        averageAngle: Math.round(averageAngle)
                    })
                });
            } catch (error) {
                console.error('평균각도 저장 실패:', error);
            }
        }
    }

    function updateVoiceToggleUI() {
        const toggle = elements.voiceToggle;
        if (!toggle) return;
        
        if (AppState.isVoiceEnabled) {
            toggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 transition-all duration-200';
        } else {
            toggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-all duration-200';
        }
    }

    function formatDateWithDayOfWeek(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const year = date.getFullYear().toString().substring(2); // 25
        const month = date.getMonth() + 1; // 6
        const day = date.getDate(); // 19
        
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = dayNames[date.getDay()];
        
        return `${year}년 ${month}월 ${day}일(${dayOfWeek})`;
    }

    function updateCurrentDate() {
        const today = new Date();
        const year = today.getFullYear().toString().slice(-2); // 25
        const month = today.getMonth() + 1; // 1-12
        const day = today.getDate();
        
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = dayNames[today.getDay()];
        
        const dateElement = document.getElementById('currentDate');
        if (dateElement) {
            dateElement.textContent = `${year}년 ${month}월 ${day}일(${dayOfWeek})`;
        }
    }

    function updateSensorStatus(status) {
        // Sensor status display removed per user request
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateUserInterface() {
        updateAngleDisplay();
        updateCurrentSessionDisplay();
        updateSessionList().catch(console.error);
    }

    function updateTodaySessionsList() {
        // Legacy function - now handled by updateSessionList()
        updateSessionList().catch(console.error);
    }

    // User Management (로컬 전용 - 단순화)
    async function updateUserInterfaceAuth() {
        // 로컬 전용 앱이므로 UI 업데이트만 수행
        await updateSessionList();
    }




    // Event Listeners
    function initEventListeners() {
        // Enhanced event handler for mobile compatibility
        function addEventHandler(element, handler) {
            if (!element) {
                console.warn('Element not found for event listener');
                return;
            }
            
            // Add both click and touch events for mobile compatibility
            element.addEventListener('click', handler);
            element.addEventListener('touchend', (e) => {
                e.preventDefault(); // Prevent double-firing
                handler(e);
            });
            
            // Ensure button is focusable and clickable
            element.style.cursor = 'pointer';
            element.style.userSelect = 'none';
            element.style.webkitUserSelect = 'none';
            element.style.webkitTapHighlightColor = 'rgba(0,0,0,0.1)';
        }

        // Voice toggle
        const handleVoiceToggle = (e) => {
            console.log('Voice toggle clicked!', e.type); // 디버깅용
            
            AppState.isVoiceEnabled = !AppState.isVoiceEnabled;
            
            const toggle = elements.voiceToggle;
            if (!toggle) {
                console.warn('Voice toggle element not found');
                return;
            }
            
            const iconDiv = toggle.querySelector('div');
            const icon = iconDiv ? iconDiv.querySelector('svg') : null;
            
            console.log('Voice enabled:', AppState.isVoiceEnabled); // 디버깅용
            
            if (AppState.isVoiceEnabled) {
                toggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 transition-all duration-200';
                if (iconDiv) iconDiv.className = 'w-6 h-6 bg-green-200 rounded-full flex items-center justify-center';
                if (icon) icon.setAttribute('class', 'w-3 h-3 text-green-700');
                
                // 모바일에서 음성 테스트
                try {
                    VoiceManager.speak('음성 안내가 켜졌습니다');
                } catch (error) {
                    console.error('Voice error:', error);
                }
            } else {
                toggle.className = 'flex items-center space-x-2 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-all duration-200';
                if (iconDiv) iconDiv.className = 'w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center';
                if (icon) icon.setAttribute('class', 'w-3 h-3 text-gray-600');
            }
        };
        
        addEventHandler(elements.voiceToggle, handleVoiceToggle);

        // Start/Pause buttons
        const handleStartTherapy = (e) => {
            console.log('Start therapy clicked!', e.type); // 디버깅용
            console.log('Current measuring state:', AppState.isMeasuring);
            
            if (!AppState.isMeasuring) {
                console.log('Starting therapy...');
                startTherapy();
            } else {
                console.log('Already measuring, ignoring click');
            }
        };
        
        const handleStopTherapy = async (e) => {
            console.log('Stop therapy clicked!', e.type); // 디버깅용
            console.log('Current measuring state:', AppState.isMeasuring);
            
            if (AppState.isMeasuring) {
                console.log('Stopping therapy...');
                await stopTherapy();
            } else {
                console.log('Not measuring, ignoring click');
            }
        };
        
        addEventHandler(elements.startBtn, handleStartTherapy);
        addEventHandler(elements.pauseBtn, handleStopTherapy);

        // Modal buttons
        const handleRequestPermission = async () => {
            elements.permissionModal.classList.add('hidden');
            await SensorManager.requestPermission();
        };
        
        const handleClosePermission = () => {
            elements.permissionModal.classList.add('hidden');
        };
        
        const handleCloseCompletion = () => {
            elements.completionModal.classList.add('hidden');
        };
        

        
        // Navigation - History button (모달 방식으로 변경)
        const navHistoryBtn = document.getElementById('navHistory');
        console.log('navHistoryBtn element:', navHistoryBtn);
        if (navHistoryBtn) {
            navHistoryBtn.addEventListener('click', (e) => {
                console.log('History button clicked');
                e.preventDefault();
                e.stopPropagation();
                showHistoryModal();
            });
        } else {
            console.error('navHistory button not found');
        }


    }

    // 기록 모달 표시 함수
    function showHistoryModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl p-6 max-w-md w-full max-h-96 overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold text-gray-900">세션 기록</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div id="historyContent" class="space-y-3">
                    <div class="text-center text-gray-500">로딩 중...</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 기록 데이터 로드
        loadHistoryData();
    }

    // 기록 데이터 로드 함수
    async function loadHistoryData() {
        const historyContent = document.getElementById('historyContent');
        if (!historyContent) return;
        
        try {
            // localStorage에서 세션 데이터 가져오기
            const sessions = JSON.parse(localStorage.getItem('gravityease_sessions') || '[]');
            
            if (sessions.length === 0) {
                historyContent.innerHTML = '<div class="text-center text-gray-500 py-4">아직 기록된 세션이 없습니다</div>';
                return;
            }
            
            // 날짜별로 그룹화
            const groupedSessions = {};
            sessions.forEach(session => {
                const date = session.sessionDate || new Date().toISOString().split('T')[0];
                if (!groupedSessions[date]) {
                    groupedSessions[date] = [];
                }
                groupedSessions[date].push(session);
            });
            
            // HTML 생성
            let html = '';
            Object.keys(groupedSessions).sort().reverse().forEach(date => {
                const dateObj = new Date(date + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('ko-KR', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    weekday: 'short'
                });
                
                html += `<div class="border-b border-gray-200 pb-3 mb-3">`;
                html += `<h4 class="font-medium text-gray-900 mb-2">${formattedDate}</h4>`;
                
                groupedSessions[date].forEach(session => {
                    const time = session.sessionTime || '00:00';
                    const angle = Math.abs(session.angle || 0);
                    const duration = session.durationSeconds || 0;
                    const minutes = Math.floor(duration / 60);
                    const seconds = duration % 60;
                    const durationText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    
                    html += `
                        <div class="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg mb-2">
                            <span class="text-sm text-gray-600">${time}</span>
                            <span class="font-medium text-gray-900">-${angle}도</span>
                            <span class="font-medium text-gray-900">${durationText}</span>
                        </div>
                    `;
                });
                
                html += `</div>`;
            });
            
            historyContent.innerHTML = html;
            
        } catch (error) {
            console.error('기록 로드 실패:', error);
            historyContent.innerHTML = '<div class="text-center text-red-500 py-4">기록을 불러오는데 실패했습니다</div>';
        }
    }

    function startTherapy() {
        console.log('startTherapy() called');
        
        // Check if sensor permission is needed (iOS)
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && !AppState.sensorSupported) {
            console.log('Requesting sensor permission first');
            SensorManager.requestPermission().then(() => {
                if (AppState.sensorSupported) {
                    console.log('Sensor permission granted, starting therapy');
                    TherapyManager.start();
                    updateButtonStates();
                } else {
                    console.log('Sensor permission denied, showing permission modal');
                    SensorManager.showPermissionModal();
                }
            }).catch(error => {
                console.error('Permission request error:', error);
                SensorManager.showPermissionModal();
            });
        } else if (!AppState.sensorSupported) {
            console.log('Sensor not supported, trying to initialize');
            SensorManager.init();
            // 잠시 후 다시 시도
            setTimeout(() => {
                if (AppState.sensorSupported) {
                    TherapyManager.start();
                    updateButtonStates();
                } else {
                    alert('센서를 사용할 수 없습니다. 기기를 확인해주세요.');
                }
            }, 1000);
        } else {
            console.log('Starting therapy directly');
            TherapyManager.start();
            updateButtonStates();
        }
    }

    async function stopTherapy() {
        await TherapyManager.stop();
        updateButtonStates();
    }

    function updateButtonStates() {
        if (AppState.isMeasuring) {
            if (elements.startBtn) {
                elements.startBtn.disabled = true;
                elements.startBtn.style.setProperty('background-color', '#d1d5db', 'important');
                elements.startBtn.style.setProperty('color', '#9ca3af', 'important');
                elements.startBtn.style.setProperty('cursor', 'not-allowed', 'important');
                elements.startBtn.style.setProperty('opacity', '0.7', 'important');
                elements.startBtn.style.setProperty('display', 'flex', 'important');
                elements.startBtn.style.setProperty('align-items', 'center', 'important');
                elements.startBtn.style.setProperty('justify-content', 'center', 'important');
            }
            
            if (elements.pauseBtn) {
                elements.pauseBtn.disabled = false;
                elements.pauseBtn.style.setProperty('background-color', '#ef4444', 'important');
                elements.pauseBtn.style.setProperty('color', 'white', 'important');
                elements.pauseBtn.style.setProperty('cursor', 'pointer', 'important');
                elements.pauseBtn.style.setProperty('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 'important');
                elements.pauseBtn.style.setProperty('opacity', '1', 'important');
                elements.pauseBtn.style.setProperty('display', 'flex', 'important');
                elements.pauseBtn.style.setProperty('align-items', 'center', 'important');
                elements.pauseBtn.style.setProperty('justify-content', 'center', 'important');
            }
        } else {
            if (elements.startBtn) {
                elements.startBtn.disabled = false;
                elements.startBtn.style.setProperty('background-color', '#3b82f6', 'important');
                elements.startBtn.style.setProperty('color', 'white', 'important');
                elements.startBtn.style.setProperty('cursor', 'pointer', 'important');
                elements.startBtn.style.setProperty('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 'important');
                elements.startBtn.style.setProperty('opacity', '1', 'important');
                elements.startBtn.style.setProperty('display', 'flex', 'important');
                elements.startBtn.style.setProperty('align-items', 'center', 'important');
                elements.startBtn.style.setProperty('justify-content', 'center', 'important');
            }
            
            if (elements.pauseBtn) {
                elements.pauseBtn.disabled = true;
                elements.pauseBtn.style.setProperty('background-color', '#f3f4f6', 'important');
                elements.pauseBtn.style.setProperty('color', '#9ca3af', 'important');
                elements.pauseBtn.style.setProperty('cursor', 'not-allowed', 'important');
                elements.pauseBtn.style.setProperty('box-shadow', 'none', 'important');
                elements.pauseBtn.style.setProperty('opacity', '0.7', 'important');
                elements.pauseBtn.style.setProperty('display', 'flex', 'important');
                elements.pauseBtn.style.setProperty('align-items', 'center', 'important');
                elements.pauseBtn.style.setProperty('justify-content', 'center', 'important');
            }
        }
    }

    // PWA Installation
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install hint
        const installHint = document.createElement('div');
        installHint.className = 'fixed top-4 left-4 right-4 bg-primary text-white p-4 rounded-xl shadow-lg z-50';
        installHint.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                    <div>
                        <div class="font-semibold">앱 설치</div>
                        <div class="text-sm opacity-90">홈 화면에 추가하여 더 편리하게 사용하세요</div>
                    </div>
                </div>
                <button id="installBtn" class="bg-white text-primary px-4 py-2 rounded-lg font-medium">
                    설치
                </button>
                <button id="dismissInstall" class="ml-2 p-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(installHint);
        
        document.getElementById('installBtn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('PWA install outcome:', outcome);
                deferredPrompt = null;
            }
            installHint.remove();
        });
        
        document.getElementById('dismissInstall').addEventListener('click', () => {
            installHint.remove();
        });
        
        // Auto dismiss after 10 seconds
        setTimeout(() => {
            if (installHint.parentNode) {
                installHint.remove();
            }
        }, 10000);
    });

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('SW registered: ', registration);
                })
                .catch((registrationError) => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }

    // App Initialization
    async function initApp() {
        try {
            // Load current user
            AppState.currentUser = await API.getCurrentUser();
            
            // Initialize sensor
            SensorManager.init();
            
            // Initialize voice
            VoiceManager.initVoice();
            
            // Initialize background management
            BackgroundManager.preventBackground();
            
            // Setup UI
            await updateUserInterfaceAuth();
            updateCurrentSessionDisplay();
            await updateSessionList(); // Make this await since it's now async
            updateCurrentDate();
            updateVoiceToggleUI();
            initEventListeners();
            
            // Start angle updates
            setInterval(updateAngleDisplay, 100);
            
            console.log('PWA 초기화 완료');
            
        } catch (error) {
            console.error('앱 초기화 오류:', error);
        }
    }

    // Start the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
})();