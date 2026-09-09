import type { ImageEntry } from "../../types";

interface GridStatusBarProps {
  loading: boolean;
  progressCurrent: number;
  progressTotal: number;
  total: number;
  images: ImageEntry[];
  filterTagId: string;
  folderTagMap: Record<string, string[]>;
}

export function GridStatusBar({
  loading,
  progressCurrent,
  progressTotal,
  total,
  images,
  filterTagId,
  folderTagMap,
}: GridStatusBarProps) {
  const displayedCount = filterTagId
    ? images.filter((img) => (folderTagMap[img.name] ?? []).includes(filterTagId)).length
    : images.length;

  return (
    <div className="status-bar">
      {loading ? (
        <>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width:
                  progressTotal > 0
                    ? `${(progressCurrent / progressTotal) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <span className="progress-text">
            已完成 {progressCurrent}/{progressTotal}
          </span>
        </>
      ) : (
        <span>
          {total > 0
            ? filterTagId
              ? `${displayedCount} 张（筛选） / 已加载 ${images.length} / ${total}`
              : `${images.length} / ${total}`
            : ""}
        </span>
      )}
    </div>
  );
}
