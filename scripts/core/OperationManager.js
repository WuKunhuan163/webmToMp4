import { state } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';

export const operationManager = {
    canStartOperation: (operationType) => {
        if (state.operationInProgress) {
            const currentOp = state.isRecording ? '录制' : state.isConverting ? '转换' : state.isCompositing ? '合成' : '未知操作';
            logger.log(`无法开始${operationType}：${currentOp}正在进行中`);
            return false;
        }
        return true;
    },
    
    startOperation: (operationType) => {
        state.operationInProgress = true;
        if (operationType === '转换') {
            state.isConverting = true;
        } else if (operationType === '合成') {
            state.isCompositing = true;
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
            // DOM 属性修改已移除，统一由 CSS data-state 驱动
        }
        if (state.webmBlob && !state.isConverting && !state.isCompositing) {
            // DOM 属性修改已移除，统一由 CSS data-state 驱动
        }
        
        if (operationType !== '录制') {
            if (state.cameraInitialized && state.stream) {
                // Keep connected status
            } else {
                // Keep default status
            }
        }
        
        logger.log(`${operationType}完成，操作锁定已解除`);
    }
};
