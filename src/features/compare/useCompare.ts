import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { CompareResult, CompareSide, MergedRow } from "../../types";

export function useCompare() {
  const [leftPath, setLeftPath] = useState("");
  const [rightPath, setRightPath] = useState("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    name: string;
    side: CompareSide;
  } | null>(null);

  const handleOpenCompareFolder = useCallback(
    async (side: CompareSide) => {
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
    },
    [leftPath, rightPath],
  );

  const handleRefreshCompare = useCallback(async () => {
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
  }, [leftPath, rightPath]);

  const handleFileClick = useCallback(
    (name: string, path: string, side: CompareSide) => {
      setSelectedFile((prev) =>
        prev?.path === path && prev.side === side ? null : { path, name, side },
      );
    },
    [],
  );

  const handleCopyToOtherSide = useCallback(
    async (path: string, side: CompareSide) => {
      if (!compareResult) return;
      const destDir = side === "left" ? rightPath : leftPath;
      try {
        await invoke("copy_file", { src: path, destDir });
        setSelectedFile(null);
        await handleRefreshCompare();
      } catch (e) {
        console.error("copy_file failed:", e);
      }
    },
    [compareResult, leftPath, rightPath, handleRefreshCompare],
  );

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

  return {
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
  };
}
