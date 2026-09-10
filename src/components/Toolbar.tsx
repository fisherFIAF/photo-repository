import type { AppTab, PersonTag } from "../types";

interface ToolbarProps {
  activeTab: AppTab | null;
  personTags: PersonTag[];
  filterTagId: string;
  onOpenFolder: () => void;
  onOpenCompare: () => void;
  onOpenFaces: () => void;
  onFilterChange: (tagId: string) => void;
}

export function Toolbar({
  activeTab,
  personTags,
  filterTagId,
  onOpenFolder,
  onOpenCompare,
  onOpenFaces,
  onFilterChange,
}: ToolbarProps) {
  const kind = activeTab?.kind ?? null;

  return (
    <div className="toolbar">
      <button
        className={`toolbar-btn ${kind === "folder" ? "active" : ""}`}
        onClick={onOpenFolder}
        title="打开文件夹"
      >
        📂
      </button>
      <button
        className={`toolbar-btn ${kind === "compare" ? "active" : ""}`}
        onClick={onOpenCompare}
        title="目录比较"
      >
        🔀
      </button>
      <button
        className={`toolbar-btn ${kind === "faces" ? "active" : ""}`}
        onClick={onOpenFaces}
        title="人物标签"
      >
        👤
      </button>
      {kind === "folder" && (
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
        </div>
      )}
    </div>
  );
}
