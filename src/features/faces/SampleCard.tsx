import { convertFileSrc } from "@tauri-apps/api/core";
import type { FaceSample } from "../../types";

interface SampleCardProps {
  sample: FaceSample;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleteTitle?: string;
}

export function SampleCard({
  sample,
  selected,
  disabled = false,
  onToggle,
  onDelete,
  deleteTitle = "删除",
}: SampleCardProps) {
  return (
    <label className={`sample-card ${selected ? "selected" : ""}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <button
        type="button"
        className="sample-delete-btn"
        title={deleteTitle}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
      <img src={convertFileSrc(sample.thumb_path)} alt={sample.id} />
    </label>
  );
}
