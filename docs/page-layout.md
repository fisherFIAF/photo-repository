# 页面布局

单页应用入口：`src/App.tsx`（shell）+ `src/App.css`（全局壳与 Tab 显隐）。无路由；用 **统一 Tab 模型** 切换工作区内容，DOM 同树共存，靠当前激活 Tab 控制显隐。

查找或修改任一 UI widget 时，**先读本文**，再按 class → 对应组件文件定位。

命名约定：**工具栏** = `.toolbar`（勿称「顶栏」）。

---

## 总结构

```
.layout  (100vh, column flex)
├── .toolbar                    工具栏 25px（始终显示）     → components/Toolbar.tsx
├── .tab-bar                    Tab 条 24px（有 Tab 时显示） → components/TabBar.tsx
├── .work-area                  文件夹浏览工作区             → features/grid/GridView.tsx
├── .compare-work-area          目录比较工作区               → features/compare/CompareView.tsx
├── .compare-status-bar         底栏（compare）              → 同上 Fragment
├── .faces-work-area            人物标签工作区               → features/faces/FacesView.tsx
├── .faces-status-bar           底栏（faces）                → 同上 Fragment
└── .status-bar                 底栏（folder）               → features/grid/GridStatusBar.tsx
```

根 class 随 **激活 Tab 类型** 变化（取代旧的 `mode`）：

| 激活 Tab `kind` | `layoutClass` | 可见工作区 / 底栏 |
|-----------------|---------------|-------------------|
| 无 Tab / 空 | `layout` | 空工作区提示（无 Tab 条） |
| `"folder"` | `layout` | `.work-area` + `.status-bar` |
| `"compare"` | `layout compare-mode` | `.compare-work-area` + `.compare-status-bar` |
| `"faces"` | `layout faces-mode` | `.faces-work-area` + `.faces-status-bar` |

---

## 工具栏 `.toolbar`

- **尺寸：** `height` / `min-height` **25px**，`sticky`，背景 `#d6eaf8`
- **对齐：** `display: flex; align-items: center`
- **约束：** 子控件高度不得超过 25px
- **展示：** 仅图标（`title` 为中文提示）

| Widget | class / 元素 | 行为 |
|--------|----------------|------|
| 打开文件夹 | `.toolbar-btn`（📂） | 选目录 → 新增或激活文件夹 Tab（≤7） |
| 目录比较 | `.toolbar-btn`（🔀） | 新建或激活唯一的比较 Tab |
| 人物标签 | `.toolbar-btn`（👤） | 新建或激活唯一的人物标签 Tab |
| 标签筛选 | `.toolbar-filter` > `select` | **仅当激活 Tab 为文件夹时显示**；其它 Tab 隐藏 |

无「图片浏览」按钮（与「打开文件夹」重复，已移除）。

样式：`App.css` 中 `.toolbar` / `.toolbar-btn` / `.toolbar-filter`。

---

## Tab 条 `.tab-bar`

- **位置：** 工具栏 **下一行**（与工具栏分离，不在同一行）
- **尺寸：** `height` / `min-height` **24px**；有至少一个 Tab 时显示，否则不占位
- **约束：** 子控件高度不得超过 24px；路径过长省略，`title` 显示完整路径

| Tab 类型 | 上限 | 图标 | 标签文案 | id |
|----------|------|------|----------|-----|
| 文件夹浏览 | **7** | 🖼️ | 目录绝对路径 | 稳定唯一 id |
| 目录比较 | **1** | 🔀 | 「目录比较」 | 固定 `"compare"` |
| 人物标签 | **1** | 👤 | 「人物标签」 | 固定 `"faces"` |

规则：

- 打开文件夹：同路径已存在 → 只激活该 Tab，不新建；已达 7 个不同路径 → 提示并拒绝
- 目录比较 / 人物标签：已存在 → 只激活；不存在 → 新建唯一 Tab
- 每个 Tab 可关闭（×）；关闭当前则激活相邻 Tab；全部关闭 → 空工作区
- 点击 Tab → 设为激活，切换工作区内容

文件：`components/TabBar.tsx`；样式：`App.css` 中 `.tab-bar` / `.tab` / `.tab-close`。

---

## Folder：文件夹浏览（原 grid）

```
.work-area  (flex:1, overflow:auto)     GridView.tsx
├── .empty-state                        （无文件夹 Tab 或当前列表为空）
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
| 加载逻辑 | — | `features/grid/useGridImages.ts`（按激活文件夹 Tab） |
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

说明：工作区内的 `.compare-toolbar` 是比较视图自己的操作条，**不是**全局工具栏。

---

## Faces：人物标签

```
.faces-work-area                        FacesView.tsx
└── .faces-panel
    ├── .faces-section「1. 模板人脸」    InboxSection.tsx
    │   └── .sample-grid > .sample-card SampleCard.tsx
    ├── .faces-section「2. 人物标签」    TagListSection.tsx
    │   └── .tag-list > .tag-block      TagBlock.tsx
    │       ├── .tag-row（含 .tag-expand-btn，默认折叠）
    │       └── .tag-samples（展开时才显示）
    ├── .faces-section「3. 批量打标」    BatchTagSection.tsx
    └── .faces-status
```

| Widget | class | 文件 |
|--------|-------|------|
| 视图 | `.faces-work-area` | `features/faces/FacesView.tsx` |
| 收件箱 | `.faces-section` | `features/faces/InboxSection.tsx` |
| 标签列表 | `.tag-list` | `features/faces/TagListSection.tsx` |
| 标签块 | `.tag-block` | `features/faces/TagBlock.tsx` |
| 展开/折叠 | `.tag-expand-btn`（▸/▾） | 同上；默认折叠，不显示模板图 |
| 样本卡 | `.sample-card` | `features/faces/SampleCard.tsx` |
| 批量打标 | `.faces-section` | `features/faces/BatchTagSection.tsx` |
| 底栏 | `.faces-status-bar` | `features/faces/FacesStatusBar.tsx` |
| 逻辑 | — | `features/faces/useFaces.ts` |
| 样式 | — | `features/faces/faces.css` |

批量打标使用的「当前文件夹」= **最近激活的文件夹 Tab 路径**（若无文件夹 Tab 则为空）。

---

## 共享状态（留在 App）

跨视图共用、暂未抽 Context：

- `tabs` / `activeTabId` — 统一 Tab 列表与激活项
- 激活文件夹的 `path`、`filterTagId`、`folderTagMap` — 文件夹筛选与 faces 打标
- `personTags` — 工具栏筛选与 faces 标签列表

类型：`src/types.ts`（含 `AppTab` 等）。工具：`src/lib/fileIcon.ts`。

---

## 固定尺寸速查

| 区域 | 高度 / 尺寸 |
|------|-------------|
| `.toolbar`（工具栏） | **25px** |
| `.toolbar-filter select` | **20px**（须 ≤ 工具栏） |
| `.tab-bar` | **24px** |
| `.tab` / `.tab-close` | 高度 ≤ 24px |
| `.status-bar` / `.compare-status-bar` / `.faces-status-bar` | **22px** |
| `.thumb-wrap` / 缩略图 | **120×120** |
| `.sample-card` 图 | **72×72** |

子控件不得超出父容器可用宽高（见 `.cursor/rules/frontend-ui-layout.mdc`）。

---

## 源码索引

| 内容 | 位置 |
|------|------|
| Shell / Tab 切换 | `src/App.tsx` |
| 布局壳 + Tab 显隐 | `src/App.css` |
| 共享类型 | `src/types.ts` |
| Grid（文件夹浏览） | `src/features/grid/` |
| Compare | `src/features/compare/` |
| Faces | `src/features/faces/` |
| 工具栏 | `src/components/Toolbar.tsx` |
| Tab 条 | `src/components/TabBar.tsx` |
