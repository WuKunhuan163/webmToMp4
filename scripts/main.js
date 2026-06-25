import { state } from './core/State.js';
import { elements } from './utils/dom.js';
import { logger } from './utils/logger.js';
import { uiUtils } from './utils/uiUtils.js';
import { cameraManager } from './core/Camera.js';
import { recorderManager } from './core/Recorder.js';
import { converterManager } from './core/Converter.js';
import { speakerModeManager } from './core/SpeakerMode.js';
import OptimizedFFmpegConverter from './modules/ffmpeg-converter-optimized.js';
import FFmpegProgressCalculator from './modules/ffmpeg-progress-calculator.js';
import PathResolver from './modules/path-resolver.js';
import { uiStateMachine, STATES } from './utils/uiStateMachine.js';
import { sessionManager } from './utils/sessionManager.js';
import { restoreState } from './core/State.js';

class App {
    constructor() {
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        const sid = sessionManager.init();
        this.initAgentRemoteControl();
        this.setupEventDelegation();
        
        await this.preloadAssets();
        await this.initApp();
        this.initialized = true;
        
        // IndexedDB state is restored here AFTER app is initialized (converter ready)
        const hasRestored = await restoreState();
        
        if (hasRestored) {
            logger.log(`已从当前 Session(${sid}) 的缓存中恢复上一次的视频`);
            
            // Wait for video data to load before trying to draw the preview
            elements.video.onloadeddata = () => {
                speakerModeManager.preview();
            };
            
            elements.video.src = URL.createObjectURL(state.webmBlob);
            
            uiUtils.updateVideoFormatIndicator('WEBM');
            
            // Restore stats info
            elements.webmSize.textContent = uiUtils.formatFileSize(state.webmBlob.size);
            
            // Set operation manager states to ready
            state.operationInProgress = false;
            state.isCompositing = false;
            state.isConverting = false;
            
            if (state.mp4Blob) {
                elements.video.src = URL.createObjectURL(state.mp4Blob);
                uiUtils.updateVideoFormatIndicator('MP4');
                elements.mp4Size.textContent = uiUtils.formatFileSize(state.mp4Blob.size);
                
                if (state.conversionTimeFormatted) {
                    elements.convertTime.textContent = state.conversionTimeFormatted;
                }
                if (state.compressionRatioStr) {
                    elements.compressionRatio.textContent = state.compressionRatioStr;
                }
            }
                
            // Restore speaker blob if it exists
            if (state.speakerBlob) {
                const downloadUrl = URL.createObjectURL(state.speakerBlob);
                const speakerVideo = document.createElement('video');
                speakerVideo.src = downloadUrl;
                speakerVideo.controls = true;
                speakerVideo.className = 'speaker-video';
                
                // Wait for the video to be ready before removing the canvas from view
                speakerVideo.oncanplay = () => {
                    elements.speakerCanvas.style.display = 'none';
                };
                
                // If the user clicks play without waiting for canplay, hide the canvas.
                speakerVideo.onplay = () => {
                     elements.speakerCanvas.style.display = 'none';
                };
                
                elements.speakerPreview.appendChild(speakerVideo);
            }
            
            // Determine final state
            if (state.speakerBlob) {
                uiStateMachine.transitionTo(STATES.SYNTHESIZED);
            } else if (state.mp4Blob) {
                uiStateMachine.transitionTo(STATES.CONVERTED);
            } else {
                uiStateMachine.transitionTo(STATES.RECORDED);
            }
        }
    }
    initAgentRemoteControl() {
        try {
            const eventSource = new EventSource('/agent-sse');
            eventSource.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    let commandResult = { success: true };
                    
                    if (data.type === 'connected') {
                        logger.log('Agent 远程控制通道已连接');
                    } else if (data.action === 'reload') {
                        logger.log('[Agent] Reloading page');
                        // 先响应后端，再刷新
                        if (data.id) {
                           try {
                               await fetch(`/agent-result/${data.id}`, {
                                   method: 'POST',
                                   headers: { 'Content-Type': 'application/json' },
                                   body: JSON.stringify({ success: true, message: 'Reloading...' })
                               });
                           } catch(e) {}
                        }
                        setTimeout(() => window.location.reload(), 100);
                        return; // 不再走后面的 fetch
                    } else if (data.action === 'click') {
                        const el = document.querySelector(data.selector);
                        if (el) {
                            el.click();
                            logger.log(`[Agent] Clicked ${data.selector}`);
                            commandResult.message = `Clicked ${data.selector}`;
                        } else {
                            commandResult = { success: false, error: `Element not found: ${data.selector}` };
                        }
                    } else if (data.action === 'state') {
                        // 后端直接指令状态转移
                        uiStateMachine.transitionTo(STATES[data.targetState]);
                        logger.log(`[Agent] 强制转移状态到 ${data.targetState}`);
                    }
                    
                    // Reply back to backend if it's a tracked command
                    if (data.id) {
                       await fetch(`/agent-result/${data.id}`, {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify(commandResult)
                       });
                    }
                } catch (e) {
                    console.error('[Agent] SSE Error', e);
                }
            };
        } catch (e) {
            console.warn('Agent 远程控制通道初始化失败', e);
        }
    }

    handleMainButton() {
        if (!state.cameraInitialized) {
            cameraManager.init();
        } else if (uiStateMachine.currentState === STATES.RECORDED || uiStateMachine.currentState === STATES.CONVERTED || uiStateMachine.currentState === STATES.SYNTHESIZED) {
            recorderManager.start();
        } else if (!state.isRecording) {
            recorderManager.start();
        } else {
            recorderManager.stop();
        }
    }

    handleConvertButton() {
        if (uiStateMachine.currentState === STATES.CONVERTING) {
            converterManager.cancel();
        } else {
            converterManager.convert();
        }
    }

    handleSpeakerVideoButton() {
        if (uiStateMachine.currentState === STATES.SYNTHESIZING) {
            speakerModeManager.cancel();
        } else {
            speakerModeManager.generate();
        }
    }

    downloadMP4() {
        if (state.mp4Blob) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const hash = Math.random().toString(36).substring(2, 8);
            const filename = `converted_${timestamp}_${hash}.mp4`;
            uiUtils.downloadFile(state.mp4Blob, filename);
            logger.log(`MP4 文件下载开始: ${filename}`);
        }
    }
    
    downloadSpeaker() {
        if (state.speakerBlob) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const hash = Math.random().toString(36).substring(2, 8);
            const filename = `speaker_${timestamp}_${hash}.mp4`;
            uiUtils.downloadFile(state.speakerBlob, filename);
            logger.log(`合成视频下载开始: ${filename}`);
        }
    }

    refreshPreviewOnChange() {
        const existingVideo = elements.speakerPreview.querySelector('.speaker-video');
        if (existingVideo) {
            existingVideo.remove();
            logger.log('检测到设置变化，已移除合成视频');
            
            // 既然视频移除了，我们要确保底层的 Canvas 骨架露出来！
            elements.speakerCanvas.style.display = 'block';
        }
        
        if (uiStateMachine.currentState === STATES.RECORDED || uiStateMachine.currentState === STATES.CONVERTED || uiStateMachine.currentState === STATES.SYNTHESIZING || uiStateMachine.currentState === STATES.SYNTHESIZED) {
            speakerModeManager.preview();
            logger.log('预览图已刷新');
        }
    }

    setupEventDelegation() {
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            switch(action) {
                case 'toggle-recording':
                    this.handleMainButton();
                    break;
                case 'convert':
                    this.handleConvertButton();
                    break;
                case 'cancel-convert':
                    this.handleConvertButton();
                    break;
                case 'download':
                    this.downloadMP4();
                    break;
                case 'close-camera':
                    cameraManager.close();
                    break;
                case 'copy-log':
                    logger.copyLog();
                    break;
                case 'generate-speaker':
                    this.handleSpeakerVideoButton();
                    break;
                case 'cancel-speaker':
                    speakerModeManager.cancel();
                    break;
                case 'download-speaker':
                    this.downloadSpeaker();
                    break;
            }
        });

        const refreshPreview = this.refreshPreviewOnChange.bind(this);
        elements.videoPosition.addEventListener('change', refreshPreview);
        elements.videoScale.addEventListener('change', refreshPreview);
        elements.videoMargin.addEventListener('change', refreshPreview);
    }

    async preloadAssets() {
        try {
            const coverPath = PathResolver.resolveAsset('cover.jpg');
            logger.log(`[PathResolver v2.0] 预加载cover.jpg: ${coverPath}`);
            
            const response = await fetch(coverPath, { method: 'HEAD' });
            if (response.ok) {
                logger.log(`[PathResolver v2.0] cover.jpg预加载成功 (${response.status})`);
            } else {
                logger.log(`[PathResolver v2.0] cover.jpg预加载失败 (${response.status})`);
            }
            
            const img = new Image();
            img.onload = () => {
                logger.log(`[PathResolver v2.0] cover.jpg图片缓存完成 (${img.width}x${img.height})`);
            };
            img.onerror = () => {
                logger.log(`[PathResolver v2.0] cover.jpg图片加载失败`);
            };
            img.src = coverPath;
            
        } catch (error) {
            logger.log(`[PathResolver v2.0] 预加载过程出错: ${error.message}`);
        }
    }

    async initApp() {
        try {
            logger.log('正在初始化转换器...');
            
            state.converter = new OptimizedFFmpegConverter(true);
            
            state.converter.setLogCallback((message) => {
                logger.log(message);
            });
            
            state.converter.setProgressCallback((percent, time) => {
                if (!state.progressCalculator) {
                    let totalDuration = state.actualRecordingDuration > 0 ? state.actualRecordingDuration : 
                                      (state.videoDuration > 0 ? state.videoDuration : state.recordingSeconds);
                    
                    state.progressCalculator = FFmpegProgressCalculator.create(totalDuration, {
                        skipInitialSeconds: 2,
                        enableDebugLog: false,
                        logCallback: logger.log
                    });
                }
                
                const result = state.progressCalculator.calculateProgress(percent, time);
                
                if (result.isValid || result.percent === 100) {
                    uiUtils.updateProgress(result.percent, result.time, 'CONVERT');
                    uiStateMachine.updateProgress('CONVERT', result.percent);
                }
            });

            await state.converter.init();
            const info = state.converter.getInfo();
            logger.log('转换器初始化完成！');
            logger.log(`转换器模式: ${info.useWorker ? 'Web Worker' : '直接模式'}`);
            logger.log(`Worker状态: ${info.hasWorker ? '可用' : '不可用'}`);
            logger.log(`FFmpeg状态: ${info.hasFFmpeg ? '已加载' : '未加载'}`);
            
            if (info.useWorker) {
                logger.log('使用Web Worker模式，转换不会阻塞界面');
            } else {
                logger.log('使用直接模式，转换时界面可能卡顿');
            }

            uiUtils.updateCameraStatus(false);
            uiUtils.updateRecordButton();

        } catch (error) {
            logger.log(`初始化失败: ${error.message}`);
            console.error('初始化错误:', error);
        }
    }
}

const app = new App();

// 生命周期事件
window.addEventListener('load', () => {
    app.init();
});

window.addEventListener('beforeunload', () => {
    if (state.recordingTimer) {
        clearInterval(state.recordingTimer);
        state.recordingTimer = null;
    }
    
    cameraManager.stopMonitoring();
    cameraManager.close();
    
    if (state.converter) {
        state.converter.destroy();
    }
});
