import { state } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';
import { uiStateMachine, STATES } from '../utils/uiStateMachine.js';

export const cameraManager = {
    checkCameraStatus: () => {
        if (!state.stream) {
            uiUtils.updateCameraStatus(false);
            return;
        }
        
        const videoTracks = state.stream.getVideoTracks();
        const audioTracks = state.stream.getAudioTracks();
        
        const hasActiveVideo = videoTracks.some(track => track.readyState === 'live');
        const hasActiveAudio = audioTracks.some(track => track.readyState === 'live');
        const isCameraActive = hasActiveVideo || hasActiveAudio;
        
        if (!state.isRecording) {
            uiUtils.updateCameraStatus(isCameraActive);
        }
    },
    
    startMonitoring: () => {
        if (state.cameraStatusTimer) clearInterval(state.cameraStatusTimer);
        state.cameraStatusTimer = setInterval(cameraManager.checkCameraStatus, 1000);
    },
    
    stopMonitoring: () => {
        if (state.cameraStatusTimer) {
            clearInterval(state.cameraStatusTimer);
            state.cameraStatusTimer = null;
        }
    },

    init: async () => {
        try {
            state.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: true 
            });
            
            elements.video.srcObject = state.stream;
            state.cameraInitialized = true;
            uiUtils.updateCameraStatus(true);
            uiUtils.updateVideoFormatIndicator(null);
            logger.log('摄像头初始化成功');
            cameraManager.startMonitoring();
            
            uiStateMachine.transitionTo(STATES.CAMERA_ON);
        } catch (error) {
            state.cameraInitialized = false;
            uiUtils.updateCameraStatus(false);
            logger.log(`摄像头初始化失败: ${error.message}`);
        }
    },

    close: () => {
        cameraManager.stopMonitoring();
        if (state.stream) {
            state.stream.getTracks().forEach(track => {
                track.stop();
                logger.log(`关闭 ${track.kind} 轨道`);
            });
            state.stream = null;
            if (elements.video) {
                elements.video.srcObject = null;
            }
            state.cameraInitialized = false;
            
            state.cameraStatusCheckCount = 0;
            state.lastCameraStatus = null;
            
            uiUtils.updateCameraStatus(false);
            logger.log('摄像头已关闭');
            
            state.isRecording = false;
            
            uiUtils.updateStatusMessage('摄像头未开启', 'default');
            
            uiStateMachine.transitionTo(STATES.INITIAL);
        }
    }
};
