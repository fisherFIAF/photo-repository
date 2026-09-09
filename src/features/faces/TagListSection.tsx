import type { FaceSample, PersonTag } from "../../types";
import { TagBlock } from "./TagBlock";

interface TagListSectionProps {
  personTags: PersonTag[];
  tagSamplesMap: Record<string, FaceSample[]>;
  selectedTagIds: Set<string>;
  selectedTagSampleKeys: Set<string>;
  newTagName: string;
  editingTagId: string;
  editingTagName: string;
  facesBusy: boolean;
  tagSampleKey: (tagId: string, sampleId: string) => string;
  onNewTagNameChange: (name: string) => void;
  onCreateTag: () => void;
  onAttachSamples: () => void;
  onToggleTag: (id: string) => void;
  onStartEditTag: (tag: PersonTag) => void;
  onEditingTagNameChange: (name: string) => void;
  onRenameTag: (tagId: string) => void;
  onCancelEdit: () => void;
  onDeleteTag: (tagId: string) => void;
  onToggleTagSample: (tagId: string, sampleId: string) => void;
  onDeleteTagSamples: (tagId: string, sampleIds: string[]) => void;
}

export function TagListSection({
  personTags,
  tagSamplesMap,
  selectedTagIds,
  selectedTagSampleKeys,
  newTagName,
  editingTagId,
  editingTagName,
  facesBusy,
  tagSampleKey,
  onNewTagNameChange,
  onCreateTag,
  onAttachSamples,
  onToggleTag,
  onStartEditTag,
  onEditingTagNameChange,
  onRenameTag,
  onCancelEdit,
  onDeleteTag,
  onToggleTagSample,
  onDeleteTagSamples,
}: TagListSectionProps) {
  return (
    <section className="faces-section">
      <h3>2. 人物标签</h3>
      <div className="faces-actions">
        <input
          className="faces-input"
          placeholder="新标签名"
          value={newTagName}
          onChange={(e) => onNewTagNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreateTag();
          }}
        />
        <button className="faces-btn" disabled={facesBusy} onClick={onCreateTag}>
          创建
        </button>
        <button className="faces-btn primary" disabled={facesBusy} onClick={onAttachSamples}>
          绑定选中样本
        </button>
      </div>
      <ul className="tag-list">
        {personTags.map((t) => {
          const samples = tagSamplesMap[t.id] ?? [];
          const selectedInTag = samples
            .filter((s) => selectedTagSampleKeys.has(tagSampleKey(t.id, s.id)))
            .map((s) => s.id);
          return (
            <TagBlock
              key={t.id}
              tag={t}
              samples={samples}
              selected={selectedTagIds.has(t.id)}
              selectedSampleIds={selectedInTag}
              editing={editingTagId === t.id}
              editingName={editingTagName}
              facesBusy={facesBusy}
              onToggleTag={() => onToggleTag(t.id)}
              onStartEdit={() => onStartEditTag(t)}
              onEditingNameChange={onEditingTagNameChange}
              onSaveRename={() => onRenameTag(t.id)}
              onCancelEdit={onCancelEdit}
              onDeleteTag={() => onDeleteTag(t.id)}
              onToggleSample={(sampleId) => onToggleTagSample(t.id, sampleId)}
              onDeleteSamples={(ids) => onDeleteTagSamples(t.id, ids)}
            />
          );
        })}
      </ul>
    </section>
  );
}
