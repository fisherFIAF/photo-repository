# 页面布局

单页应用入口：`src/App.tsx`（shell）+ `src/App.css`（全局壳与模式显隐）。无路由；用 `mode` 在三种视图间切换，DOM 同树共存，靠 CSS 显隐。

查找或修改任一 UI widget 时，**先读本文**，再按 class → 对应组件文件定位。

---

## 总结构

```
.layout  (100vh, column flex)
├── .toolbar                    顶栏 25px（始终显示）  → components/Toolbar.tsx
├── .work-area                  图片浏览工作区（grid） → features/grid/GridView.tsx
├── .compare-work-area          目录比较工作区         → features/compare/CompareView.tsx
├── .compare-status-bar         底栏（compare）        → 同上 Fragment
├── .faces-work-area            人物标签工作区         → features/faces/FacesView.tsx
├── .faces-status-bar           底栏（faces）          → 同上 Fragment
└── .status-bar                 底栏（grid）           → features/grid/GridStatusBar.tsx
```

根 class 随模式变化：

| `mode` | `layoutClass` | 可见工作区 / 底栏 |
|--------|---------------|-------------------|
| `"grid"`（默认） | `layout` | `.work-area` + `.status-bar` |
| `"compare"` | `layout compare-mode` | `.compare-work-area` + `.compare-status-bar` |
| `"faces"` | `layout faces-mode` | `.faces-work-area` + `.faces-status-bar` |

---

## 顶栏 `.toolbar`

- **尺寸：** `height` / `min-height` **25px**，`sticky`，背景 `#d6eaf8`
- **对齐：** `display: flex; align-items: center`
- **约束：** 子控件高度不得超过 25px

| Widget | class / 元素 | 文件 |
|--------|----------------|------|
| 图片浏览 | `.toolbar-btn`（📁） | `components/Toolbar.tsx` |
| 目录比较 | `.toolbar-btn`（🔀） | 同上 |
| 人物标签 | `.toolbar-btn`（👤） | 同上 |
| 标签筛选 | `.toolbar-filter` > `select` | 同上 |
| 打开文件夹 | `.toolbar-filter` > `.toolbar-btn`（📂） | 同上 |

样式：`App.css` 中 `.toolbar` / `.toolbar-btn` / `.toolbar-filter`。

---

## Grid：文件夹预览（图片浏览）

```
.work-area  (flex:1, overflow:auto)     GridView.tsx
├── .empty-state
└── .image-grid
    └── .image-item                     ImageItem.tsx
        ├── .thumb-wrap 120×120
        │   ├── img | .thumb-placeholder
        │   └── .tag-badges > .tag-badge
        └── .image-name
```

| Widget | class | 文件 |
|--------|-------|------|
| 工作区 | `.work-area` | `features/grid/GridView.tsx` |
| 缩略图项 | `.image-item` | `features/grid/ImageItem.tsx` |
| 底栏 | `.status-bar` | `features/grid/GridStatusBar.tsx` |
| 加载逻辑 | — | `features/grid/useGridImages.ts` |
| 样式 | — | `features/grid/grid.css` |

---

## Compare：目录比较

```
.compare-work-area                      CompareView.tsx
├── .compare-toolbar
│   ├── .toolbar-btn（左/右目录、刷新）
│   └── .compare-path
├── .empty-state | 比较中…
└── .compare-body > .compare-scroll
    └── .compare-row                    CompareRow.tsx
        ├── .compare-cell-left > .compare-file
        ├── .compare-action-col > .compare-action-btn
        └── .compare-cell-right > .compare-file
```

| Widget | class | 文件 |
|--------|-------|------|
| 视图 | `.compare-work-area` | `features/compare/CompareView.tsx` |
| 行 | `.compare-row` | `features/compare/CompareRow.tsx` |
| 底栏 | `.compare-status-bar` | `features/compare/CompareStatusBar.tsx` |
| 逻辑 | — | `features/compare/useCompare.ts` |
| 样式 | — | `features/compare/compare.css` |

---

## Faces：人物标签

```
.faces-work-area                        FacesView.tsx
└── .faces-panel
    ├── .faces-section「1. 模板人脸」    InboxSection.tsx
    │   └── .sample-grid > .sample-card SampleCard.tsx
    ├── .faces-section「2. 人物标签」    TagListSection.tsx
    │   └── .tag-list > .tag-block      TagBlock.tsx
    ├── .faces-section「3. 批量打标」    BatchTagSection.tsx
    └── .faces-status
```

| Widget | class | 文件 |
|--------|-------|------|
| 视图 | `.faces-work-area` | `features/faces/FacesView.tsx` |
| 收件箱 | `.faces-section` | `features/faces/InboxSection.tsx` |
| 标签列表 | `.tag-list` | `features/faces/TagListSection.tsx` |
| 标签块 | `.tag-block` | `features/faces/TagBlock.tsx` |
| 样本卡 | `.sample-card` | `features/faces/SampleCard.tsx` |
| 批量打标 | `.faces-section` | `features/faces/BatchTagSection.tsx` |
| 底栏 | `.faces-status-bar` | `features/faces/FacesStatusBar.tsx` |
| 逻辑 | — | `features/faces/useFaces.ts` |
| 样式 | — | `features/faces/faces.css` |

---

## 共享状态（留在 App）

跨视图共用、暂未抽 Context：

- `folderPath` / `filterTagId` / `folderTagMap` — grid 筛选与 faces 打标
- `personTags` — 顶栏筛选与 faces 标签列表

类型：`src/types.ts`。工具：`src/lib/fileIcon.ts`。

---

## 固定尺寸速查

| 区域 | 高度 / 尺寸 |
|------|-------------|
| `.toolbar` | **25px** |
| `.toolbar-filter select` | **20px**（须 ≤ toolbar） |
| `.status-bar` / `.compare-status-bar` / `.faces-status-bar` | **22px** |
| `.thumb-wrap` / 缩略图 | **120×120** |
| `.sample-card` 图 | **72×72** |

子控件不得超出父容器可用宽高（见 `.cursor/rules/frontend-ui-layout.mdc`）。

---

## 源码索引

| 内容 | 位置 |
|------|------|
| Shell / 模式切换 | `src/App.tsx` |
| 布局壳 + 模式显隐 | `src/App.css` |
| 共享类型 | `src/types.ts` |
| Grid | `src/features/grid/` |
| Compare | `src/features/compare/` |
| Faces | `src/features/faces/` |
| 顶栏 | `src/components/Toolbar.tsx` |
