/**
 * 统一路径解析器 - 为所有资源提供一致的路径解析
 * 确保在不同上下文（window、worker、GitHub Pages）中都能正确解析路径
 */

export class PathResolver {
    /**
     * 获取项目基础URL
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} 基础URL，以斜杠结尾
     */
    static getBaseURL(context = 'window') {
        let baseURL;
        
        if (context === 'worker') {
            // 在Worker中，Worker文件在 src/modules 目录下，需要回退两级到项目根目录
            baseURL = new URL('../../', self.location.href).href;
        } else {
            // 在主线程中，使用当前目录（项目根目录）
            baseURL = new URL('./', window.location.href).href;
        }
        
        // 确保URL以斜杠结尾
        return baseURL.endsWith('/') ? baseURL : baseURL + '/';
    }
    
    /**
     * 解析项目资源路径
     * @param {string} relativePath - 相对于项目根目录的路径
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} 完整的资源URL
     */
    static resolveAsset(relativePath, context = 'window') {
        const baseURL = this.getBaseURL(context);
        
        // 移除开头的 ./ 如果存在
        const cleanPath = relativePath.replace(/^\.\//, '');
        
        return baseURL + cleanPath;
    }
    
    /**
     * 解析FFmpeg库文件路径
     * @param {string} libPath - FFmpeg库内的相对路径
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} 完整的FFmpeg库文件URL
     */
    static resolveFFmpegLib(libPath, context = 'window') {
        const baseURL = this.getBaseURL(context);
        return baseURL + 'ffmpeg-libs/' + libPath;
    }
    
    /**
     * 获取FFmpeg模块URL
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} FFmpeg模块URL
     */
    static getFFmpegModuleURL(context = 'window') {
        return this.resolveFFmpegLib('ffmpeg/ffmpeg/dist/esm/index.js', context);
    }
    
    /**
     * 获取FFmpeg核心URL
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} FFmpeg核心URL
     */
    static getFFmpegCoreURL(context = 'window') {
        return this.resolveFFmpegLib('ffmpeg/core/dist/esm/ffmpeg-core.js', context);
    }
    
    /**
     * 获取FFmpeg WASM URL
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {string} FFmpeg WASM URL
     */
    static getFFmpegWasmURL(context = 'window') {
        return this.resolveFFmpegLib('ffmpeg/core/dist/esm/ffmpeg-core.wasm', context);
    }
    
    /**
     * 获取加载配置
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {object} 包含coreURL和wasmURL的配置对象
     */
    static getLoadConfig(context = 'window') {
        return {
            coreURL: this.getFFmpegCoreURL(context),
            wasmURL: this.getFFmpegWasmURL(context)
        };
    }
    
    /**
     * 验证资源URL是否可访问
     * @param {string} url - 要验证的URL
     * @param {function} logCallback - 日志回调函数
     * @returns {Promise<boolean>} 是否可访问
     */
    static async validateResourceURL(url, logCallback = null) {
        try {
            const response = await fetch(url, { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                if (logCallback) logCallback(`资源可访问: ${url}`);
                return true;
            } else {
                if (logCallback) logCallback(`资源不可访问 (${response.status}): ${url}`);
                return false;
            }
        } catch (error) {
            if (logCallback) logCallback(`资源检查失败: ${url} - ${error.message}`);
            return false;
        }
    }
    
    /**
     * 验证加载配置
     * @param {string} context - 上下文：'window' 或 'worker'
     * @param {function} logCallback - 日志回调函数
     * @returns {Promise<{config: object, valid: boolean}>} 配置和验证结果
     */
    static async validateLoadConfig(context = 'window', logCallback = null) {
        const config = this.getLoadConfig(context);
        
        if (logCallback) {
            logCallback('验证FFmpeg核心文件...');
        }
        
        const coreAccessible = await this.validateResourceURL(config.coreURL, logCallback);
        const wasmAccessible = await this.validateResourceURL(config.wasmURL, logCallback);
        
        if (coreAccessible && wasmAccessible) {
            if (logCallback) {
                logCallback('所有核心文件都可以访问');
            }
            return { config, valid: true };
        } else {
            if (logCallback) {
                logCallback('部分核心文件无法访问');
            }
            return { config, valid: false };
        }
    }
    
    /**
     * 加载FFmpeg模块（带重试）
     * @param {string} context - 上下文：'window' 或 'worker'
     * @param {function} logCallback - 日志回调函数
     * @param {number} maxRetries - 最大重试次数
     * @returns {Promise<object>} FFmpeg模块
     */
    static async loadFFmpegWithRetry(context = 'window', logCallback = null, maxRetries = 3) {
        const moduleURL = this.getFFmpegModuleURL(context);
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (logCallback) {
                    logCallback(`尝试加载FFmpeg模块 (第${attempt}次): ${moduleURL}`);
                }
                
                // 验证资源是否可访问
                const isAccessible = await this.validateResourceURL(moduleURL, logCallback);
                if (!isAccessible && attempt < maxRetries) {
                    if (logCallback) logCallback(`资源不可访问，将重试...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                
                if (!isAccessible) {
                    throw new Error('资源不可访问');
                }
                
                const module = await import(moduleURL);
                
                if (logCallback) {
                    logCallback(`FFmpeg模块加载成功 (第${attempt}次尝试)`);
                }
                
                return module;
                
            } catch (error) {
                lastError = error;
                
                if (logCallback) {
                    logCallback(`第${attempt}次加载失败: ${error.message}`);
                }
                
                if (attempt < maxRetries) {
                    if (logCallback) {
                        logCallback(`⏳ 等待${attempt}秒后重试...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        
        throw new Error(`FFmpeg模块加载失败 (尝试${maxRetries}次): ${lastError.message}`);
    }
    
    /**
     * 获取配置信息（用于调试）
     * @param {string} context - 上下文：'window' 或 'worker'
     * @returns {object} 配置信息对象
     */
    static getConfigInfo(context = 'window') {
        const baseURL = this.getBaseURL(context);
        return {
            baseURL,
            ffmpegModule: this.getFFmpegModuleURL(context),
            ffmpegCore: this.getFFmpegCoreURL(context),
            ffmpegWasm: this.getFFmpegWasmURL(context),
            context,
            timestamp: new Date().toISOString()
        };
    }
}

export default PathResolver;

