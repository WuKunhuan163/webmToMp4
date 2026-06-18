import { elements } from './dom.js';
import { logger } from './logger.js';
import { state, CAMERA_STATUS_STABLE_COUNT } from '../core/State.js';

export const uiUtils = {
    updateProgress: (percent, currentTime = null) => {
        let realPercent = 0;
        if (currentTime && state.videoDuration > 0) {
            realPercent = Math.min(Math.round((currentTime / state.videoDuration) * 100), 100);
        } else if (percent === 100) {
            realPercent = 100;
        }
        
        if (state.isConverting) {
            if (realPercent >= 100) {
                elements.convertBtn.textContent = '转换完成';
                elements.convertBtn.disabled = true;
            } else {
                const displayPercent = Math.max(realPercent, 0);
                elements.convertBtn.textContent = `点击停止 (${displayPercent}%)`;
                elements.convertBtn.disabled = false;
            }
        } else {
            elements.convertBtn.textContent = '转换为 MP4';
            elements.convertBtn.disabled = false;
        }
        elements.progressContainer.style.display = 'none';
    },

    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    downloadFile: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    updateVideoFormatIndicator: (format) => {
        if (format) {
            elements.videoFormatIndicator.textContent = format.toUpperCase();
            elements.videoFormatIndicator.style.display = 'block';
            logger.log(`📺 视频格式指示器: ${format.toUpperCase()}`);
        } else {
            elements.videoFormatIndicator.style.display = 'none';
        }
    },

    updateStatusMessage: (message, type = 'default') => {
        elements.cameraStatusText.textContent = message;
        switch (type) {
            case 'success':
            case 'recording':
            case 'converting':
            case 'compositing':
                elements.cameraStatus.className = 'camera-status camera-on';
                break;
            case 'error':
            default:
                elements.cameraStatus.className = 'camera-status camera-off';
                break;
        }
        logger.log(`📱 状态消息更新: ${message} (类型: ${type})`);
    },

    updateCameraStatus: (isOn, isRecording = false, seconds = 0) => {
        if (isRecording) {
            elements.cameraStatus.className = 'camera-status camera-on';
            elements.cameraStatusText.textContent = `录制中… (${seconds}秒)`;
            elements.closeCameraBtn.style.display = 'none';
            return;
        }
        
        const currentStatus = isOn ? 'on' : 'off';
        if (currentStatus === state.lastCameraStatus) {
            state.cameraStatusCheckCount++;
        } else {
            state.cameraStatusCheckCount = 1;
            state.lastCameraStatus = currentStatus;
        }
        
        if (state.cameraStatusCheckCount >= CAMERA_STATUS_STABLE_COUNT) {
            if (isOn) {
                elements.cameraStatus.className = 'camera-status camera-on';
                elements.cameraStatusText.textContent = '摄像头已开启';
                elements.closeCameraBtn.style.display = 'inline-block';
                elements.closeCameraBtn.disabled = false;
            } else {
                elements.cameraStatus.className = 'camera-status camera-off';
                elements.cameraStatusText.textContent = '摄像头未开启';
                elements.closeCameraBtn.style.display = 'none';
            }
        }
    },

    updateRecordButton: () => {
        if (!state.cameraInitialized) {
            elements.recordBtn.textContent = '开启摄像头';
            elements.recordBtn.disabled = false;
        } else if (!state.isRecording) {
            elements.recordBtn.textContent = '开始录制';
            elements.recordBtn.disabled = false;
        }
    }
};
