# Change: thumbnail-progress

**Status**: implemented
**Date**: 2026-07-18
**Author**: fisher

## Summary

首页加载缩略图时增加进度条，后端异步生成缩略图并通过 Tauri 事件逐步回报进度，前端在底部状态栏展示进度条。

## Motivation

当前 `list_images` 命令在返回前同步生成当前页所有缩略图，图片较多时页面长时间无响应且无任何加载反馈。需要将缩略图生成改为异步，并向前端实时报告进度。

## Design

### 整体流程

1. 前端调用 `list_images` 命令
2. 后端**立即**扫描文件、计算缩略图路径，返回 `{ total, items }`（此时缩略图尚未生成，`thumb_ready = false`）
3. 后端通过 `tauri::async_runtime::spawn` 启动后台任务，逐个生成缩略图
4. 每完成一个缩略图，后端通过 `app.emit("thumb-progress", ...)` 发送进度事件
5. 前端监听 `thumb-progress` 事件，更新进度条和对应图片的缩略图
6. 当前批次全部完成后，前端清除进度条

### 后端

新增进度事件数据结构：

```rust
#[derive(Clone, serde::Serialize)]
struct ThumbProgress {
    current: usize,   // 已完成数量
    total: usize,     // 当前批次总数
}
```

`list_images` 命令修改：

- 新增参数 `app: tauri::AppHandle`
- `ImageEntry` 新增 `thumb_ready: bool` 字段，初始返回 `false`
- 扫描文件并计算缩略图路径后**立即返回**结果
- 通过 `tauri::async_runtime::spawn` 启动后台任务，逐个生成缩略图并 emit 进度事件

### 前端

- 在页面最底部新增**状态栏**，高度与顶部工具栏（`bar-row`）一致，固定位置
- 状态栏内显示进度条（加载时）或文件统计信息（空闲时）
- 进度条颜色为**蓝色**
- 监听 `thumb-progress` 事件：
  - 更新进度条百分比
  - 将对应图片的 `thumb_ready` 设为 `true`，触发缩略图渲染
- 当 `current === total` 时，清除进度条，恢复空闲状态

### 页面布局变化

```
┌──────────────────────────┐
│  工具栏 (bar-row)         │  ← 已有，顶部
├──────────────────────────┤
│                          │
│  工作区 (work-area)       │  ← flex: 1，中间
│                          │
├──────────────────────────┤
│  状态栏 (status-bar)      │  ← 新增，底部固定
└──────────────────────────┘
```

## Affected Specs

- 无现有 spec 文件需要修改（`specs/` 下当前无 spec 文件）

## Affected Code

### Rust 后端（`src-tauri/src/image.rs`）

- 新增 `ThumbProgress` 结构体
- `ImageEntry` 新增 `thumb_ready: bool` 字段
- `list_images` 新增 `app: tauri::AppHandle` 参数
- `list_images` 改为立即返回 + spawn 后台缩略图生成任务
- 后台任务逐个生成缩略图并 emit `thumb-progress` 事件

### 前端（`src/App.tsx`）

- `ImageEntry` 接口新增 `thumb_ready: boolean`
- 新增 `thumb-progress` 事件监听
- 新增进度状态管理（`progressCurrent`, `progressTotal`）
- 图片 `src` 根据 `thumb_ready` 条件渲染（未就绪时显示占位符）
- 状态栏内展示进度条

### 前端样式（`src/App.css`）

- 调整 `.layout` 为三段式布局（工具栏 / 工作区 / 状态栏）
- 新增底部 `.status-bar` 样式，高度与 `.bar-row` 一致
- 新增进度条样式（蓝色）

## Implementation Plan

分为 4 个独立步骤：

### Step 1: 前端 — 状态栏 UI 与固定进度条（先行验证）

1. 布局调整为三段式（工具栏 / 工作区 / 底部状态栏）
2. 底部新增状态栏，高度同工具栏
3. 状态栏内展示蓝色进度条，固定为 80%
4. 检查前端页面，确认状态栏和进度条显示无误
5. `App.css` 新增状态栏和进度条样式

### Step 2: 后端 — 异步缩略图生成与进度事件

1. `image.rs` 新增 `ThumbProgress` 结构体
2. `ImageEntry` 新增 `thumb_ready` 字段
3. `list_images` 新增 `app: tauri::AppHandle` 参数
4. 重构 `list_images`：立即返回结果，spawn 后台任务逐个生成缩略图并 emit 事件
5. `cargo check` / `cargo clippy` 验证

### Step 3: 前端 — 接入真实进度事件

1. `App.tsx` 新增 `thumb_ready` 字段、进度状态、事件监听
2. 图片根据 `thumb_ready` 条件渲染（未就绪时显示占位符）
3. 进度条由固定 80% 改为响应 `thumb-progress` 事件的真实进度
4. 当 `current === total` 时清除进度条

### Step 4: 集成验证

1. 更新 `lib.rs` 中的测试以适配新的 `list_images` 签名
2. 运行 `cargo test` 确保后端测试通过
3. 构建并手动验证完整流程
