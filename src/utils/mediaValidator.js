import { state } from '../core/State.js';
import { elements } from './dom.js';
import { uiUtils } from './uiUtils.js';
import { logger } from './logger.js';

export const mediaValidator = {
    validateMP4: (mp4Blob) => {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(mp4Blob);
            const testVideo = document.createElement('video');
            testVideo.muted = true;
            testVideo.preload = 'metadata';
            
            let isResolved = false;
            
            const timeout = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    reject(new Error('验证超时：文件可能已损坏'));
                }
            }, 10000);
            
            const cleanup = () => {
                clearTimeout(timeout);
                testVideo.pause();
                URL.revokeObjectURL(url);
                testVideo.remove();
            };
            
            const handleSuccess = () => {
                if (!isResolved) {
                    isResolved = true;
                    const mp4Duration = testVideo.duration;
                    
                    logger.log(`✅ MP4验证成功 - 时长: ${mp4Duration.toFixed(2)}秒, 尺寸: ${testVideo.videoWidth}x${testVideo.videoHeight}`);
                    
                    const expectedDuration = state.actualRecordingDuration > 0 ? state.actualRecordingDuration : state.recordingSeconds;
                    const timeDiff = Math.abs(mp4Duration - expectedDuration);
                    const percentDiff = (timeDiff / expectedDuration) * 100;
                    
                    if (percentDiff > 10 || timeDiff > 0.5) {
                        cleanup();
                        reject(new Error(`时长验证失败: 转换后${mp4Duration.toFixed(2)}s与录制${expectedDuration.toFixed(2)}s差异过大`));
                        return;
                    }
                    
                    const displayUrl = URL.createObjectURL(mp4Blob);
                    elements.video.src = displayUrl;
                    elements.video.controls = true;
                    elements.video.muted = false;
                    uiUtils.updateVideoFormatIndicator('MP4');
                    logger.log('MP4文件已在页面上显示');
                    
                    cleanup();
                    resolve();
                }
            };
            
            const handleError = (errorMsg) => {
                if (!isResolved) {
                    isResolved = true;
                    logger.log(`❌ MP4验证失败: ${errorMsg}`);
                    cleanup();
                    reject(new Error(`文件验证失败: ${errorMsg}`));
                }
            };
            
            testVideo.onloadedmetadata = () => {
                if (testVideo.duration > 0 && testVideo.videoWidth > 0 && testVideo.videoHeight > 0) {
                    handleSuccess();
                } else {
                    handleError('视频文件信息不完整');
                }
            };
            
            testVideo.onerror = (error) => {
                const errorMsg = error.target?.error?.message || '文件格式错误';
                handleError(errorMsg);
            };
            
            testVideo.src = url;
        });
    }
};
