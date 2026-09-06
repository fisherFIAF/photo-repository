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

interface PersonTag {
  id: string;
  name: string;
  data_dir: string;
}

interface FaceSample {
  id: string;
  thumb_path: string;
  source_path: string;
  location: string;
}

interface FolderImagesInfo {
  version: number;
  images: Record<string, string[]>;
}

interface FaceTagProgress {
  current: number;
  total: number;
  matched: number;
  path: string;
}

interface TagFolderResult {
  scanned: number;
  matched: number;
  skipped: number;
}

type ViewMode = "grid" | "compare" | "faces";

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const videoExts = [
    "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v",
    "mpeg", "mpg", "3gp",
  ];
  return videoExts.includes(ext) ? "🎬" : "🖼️";
}

function App() {
  const [mode, setMode] = useState<ViewMode>("grid");

  // --- Grid view state ---
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [folderPath, setFolderPath] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const imageCountRef = useRef(0);

  // --- Compare view state ---
  const [leftPath, setLeftPath] = useState("");
  const [rightPath, setRightPath] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    side: "left" | "right";
  } | null>(null);

  // --- Faces / tags state ---
  const [personTags, setPersonTags] = useState<PersonTag[]>([]);
  const [inboxSamples, setInboxSamples] = useState<FaceSample[]>([]);
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const [facesBusy, setFacesBusy] = useState(false);
  const [facesStatus, setFacesStatus] = useState("");
  const [folderTagMap, setFolderTagMap] = useState<Record<string, string[]>>({});
  const [filterTagId, setFilterTagId] = useState<string>("");
  const [tagProgress, setTagProgress] = useState<FaceTagProgress | null>(null);
  const [activeTagSamples, setActiveTagSamples] = useState<FaceSample[]>([]);
  const [previewTagId, setPreviewTagId] = useState<string>("");

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of personTags) m.set(t.id, t.name);
    return m;
  }, [personTags]);

  const refreshTags = useCallback(async () => {
    try {
      const tags = await invoke<PersonTag[]>("list_person_tags");
      setPersonTags(tags);
    } catch (e) {
      console.error("list_person_tags failed:", e);
    }
  }, []);

  const refreshInbox = useCallback(async () => {
    try {
      const samples = await invoke<FaceSample[]>("list_inbox_face_samples");
      setInboxSamples(samples);
    } catch (e) {
      console.error("list_inbox_face_samples failed:", e);
    }
  }, []);

  const refreshFolderTags = useCallback(async (folder: string) => {
    if (!folder) {
      setFolderTagMap({});
      return;
    }
    try {
      const info = await invoke<FolderImagesInfo>("read_folder_tags", { folder });
      setFolderTagMap(info.images ?? {});
    } catch (e) {
      console.error("read_folder_tags failed:", e);
      setFolderTagMap({});
    }
  }, []);

  useEffect(() => {
    refreshTags();
    refreshInbox();
  }, [refreshTags, refreshInbox]);

  useEffect(() => {
    if (folderPath) refreshFolderTags(folderPath);
  }, [folderPath, refreshFolderTags]);

  useEffect(() => {
    if (!previewTagId) {
      setActiveTagSamples([]);
      return;
    }
    invoke<FaceSample[]>("list_tag_samples", { tagId: previewTagId })
      .then(setActiveTagSamples)
      .catch((e) => {
        console.error(e);
        setActiveTagSamples([]);
      });
  }, [previewTagId]);

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

  async function handleSelectTagFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择要打标的文件夹",
      ...(folderPath ? { defaultPath: folderPath } : {}),
    });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setFilterTagId("");
    await refreshFolderTags(selected);
    setFacesStatus(`已选择文件夹：${selected}`);
  }

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setImages([]);
    imageCountRef.current = 0;
    setTotal(0);
    setOffset(0);
    setFilterTagId("");
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

  // --- Faces logic ---
  async function handleAddTemplates() {
    const selected = await open({
      multiple: true,
      title: "选择模板图片",
      // 不设 filters：Linux xdg-portal 的 glob 区分大小写（*.jpg 不匹配 .JPG），
      // 会导致常见相机照片无法选中；后端会校验是否为可解码的图片。
      ...(folderPath ? { defaultPath: folderPath } : {}),
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    setFacesBusy(true);
    setFacesStatus("准备模型并识别人脸…（首次会下载模型）");
    try {
      await invoke("ensure_face_models");
      const samples = await invoke<FaceSample[]>("add_face_samples", { paths });
      setFacesStatus(
        samples.length > 0
          ? `已提取 ${samples.length} 张人脸，请归类到标签`
          : "未检测到人脸",
      );
      await refreshInbox();
      setSelectedSampleIds(new Set(samples.map((s) => s.id)));
    } catch (e) {
      console.error(e);
      setFacesStatus(`失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setFacesBusy(true);
    try {
      const tag = await invoke<PersonTag>("create_person_tag", { name });
      setNewTagName("");
      await refreshTags();
      setSelectedTagIds(new Set([tag.id]));
      setFacesStatus(`已创建标签「${tag.name}」`);
    } catch (e) {
      setFacesStatus(`创建标签失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleAttachSamples() {
    if (selectedSampleIds.size === 0) {
      setFacesStatus("请先勾选待归类的人脸样本");
      return;
    }
    const tagId = [...selectedTagIds][0];
    if (!tagId) {
      setFacesStatus("请先选择一个目标人物标签");
      return;
    }
    setFacesBusy(true);
    try {
      const n = await invoke<number>("attach_samples_to_tag", {
        tagId,
        sampleIds: [...selectedSampleIds],
      });
      setSelectedSampleIds(new Set());
      await refreshInbox();
      if (previewTagId === tagId) {
        const samples = await invoke<FaceSample[]>("list_tag_samples", { tagId });
        setActiveTagSamples(samples);
      }
      setFacesStatus(`已将 ${n} 个样本绑定到「${tagNameById.get(tagId) ?? tagId}」`);
    } catch (e) {
      setFacesStatus(`绑定失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleDeleteTag(tagId: string) {
    if (!confirm(`删除标签「${tagNameById.get(tagId) ?? tagId}」及其模板数据？`)) return;
    setFacesBusy(true);
    try {
      await invoke("delete_person_tag", { tagId });
      await refreshTags();
      setSelectedTagIds((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
      if (previewTagId === tagId) setPreviewTagId("");
      if (filterTagId === tagId) setFilterTagId("");
      setFacesStatus("标签已删除");
    } catch (e) {
      setFacesStatus(`删除失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleTagFolder() {
    let folder = folderPath;
    if (!folder) {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要打标的文件夹",
      });
      if (!selected || typeof selected !== "string") return;
      folder = selected;
      setFolderPath(folder);
      await refreshFolderTags(folder);
    }
    if (selectedTagIds.size === 0) {
      setFacesStatus("请勾选要打标的人物标签");
      return;
    }
    setFacesBusy(true);
    setTagProgress({ current: 0, total: 0, matched: 0, path: "" });
    setFacesStatus("批量识别中…");

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<FaceTagProgress>("face-tag-progress", (ev) => {
        setTagProgress(ev.payload);
      });
      await invoke("ensure_face_models");
      const result = await invoke<TagFolderResult>("tag_folder", {
        folder,
        tagIds: [...selectedTagIds],
        force: false,
      });
      await refreshFolderTags(folder);
      setFacesStatus(
        `完成：扫描 ${result.scanned}，命中 ${result.matched}，跳过已有 ${result.skipped}`,
      );
    } catch (e) {
      setFacesStatus(`打标失败: ${e}`);
    } finally {
      unlisten?.();
      setFacesBusy(false);
      setTagProgress(null);
    }
  }

  function toggleSample(id: string) {
    setSelectedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  const displayedImages = useMemo(() => {
    if (!filterTagId) return images;
    return images.filter((img) => (folderTagMap[img.name] ?? []).includes(filterTagId));
  }, [images, filterTagId, folderTagMap]);

  const layoutClass =
    mode === "compare" ? "layout compare-mode" : mode === "faces" ? "layout faces-mode" : "layout";

  return (
    <div className={layoutClass}>
      <div className="toolbar">
        <button
          className={`toolbar-btn ${mode === "grid" ? "active" : ""}`}
          onClick={() => {
            if (folderPath) {
              setMode("grid");
              if (images.length === 0) {
                loadPage(folderPath, 0, false);
              }
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
        <button
          className={`toolbar-btn ${mode === "faces" ? "active" : ""}`}
          onClick={() => setMode("faces")}
          title="人物标签"
        >
          👤
        </button>
        {mode === "grid" && folderPath && (
          <div className="toolbar-filter">
            <select
              value={filterTagId}
              onChange={(e) => setFilterTagId(e.target.value)}
              title="按人物标签筛选"
            >
              <option value="">全部图片</option>
              {personTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="toolbar-btn"
              title="打开文件夹"
              onClick={handleOpenFolder}
            >
              📂
            </button>
          </div>
        )}
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
            {displayedImages.map((img) => {
              const tags = folderTagMap[img.name] ?? [];
              return (
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
                  <div className="thumb-wrap">
                    {img.thumb_ready ? (
                      <img src={convertFileSrc(img.thumb_path)} alt={img.name} />
                    ) : (
                      <div className="thumb-placeholder" />
                    )}
                    {tags.length > 0 && (
                      <div className="tag-badges">
                        {tags.map((tid) => (
                          <span key={tid} className="tag-badge">
                            {tagNameById.get(tid) ?? tid}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="image-name">{img.name}</span>
                </div>
              );
            })}
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

      {/* Faces view */}
      <div className="faces-work-area">
        <div className="faces-panel">
          <section className="faces-section">
            <h3>1. 模板人脸</h3>
            <div className="faces-actions">
              <button className="faces-btn" disabled={facesBusy} onClick={handleAddTemplates}>
                选择模板图片
              </button>
              <button className="faces-btn" disabled={facesBusy} onClick={refreshInbox}>
                刷新收件箱
              </button>
            </div>
            <div className="sample-grid">
              {inboxSamples.length === 0 ? (
                <span className="faces-hint">暂无未归类人脸，请先选模板图</span>
              ) : (
                inboxSamples.map((s) => (
                  <label
                    key={s.id}
                    className={`sample-card ${selectedSampleIds.has(s.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSampleIds.has(s.id)}
                      onChange={() => toggleSample(s.id)}
                    />
                    <img src={convertFileSrc(s.thumb_path)} alt={s.id} />
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="faces-section">
            <h3>2. 人物标签</h3>
            <div className="faces-actions">
              <input
                className="faces-input"
                placeholder="新标签名"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                }}
              />
              <button className="faces-btn" disabled={facesBusy} onClick={handleCreateTag}>
                创建
              </button>
              <button
                className="faces-btn primary"
                disabled={facesBusy}
                onClick={handleAttachSamples}
              >
                绑定选中样本
              </button>
            </div>
            <ul className="tag-list">
              {personTags.map((t) => (
                <li key={t.id} className="tag-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedTagIds.has(t.id)}
                      onChange={() => toggleTag(t.id)}
                    />
                    <span
                      className={`tag-name ${previewTagId === t.id ? "active" : ""}`}
                      onClick={() => setPreviewTagId(t.id === previewTagId ? "" : t.id)}
                    >
                      {t.name}
                    </span>
                  </label>
                  <button
                    className="faces-btn danger"
                    disabled={facesBusy}
                    onClick={() => handleDeleteTag(t.id)}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
            {previewTagId && (
              <div className="sample-grid compact">
                {activeTagSamples.length === 0 ? (
                  <span className="faces-hint">该标签尚无样本</span>
                ) : (
                  activeTagSamples.map((s) => (
                    <div key={s.id} className="sample-card">
                      <img src={convertFileSrc(s.thumb_path)} alt={s.id} />
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="faces-section">
            <h3>3. 批量打标</h3>
            <p className="faces-hint">
              当前文件夹：{folderPath || "（未选择）"}
            </p>
            <div className="faces-actions">
              <button
                className="faces-btn"
                disabled={facesBusy}
                onClick={handleSelectTagFolder}
              >
                选择文件夹
              </button>
              <button
                className="faces-btn primary"
                disabled={facesBusy || selectedTagIds.size === 0}
                onClick={handleTagFolder}
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

          {facesStatus && <div className="faces-status">{facesStatus}</div>}
        </div>
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
          <span>
            {total > 0
              ? filterTagId
                ? `${displayedImages.length} 张（筛选） / 已加载 ${images.length} / ${total}`
                : `${images.length} / ${total}`
              : ""}
          </span>
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

      <div className="faces-status-bar">
        <span>{facesBusy ? "处理中…" : facesStatus || "人物标签"}</span>
      </div>
    </div>
  );
}

export default App;
