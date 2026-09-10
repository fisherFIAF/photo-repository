import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImageEntry, ListImagesResponse, ThumbProgress } from "../../types";

const PAGE_SIZE = 50;
let batchId = 0;

type FolderSession = {
  images: ImageEntry[];
  total: number;
  offset: number;
};

const emptySession = (): FolderSession => ({
  images: [],
  total: 0,
  offset: 0,
});

export function useGridImages(activeFolderPath: string) {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const folderPathRef = useRef(activeFolderPath);
  const offsetRef = useRef(offset);
  const totalRef = useRef(total);
  const imagesLenRef = useRef(images.length);
  const sessionsRef = useRef<Map<string, FolderSession>>(new Map());

  folderPathRef.current = activeFolderPath;
  offsetRef.current = offset;
  totalRef.current = total;
  imagesLenRef.current = images.length;

  const persistActive = useCallback(
    (next: Partial<FolderSession>) => {
      const path = folderPathRef.current;
      if (!path) return;
      const prev = sessionsRef.current.get(path) ?? emptySession();
      sessionsRef.current.set(path, { ...prev, ...next });
    },
    [],
  );

  const restoreSession = useCallback((path: string) => {
    const session = sessionsRef.current.get(path) ?? emptySession();
    setImages(session.images);
    setTotal(session.total);
    setOffset(session.offset);
    setProgressCurrent(0);
    setProgressTotal(0);
  }, []);

  useEffect(() => {
    if (!activeFolderPath) {
      setImages([]);
      setTotal(0);
      setOffset(0);
      return;
    }
    restoreSession(activeFolderPath);
  }, [activeFolderPath, restoreSession]);

  const loadPage = useCallback(
    async (currentFolder: string, currentOffset: number, append: boolean) => {
      if (!currentFolder || loadingRef.current) return;
      loadingRef.current = true;

      const myBatchId = ++batchId;
      const baseIndex = append
        ? (sessionsRef.current.get(currentFolder)?.images.length ?? 0)
        : 0;

      if (append) {
        setOffset(currentOffset);
      }

      setLoading(true);
      setProgressCurrent(0);

      try {
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
            if (folderPathRef.current !== currentFolder) return;
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
            if (folderPathRef.current !== currentFolder) return;
            const { index, current, total: progTotal } = event.payload;
            setProgressCurrent(current);
            setProgressTotal(progTotal);
            setImages((prev) => {
              const updated = [...prev];
              const actualIndex = baseIndex + index;
              if (actualIndex < updated.length) {
                updated[actualIndex] = {
                  ...updated[actualIndex],
                  thumb_ready: true,
                };
              }
              persistActive({ images: updated });
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
                  const apply = (prevImages: ImageEntry[]) => {
                    const next = append ? [...prevImages, ...resp.items] : resp.items;
                    const nextOffset = currentOffset + resp.items.length;
                    sessionsRef.current.set(currentFolder, {
                      images: next,
                      total: resp.total,
                      offset: nextOffset,
                    });
                    return { next, nextOffset };
                  };

                  if (folderPathRef.current === currentFolder) {
                    setTotal(resp.total);
                    setImages((prev) => {
                      const { next, nextOffset } = apply(prev);
                      setOffset(nextOffset);
                      return next;
                    });
                    setProgressTotal(resp.items.length);
                  } else {
                    const existing =
                      sessionsRef.current.get(currentFolder)?.images ?? [];
                    apply(existing);
                  }

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
      } finally {
        loadingRef.current = false;
        if (folderPathRef.current === currentFolder) {
          setLoading(false);
        }
      }
    },
    [persistActive],
  );

  /** Pick a directory; returns path or null. Does not mutate tabs. */
  const pickFolder = useCallback(async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return null;
    return selected;
  }, []);

  const ensureLoaded = useCallback(
    async (path: string) => {
      const session = sessionsRef.current.get(path);
      if (session && session.images.length > 0) return;
      await loadPage(path, 0, false);
    },
    [loadPage],
  );

  const dropSession = useCallback((path: string) => {
    sessionsRef.current.delete(path);
    if (folderPathRef.current === path) {
      setImages([]);
      setTotal(0);
      setOffset(0);
    }
  }, []);

  useEffect(() => {
    const el = workAreaRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (loadingRef.current) return;
      const path = folderPathRef.current;
      if (!path || imagesLenRef.current >= totalRef.current) return;

      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
      if (nearBottom) {
        void loadPage(path, offsetRef.current, true);
      }
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadPage]);

  return {
    images,
    total,
    loading,
    progressCurrent,
    progressTotal,
    workAreaRef,
    loadPage,
    pickFolder,
    ensureLoaded,
    dropSession,
  };
}
