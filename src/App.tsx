import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import "./App.css";

const PAGE_SIZE = 50;
let batchId = 0;

interface ImageEntry {
  path: string;
  name: string;
  thumb_path: string;
  thumb_ready: boolean;
}

interface ListImagesResponse {
  total: number;
  items: ImageEntry[];
}

interface ThumbProgress {
  index: number;
  current: number;
  total: number;
}

interface FileEntry {
  name: string;
  path: string;
}

interface CompareResult {
  left_only: FileEntry[];
  right_only: FileEntry[];
  same: FileEntry[];
  different: FileEntry[];
}

interface MergedRow {
  name: string;
  left: FileEntry | null;
  right: FileEntry | null;
  status: "left-only" | "right-only" | "same" | "different";
}

type ViewMode = "grid" | "compare";

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const videoExts = [
    "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v",
    "mpeg", "mpg", "3gp",
  ];
  return videoExts.includes(ext) ? "🎬" : "🖼️";
}

function App() {
  // --- View mode ---
  const [mode, setMode] = useState<ViewMode>("grid");

  // --- Grid view state (persisted across mode switches) ---
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [folderPath, setFolderPath] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const imageCountRef = useRef(0);

  // --- Compare view state (persisted across mode switches) ---
  const [leftPath, setLeftPath] = useState("");
  const [rightPath, setRightPath] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    side: "left" | "right";
  } | null>(null);

  // --- Grid view logic ---
  const loadPage = useCallback(
    async (currentFolder: string, currentOffset: number, append: boolean) => {
      const myBatchId = ++batchId;
      const baseIndex = append ? imageCountRef.current : 0;

      if (append) {
        setOffset(currentOffset);
      }

      setLoading(true);
      setProgressCurrent(0);

      await new Promise<void>((resolve, reject) => {
        let unlistenFn: (() => void) | undefined;
        let done = false;

        const finish = () => {
          if (done) return;
          done = true;
          resolve();
          setTimeout(() => unlistenFn?.(), 0);
        };

        const timer = setInterval(() => {
          if (done) {
            clearInterval(timer);
            return;
          }
          setImages((prev) => {
            if (prev.length > 0 && prev.every((img) => img.thumb_ready)) {
              finish();
            }
            return prev;
          });
        }, 50);

        listen<ThumbProgress>("thumb-progress", (event) => {
          if (myBatchId !== batchId) {
            clearInterval(timer);
            finish();
            return;
          }
          const { index, current, total } = event.payload;
          setProgressCurrent(current);
          setProgressTotal(total);
          setImages((prev) => {
            const updated = [...prev];
            const actualIndex = baseIndex + index;
            if (actualIndex < updated.length) {
              updated[actualIndex] = {
                ...updated[actualIndex],
                thumb_ready: true,
              };
            }
            return updated;
          });
        })
          .then((unlisten) => {
            unlistenFn = unlisten;
            invoke<ListImagesResponse>("list_images", {
              path: currentFolder,
              offset: currentOffset,
              limit: PAGE_SIZE,
            })
              .then((resp) => {
                setTotal(resp.total);
                setImages((prev) => {
                  const next = append ? [...prev, ...resp.items] : resp.items;
                  imageCountRef.current = next.length;
                  return next;
                });
                setOffset(currentOffset + resp.items.length);
                setProgressTotal(resp.items.length);
                if (resp.items.length === 0) {
                  clearInterval(timer);
                  finish();
                }
              })
              .catch((e) => {
                clearInterval(timer);
                unlisten();
                reject(e);
              });
          })
          .catch((e) => {
            clearInterval(timer);
            reject(e);
          });
      });

      setLoading(false);
    },
    [],
  );

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setImages([]);
    imageCountRef.current = 0;
    setTotal(0);
    setOffset(0);
    await loadPage(selected, 0, false);
  }

  async function handleScroll() {
    const el = workAreaRef.current;
    if (!el || loading || !folderPath || images.length >= total) return;

    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (nearBottom) {
      await loadPage(folderPath, offset, true);
    }
  }

  useEffect(() => {
    const el = workAreaRef.current;
    if (el) el.addEventListener("scroll", handleScroll);
    return () => {
      if (el) el.removeEventListener("scroll", handleScroll);
    };
  });

  // --- Compare view logic ---
  async function handleOpenCompareFolder(side: "left" | "right") {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    if (side === "left") {
      setLeftPath(selected);
    } else {
      setRightPath(selected);
    }
    setCompareResult(null);

    const newLeft = side === "left" ? selected : leftPath;
    const newRight = side === "right" ? selected : rightPath;

    if (newLeft && newRight) {
      setCompareLoading(true);
      try {
        const result = await invoke<CompareResult>("compare_dirs", {
          left: newLeft,
          right: newRight,
        });
        setCompareResult(result);
      } catch (e) {
        console.error("compare_dirs failed:", e);
      }
      setCompareLoading(false);
    }
  }

  async function handleRefreshCompare() {
    if (!leftPath || !rightPath) return;
    setCompareLoading(true);
    setSelectedFile(null);
    try {
      const result = await invoke<CompareResult>("compare_dirs", {
        left: leftPath,
        right: rightPath,
      });
      setCompareResult(result);
    } catch (e) {
      console.error("compare_dirs failed:", e);
    }
    setCompareLoading(false);
  }

  function handleFileClick(name: string, path: string, side: "left" | "right") {
    setSelectedFile((prev) =>
      prev?.path === path && prev.side === side ? null : { path, name, side },
    );
  }

  async function handleCopyToOtherSide(path: string, side: "left" | "right") {
    if (!compareResult) return;
    const destDir = side === "left" ? rightPath : leftPath;
    try {
      await invoke("copy_file", { src: path, destDir });
      setSelectedFile(null);
      await handleRefreshCompare();
    } catch (e) {
      console.error("copy_file failed:", e);
    }
  }

  // --- Render ---
  const compareFileCount = compareResult
    ? compareResult.left_only.length +
      compareResult.right_only.length +
      compareResult.same.length +
      compareResult.different.length
    : 0;

  const mergedRows = useMemo<MergedRow[]>(() => {
    if (!compareResult) return [];
    const rows: MergedRow[] = [];
    for (const f of compareResult.left_only) {
      rows.push({ name: f.name, left: f, right: null, status: "left-only" });
    }
    for (const f of compareResult.right_only) {
      rows.push({ name: f.name, left: null, right: f, status: "right-only" });
    }
    for (const f of compareResult.same) {
      rows.push({ name: f.name, left: f, right: f, status: "same" });
    }
    for (const f of compareResult.different) {
      rows.push({ name: f.name, left: f, right: f, status: "different" });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [compareResult]);

  return (
    <div className={`layout ${mode === "compare" ? "compare-mode" : ""}`}>
      <div className="toolbar">
        <button
          className={`toolbar-btn ${mode === "grid" ? "active" : ""}`}
          onClick={() => {
            if (folderPath) {
              setMode("grid");
            } else {
              handleOpenFolder();
            }
          }}
          title="图片浏览"
        >
          📁
        </button>
        <button
          className={`toolbar-btn ${mode === "compare" ? "active" : ""}`}
          onClick={() => setMode("compare")}
          title="目录比较"
        >
          🔀
        </button>
      </div>

      {/* Grid view */}
      <div className="work-area" ref={workAreaRef}>
        {images.length === 0 ? (
          <div className="empty-state">
            <span>工作区</span>
            <span>(显示图片列表)</span>
          </div>
        ) : (
          <div className="image-grid">
            {images.map((img) => (
              <div
                key={img.path}
                className="image-item"
                onDoubleClick={async () => {
                  try {
                    await openPath(img.path);
                  } catch (e) {
                    console.error("openPath failed:", e);
                  }
                }}
              >
                {img.thumb_ready ? (
                  <img src={convertFileSrc(img.thumb_path)} alt={img.name} />
                ) : (
                  <div className="thumb-placeholder" />
                )}
                <span className="image-name">{img.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compare view */}
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
              {mergedRows.map((row) => {
                const isSame = row.status === "same";
                const isSelectedLeft =
                  selectedFile?.path === row.left?.path && selectedFile?.side === "left";
                const isSelectedRight =
                  selectedFile?.path === row.right?.path && selectedFile?.side === "right";

                return (
                  <div key={row.name} className="compare-row">
                    <div className="compare-cell-left">
                      {row.left ? (
                        <div
                          className={`compare-file file-${row.status} ${isSelectedLeft ? "selected" : ""}`}
                          onClick={() => handleFileClick(row.left!.name, row.left!.path, "left")}
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
                          onClick={() => handleCopyToOtherSide(row.left!.path, "left")}
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
                          onClick={() => handleCopyToOtherSide(row.right!.path, "right")}
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
                          onClick={() => handleFileClick(row.right!.name, row.right!.path, "right")}
                        >
                          {fileIcon(row.right.name)} {row.right.name}
                        </div>
                      ) : (
                        <div className="compare-file compare-file-empty" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <span>选择两个目录进行比较</span>
          </div>
        )}
      </div>

      {/* Grid status bar */}
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
          <span>{total > 0 ? `${images.length} / ${total}` : ""}</span>
        )}
      </div>

      {/* Compare status bar */}
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
    </div>
  );
}

export default App;
