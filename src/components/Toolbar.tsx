import type { PersonTag, ViewMode } from "../types";

interface ToolbarProps {
  mode: ViewMode;
  folderPath: string;
  personTags: PersonTag[];
  filterTagId: string;
  onSelectGrid: () => void;
  onSelectCompare: () => void;
  onSelectFaces: () => void;
  onFilterChange: (tagId: string) => void;
  onOpenFolder: () => void;
}

export function Toolbar({
  mode,
  folderPath,
  personTags,
  filterTagId,
  onSelectGrid,
  onSelectCompare,
  onSelectFaces,
  onFilterChange,
  onOpenFolder,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button
        className={`toolbar-btn ${mode === "grid" ? "active" : ""}`}
        onClick={onSelectGrid}
        title="图片浏览"
      >
        📁
      </button>
      <button
        className={`toolbar-btn ${mode === "compare" ? "active" : ""}`}
        onClick={onSelectCompare}
        title="目录比较"
      >
        🔀
      </button>
      <button
        className={`toolbar-btn ${mode === "faces" ? "active" : ""}`}
        onClick={onSelectFaces}
        title="人物标签"
      >
        👤
      </button>
      {mode === "grid" && folderPath && (
        <div className="toolbar-filter">
          <select
            value={filterTagId}
            onChange={(e) => onFilterChange(e.target.value)}
            title="按人物标签筛选"
          >
            <option value="">全部图片</option>
            {personTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="toolbar-btn" title="打开文件夹" onClick={onOpenFolder}>
            📂
          </button>
        </div>
      )}
    </div>
  );
}
