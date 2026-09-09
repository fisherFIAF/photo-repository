import type { CompareResult } from "../../types";

interface CompareStatusBarProps {
  compareResult: CompareResult | null;
  compareFileCount: number;
}

export function CompareStatusBar({
  compareResult,
  compareFileCount,
}: CompareStatusBarProps) {
  return (
    <div className="compare-status-bar">
      {compareResult && (
        <span>
          共 {compareFileCount} 个文件 |
          左侧独有 {compareResult.left_only.length} |
          右侧独有 {compareResult.right_only.length} |
          相同 {compareResult.same.length} |
          不同 {compareResult.different.length}
        </span>
      )}
    </div>
  );
}
