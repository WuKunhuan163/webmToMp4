import { state, persistState, restoreState } from './State.js';
import { elements } from '../utils/dom.js';
import { logger } from '../utils/logger.js';
import { uiUtils } from '../utils/uiUtils.js';
import { uiStateMachine, STATES } from '../utils/uiStateMachine.js';
import { operationManager } from './OperationManager.js';
import { mediaValidator } from '../utils/mediaValidator.js';

export const converterManager = {
    convert: async () => {
        if (!state.webmBlob || !state.converter) {
            logger.log('请先录制视频或等待转换器初始化');
            return;
        }
        
        if (!operationManager.canStartOperation('转换')) return;

        const startTime = Date.now();

        try {
            logger.log('开始转换...');
            state.progressCalculator = null;
            
            operationManager.startOperation('转换');
            state.conversionStartTime = Date.now();
            
            uiStateMachine.transitionTo(STATES.CONVERTING);
            // uiUtils.updateStatusMessage('转换中...', 'converting');
            
            logger.log(`开始转换 ${state.videoDuration.toFixed(2)}秒 视频`);

            state.currentConversionPromise = state.converter.convertWebMToMP4(state.webmBlob, {
                fastMode: true
            });
            
            state.mp4Blob = await state.currentConversionPromise;

            const convertTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const compressionRatio = ((state.webmBlob.size - state.mp4Blob.size) / state.webmBlob.size * 100);

            elements.mp4Size.textContent = uiUtils.formatFileSize(state.mp4Blob.size);
            
            state.conversionTimeFormatted = convertTime + ' 秒';
            elements.convertTime.textContent = state.conversionTimeFormatted;
            
            state.compressionRatioStr = compressionRatio > 0 
                ? `压缩 ${compressionRatio.toFixed(1)}%` 
                : `增大 ${Math.abs(compressionRatio).toFixed(1)}%`;
            elements.compressionRatio.textContent = state.compressionRatioStr;

            uiUtils.updateVideoFormatIndicator('MP4');

            logger.log('正在验证MP4文件...');
            // elements.convertBtn.textContent = '验证文件中...';
            
            try {
                await mediaValidator.validateMP4(state.mp4Blob);
                uiUtils.updateProgress(100, null, 'CONVERT');
                logger.log(`转换并验证成功！耗时 ${convertTime} 秒`);
                // uiUtils.updateStatusMessage('转换成功', 'success');

                operationManager.endOperation('转换');
                state.currentConversionPromise = null;

                uiStateMachine.transitionTo(STATES.CONVERTED);
                
                // Persist the newly generated mp4 blob
                persistState();
                
                setTimeout(() => {
                    uiUtils.updateStatusMessage('摄像头未开启', 'default');
                }, 5000);
                
            } catch (validationError) {
                logger.log(`MP4文件验证失败: ${validationError.message}`);
                logger.log('文件可能已损坏，请重新转换');
                // uiUtils.updateStatusMessage('转换失败', 'error');
                
                operationManager.endOperation('转换');
                state.currentConversionPromise = null;
                uiUtils.updateProgress(0, null, 'CONVERT');
                uiStateMachine.transitionTo(STATES.RECORDED);
                
                setTimeout(() => {
                    uiUtils.updateStatusMessage('摄像头未开启', 'default');
                }, 5000);
            }

        } catch (error) {
            if (error.message && error.message.includes('cancelled')) {
                logger.log('转换已正确取消');
            } else {
                logger.log(`转换失败: ${error.message}`);
                console.error('转换错误:', error);
                // uiUtils.updateStatusMessage('转换失败', 'error');
                
                setTimeout(() => {
                    uiUtils.updateStatusMessage('摄像头未开启', 'default');
                }, 5000);
            }
            
            operationManager.endOperation('转换');
            state.currentConversionPromise = null;
            uiUtils.updateProgress(0);
            
            uiStateMachine.transitionTo(STATES.RECORDED);
        }
    },

    cancel: () => {
        logger.log('用户请求取消转换');
        
        if (state.converter && state.converter.cancelConversion) {
            state.converter.cancelConversion();
        } else {
            logger.log('转换器不支持取消功能');
        }
        
        state.isConverting = false;
        state.currentConversionPromise = null;
        uiUtils.updateProgress(0);
        uiStateMachine.transitionTo(STATES.RECORDED);
        
        if (state.webmBlob && elements.video) {
            const webmUrl = URL.createObjectURL(state.webmBlob);
            elements.video.src = webmUrl;
            elements.video.controls = true;
            elements.video.muted = false;
            uiUtils.updateVideoFormatIndicator('WEBM');
            logger.log('已恢复WebM播放');
        }
        
        logger.log('转换已取消，状态已重置');
        operationManager.endOperation('转换');
    }
};
