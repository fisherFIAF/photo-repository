# Change: parallel-thumbnail-generation

**Status**: implemented
**Date**: 2026-07-18
**Author**: fisher

## Summary

将缩略图生成从顺序执行改为并行执行（最多 10 路并发），显著加快大量图片的缩略图生成速度。

## Motivation

当前 `list_images` 的后台缩略图生成任务在单个 `for` 循环中逐个调用 `generate_thumbnail`，完全串行。对于一页 50 张大图，需要依次执行 50 次 decode + resize + encode，耗时与图片数量线性增长。改为并行（上限 10）可将总耗时缩短至约 1/5 ~ 1/10。

## Design

### 核心思路

`generate_thumbnail` 是 CPU 密集型操作（图片解码 + 缩放 + 编码），不能使用纯 async 实现并行（会阻塞 tokio 线程池）。必须使用 `spawn_blocking` 将每张图片的生成任务投递到 blocking 线程池，并通过 `tokio::sync::Semaphore` 限制最大并发数为 10。

### 并发控制

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;

const MAX_CONCURRENT: usize = 10;

let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
let mut handles = Vec::new();

for (i, (src, dest)) in thumb_tasks.into_iter().enumerate() {
    let permit = semaphore.clone().acquire_owned().await?;
    let app = app_clone.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let result = generate_thumbnail(&src, &dest);
        drop(permit);
        (i, result)
    });
    handles.push(handle);
}
```

### 进度事件扩展

当前 `ThumbProgress` 只有 `current` / `total`，前端用 `current - 1` 作为数组下标。并行执行完成顺序不确定，需要新增 `index` 字段标识具体哪个缩略图完成：

```rust
#[derive(Clone, serde::Serialize)]
struct ThumbProgress {
    index: usize,    // 新增：完成的缩略图在 items 数组中的下标
    current: usize,  // 累计完成数（用于进度条）
    total: usize,
}
```

使用 `AtomicUsize` 原子计数器跟踪累计完成数：

```rust
let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
```

每个任务完成后：`completed.fetch_add(1, Ordering::Relaxed) + 1` 得到当前 `current`。

### 结果收集

主任务通过 `join_all(handles)` 等待所有子任务完成，然后发送最终完成事件（`current == total`）。

### 前端适配

前端 `thumb-progress` 事件处理改为使用 `index` 字段标记对应图片的 `thumb_ready`，而非 `current - 1`：

```typescript
// 旧：images[event.current - 1].thumb_ready = true
// 新：images[event.index].thumb_ready = true
```

进度条百分比仍使用 `current / total` 计算，无需改动。

## Affected Specs

- 无现有 spec 文件需要修改

## Affected Code

### Rust 后端（`src-tauri/src/image.rs`）

- 新增 `MAX_CONCURRENT` 常量（值为 10）
- `ThumbProgress` 新增 `index: usize` 字段
- `list_images` 后台任务改为 semaphore + `spawn_blocking` 并行生成
- 使用 `AtomicUsize` 跟踪完成计数
- 使用 `join_all` 等待所有任务完成

### 前端（`src/App.tsx`）

- `ThumbProgress` 接口新增 `index: number` 字段
- 事件处理改为使用 `event.index` 标记 `thumb_ready`

## Implementation Plan

1. **后端**：修改 `image.rs`，引入 semaphore + `spawn_blocking` 并行生成逻辑，扩展 `ThumbProgress` 结构体
2. **前端**：修改 `App.tsx`，适配新的 `index` 字段
3. **验证**：`cargo check` / `cargo clippy` / `cargo test` 确保编译和测试通过
