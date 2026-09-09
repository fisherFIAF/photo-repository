import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImageEntry, ListImagesResponse, ThumbProgress } from "../../types";

const PAGE_SIZE = 50;
let batchId = 0;

export function useGridImages(
  folderPath: string,
  setFolderPath: (path: string) => void,
  setFilterTagId: (id: string) => void,
) {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const workAreaRef = useRef<HTMLDivElement>(null);
  const imageCountRef = useRef(0);
  const loadingRef = useRef(false);
  const folderPathRef = useRef(folderPath);
  const offsetRef = useRef(offset);
  const totalRef = useRef(total);
  const imagesLenRef = useRef(images.length);

  folderPathRef.current = folderPath;
  offsetRef.current = offset;
  totalRef.current = total;
  imagesLenRef.current = images.length;

  const loadPage = useCallback(
    async (currentFolder: string, currentOffset: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      const myBatchId = ++batchId;
      const baseIndex = append ? imageCountRef.current : 0;

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
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setImages([]);
    imageCountRef.current = 0;
    setTotal(0);
    setOffset(0);
    setFilterTagId("");
    await loadPage(selected, 0, false);
  }, [loadPage, setFolderPath, setFilterTagId]);

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
    handleOpenFolder,
  };
}
