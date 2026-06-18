# Architecture Decision Records (ADRs) & Technical Notes

本目录用于存档 `webmToMp4` 项目演进过程中的核心技术考量与架构设计决策。

在工程实践中，记录“为什么这么做”（Why）往往比记录“怎么做”（How）更有价值。这里的每一份文档（Markdown 格式）都详细阐述了我们在特定场景下面临的工程挑战、采用的技术方案及其背后的深层考量。

## 目录 / Index

| 编号 | 核心议题 | 文档链接 | 描述 |
| :--- | :--- | :--- | :--- |
| 001 | WASM 引擎与静态资源管理策略 | [001-wasm-static-asset-strategy.md](./001-wasm-static-asset-strategy.md) | 论述为何将 `@ffmpeg/ffmpeg` 核心库脱离 Vite 构建管线，沉淀至 `public/` 目录 |
