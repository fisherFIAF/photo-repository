import { useMemo, type RefObject } from "react";
import type { ImageEntry, PersonTag } from "../../types";
import { ImageItem } from "./ImageItem";
import "./grid.css";

interface GridViewProps {
  workAreaRef: RefObject<HTMLDivElement | null>;
  images: ImageEntry[];
  filterTagId: string;
  folderTagMap: Record<string, string[]>;
  personTags: PersonTag[];
  hasFolderTab: boolean;
  loading: boolean;
}

export function GridView({
  workAreaRef,
  images,
  filterTagId,
  folderTagMap,
  personTags,
  hasFolderTab,
  loading,
}: GridViewProps) {
  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of personTags) m.set(t.id, t.name);
    return m;
  }, [personTags]);

  const displayedImages = useMemo(() => {
    if (!filterTagId) return images;
    return images.filter((img) => (folderTagMap[img.name] ?? []).includes(filterTagId));
  }, [images, filterTagId, folderTagMap]);

  return (
    <div className="work-area" ref={workAreaRef}>
      {!hasFolderTab ? (
        <div className="empty-state">
          <span>工作区</span>
          <span>点击工具栏「打开文件夹」开始浏览</span>
        </div>
      ) : images.length === 0 ? (
        <div className="empty-state">
          <span>{loading ? "加载中…" : "此文件夹暂无图片"}</span>
        </div>
      ) : (
        <div className="image-grid">
          {displayedImages.map((img) => {
            const tagIds = folderTagMap[img.name] ?? [];
            const tags = tagIds.map((id) => ({
              id,
              name: tagNameById.get(id) ?? id,
            }));
            return <ImageItem key={img.path} image={img} tags={tags} />;
          })}
        </div>
      )}
    </div>
  );
}
