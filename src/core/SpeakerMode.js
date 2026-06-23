import { state } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';
import { uiStateMachine, STATES } from '../utils/uiStateMachine.js';
import { operationManager } from './OperationManager.js';
import PathResolver from '../modules/path-resolver.js';
import FFmpegProgressCalculator from '../modules/ffmpeg-progress-calculator.js';
import OptimizedFFmpegConverter from '../modules/ffmpeg-converter-optimized.js';

export const speakerModeManager = {
    pptImage: null,
    pptAspectRatio: 0,
    videoAspectRatio: 0,

    async loadPPTImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.pptImage = img;
                this.pptAspectRatio = img.width / img.height;
                logger.log(`[PathResolver v2.0] PPT图片已加载: ${img.width}x${img.height} (比例: ${this.pptAspectRatio.toFixed(2)})`);
                resolve(img);
            };
            img.onerror = () => {
                logger.log('[PathResolver v2.0] PPT图片加载失败');
                reject(new Error('PPT图片加载失败'));
            };
            img.src = PathResolver.resolveAsset('cover.jpg');
        });
    },

    async preview() {
        if (!this.pptImage) {
            await this.loadPPTImage();
        }

        if (!elements.video.videoWidth) {
            logger.log('请先录制视频');
            return;
        }

        const canvas = elements.speakerCanvas;
        const ctx = canvas.getContext('2d');
        const scale = parseFloat(elements.videoScale.value);

        canvas.width = this.pptImage.width;
        canvas.height = this.pptImage.height;

        ctx.drawImage(this.pptImage, 0, 0);

        const videoAspectRatio = elements.video.videoWidth / elements.video.videoHeight;

        let videoWidth, videoHeight;
        
        if (this.pptAspectRatio > videoAspectRatio) {
            videoHeight = canvas.height * scale;
            videoWidth = videoHeight * videoAspectRatio;
        } else {
            videoWidth = canvas.width * scale;
            videoHeight = videoWidth / videoAspectRatio;
        }

        const marginPercent = parseFloat(elements.videoMargin.value);
        const marginX = canvas.width * marginPercent;
        const marginY = canvas.height * marginPercent;

        const position = elements.videoPosition.value;
        let x, y;

        switch (position) {
            case 'top-left':
                x = marginX;
                y = marginY;
                break;
            case 'top-right':
                x = canvas.width - videoWidth - marginX;
                y = marginY;
                break;
            case 'bottom-left':
                x = marginX;
                y = canvas.height - videoHeight - marginY;
                break;
            case 'bottom-right':
            default:
                x = canvas.width - videoWidth - marginX;
                y = canvas.height - videoHeight - marginY;
                break;
        }

        ctx.drawImage(elements.video, x, y, videoWidth, videoHeight);
        elements.speakerPreview.dataset.active = 'true';
        elements.speakerCanvas.dataset.active = 'false';
        logger.log(`预览已生成`);
    },

    async generate() {
        if (!state.webmBlob) {
            logger.log('请先录制视频');
            return;
        }
        
        if (!operationManager.canStartOperation('合成')) return;
        
        uiStateMachine.transitionTo(STATES.SYNTHESIZING);
        // uiUtils.updateStatusMessage('合成中...', 'compositing');

        if (!this.pptImage) {
            await this.loadPPTImage();
        }

        logger.log('开始生成演讲者模式视频...');
        operationManager.startOperation('合成');
        // uiStateMachine.transitionTo(STATES.SYNTHESIZING);

    // Disable dropdowns
    elements.videoPosition.disabled = true;
    elements.videoScale.disabled = true;
    elements.videoMargin.disabled = true;
        logger.log('🔒 合成期间已锁定预览选项');

        const originalProgressCallback = state.converter.onProgress;
        
        const totalDuration = state.actualRecordingDuration > 0 ? state.actualRecordingDuration : 
                            (state.videoDuration > 0 ? state.videoDuration : state.recordingSeconds);
        
        const speakerProgressCalculator = FFmpegProgressCalculator.create(totalDuration, {
            skipInitialSeconds: 2,
            enableDebugLog: false,
            logCallback: logger.log
        });
        
        state.converter.setProgressCallback((percent, time) => {
            const result = speakerProgressCalculator.calculateProgress(percent, time);
            
            if (result.isValid) {
                uiUtils.updateProgress(result.percent, result.time, 'SYNTHESIZE');
                uiStateMachine.updateProgress('SYNTHESIZE', result.percent);
            } else if (result.reason.includes('准备阶段')) {
                // Ignore preparation phase logging for UI update
            }
            
            logger.log(`合成进度: ${result.percent}% (${result.reason})`);
        });

        try {
            const scale = parseFloat(elements.videoScale.value);
            const position = elements.videoPosition.value;
            const marginPercent = parseFloat(elements.videoMargin.value);
            
            const videoAspectRatio = elements.video.videoWidth / elements.video.videoHeight;
            const pptAspectRatio = this.pptAspectRatio;
            
            let videoWidth, videoHeight;
            if (pptAspectRatio > videoAspectRatio) {
                videoHeight = Math.round(this.pptImage.height * scale);
                videoWidth = Math.round(videoHeight * videoAspectRatio);
            } else {
                videoWidth = Math.round(this.pptImage.width * scale);
                videoHeight = Math.round(videoWidth / videoAspectRatio);
            }
            
            const marginX = Math.round(this.pptImage.width * marginPercent);
            const marginY = Math.round(this.pptImage.height * marginPercent);
            
            let overlayX, overlayY;
            switch (position) {
                case 'top-left':
                    overlayX = marginX;
                    overlayY = marginY;
                    break;
                case 'top-right':
                    overlayX = this.pptImage.width - videoWidth - marginX;
                    overlayY = marginY;
                    break;
                case 'bottom-left':
                    overlayX = marginX;
                    overlayY = this.pptImage.height - videoHeight - marginY;
                    break;
                case 'bottom-right':
                default:
                    overlayX = this.pptImage.width - videoWidth - marginX;
                    overlayY = this.pptImage.height - videoHeight - marginY;
                    break;
            }
            
            logger.log(`合成参数: 视频${videoWidth}x${videoHeight} 位置(${overlayX},${overlayY})`);
            
            const speakerVideoBlob = await state.converter.compositeVideoWithBackground(state.webmBlob, {
                pptBackground: PathResolver.resolveAsset('cover.jpg'),
                videoScale: `${videoWidth}:${videoHeight}`,
                overlayPosition: `${overlayX}:${overlayY}`,
                outputSize: `${this.pptImage.width}:${this.pptImage.height}`,
                autoTrimStart: true
            });
            
            const downloadUrl = URL.createObjectURL(speakerVideoBlob);
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = '下载';
            downloadBtn.className = 'btn btn-success';
            downloadBtn.style.marginLeft = '10px';
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = 'speaker-mode-video.mp4';
                link.click();
            };
            
            elements.generateSpeakerVideo.parentNode.insertBefore(downloadBtn, elements.generateSpeakerVideo.nextSibling);
            
            const existingVideo = elements.speakerPreview.querySelector('.speaker-video');
            if (existingVideo) {
                existingVideo.remove();
            }
            
            const speakerVideo = document.createElement('video');
            speakerVideo.src = downloadUrl;
            speakerVideo.controls = true;
            speakerVideo.className = 'speaker-video';
            speakerVideo.style.cssText = 'width: 100%; max-width: 600px; margin-top: 20px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);';
            
            elements.speakerCanvas.dataset.active = 'false';
            elements.speakerPreview.appendChild(speakerVideo);
            elements.speakerPreview.dataset.active = 'true';
        elements.speakerCanvas.dataset.active = 'false';
            
            logger.log('演讲者模式视频生成完成！已在页面显示');
            // uiUtils.updateStatusMessage('合成成功', 'success');
            operationManager.endOperation('合成');
            uiStateMachine.transitionTo(STATES.SYNTHESIZED);
            
            setTimeout(() => {
                // uiUtils.updateStatusMessage('摄像头未开启', 'default');
            }, 5000);
            
        } catch (error) {
            logger.log(`生成失败: ${error.message}`);
            // uiUtils.updateStatusMessage('合成失败', 'error');
            operationManager.endOperation('合成');
            uiStateMachine.transitionTo(STATES.RECORDED);
            
            setTimeout(() => {
                // uiUtils.updateStatusMessage('摄像头未开启', 'default');
            }, 5000);
        } finally {
            state.converter.setProgressCallback(originalProgressCallback);
            
            elements.videoPosition.disabled = false;
            elements.videoScale.disabled = false;
            elements.videoMargin.disabled = false;
        }
    },

    cancel: () => {
        logger.log('用户请求取消演讲者模式合成');
        
        if (state.converter) {
            if (state.converter.cancelConversion) {
                state.converter.cancelConversion();
            }
            try {
                state.converter.destroy();
                
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
            uiUtils.updateProgress(result.percent, result.time, 'SYNTHESIZE');
            uiStateMachine.updateProgress('SYNTHESIZE', result.percent);
                    }
                });
                state.converter.init().catch(error => {
                    logger.log(`转换器重新初始化失败: ${error.message}`);
                });
                
            } catch (error) {
                logger.log(`转换器重置失败: ${error.message}`);
            }
        }
        
        uiStateMachine.transitionTo(STATES.RECORDED);
        
        elements.videoPosition.disabled = false;
        elements.videoScale.disabled = false;
        elements.videoMargin.disabled = false;
        
        elements.speakerCanvas.dataset.active = 'true';
        if (elements.speakerPreview.dataset.active === 'true') {
            setTimeout(() => {
                speakerModeManager.preview();
            }, 100);
        }
        
        logger.log('演讲者模式合成已取消，转换器已重置');
        operationManager.endOperation('合成');
    }
};
