import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Toolbar } from "./components/Toolbar";
import { CompareView } from "./features/compare/CompareView";
import { FacesView } from "./features/faces/FacesView";
import { GridStatusBar } from "./features/grid/GridStatusBar";
import { GridView } from "./features/grid/GridView";
import { useGridImages } from "./features/grid/useGridImages";
import type { FolderImagesInfo, PersonTag, ViewMode } from "./types";
import "./App.css";

function App() {
  const [mode, setMode] = useState<ViewMode>("grid");
  const [folderPath, setFolderPath] = useState("");
  const [filterTagId, setFilterTagId] = useState("");
  const [personTags, setPersonTags] = useState<PersonTag[]>([]);
  const [folderTagMap, setFolderTagMap] = useState<Record<string, string[]>>({});

  const grid = useGridImages(folderPath, setFolderPath, setFilterTagId);

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
    if (folderPath) refreshFolderTags(folderPath);
  }, [folderPath, refreshFolderTags]);

  const layoutClass =
    mode === "compare"
      ? "layout compare-mode"
      : mode === "faces"
        ? "layout faces-mode"
        : "layout";

  return (
    <div className={layoutClass}>
      <Toolbar
        mode={mode}
        folderPath={folderPath}
        personTags={personTags}
        filterTagId={filterTagId}
        onSelectGrid={() => {
          if (folderPath) {
            setMode("grid");
            if (grid.images.length === 0) {
              void grid.loadPage(folderPath, 0, false);
            }
          } else {
            void grid.handleOpenFolder();
          }
        }}
        onSelectCompare={() => setMode("compare")}
        onSelectFaces={() => setMode("faces")}
        onFilterChange={setFilterTagId}
        onOpenFolder={() => void grid.handleOpenFolder()}
      />

      <GridView
        workAreaRef={grid.workAreaRef}
        images={grid.images}
        filterTagId={filterTagId}
        folderTagMap={folderTagMap}
        personTags={personTags}
      />

      <CompareView />

      <FacesView
        folderPath={folderPath}
        setFolderPath={setFolderPath}
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
