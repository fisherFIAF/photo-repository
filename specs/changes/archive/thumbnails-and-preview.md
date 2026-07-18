# 缩略图与图片预览

## 问题
1. 加载文件夹后图片以原图渲染（CSS 缩放），无真正缩略图
2. 点击图片无任何交互，无法预览或打开

## 变更

### Rust 端 (`src-tauri/`)
- 新增依赖：`image`、`md-5`
- 缩略图缓存目录：Linux `~/.cache/photo-repository/thumbs/`，Windows `{exe_dir}/cache/thumbs/`
- 缩略图命名：`{原文件名}_{md5(完整路径)}.{后缀}`
- `list_images` 改为分页：接收 `offset`/`limit`，返回 `{ total, items: Vec<ImageEntry> }`
- `ImageEntry` 新增 `thumb_path` 字段
- 每次调用只生成当前页图片的缩略图（命中缓存则跳过）

### 前端 (`src/`)
- `img.src` 改用 `convertFileSrc(img.thumb_path)`
- 分页加载：首次 `offset=0, limit=50`，滚动到底部时追加下一页
- 双击图片：通过 `@tauri-apps/plugin-opener` 用系统默认查看器打开原图

### 影响文件
- `src-tauri/Cargo.toml` — 新增依赖
- `src-tauri/src/lib.rs` — 核心逻辑变更
- `src/App.tsx` — 分页状态、缩略图 src、双击处理
- `package.json` — 可能需安装 `@tauri-apps/plugin-opener` npm 包
