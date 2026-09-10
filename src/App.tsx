import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toolbar } from "./components/Toolbar";
import { TabBar } from "./components/TabBar";
import { CompareView } from "./features/compare/CompareView";
import { FacesView } from "./features/faces/FacesView";
import { GridStatusBar } from "./features/grid/GridStatusBar";
import { GridView } from "./features/grid/GridView";
import { useGridImages } from "./features/grid/useGridImages";
import type {
  AppTab,
  FolderImagesInfo,
  FolderTab,
  PersonTag,
} from "./types";
import { MAX_FOLDER_TABS } from "./types";
import "./App.css";

let folderTabSeq = 0;

function nextFolderTabId(): string {
  folderTabSeq += 1;
  return `folder-${folderTabSeq}`;
}

function App() {
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [filterByFolderId, setFilterByFolderId] = useState<Record<string, string>>(
    {},
  );
  const [personTags, setPersonTags] = useState<PersonTag[]>([]);
  const [folderTagMap, setFolderTagMap] = useState<Record<string, string[]>>({});

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const activeFolderTab =
    activeTab?.kind === "folder" ? activeTab : null;

  const lastFolderPath = useMemo(() => {
    for (let i = tabs.length - 1; i >= 0; i--) {
      const t = tabs[i];
      if (t.kind === "folder") return t.path;
    }
    return "";
  }, [tabs]);

  const filterFolderTab = useMemo(() => {
    if (activeFolderTab) return activeFolderTab;
    for (let i = tabs.length - 1; i >= 0; i--) {
      const t = tabs[i];
      if (t.kind === "folder") return t;
    }
    return null;
  }, [activeFolderTab, tabs]);

  const folderPath = activeFolderTab?.path ?? lastFolderPath;
  const filterTagId = filterFolderTab
    ? (filterByFolderId[filterFolderTab.id] ?? "")
    : "";

  const grid = useGridImages(activeFolderTab?.path ?? "");

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
    if (activeFolderTab?.path) void refreshFolderTags(activeFolderTab.path);
  }, [activeFolderTab?.path, refreshFolderTags]);

  const activateTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const closing = prev[idx];
        if (closing.kind === "folder") {
          grid.dropSession(closing.path);
          setFilterByFolderId((filters) => {
            const next = { ...filters };
            delete next[closing.id];
            return next;
          });
        }
        const next = prev.filter((t) => t.id !== id);
        setActiveTabId((cur) => {
          if (cur !== id) return cur;
          if (next.length === 0) return null;
          const fallback = next[Math.min(idx, next.length - 1)];
          return fallback.id;
        });
        return next;
      });
    },
    [grid],
  );

  const openOrFocusFolder = useCallback(
    async (path: string) => {
      const existing = tabs.find(
        (t): t is FolderTab => t.kind === "folder" && t.path === path,
      );
      if (existing) {
        setActiveTabId(existing.id);
        await grid.ensureLoaded(path);
        return;
      }

      const folderCount = tabs.filter((t) => t.kind === "folder").length;
      if (folderCount >= MAX_FOLDER_TABS) {
        window.alert(`最多打开 ${MAX_FOLDER_TABS} 个文件夹标签页`);
        return;
      }

      const tab: FolderTab = {
        kind: "folder",
        id: nextFolderTabId(),
        path,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      await grid.ensureLoaded(path);
    },
    [tabs, grid],
  );

  const handleOpenFolder = useCallback(async () => {
    const path = await grid.pickFolder();
    if (!path) return;
    await openOrFocusFolder(path);
  }, [grid, openOrFocusFolder]);

  const handleOpenCompare = useCallback(() => {
    const existing = tabs.find((t) => t.kind === "compare");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: AppTab = { kind: "compare", id: "compare" };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs]);

  const handleOpenFaces = useCallback(() => {
    const existing = tabs.find((t) => t.kind === "faces");
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: AppTab = { kind: "faces", id: "faces" };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs]);

  const setFilterTagId = useCallback(
    (id: string) => {
      if (!filterFolderTab) return;
      setFilterByFolderId((prev) => ({ ...prev, [filterFolderTab.id]: id }));
    },
    [filterFolderTab],
  );

  /** Faces may set a folder for batch tagging — open/focus as a folder tab. */
  const setFolderPathFromFaces = useCallback(
    (path: string) => {
      if (!path) return;
      void openOrFocusFolder(path);
    },
    [openOrFocusFolder],
  );

  const layoutClass =
    activeTab?.kind === "compare"
      ? "layout compare-mode"
      : activeTab?.kind === "faces"
        ? "layout faces-mode"
        : "layout";

  return (
    <div className={layoutClass}>
      <Toolbar
        activeTab={activeTab}
        personTags={personTags}
        filterTagId={filterTagId}
        onOpenFolder={() => void handleOpenFolder()}
        onOpenCompare={handleOpenCompare}
        onOpenFaces={handleOpenFaces}
        onFilterChange={setFilterTagId}
      />

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onActivate={activateTab}
        onClose={closeTab}
      />

      <GridView
        workAreaRef={grid.workAreaRef}
        images={grid.images}
        filterTagId={filterTagId}
        folderTagMap={folderTagMap}
        personTags={personTags}
        hasFolderTab={!!activeFolderTab}
        loading={grid.loading}
      />

      <CompareView />

      <FacesView
        folderPath={folderPath}
        setFolderPath={setFolderPathFromFaces}
        personTags={personTags}
        setPersonTags={setPersonTags}
        filterTagId={filterTagId}
        setFilterTagId={setFilterTagId}
        refreshFolderTags={refreshFolderTags}
      />

      <GridStatusBar
        loading={grid.loading}
        progressCurrent={grid.progressCurrent}
        progressTotal={grid.progressTotal}
        total={grid.total}
        images={grid.images}
        filterTagId={filterTagId}
        folderTagMap={folderTagMap}
      />
    </div>
  );
}

export default App;
