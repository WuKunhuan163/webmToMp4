/**
 * 优化的FFmpeg WebM to MP4 转换器 - GitHub Pages 兼容版本
 * 支持Web Worker和多种性能优化策略
 * 不使用SharedArrayBuffer，确保GitHub Pages兼容性
 */

import PathResolver from './path-resolver.js';

class OptimizedFFmpegConverter {
    constructor(useWorker = true) {
        this.useWorker = useWorker;
        this.worker = null;
        this.ffmpeg = null;
        this.isLoaded = false;
        this.onProgress = null;
        this.onLog = null;
        this.conversionPromise = null;
        this.memoryPool = new Map(); // 内存池用于重用ArrayBuffer
        this.maxPoolSize = 5;        // 最大缓存数量
        this.isCancelled = false;    // 取消标志
        this.currentReject = null;   // 当前Promise的reject函数
    }

    // 初始化转换器
    async init() {
        if (this.isLoaded) return;

        if (this.useWorker && typeof Worker !== 'undefined') {
            return this.initWorker();
        } else {
            return this.initDirect();
        }
    }

    // 初始化Web Worker模式
    async initWorker() {
        try {
            if (this.onLog) this.onLog('正在初始化 FFmpeg Worker...');
            
            this.worker = new Worker(new URL('./ffmpeg-worker.js', import.meta.url), { type: 'module' });
            
            return new Promise((resolve, reject) => {
                this.worker.onmessage = (e) => {
                    const { type, message, success } = e.data;
                    
                    switch (type) {
                        case 'initialized':
                            if (success) {
                                this.isLoaded = true;
                                if (this.onLog) this.onLog('FFmpeg Worker 初始化完成！');
                                resolve();
                            } else {
                                reject(new Error('Worker 初始化失败'));
                            }
                            break;
                            
                        case 'log':
                            if (this.onLog) this.onLog(message);
                            break;
                            
                        case 'error':
                            reject(new Error(message));
                            break;
                    }
                };
                
                this.worker.onerror = (error) => {
                    reject(new Error(`Worker 错误: ${error.message}`));
                };
                
                // 发送初始化命令
                this.worker.postMessage({ type: 'init' });
            });
            
        } catch (error) {
            if (this.onLog) this.onLog(`Worker 初始化失败，切换到直接模式: ${error.message}`);
            this.useWorker = false;
            return this.initDirect();
        }
    }

    // 初始化直接模式
    async initDirect() {
        try {
            if (this.onLog) this.onLog('正在初始化 FFmpeg (直接模式)...');
            
            // GitHub Pages兼容版本 - 动态构建模块路径
            const logCallback = this.onLog ? this.onLog.bind(this) : null;
            
            const module = await PathResolver.loadFFmpegWithRetry('window', logCallback);
            const { FFmpeg } = module;
            this.ffmpeg = new FFmpeg();

            // 设置事件监听
            this.ffmpeg.on('log', ({ message }) => {
                if (this.onLog) this.onLog(`[FFmpeg] ${message}`);
            });

            this.ffmpeg.on('progress', ({ progress, time }) => {
                const percent = Math.round(progress * 100);
                if (this.onProgress) {
                    const timeInSeconds = time > 1000000 ? (time / 1000000).toFixed(2) : time.toFixed(2);
                    this.onProgress(percent, timeInSeconds);
                }
            });

            // 加载FFmpeg核心 - 使用最简化路径
            const { config: loadConfig, valid } = await PathResolver.validateLoadConfig('window', logCallback);
            
            if (!valid) {
                throw new Error('所需的FFmpeg核心文件不可访问');
            }
            
            if (this.onLog) this.onLog(`使用简化路径核心文件: ${loadConfig.coreURL}`);
            if (this.onLog) this.onLog(`使用简化路径WASM文件: ${loadConfig.wasmURL}`);
            
            await this.ffmpeg.load(loadConfig);

            this.isLoaded = true;
            if (this.onLog) this.onLog('FFmpeg 直接模式初始化完成！');

        } catch (error) {
            if (this.onLog) this.onLog(`FFmpeg 初始化失败: ${error.message}`);
            throw error;
        }
    }

    // 智能参数选择器
    getOptimalSettings(fileSize, duration = 5) {
        const fileSizeMB = fileSize / (1024 * 1024);
        
        // 根据文件大小和时长智能选择参数 - 极速模式
        if (fileSizeMB < 1) {
            // 小文件：极速模式
            return {
                preset: 'ultrafast',
                crf: 38,                // 极低质量，极高速度
                audioBitrate: '24k',    // 极低音频比特率
                fastMode: true,
                priority: 'speed'
            };
        } else if (fileSizeMB < 5) {
            // 中等文件：高速模式
            return {
                preset: 'ultrafast',
                crf: 35,
                audioBitrate: '32k',
                fastMode: true,
                priority: 'speed'
            };
        } else {
            // 大文件：快速模式
            return {
                preset: 'ultrafast',
                crf: 32,
                audioBitrate: '48k',
                fastMode: true,
                priority: 'speed'
            };
        }
    }

    // 转换WebM到MP4
    async convertWebMToMP4(webmBlob, options = {}) {
        if (!this.isLoaded) {
            throw new Error('转换器未初始化，请先调用 init()');
        }

        // 重置取消标志 - 新的转换开始时清除之前的取消状态
        this.isCancelled = false;
        this.currentReject = null;

        // 防止并发转换
        if (this.conversionPromise) {
            if (this.onLog) this.onLog('等待上一个转换任务完成...');
            await this.conversionPromise;
        }

        // 智能参数选择 - 强制重编码以确保兼容性
        if (!options.preset && !options.crf) {
            const optimalSettings = this.getOptimalSettings(webmBlob.size);
            options = { ...optimalSettings, ...options, fastMode: false }; // 强制关闭快速复制
            if (this.onLog) {
                this.onLog(`智能选择参数: ${optimalSettings.priority}模式 (preset=${optimalSettings.preset}, crf=${optimalSettings.crf}) - 强制重编码以确保兼容性`);
            }
        }

        if (this.useWorker && this.worker) {
            this.conversionPromise = this.convertWithWorker(webmBlob, options);
        } else {
            this.conversionPromise = this.convertDirect(webmBlob, options);
        }

        const result = await this.conversionPromise;
        this.conversionPromise = null;
        return result;
    }

    // 使用Worker转换 - GitHub Pages兼容版本
    async convertWithWorker(webmBlob, options) {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            
            // 保存reject函数以便取消时使用
            this.currentReject = reject;
            this.isCancelled = false;
            
            // 检查是否已被取消
            if (this.isCancelled) {
                reject(new Error('转换已被取消'));
                return;
            }
            
            this.worker.onmessage = (e) => {
                // 如果已被取消，忽略所有消息
                if (this.isCancelled) {
                    return;
                }
                
                const { type, buffer, percent, time, message } = e.data;
                
                switch (type) {
                    case 'progress':
                        if (this.onProgress) this.onProgress(percent, time);
                        break;
                        
                    case 'log':
                        if (this.onLog) this.onLog(message);
                        break;
                        
                    case 'completed':
                        this.currentReject = null;
                        const convertTime = ((Date.now() - startTime) / 1000).toFixed(2);
                        const mp4Blob = new Blob([buffer], { type: 'video/mp4' });
                        if (this.onLog) this.onLog(`Worker转换完成！耗时 ${convertTime} 秒`);
                        resolve(mp4Blob);
                        break;
                        
                    case 'reset_complete':
                        if (this.onLog) this.onLog('Worker状态重置完成');
                        break;
                        
                    case 'error':
                        this.currentReject = null;
                        reject(new Error(message));
                        break;
                }
            };
            
            try {
                // 发送转换命令 - 不使用Transferable Objects以确保兼容性
                const webmBuffer = await webmBlob.arrayBuffer();
                
                // 再次检查是否已被取消
                if (this.isCancelled) {
                    reject(new Error('转换已被取消'));
                    return;
                }
                
                this.worker.postMessage({
                    type: 'convert',
                    data: { webmBuffer, options }
                });
            } catch (error) {
                this.currentReject = null;
                reject(error);
            }
        });
    }

    // 直接转换
    async convertDirect(webmBlob, options) {
        const {
            preset = 'ultrafast',
            crf = 28,
            audioBitrate = '96k',
            fastMode = true
        } = options;

        try {
            if (this.onLog) this.onLog('开始转换 WebM 到 MP4...');

            // 写入输入文件
            const inputData = new Uint8Array(await webmBlob.arrayBuffer());
            await this.ffmpeg.writeFile('input.webm', inputData);

            // 始终使用重编码模式以确保兼容性
            if (this.onLog) this.onLog('使用重编码模式确保MP4兼容性...');
            let command = ['-i', 'input.webm'].concat([
                '-c:v', 'libx264',           // 强制使用H.264编码
                '-preset', preset,
                '-tune', 'zerolatency',
                '-crf', crf.toString(),
                '-pix_fmt', 'yuv420p',       // 确保像素格式兼容
                '-profile:v', 'baseline',    // 使用baseline profile确保最大兼容性
                '-level:v', '3.0',           // 设置H.264 level
                '-c:a', 'aac',               // 强制使用AAC音频编码
                '-b:a', audioBitrate,
                '-ac', '2',                  // 双声道
                '-ar', '44100',              // 标准采样率
                '-movflags', '+faststart',   // 优化流媒体播放
                '-threads', '0',             // 使用所有可用线程
                '-f', 'mp4',                 // 确保MP4格式
                'output.mp4'
            ]);

            await this.ffmpeg.exec(command);
            if (this.onLog) this.onLog('H.264/AAC重编码完成');

            const data = await this.ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

            // 清理临时文件
            await this.ffmpeg.deleteFile('input.webm');
            await this.ffmpeg.deleteFile('output.mp4');

            if (this.onLog) this.onLog('直接模式转换完成！');
            return mp4Blob;

        } catch (error) {
            if (this.onLog) this.onLog(`转换失败: ${error.message}`);
            
            if (options.fastMode !== false) {
                if (this.onLog) this.onLog('快速模式失败，尝试标准重编码...');
                return this.convertDirect(webmBlob, { ...options, fastMode: false });
            }
            
            throw error;
        }
    }

    // 设置进度回调
    setProgressCallback(callback) {
        this.onProgress = callback;
    }

    // 设置日志回调
    setLogCallback(callback) {
        this.onLog = callback;
    }

    // 检查是否已加载
    isReady() {
        return this.isLoaded;
    }

    // 获取转换器信息
    getInfo() {
        return {
            isLoaded: this.isLoaded,
            useWorker: this.useWorker,
            hasWorker: !!this.worker,
            hasFFmpeg: !!this.ffmpeg
        };
    }

    // 合成视频与背景图片
    async compositeVideoWithBackground(videoBlob, options) {
        if (!this.isLoaded) {
            throw new Error('转换器未初始化，请先调用 init()');
        }

        // 重置取消标志 - 新的合成开始时清除之前的取消状态
        this.isCancelled = false;
        this.currentReject = null;

        const { pptBackground, videoScale, overlayPosition, outputSize } = options;

        try {
            if (this.onLog) this.onLog('开始视频背景合成...');

            if (this.useWorker && this.worker) {
                return await this.compositeWithWorker(videoBlob, options);
            } else {
                return await this.compositeDirect(videoBlob, options);
            }
        } catch (error) {
            if (this.onLog) this.onLog(`背景合成失败: ${error.message}`);
            throw error;
        }
    }

    // Worker模式合成
    async compositeWithWorker(videoBlob, options) {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            
            this.worker.onmessage = (e) => {
                const { type, message, buffer } = e.data;
                
                switch (type) {
                    case 'log':
                        if (this.onLog) this.onLog(`[FFmpeg Worker] ${message}`);
                        break;
                        
                    case 'progress':
                        // 合成进度处理
                        if (this.onProgress) {
                            this.onProgress(e.data.percent, e.data.time);
                        }
                        break;
                        
                    case 'composite_complete':
                        const convertTime = ((Date.now() - startTime) / 1000).toFixed(2);
                        const mp4Blob = new Blob([buffer], { type: 'video/mp4' });
                        if (this.onLog) this.onLog(`Worker合成完成！耗时 ${convertTime} 秒`);
                        resolve(mp4Blob);
                        break;
                        
                    case 'error':
                        reject(new Error(message));
                        break;
                }
            };
            
            // 发送合成命令
            const videoBuffer = await videoBlob.arrayBuffer();
            this.worker.postMessage({
                type: 'composite',
                data: { videoBuffer, options }
            });
        });
    }

    // 直接模式合成
    async compositeDirect(videoBlob, options) {
        const { pptBackground, videoScale, overlayPosition, outputSize, autoTrimStart = true } = options;

        try {
            if (this.onLog) this.onLog('直接模式背景合成...');

            // 写入视频文件
            const videoData = new Uint8Array(await videoBlob.arrayBuffer());
            await this.ffmpeg.writeFile('input_video.webm', videoData);
            if (this.onLog) this.onLog(`输入视频大小: ${videoData.length} bytes`);

            // 检测视频开始时间（可选）
            let startTime = 0;
            if (autoTrimStart) {
                if (this.onLog) this.onLog('[视频检测] 开始检测视频实际开始时间...');
                startTime = await this.detectVideoStart('input_video.webm');
                if (startTime > 0) {
                    if (this.onLog) this.onLog(`[视频检测] 检测到视频实际开始时间: ${startTime.toFixed(2)}秒，将自动裁剪`);
                    if (this.onLog) this.onLog(`[视频检测] 裁剪设置: 从${startTime.toFixed(2)}秒开始，跳过前面的静态部分`);
                } else {
                    if (this.onLog) this.onLog('[视频检测] 视频从开头就有内容，无需裁剪');
                }
            } else {
                if (this.onLog) this.onLog('[视频检测] 自动裁剪功能已禁用');
            }

            // 读取PPT背景图片
            const response = await fetch(pptBackground);
            const pptData = new Uint8Array(await response.arrayBuffer());
            await this.ffmpeg.writeFile('background.jpg', pptData);
            if (this.onLog) this.onLog(`PPT背景图片大小: ${pptData.length} bytes`);

            if (this.onLog) this.onLog(`合成参数: 视频缩放=${videoScale}, 叠加位置=${overlayPosition}, 输出尺寸=${outputSize}`);

            // 确保输出尺寸是偶数（H.264要求）
            const [outputWidth, outputHeight] = outputSize.split(':').map(Number);
            const evenWidth = outputWidth % 2 === 0 ? outputWidth : outputWidth + 1;
            const evenHeight = outputHeight % 2 === 0 ? outputHeight : outputHeight + 1;
            const evenOutputSize = `${evenWidth}:${evenHeight}`;
            
            if (this.onLog) this.onLog(`调整输出尺寸: ${outputSize} -> ${evenOutputSize} (确保偶数)`);

            // 构建FFmpeg命令 - 修复静态背景与动态视频叠加问题
            const command = [
                '-loop', '1',                     // 循环背景图片
                '-i', 'background.jpg',           // 背景图片
            ];
            
            // 如果需要裁剪开头，添加 -ss 参数
            if (startTime > 0) {
                command.push('-ss', startTime.toString());
            }
            
            command.push(
                '-i', 'input_video.webm',         // 输入视频
                '-filter_complex', 
                `[0:v]scale=${evenOutputSize}[bg];[1:v]scale=${videoScale}[small];[bg][small]overlay=${overlayPosition}:shortest=1[v]`,
                '-map', '[v]',                    // 映射合成的视频流
                '-map', '1:a',                    // 映射原视频的音频流
                '-c:v', 'libx264',                // H.264编码
                '-preset', 'fast',                // 快速预设
                '-crf', '23',                     // 质量设置
                '-c:a', 'aac',                    // AAC音频
                '-b:a', '128k',                   // 音频比特率
                '-pix_fmt', 'yuv420p',           // 像素格式
                '-t', '30',                       // 限制最长30秒（防止卡死）
                'output_composite.mp4'
            );

            if (this.onLog) this.onLog(`FFmpeg合成命令: ${command.join(' ')}`);
            
            // 执行前检查输入文件
            try {
                const bgCheck = await this.ffmpeg.readFile('background.jpg');
                const videoCheck = await this.ffmpeg.readFile('input_video.webm');
                if (this.onLog) this.onLog(`执行前检查 - 背景图片: ${bgCheck.length} bytes, 视频: ${videoCheck.length} bytes`);
            } catch (error) {
                if (this.onLog) this.onLog(`执行前文件检查失败: ${error.message}`);
            }
            
            if (this.onLog) this.onLog('执行FFmpeg合成命令...');
            await this.ffmpeg.exec(command);
            
            // 执行后检查
            if (this.onLog) this.onLog('FFmpeg命令执行完成，检查输出文件...');

            // 读取输出文件
            const outputData = await this.ffmpeg.readFile('output_composite.mp4');
            if (this.onLog) this.onLog(`输出文件大小: ${outputData.length} bytes`);
            
            if (outputData.length < 1000) {
                if (this.onLog) this.onLog(`输出文件太小 (${outputData.length} bytes)，可能合成失败`);
                throw new Error(`合成失败：输出文件太小 (${outputData.length} bytes)`);
            }
            
            const compositeBlob = new Blob([outputData.buffer], { type: 'video/mp4' });

            // 清理临时文件
            await this.ffmpeg.deleteFile('input_video.webm');
            await this.ffmpeg.deleteFile('background.jpg');
            await this.ffmpeg.deleteFile('output_composite.mp4');

            if (this.onLog) this.onLog('背景合成完成！');
            return compositeBlob;

        } catch (error) {
            if (this.onLog) this.onLog(`背景合成失败: ${error.message}`);
            throw error;
        }
    }

    // 检测视频实际开始时间（跳过静态开头部分）
    async detectVideoStart(inputFile) {
        try {
            if (this.onLog) this.onLog('[场景检测] 开始分析视频场景变化...');
            
            // 使用场景检测找到第一个显著变化的时间点
            const command = [
                '-i', inputFile,
                '-vf', 'select=gt(scene\\,0.1)',  // 场景变化阈值0.1
                '-vsync', 'vfr',
                '-f', 'null',
                '-'
            ];

            if (this.onLog) this.onLog(`[场景检测] FFmpeg命令: ${command.join(' ')}`);

            // 捕获FFmpeg输出
            let logOutput = '';
            const originalOnLog = this.ffmpeg.on;
            
            // 临时捕获日志
            if (this.ffmpeg.on) {
                this.ffmpeg.on('log', ({ message }) => {
                    logOutput += message + '\n';
                    // 实时显示FFmpeg分析日志
                    if (this.onLog && message.includes('pts_time')) {
                        this.onLog(`[场景检测] FFmpeg输出: ${message.trim()}`);
                    }
                });
            }

            if (this.onLog) this.onLog('[场景检测] 执行场景检测命令...');
            await this.ffmpeg.exec(command);
            
            if (this.onLog) this.onLog(`[场景检测] 命令执行完成，分析输出日志 (${logOutput.length}字符)`);

            // 解析输出中的时间戳
            const lines = logOutput.split('\n');
            let foundScenes = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('pts_time')) {
                    const timeMatch = line.match(/pts_time:(\d+\.?\d*)/);
                    if (timeMatch) {
                        const sceneTime = parseFloat(timeMatch[1]);
                        foundScenes.push(sceneTime);
                        if (this.onLog) this.onLog(`[场景检测] 发现场景变化 #${foundScenes.length}: ${sceneTime.toFixed(2)}秒`);
                    }
                }
            }
            
            if (this.onLog) this.onLog(`[场景检测] 总共发现 ${foundScenes.length} 个场景变化`);
            
            if (foundScenes.length > 0) {
                const firstSceneTime = foundScenes[0];
                if (this.onLog) this.onLog(`[场景检测] 第一个场景变化: ${firstSceneTime.toFixed(2)}秒`);
                
                // 如果变化在合理范围内（0.3-10秒），认为是有效的开始时间
                if (firstSceneTime >= 0.3 && firstSceneTime <= 10.0) {
                    const startTime = Math.max(0, firstSceneTime - 0.1); // 提前0.1秒开始
                    if (this.onLog) this.onLog(`[场景检测] 设置开始时间: ${startTime.toFixed(2)}秒 (原场景时间-0.1秒)`);
                    return startTime;
                } else {
                    if (this.onLog) this.onLog(`[场景检测] 第一个场景变化时间不合理: ${firstSceneTime.toFixed(2)}秒 (应在0.3-10秒范围内)`);
                }
            } else {
                if (this.onLog) this.onLog('[场景检测] 未检测到任何场景变化');
            }

            if (this.onLog) this.onLog('[场景检测] 结论：从原始位置开始，无需裁剪');
            return 0;

        } catch (error) {
            if (this.onLog) this.onLog(`[场景检测] 检测失败: ${error.message}，从原始位置开始`);
            return 0;
        }
    }

    // 取消当前转换
    cancelConversion() {
        if (this.onLog) this.onLog('用户请求取消转换...');
        
        this.isCancelled = true;
        
        if (this.currentReject) {
            this.currentReject(new Error('转换已被用户取消'));
            this.currentReject = null;
        }
        
        // 清除转换Promise，避免阻塞后续转换
        this.conversionPromise = null;
        
        // 如果使用Worker，发送取消消息而不是终止Worker
        if (this.useWorker && this.worker) {
            if (this.onLog) this.onLog('发送取消请求到Worker...');
            this.worker.postMessage({ type: 'cancel' });
            
            // 重置Worker状态以便下次使用
            setTimeout(() => {
                if (this.worker) {
                    this.worker.postMessage({ type: 'reset' });
                }
            }, 100);
        }
        
        // 如果使用直接模式，FFmpeg没有直接的取消方法，但我们设置取消标志
        if (!this.useWorker && this.ffmpeg) {
            if (this.onLog) this.onLog('设置取消标志（直接模式）...');
            // 注意：FFmpeg.wasm 没有直接的取消方法，但我们可以通过Promise rejection来处理
        }
        
        if (this.onLog) this.onLog('取消请求已发送');
    }

    // 清理资源
    destroy() {
        this.cancelConversion(); // 先取消任何进行中的转换
        
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.ffmpeg = null;
        this.isLoaded = false;
        this.conversionPromise = null;
        this.memoryPool.clear(); // 清理内存池
        this.isCancelled = false;
        this.currentReject = null;
    }
}

// 导出模块
export default OptimizedFFmpegConverter;
