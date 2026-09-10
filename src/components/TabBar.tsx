import type { AppTab } from "../types";

interface TabBarProps {
  tabs: AppTab[];
  activeTabId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function tabLabel(tab: AppTab): string {
  if (tab.kind === "folder") return tab.path;
  if (tab.kind === "compare") return "目录比较";
  return "人物标签";
}

function tabIcon(tab: AppTab): string {
  if (tab.kind === "folder") return "🖼️";
  if (tab.kind === "compare") return "🔀";
  return "👤";
}

export function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => {
        const label = tabLabel(tab);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            title={label}
            onClick={() => onActivate(tab.id)}
          >
            <span className="tab-icon">{tabIcon(tab)}</span>
            <span className="tab-label">{label}</span>
            <span
              className="tab-close"
              title="关闭"
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
