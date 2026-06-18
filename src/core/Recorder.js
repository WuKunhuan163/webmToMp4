import { state } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';
import { operationManager } from './OperationManager.js';
import { cameraManager } from './Camera.js';
import { speakerModeManager } from './SpeakerMode.js';

export const recorderManager = {
    start: () => {
        if (!state.stream) {
            logger.log('请先初始化摄像头');
            return;
        }
        
        if (!operationManager.canStartOperation('录制')) return;

        state.recordedChunks = [];
        state.isRecording = true;
        operationManager.startOperation('录制');
        state.recordingSeconds = 0;
        state.recordingStartTime = Date.now();
        state.actualRecordingDuration = 0;
        
        elements.recordBtn.textContent = '录制中';
        elements.recordBtn.disabled = true;
        elements.video.muted = true;
        logger.log('录制开始，视频已静音以避免回声');

        state.recordingTimer = setInterval(() => {
            state.recordingSeconds++;
            uiUtils.updateCameraStatus(true, true, state.recordingSeconds);
            
            if (state.recordingSeconds >= 1 && elements.recordBtn.disabled) {
                elements.recordBtn.textContent = '停止录制';
                elements.recordBtn.disabled = false;
            }
        }, 1000);

        uiUtils.updateCameraStatus(true, true, 0);

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
        }

        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });

        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.recordedChunks.push(event.data);
            }
        };

        state.mediaRecorder.onstop = () => {
            if (state.recordingTimer) {
                clearInterval(state.recordingTimer);
                state.recordingTimer = null;
            }
            
            state.actualRecordingDuration = (Date.now() - state.recordingStartTime) / 1000;
            logger.log(`录制时长: ${state.actualRecordingDuration.toFixed(2)}秒`);

            state.webmBlob = new Blob(state.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(state.webmBlob);
            
            elements.video.srcObject = null;
            elements.video.src = url;
            elements.video.controls = true;
            elements.video.muted = false;
            uiUtils.updateVideoFormatIndicator('WebM');
            
            elements.video.onloadedmetadata = () => {
                const duration = elements.video.duration;
                if (duration && duration !== Infinity && !isNaN(duration)) {
                    state.videoDuration = duration;
                    logger.log(`✅ 视频时长: ${state.videoDuration.toFixed(2)}秒`);
                } else {
                    setTimeout(() => {
                        const retryDuration = elements.video.duration;
                        if (retryDuration && retryDuration !== Infinity && !isNaN(retryDuration)) {
                            state.videoDuration = retryDuration;
                            logger.log(`✅ 视频时长: ${state.videoDuration.toFixed(2)}秒`);
                        } else {
                            if (state.actualRecordingDuration > 0) {
                                state.videoDuration = state.actualRecordingDuration;
                            } else if (state.recordingSeconds > 0) {
                                state.videoDuration = state.recordingSeconds;
                            }
                            logger.log(`📝 使用录制时长: ${state.videoDuration.toFixed(2)}秒`);
                        }
                    }, 1000);
                }
            };
            
            elements.video.onerror = (e) => {
                logger.log(`❌ 视频加载错误: ${e.message || '未知错误'}`);
            };
            
            elements.webmSize.textContent = uiUtils.formatFileSize(state.webmBlob.size);
            elements.stats.style.display = 'grid';
            elements.convertBtn.disabled = false;
            elements.convertBtn.style.display = 'inline-block';
            elements.convertBtn.textContent = '转换为 MP4';
            
            elements.generateSpeakerVideo.disabled = false;
            
            setTimeout(() => {
                speakerModeManager.preview();
            }, 500);
            
            elements.downloadBtn.style.display = 'none';
            elements.downloadBtn.disabled = true;
            
            logger.log(`录制完成，文件大小: ${uiUtils.formatFileSize(state.webmBlob.size)}`);
            logger.log('录制回放已恢复声音');
            
            logger.log('录制完成，自动关闭摄像头以节省资源');
            cameraManager.close();
        };

        state.mediaRecorder.start();
        logger.log('开始录制...');

        setTimeout(() => {
            if (state.isRecording) {
                recorderManager.stop();
                logger.log('已达到最大录制时长(5分钟)，自动停止录制');
            }
        }, 300000);
    },

    stop: () => {
        if (state.recordingSeconds < 1) {
            logger.log('⚠️ 录制时间不足1秒，请稍等...');
            return;
        }
        
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        }
        
        if (state.recordingTimer) {
            clearInterval(state.recordingTimer);
            state.recordingTimer = null;
        }
        
        state.isRecording = false;
        operationManager.endOperation('录制');
        uiUtils.updateRecordButton();
    }
};
