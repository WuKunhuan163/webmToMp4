// uiUtils.js - UI Utilities
import { elements } from './dom.js';
import { logger } from './logger.js';
import { state, CAMERA_STATUS_STABLE_COUNT } from '../core/State.js';

import { uiStateMachine, STATES } from './uiStateMachine.js';

export const uiUtils = {
    updateProgress: (percent, currentTime = null, action = 'CONVERT') => {
        let realPercent = 0;
        if (currentTime && state.videoDuration > 0) {
            realPercent = Math.min(Math.round((currentTime / state.videoDuration) * 100), 100);
        } else if (percent === 100) {
            realPercent = 100;
        } else {
            realPercent = percent;
        }
        
        elements.progressBar.style.width = `${Math.max(realPercent, 0)}%`;
        elements.progressBar.textContent = `${Math.max(realPercent, 0)}%`;
        uiStateMachine.updateProgress(action, Math.max(realPercent, 0));
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
            elements.videoFormatIndicator.dataset.format = format.toUpperCase();
            logger.log(`📺 视频格式指示器: ${format.toUpperCase()}`);
        } else {
            elements.videoFormatIndicator.dataset.format = '';
        }
    },

    updateStatusMessage: (message, type = 'default') => {
        // Now handled primarily by uiStateMachine, keeping this for fallback/direct updates
        elements.cameraStatusText.textContent = message;
        switch (type) {
            case 'success':
            case 'recording':
            case 'converting':
            case 'compositing':
            case 'connected':
                elements.cameraStatus.className = 'camera-status camera-on';
                break;
            case 'error':
            default:
                elements.cameraStatus.className = 'camera-status camera-off';
                break;
        }
        logger.log(`📱 状态消息更新(直接): ${message}`);
    },

    updateCameraStatus: (isOn, isRecording = false, seconds = 0) => {
        if (isRecording) {
            elements.cameraStatus.className = 'camera-status camera-on';
            elements.cameraStatusText.textContent = `录制中… (${seconds}秒)`;
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
            } else {
                elements.cameraStatus.className = 'camera-status camera-off';
                elements.cameraStatusText.textContent = '摄像头未开启';
            }
        }
    },

    updateRecordButton: () => {
        // Now managed by state machine, no-op or fallback
    }
};
