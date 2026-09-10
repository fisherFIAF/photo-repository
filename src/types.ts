export interface ImageEntry {
  path: string;
  name: string;
  thumb_path: string;
  thumb_ready: boolean;
}

export interface ListImagesResponse {
  total: number;
  items: ImageEntry[];
}

export interface ThumbProgress {
  index: number;
  current: number;
  total: number;
}

export interface FileEntry {
  name: string;
  path: string;
}

export interface CompareResult {
  left_only: FileEntry[];
  right_only: FileEntry[];
  same: FileEntry[];
  different: FileEntry[];
}

export interface MergedRow {
  name: string;
  left: FileEntry | null;
  right: FileEntry | null;
  status: "left-only" | "right-only" | "same" | "different";
}

export interface PersonTag {
  id: string;
  name: string;
  data_dir: string;
}

export interface FaceSample {
  id: string;
  thumb_path: string;
  source_path: string;
  location: string;
}

export interface FolderImagesInfo {
  version: number;
  images: Record<string, string[]>;
}

export interface FaceTagProgress {
  current: number;
  total: number;
  matched: number;
  path: string;
}

export interface TagFolderResult {
  scanned: number;
  matched: number;
  skipped: number;
}

/** @deprecated Prefer AppTab.kind; kept for any leftover references */
export type ViewMode = "grid" | "compare" | "faces";

export type CompareSide = "left" | "right";

export const MAX_FOLDER_TABS = 7;

export type FolderTab = {
  kind: "folder";
  id: string;
  path: string;
};

export type CompareTab = {
  kind: "compare";
  id: "compare";
};

export type FacesTab = {
  kind: "faces";
  id: "faces";
};

export type AppTab = FolderTab | CompareTab | FacesTab;
