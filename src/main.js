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

// 主按钮处理
function handleMainButton() {
    if (!state.cameraInitialized) {
        cameraManager.init();
    } else if (!state.isRecording) {
        resetConversionState();
        recorderManager.start();
    } else {
        recorderManager.stop();
    }
}

// 转换按钮处理
function handleConvertButton() {
    if (state.isConverting) {
        converterManager.cancel();
    } else {
        converterManager.convert();
    }
}

// 演讲者模式按钮处理
function handleSpeakerVideoButton() {
    const isGenerating = elements.generateSpeakerVideo.textContent.includes('点击停止');
    if (isGenerating) {
        speakerModeManager.cancel();
    } else {
        speakerModeManager.generate();
    }
}

// 下载处理
function downloadMP4() {
    if (state.mp4Blob) {
        uiUtils.downloadFile(state.mp4Blob, 'converted.mp4');
        logger.log('MP4 文件下载开始');
    }
}

// 重置转换状态
function resetConversionState() {
    state.webmBlob = null;
    state.mp4Blob = null;
    elements.convertBtn.style.display = 'none';
    elements.downloadBtn.style.display = 'none';
    elements.downloadBtn.disabled = true;
    elements.stats.style.display = 'none';
    
    const isGenerating = elements.generateSpeakerVideo.textContent.includes('点击停止');
    if (isGenerating) {
        if (state.converter && state.converter.cancelConversion) {
            state.converter.cancelConversion();
        }
        logger.log('强制停止进行中的合成');
    }
    
    elements.generateSpeakerVideo.disabled = true;
    elements.generateSpeakerVideo.textContent = '合成';
    elements.speakerPreview.style.display = 'none';
    
    elements.videoPosition.disabled = false;
    elements.videoScale.disabled = false;
    elements.videoMargin.disabled = false;
    
    const existingVideo = elements.speakerPreview.querySelector('.speaker-video');
    if (existingVideo) {
        existingVideo.remove();
    }
    
    elements.speakerCanvas.style.display = 'block';
    logger.log('已重置转换和演讲者模式状态');
}

// 设置变更时刷新预览
const refreshPreviewOnChange = () => {
    const existingVideo = elements.speakerPreview.querySelector('.speaker-video');
    if (existingVideo) {
        existingVideo.remove();
        logger.log('🔄 检测到设置变化，已移除合成视频');
    }
    
    elements.speakerCanvas.style.display = 'block';
    if (elements.speakerPreview.style.display !== 'none') {
        speakerModeManager.preview();
        logger.log('🔄 预览图已刷新');
    }
};

// 事件监听
elements.recordBtn.addEventListener('click', handleMainButton);
elements.convertBtn.addEventListener('click', handleConvertButton);
elements.downloadBtn.addEventListener('click', downloadMP4);
elements.closeCameraBtn.addEventListener('click', cameraManager.close);
elements.copyLogBtn.addEventListener('click', logger.copyLog);
elements.generateSpeakerVideo.addEventListener('click', handleSpeakerVideoButton);

elements.videoPosition.addEventListener('change', refreshPreviewOnChange);
elements.videoScale.addEventListener('change', refreshPreviewOnChange);
elements.videoMargin.addEventListener('change', refreshPreviewOnChange);

// 预加载资源
async function preloadAssets() {
    try {
        const coverPath = PathResolver.resolveAsset('cover.jpg');
        logger.log(`[PathResolver v2.0] 预加载cover.jpg: ${coverPath}`);
        
        const response = await fetch(coverPath, { method: 'HEAD' });
        if (response.ok) {
            logger.log(`[PathResolver v2.0] ✅ cover.jpg预加载成功 (${response.status})`);
        } else {
            logger.log(`[PathResolver v2.0] ❌ cover.jpg预加载失败 (${response.status})`);
        }
        
        const img = new Image();
        img.onload = () => {
            logger.log(`[PathResolver v2.0] ✅ cover.jpg图片缓存完成 (${img.width}x${img.height})`);
        };
        img.onerror = () => {
            logger.log(`[PathResolver v2.0] ❌ cover.jpg图片加载失败`);
        };
        img.src = coverPath;
        
    } catch (error) {
        logger.log(`[PathResolver v2.0] ❌ 预加载过程出错: ${error.message}`);
    }
}

// 初始化应用
async function initApp() {
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
                uiUtils.updateProgress(result.percent, result.time);
            }
        });

        await state.converter.init();
        const info = state.converter.getInfo();
        logger.log('✅ 转换器初始化完成！');
        logger.log(`转换器模式: ${info.useWorker ? 'Web Worker' : '直接模式'}`);
        logger.log(`Worker状态: ${info.hasWorker ? '可用' : '不可用'}`);
        logger.log(`FFmpeg状态: ${info.hasFFmpeg ? '已加载' : '未加载'}`);
        
        if (info.useWorker) {
            logger.log('🚀 使用Web Worker模式，转换不会阻塞界面');
        } else {
            logger.log('⚠️ 使用直接模式，转换时界面可能卡顿');
        }

        uiUtils.updateCameraStatus(false);
        uiUtils.updateRecordButton();

    } catch (error) {
        logger.log(`❌ 初始化失败: ${error.message}`);
        console.error('初始化错误:', error);
    }
}

// 生命周期事件
window.addEventListener('load', async () => {
    await preloadAssets();
    initApp();
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
