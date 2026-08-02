# Photo Repository

一款基于 Tauri v2 的桌面照片浏览工具，支持选择本地文件夹、缩略图生成与缓存、无限滚动加载，以及双击调用系统默认查看器打开原图。

## 功能特性

- **文件夹浏览** — 通过原生文件对话框选择本地文件夹，自动扫描其中的图片文件（支持 jpg、jpeg、png、gif、bmp、webp、svg、ico、tiff 共 10 种格式）
- **缩略图生成与缓存** — 使用 Rust `image` crate 生成 256×256 缩略图，基于文件路径 MD5 哈希命名，持久化缓存避免重复生成
- **并行缩略图处理** — 最多 10 个工作线程并发生成缩略图，大幅提升大文件夹的加载速度
- **实时进度反馈** — 后端通过 Tauri 事件系统逐张汇报缩略图生成进度，前端状态栏实时显示进度条
- **无限滚动分页** — 每次加载 50 张图片，滚动到底部自动加载下一页
- **系统查看器集成** — 双击图片使用系统默认图片查看器打开原图

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|---|---|---|
| React | 19.1 | UI 框架 |
| TypeScript | 5.8 | 类型安全的 JavaScript |
| Vite | 7.0 | 构建工具与开发服务器 |
| `@tauri-apps/api` | ^2 | Tauri IPC 通信 |
| `@tauri-apps/plugin-dialog` | ^2.7 | 原生文件对话框 |
| `@tauri-apps/plugin-opener` | ^2 | 调用系统默认程序打开文件 |

### 后端

| 技术 | 版本 | 用途 |
|---|---|---|
| Tauri | 2 | 桌面应用框架（基于 WebView） |
| `tauri-plugin-dialog` | 2 | 原生文件对话框插件 |
| `tauri-plugin-opener` | 2 | 文件打开插件 |
| `image` | 0.25 | 图片解码、缩放、编码（缩略图生成） |
| `md-5` | 0.10 | MD5 哈希（缓存文件命名） |
| `serde` / `serde_json` | 1 | 序列化 |

## 项目结构

```
photo-repository/
├── index.html                  # 入口 HTML
├── package.json                # JS 依赖与脚本
├── vite.config.ts              # Vite 配置（端口 1420）
├── tsconfig.json               # TypeScript 配置
├── src/                        # 前端（React）
│   ├── main.tsx                # React 入口
│   ├── App.tsx                 # 主应用组件（UI 逻辑、事件监听、分页加载）
│   ├── App.css                 # 全局样式（三栏布局、网格、进度条）
│   └── vite-env.d.ts           # Vite 类型声明
│
├── src-tauri/                  # 后端（Rust / Tauri）
│   ├── Cargo.toml              # Rust 依赖
│   ├── tauri.conf.json         # Tauri 应用配置
│   ├── capabilities/
│   │   └── default.json        # Tauri v2 权限配置
│   ├── icons/                  # 应用图标
│   └── src/
│       ├── main.rs             # 二进制入口
│       ├── lib.rs              # Tauri 应用构建、插件注册
│       ├── image.rs            # 核心逻辑：文件扫描、分页、缩略图调度
│       └── thumbnail.rs        # 缩略图生成：缓存目录、路径哈希、图片缩放
│
├── docs/                       # 文档目录
└── specs/changes/archive/      # 已实现功能的设计文档
```

## 环境准备

- [Node.js](https://nodejs.org/)（建议 18+）
- [bun](https://bun.sh/)（推荐的 JS 包管理器，也可使用 npm）
- [Rust](https://www.rust-lang.org/tools/install)（稳定版）
- 系统依赖：参考 [Tauri v2 前置条件文档](https://v2.tauri.app/start/prerequisites/)

## 快速开始

### 安装依赖

```bash
bun install
```

### 开发模式

启动 Tauri 开发模式（Rust 编译 + Vite HMR 热更新）：

```bash
bun run tauri dev
```

仅启动前端开发服务器（端口 1420）：

```bash
bun run dev
```

### 生产构建

```bash
bun run tauri build
```

构建产物位于 `src-tauri/target/release/` 目录下。

### 运行测试

```bash
cd src-tauri && cargo test
```

## 架构概览

### 数据流

```
用户选择文件夹
    │
    ▼
前端 invoke("list_images", path, offset, limit)
    │
    ▼
后端扫描目录 → 过滤图片文件 → 分页构建 ImageEntry
    │
    ├── 立即返回当前页数据（thumb_ready = false）
    │
    └── 后台线程池（≤10 线程）生成缩略图
            │
            ▼
        每完成一张 → emit("thumb-progress", { index, thumb_path })
            │
            ▼
        前端监听事件 → 更新对应图片 thumb_ready → 显示缩略图
```

### 缩略图缓存

- **Linux**: `~/.cache/photo-repository/thumbs/`
- **其他平台**: `{可执行文件目录}/cache/thumbs/`
- **命名规则**: `{原文件名}_{md5(绝对路径)}.{扩展名}`

### UI 布局

三栏垂直布局：
- **工具栏**（顶部，25px）— 文件夹选择按钮
- **工作区**（中间，flex 自适应）— 可滚动的图片网格
- **状态栏**（底部，22px）— 进度条与状态信息

图片网格使用 CSS Grid，`auto-fill, minmax(140px, 1fr)` 自适应列数。

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT
