import type { FaceTagProgress } from "../../types";

interface BatchTagSectionProps {
  folderPath: string;
  facesBusy: boolean;
  selectedTagCount: number;
  tagProgress: FaceTagProgress | null;
  onSelectFolder: () => void;
  onTagFolder: () => void;
}

export function BatchTagSection({
  folderPath,
  facesBusy,
  selectedTagCount,
  tagProgress,
  onSelectFolder,
  onTagFolder,
}: BatchTagSectionProps) {
  return (
    <section className="faces-section">
      <h3>3. 批量打标</h3>
      <p className="faces-hint">当前文件夹：{folderPath || "（未选择）"}</p>
      <div className="faces-actions">
        <button className="faces-btn" disabled={facesBusy} onClick={onSelectFolder}>
          选择文件夹
        </button>
        <button
          className="faces-btn primary"
          disabled={facesBusy || selectedTagCount === 0}
          onClick={onTagFolder}
        >
          对文件夹打标
        </button>
      </div>
      {tagProgress && (
        <div className="faces-progress">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width:
                  tagProgress.total > 0
                    ? `${(tagProgress.current / tagProgress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <span>
            {tagProgress.current}/{tagProgress.total} · 命中 {tagProgress.matched} ·{" "}
            {tagProgress.path}
          </span>
        </div>
      )}
    </section>
  );
}
