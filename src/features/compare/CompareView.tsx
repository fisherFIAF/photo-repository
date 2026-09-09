import { CompareRow } from "./CompareRow";
import { CompareStatusBar } from "./CompareStatusBar";
import { useCompare } from "./useCompare";
import "./compare.css";

/** Renders compare work-area + status-bar as layout siblings (Fragment). */
export function CompareView() {
  const {
    leftPath,
    rightPath,
    compareResult,
    compareLoading,
    selectedFile,
    compareFileCount,
    mergedRows,
    handleOpenCompareFolder,
    handleRefreshCompare,
    handleFileClick,
    handleCopyToOtherSide,
  } = useCompare();

  return (
    <>
      <div className="compare-work-area">
        <div className="compare-toolbar">
          <button
            className="toolbar-btn"
            onClick={() => handleOpenCompareFolder("left")}
            title="选择左侧目录"
          >
            📂 左侧目录
          </button>
          <span className="compare-path">{leftPath || "(未选择)"}</span>
          <button
            className="toolbar-btn"
            onClick={() => handleOpenCompareFolder("right")}
            title="选择右侧目录"
          >
            📂 右侧目录
          </button>
          <span className="compare-path">{rightPath || "(未选择)"}</span>
          {compareResult && (
            <button
              className="toolbar-btn refresh-btn"
              onClick={handleRefreshCompare}
              title="刷新比较结果"
            >
              ↻
            </button>
          )}
        </div>
        {compareLoading ? (
          <div className="empty-state">
            <span>比较中...</span>
          </div>
        ) : compareResult ? (
          <div className="compare-body">
            <div className="compare-scroll">
              {mergedRows.map((row) => (
                <CompareRow
                  key={row.name}
                  row={row}
                  selectedPath={selectedFile?.path ?? null}
                  selectedSide={selectedFile?.side ?? null}
                  onFileClick={handleFileClick}
                  onCopy={handleCopyToOtherSide}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span>选择两个目录进行比较</span>
          </div>
        )}
      </div>
      <CompareStatusBar
        compareResult={compareResult}
        compareFileCount={compareFileCount}
      />
    </>
  );
}
