# 页面布局

单页应用入口：`src/App.tsx` + `src/App.css`。无路由；用 `mode` 在三种视图间切换，DOM 同树共存，靠 CSS 显隐。

查找或修改任一 UI widget 时，**先读本文**，再按 class → `App.tsx` / `App.css` 定位。

---

## 总结构

```
.layout  (100vh, column flex)
├── .toolbar                    顶栏 25px（始终显示）
├── .work-area                  图片浏览工作区（grid）
├── .compare-work-area          目录比较工作区（compare）
├── .faces-work-area            人物标签工作区（faces）
├── .status-bar                 底栏 22px（grid）
├── .compare-status-bar         底栏 22px（compare）
└── .faces-status-bar           底栏 22px（faces）
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

| Widget | class / 元素 | 说明 |
|--------|----------------|------|
| 图片浏览 | `.toolbar-btn`（📁） | 切到 grid；无文件夹时打开目录 |
| 目录比较 | `.toolbar-btn`（🔀） | 切到 compare |
| 人物标签 | `.toolbar-btn`（👤） | 切到 faces |
| 标签筛选 | `.toolbar-filter` > `select` | 仅 `mode===grid` 且已选文件夹；高度 20px |
| 打开文件夹 | `.toolbar-filter` > `.toolbar-btn`（📂） | 同上条件 |

源码约：`App.tsx` 顶栏 JSX；样式 `.toolbar` / `.toolbar-btn` / `.toolbar-filter`。

---

## Grid：文件夹预览（图片浏览）

```
.work-area  (flex:1, overflow:auto)
├── .empty-state                无图时占位
└── .image-grid
    └── .image-item             双击用系统打开原图
        ├── .thumb-wrap 120×120
        │   ├── img | .thumb-placeholder
        │   └── .tag-badges > .tag-badge
        └── .image-name
```

| Widget | class | 关键约束 |
|--------|-------|----------|
| 工作区 | `.work-area` | 占满顶栏与底栏之间剩余高度 |
| 网格 | `.image-grid` | `auto-fill`，列最小 140px |
| 缩略图容器 | `.thumb-wrap` | **120×120** |
| 标签角标 | `.tag-badge` | 叠在缩略图左下，勿撑破 wrap |
| 文件名 | `.image-name` | `max-width: 120px` |

底栏 `.status-bar`（22px）：加载进度 `.progress-bar` / `.progress-text`，或「已加载 / 总数 / 筛选」文案。

---

## Compare：目录比较

```
.compare-work-area  (flex:1, column)
├── .compare-toolbar
│   ├── .toolbar-btn（左/右目录、刷新）
│   └── .compare-path
├── .empty-state | 比较中…
└── .compare-body > .compare-scroll
    └── .compare-row
        ├── .compare-cell-left > .compare-file
        ├── .compare-action-col > .compare-action-btn（→）
        ├── （间隔）
        ├── .compare-action-col > .compare-action-btn（←）
        └── .compare-cell-right > .compare-file
```

底栏 `.compare-status-bar`（22px）：左右独有 / 相同 / 不同 统计。

---

## Faces：人物标签

```
.faces-work-area  (flex:1, overflow:auto)
└── .faces-panel  (max-width: 960px)
    ├── .faces-section「1. 模板人脸」
    │   ├── .faces-actions > .faces-btn
    │   └── .sample-grid > .sample-card（72×72）
    ├── .faces-section「2. 人物标签」
    │   ├── .faces-actions（输入 / 创建 / 绑定）
    │   └── .tag-list > .tag-block
    │       ├── .tag-row（勾选、名、操作）
    │       └── .tag-samples > .sample-grid.compact
    ├── .faces-section「3. 批量打标」
    │   ├── .faces-actions
    │   └── .faces-progress（可选）
    └── .faces-status（可选）
```

| Widget | class | 备注 |
|--------|-------|------|
| 面板 | `.faces-panel` | 列布局，`gap: 20px` |
| 按钮 | `.faces-btn`（`.primary` / `.danger`） | |
| 输入 | `.faces-input` | |
| 样本卡 | `.sample-card` | **72×72**；含 checkbox、`.sample-delete-btn` |
| 标签块 | `.tag-block` / `.tag-row` / `.tag-samples` | |

底栏 `.faces-status-bar`（22px）：忙碌态或状态文案。

---

## 固定尺寸速查

| 区域 | 高度 / 关键 |
|------|------------|
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
| 全部 JSX / 模式切换 | `src/App.tsx`（约 `layoutClass` 与 `return`） |
| 布局与组件样式 | `src/App.css` |
| 模式显隐规则 | `.layout.compare-mode` / `.layout.faces-mode` |
