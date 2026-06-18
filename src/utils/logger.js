import { elements } from './dom.js';

export const logger = {
    log: (message) => {
        const timestamp = new Date().toLocaleTimeString();
        elements.log.textContent += `[${timestamp}] ${message}\n`;
        elements.log.scrollTop = elements.log.scrollHeight;
    },

    copyLog: () => {
        const logText = elements.log.textContent;
        
        // 使用现代API复制到剪贴板
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(logText).then(() => {
                // 临时改变按钮文本以显示成功
                const originalText = elements.copyLogBtn.textContent;
                elements.copyLogBtn.textContent = '已复制!';
                elements.copyLogBtn.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
                
                setTimeout(() => {
                    elements.copyLogBtn.textContent = originalText;
                    elements.copyLogBtn.style.background = '';
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                logger.log('❌ 日志复制失败，请手动选择复制');
            });
        } else {
            // 备用方案：选择文本
            try {
                const range = document.createRange();
                range.selectNodeContents(elements.log);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                logger.log('📋 日志文本已选中，请按Ctrl+C复制');
            } catch (err) {
                console.error('选择文本失败:', err);
                logger.log('❌ 无法选择日志文本');
            }
        }
    }
};
