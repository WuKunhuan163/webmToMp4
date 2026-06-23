import { elements } from './dom.js';

export const logger = {
    log: (message) => {
        // 去除或替换不专业的表情符号和杂乱日志
        let cleanMessage = message
            .replace(/[🟢🚀🔴✅✨🚫🔒🔓📺📱📦💾⏳⚠️❌❓🎉📸🎶]/g, '')
            .trim();
        
        if (!cleanMessage) return;
        
        // 使用更专业的格式
        if (cleanMessage.includes('Worker转换完成')) {
            cleanMessage = cleanMessage.replace('Worker转换完成！耗时', 'Worker conversion completed. Time:');
        } else if (cleanMessage.includes('正在初始化')) {
            cleanMessage = cleanMessage.replace('正在初始化', 'Initializing ');
        } else if (cleanMessage.includes('尝试加载')) {
            cleanMessage = cleanMessage.replace('尝试加载', 'Attempting to load ');
        } else if (cleanMessage.includes('资源可访问')) {
            cleanMessage = cleanMessage.replace('资源可访问', 'Resource accessible');
        } else if (cleanMessage.includes('测试发生异常')) {
            cleanMessage = cleanMessage.replace('测试发生异常', 'Test exception occurred');
        } else if (cleanMessage.includes('开始转换')) {
            cleanMessage = cleanMessage.replace('开始转换', 'Starting conversion ');
        }
        
        const timestamp = new Date().toLocaleTimeString();
        elements.log.textContent += `[${timestamp}] ${cleanMessage}\n`;
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
                logger.log('日志复制失败，请手动选择复制');
            });
        } else {
            // 备用方案：选择文本
            try {
                const range = document.createRange();
                range.selectNodeContents(elements.log);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                logger.log('日志文本已选中，请按Ctrl+C复制');
            } catch (err) {
                console.error('选择文本失败:', err);
                logger.log('无法选择日志文本');
            }
        }
    }
};
