import { useState, useCallback, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import "./App.css";

const PAGE_SIZE = 50;

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
  current: number;
  total: number;
}

function App() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [folderPath, setFolderPath] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const workAreaRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (currentFolder: string, currentOffset: number, append: boolean) => {
      try {
        const resp = await invoke<ListImagesResponse>("list_images", {
          path: currentFolder,
          offset: currentOffset,
          limit: PAGE_SIZE,
        });
        setTotal(resp.total);
        setImages((prev) => (append ? [...prev, ...resp.items] : resp.items));
        setOffset(currentOffset + resp.items.length);
        if (resp.items.length > 0) {
          setLoading(true);
          setProgressCurrent(0);
          setProgressTotal(resp.items.length);
        }
      } catch (e) {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ThumbProgress>("thumb-progress", (event) => {
      const { current, total } = event.payload;
      setProgressCurrent(current);
      setProgressTotal(total);
      setImages((prev) => {
        const updated = [...prev];
        if (current <= updated.length) {
          updated[current - 1] = { ...updated[current - 1], thumb_ready: true };
        }
        return updated;
      });
      if (current >= total) {
        setLoading(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setImages([]);
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

  return (
    <div className="layout">
      <div className="toolbar">
        <button className="toolbar-btn" onClick={handleOpenFolder} title="打开文件夹">
          📁
        </button>
      </div>
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
      <div className="status-bar">
        {loading ? (
          <>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: progressTotal > 0 ? `${(progressCurrent / progressTotal) * 100}%` : "0%",
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
    </div>
  );
}

export default App;
