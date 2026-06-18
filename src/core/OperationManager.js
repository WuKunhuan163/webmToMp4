import { state } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';

export const operationManager = {
    canStartOperation: (operationType) => {
        if (state.operationInProgress) {
            const currentOp = state.isRecording ? '录制' : state.isConverting ? '转换' : state.isCompositing ? '合成' : '未知操作';
            logger.log(`❌ 无法开始${operationType}：${currentOp}正在进行中`);
            return false;
        }
        return true;
    },
    
    startOperation: (operationType) => {
        state.operationInProgress = true;
        if (operationType === '录制') {
            elements.convertBtn.disabled = true;
            elements.generateSpeakerVideo.disabled = true;
        } else if (operationType === '转换') {
            state.isConverting = true;
            elements.recordBtn.disabled = true;
            elements.generateSpeakerVideo.disabled = true;
            uiUtils.updateStatusMessage('转换中...', 'converting');
        } else if (operationType === '合成') {
            state.isCompositing = true;
            elements.recordBtn.disabled = true;
            elements.convertBtn.disabled = true;
            uiUtils.updateStatusMessage('合成中...', 'compositing');
        }
        logger.log(`🔒 开始${operationType}，其他操作已锁定`);
    },
    
    endOperation: (operationType) => {
        state.operationInProgress = false;
        if (operationType === '转换') {
            state.isConverting = false;
        } else if (operationType === '合成') {
            state.isCompositing = false;
        }
        
        if (!state.isRecording) {
            elements.recordBtn.disabled = false;
        }
        if (state.webmBlob && !state.isConverting && !state.isCompositing) {
            elements.convertBtn.disabled = false;
            elements.generateSpeakerVideo.disabled = false;
        }
        
        if (operationType !== '录制') {
            if (state.cameraInitialized && state.stream) {
                uiUtils.updateCameraStatus(true);
            } else {
                uiUtils.updateStatusMessage('摄像头未开启', 'default');
            }
        }
        
        logger.log(`🔓 ${operationType}完成，操作锁定已解除`);
    }
};
