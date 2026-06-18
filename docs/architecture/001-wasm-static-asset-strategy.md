# 001 - WASM 引擎与静态资源管理策略

## 1. 背景与挑战 (Context)

在将 WebM 转换为 MP4 的核心架构中，我们强依赖于 `@ffmpeg/ffmpeg` 及其底层的 WebAssembly (WASM) 引擎。这属于将庞大的 C++ 库跨端移植至浏览器的硬核操作。
现代前端工程（如基于 Vite 构建的当前项目）默认会将所有位于 `src/` 目录下的 JavaScript 和依赖全部纳入构建管线，进行依赖树分析、代码压缩混淆（Minification）以及文件指纹哈希（Hashing）重命名。

然而，WASM 引擎的加载机制与传统 JS 模块截然不同。FFmpeg 核心在初始化时，会通过硬编码的相对路径发起网络 HTTP 请求（Fetch）去拉取 `.wasm` 二进制文件与配套的 `.worker.js`。一旦构建工具改变了这些文件的名称或破坏了它们的相对层级，底层的寻址逻辑就会触发不可挽回的 `404 Not Found` 错误。

## 2. 决策与方案 (Decision)

我们决定**彻底绕过 Vite 构建系统的模块解析，将 FFmpeg 依赖库物理沉淀至 `public/ffmpeg-libs/` 目录**。

## 3. 技术深度考量 (Technical Considerations)

这一设计的背后包含三个层面的工程考量：

### 3.1 规避构建副作用 (Bypassing Bundler Side-Effects)
`public/` 在 Vite 规范中是一个“特权绝对黑盒”。任何存放在此目录下的文件，在执行 `npm run build` 打包时，都会被**原封不动、一字不差**地强行拷贝至输出产物（`dist`）的根目录。这保证了 `ffmpeg-core.wasm` 等核心二进制文件的哈希签名、文件扩展名和相对目录结构绝对完整，确保 FFmpeg 初始化时的内置 Fetch 寻址算法能够 100% 命中。

### 3.2 Web Worker 的跨域与 MIME 严苛策略 (CORS & MIME Strictness)
项目启用了 SharedArrayBuffer 降级兼容的 Web Worker 多线程计算模式（大幅防止 UI 线程阻塞）。浏览器安全策略（CSP）对跨域 Worker 脚本以及 `.wasm` 文件的 MIME 类型（必须严格为 `application/wasm`）有着极其严苛的约束。
将其作为独立静态资源直接部署，能确保无论在本地开发环境、GitHub Pages（子路径），还是 Vercel（根路径）等 Serverless 环境中，静态文件服务器都能以最标准的 HTTP Header 进行下发，避免了由打包器注入的胶水代码所引发的安全沙箱拦截。

### 3.3 模块解耦与首屏性能 (Decoupling & FCP Optimization)
WASM 二进制包体积庞大（通常在 20MB-30MB 级别）。将其置于静态资源区，意味着主应用程序的 JS Bundle（如 `index.js`）能够保持极度轻量，保证了优异的首屏渲染时间（First Contentful Paint, FCP）。WASM 引擎仅在用户明确点击“转码”或“开启系统”时，按需向静态资源服务器发起拉取，实现了完美的按需加载。

## 4. 结论 (Consequences)
将硬核的二进制计算库下沉至静态目录，虽然看似破坏了现代前端“一切皆模块（Import Everything）”的直觉，但实际上是处理超大型 C++ WASM 移植包时业界推崇的**最佳实践**。这体现了对工具链边界的深刻理解以及务实的工程妥协。
