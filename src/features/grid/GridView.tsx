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
}

export function GridView({
  workAreaRef,
  images,
  filterTagId,
  folderTagMap,
  personTags,
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
      {images.length === 0 ? (
        <div className="empty-state">
          <span>工作区</span>
          <span>(显示图片列表)</span>
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
