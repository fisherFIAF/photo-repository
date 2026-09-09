import type { FaceSample, PersonTag } from "../../types";
import { SampleCard } from "./SampleCard";

interface TagBlockProps {
  tag: PersonTag;
  samples: FaceSample[];
  selected: boolean;
  selectedSampleIds: string[];
  editing: boolean;
  editingName: string;
  facesBusy: boolean;
  onToggleTag: () => void;
  onStartEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelEdit: () => void;
  onDeleteTag: () => void;
  onToggleSample: (sampleId: string) => void;
  onDeleteSamples: (sampleIds: string[]) => void;
}

export function TagBlock({
  tag,
  samples,
  selected,
  selectedSampleIds,
  editing,
  editingName,
  facesBusy,
  onToggleTag,
  onStartEdit,
  onEditingNameChange,
  onSaveRename,
  onCancelEdit,
  onDeleteTag,
  onToggleSample,
  onDeleteSamples,
}: TagBlockProps) {
  return (
    <li className="tag-block">
      <div className="tag-row">
        <div className="tag-row-main">
          <label className="tag-checkbox">
            <input type="checkbox" checked={selected} onChange={onToggleTag} />
          </label>
          {editing ? (
            <div className="tag-name-edit">
              <input
                className="faces-input tag-name-input"
                value={editingName}
                disabled={facesBusy}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveRename();
                  if (e.key === "Escape") onCancelEdit();
                }}
                autoFocus
              />
              <button className="faces-btn" disabled={facesBusy} onClick={onSaveRename}>
                保存
              </button>
              <button className="faces-btn" disabled={facesBusy} onClick={onCancelEdit}>
                取消
              </button>
            </div>
          ) : (
            <>
              <span className="tag-name">{tag.name}</span>
              <span className="tag-sample-count">{samples.length} 个模板</span>
            </>
          )}
        </div>
        <div className="tag-row-actions">
          {!editing && (
            <button className="faces-btn" disabled={facesBusy} onClick={onStartEdit}>
              重命名
            </button>
          )}
          {selectedSampleIds.length > 0 && (
            <button
              className="faces-btn danger"
              disabled={facesBusy}
              onClick={() => onDeleteSamples(selectedSampleIds)}
            >
              删除选中模板
            </button>
          )}
          <button className="faces-btn danger" disabled={facesBusy} onClick={onDeleteTag}>
            删除标签
          </button>
        </div>
      </div>
      <div className="tag-samples">
        {samples.length === 0 ? (
          <span className="faces-hint">该标签尚无模板，请绑定收件箱样本</span>
        ) : (
          <div className="sample-grid compact">
            {samples.map((s) => (
              <SampleCard
                key={s.id}
                sample={s}
                selected={selectedSampleIds.includes(s.id)}
                disabled={facesBusy}
                deleteTitle="删除模板"
                onToggle={() => onToggleSample(s.id)}
                onDelete={() => onDeleteSamples([s.id])}
              />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
