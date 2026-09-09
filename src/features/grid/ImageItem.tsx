import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ImageEntry } from "../../types";

interface ImageItemProps {
  image: ImageEntry;
  tags: { id: string; name: string }[];
}

export function ImageItem({ image, tags }: ImageItemProps) {
  return (
    <div
      className="image-item"
      onDoubleClick={async () => {
        try {
          await openPath(image.path);
        } catch (e) {
          console.error("openPath failed:", e);
        }
      }}
    >
      <div className="thumb-wrap">
        {image.thumb_ready ? (
          <img src={convertFileSrc(image.thumb_path)} alt={image.name} />
        ) : (
          <div className="thumb-placeholder" />
        )}
        {tags.length > 0 && (
          <div className="tag-badges">
            {tags.map((t) => (
              <span key={t.id} className="tag-badge">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="image-name">{image.name}</span>
    </div>
  );
}
