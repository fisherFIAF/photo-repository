import { fileIcon } from "../../lib/fileIcon";
import type { CompareSide, MergedRow } from "../../types";

interface CompareRowProps {
  row: MergedRow;
  selectedPath: string | null;
  selectedSide: CompareSide | null;
  onFileClick: (name: string, path: string, side: CompareSide) => void;
  onCopy: (path: string, side: CompareSide) => void;
}

export function CompareRow({
  row,
  selectedPath,
  selectedSide,
  onFileClick,
  onCopy,
}: CompareRowProps) {
  const isSame = row.status === "same";
  const isSelectedLeft =
    selectedPath === row.left?.path && selectedSide === "left";
  const isSelectedRight =
    selectedPath === row.right?.path && selectedSide === "right";

  return (
    <div className="compare-row">
      <div className="compare-cell-left">
        {row.left ? (
          <div
            className={`compare-file file-${row.status} ${isSelectedLeft ? "selected" : ""}`}
            onClick={() => onFileClick(row.left!.name, row.left!.path, "left")}
          >
            {fileIcon(row.left.name)} {row.left.name}
          </div>
        ) : (
          <div className="compare-file compare-file-empty" />
        )}
      </div>
      <div className="compare-action-col">
        {!isSame && row.left && (
          <button
            className="compare-action-btn"
            onClick={() => onCopy(row.left!.path, "left")}
            title="复制到右侧"
          >
            →
          </button>
        )}
      </div>
      <div />
      <div className="compare-action-col">
        {!isSame && row.right && (
          <button
            className="compare-action-btn"
            onClick={() => onCopy(row.right!.path, "right")}
            title="复制到左侧"
          >
            ←
          </button>
        )}
      </div>
      <div className="compare-cell-right">
        {row.right ? (
          <div
            className={`compare-file file-${row.status} ${isSelectedRight ? "selected" : ""}`}
            onClick={() => onFileClick(row.right!.name, row.right!.path, "right")}
          >
            {fileIcon(row.right.name)} {row.right.name}
          </div>
        ) : (
          <div className="compare-file compare-file-empty" />
        )}
      </div>
    </div>
  );
}
