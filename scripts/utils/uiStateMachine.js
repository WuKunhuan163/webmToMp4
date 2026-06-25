/**
 * 界面状态机 (UI State Machine)
 * 用于集中管理各种按钮的出现、消失和文本状态
 */
import { elements } from './dom.js';
import { logger } from './logger.js';

import { state } from '../core/State.js';

export const STATES = {
    INITIAL: 'INITIAL',               // 初始状态，摄像头未开启
    CAMERA_ON: 'CAMERA_ON',           // 摄像头已开启，等待录制
    RECORDING: 'RECORDING',           // 正在录制
    RECORDED: 'RECORDED',             // 录制完成，WebM可用
    CONVERTING: 'CONVERTING',         // 正在转换WebM到MP4
    CONVERTED: 'CONVERTED',           // 转换完成，MP4可用
    SYNTHESIZING: 'SYNTHESIZING',     // 正在合成演讲者模式
    SYNTHESIZED: 'SYNTHESIZED'        // 合成完成
};

class UIStateMachine {
    constructor() {
        this.currentState = STATES.INITIAL;
    }

    transitionTo(newState) {
        logger.log(`[UI State Machine] ${this.currentState} -> ${newState}`);
        this.currentState = newState;
        this.updateUI();
    }

    updateUI() {
        // 更新顶层容器的数据属性，实现 CSS 驱动的 UI 状态
        document.body.dataset.state = this.currentState;
        
        // Dynamic camera state attribute since camera status is independent of some application states
        if (state.cameraInitialized) {
            document.body.setAttribute('data-camera', 'on');
        } else {
            document.body.setAttribute('data-camera', 'off');
        }

        // 更新文本状态消息以替代零散的 status updates
        let statusMessage = '';
        let statusClass = 'default';

        switch (this.currentState) {
            case STATES.INITIAL:
                statusMessage = '摄像头未开启';
                break;
            case STATES.CAMERA_ON:
                statusMessage = '摄像头已连接';
                statusClass = 'connected';
                break;
            case STATES.RECORDING:
                statusMessage = '录制中...';
                statusClass = 'recording';
                break;
            case STATES.RECORDED:
                statusMessage = '录制完成，可转换';
                statusClass = 'success';
                break;
            case STATES.CONVERTING:
                statusMessage = '转换中...';
                statusClass = 'converting';
                break;
            case STATES.CONVERTED:
                statusMessage = '转换完成';
                statusClass = 'success';
                break;
            case STATES.SYNTHESIZING:
                statusMessage = '合成中...';
                statusClass = 'compositing';
                break;
            case STATES.SYNTHESIZED:
                statusMessage = '合成成功';
                statusClass = 'success';
                break;
        }

// Update status directly using DOM manipulation to avoid circular dependency
        const cameraStatusText = document.getElementById('cameraStatusText');
        const cameraStatus = document.getElementById('cameraStatus');
        if (cameraStatusText) cameraStatusText.textContent = statusMessage;
        
        if (cameraStatus) {
            switch (statusClass) {
                case 'success':
                case 'recording':
                case 'converting':
                case 'compositing':
                case 'connected':
                    cameraStatus.className = 'camera-status camera-on';
                    break;
                case 'error':
                    cameraStatus.className = 'camera-status camera-off';
                    break;
                default:
                    cameraStatus.className = 'camera-status camera-default';
                    break;
            }
        }
        
        logger.log(`📱 状态消息更新: ${statusMessage}`);

        // Update text content
        const rBtn = elements.recordBtn;
        const cvBtn = elements.convertBtn;
        const dlBtn = elements.downloadBtn;
        const spkBtn = elements.generateSpeakerVideo;

        switch (this.currentState) {
            case STATES.INITIAL:
            case STATES.CAMERA_ON:
                if (rBtn) rBtn.textContent = this.currentState === STATES.INITIAL ? '开启摄像头' : '开始录制';
                if (cvBtn) cvBtn.textContent = '转换为 MP4';
                if (spkBtn) spkBtn.textContent = '合成';
                break;

            case STATES.RECORDING:
                if (rBtn) rBtn.textContent = '停止录制';
                break;

            case STATES.RECORDED:
                if (rBtn) rBtn.textContent = '重新录制';
                if (cvBtn) cvBtn.textContent = '转换为 MP4';
                if (spkBtn) spkBtn.textContent = '合成';
                break;

            case STATES.CONVERTING:
                if (cvBtn) cvBtn.textContent = '转换中...';
                break;

            case STATES.CONVERTED:
                if (rBtn) rBtn.textContent = '开启摄像头';
                if (cvBtn) cvBtn.textContent = '转换完成';
                if (spkBtn) spkBtn.textContent = '合成';
                break;

            case STATES.SYNTHESIZING:
                if (spkBtn) spkBtn.textContent = '合成中...';
                break;

            case STATES.SYNTHESIZED:
                if (rBtn) rBtn.textContent = '重新录制';
                if (cvBtn) cvBtn.textContent = '转换为 MP4';
                if (spkBtn) spkBtn.textContent = '重新合成';
                break;
        }
    }

    updateProgress(action, percent) {
        if (action === 'CONVERT' && this.currentState === STATES.CONVERTING) {
            // We no longer update the button text, handled by uiUtils.updateProgress
        } else if (action === 'SYNTHESIZE' && this.currentState === STATES.SYNTHESIZING) {
            // We no longer update the button text, handled by uiUtils.updateProgress
        }
    }
}

export const uiStateMachine = new UIStateMachine();

// 设置初始状态
uiStateMachine.updateUI();
