import type { FaceSample } from "../../types";
import { SampleCard } from "./SampleCard";

interface InboxSectionProps {
  inboxSamples: FaceSample[];
  selectedSampleIds: Set<string>;
  facesBusy: boolean;
  onAddTemplates: () => void;
  onRefreshInbox: () => void;
  onDeleteSelected: () => void;
  onToggleSample: (id: string) => void;
  onDeleteOne: (id: string) => void;
}

export function InboxSection({
  inboxSamples,
  selectedSampleIds,
  facesBusy,
  onAddTemplates,
  onRefreshInbox,
  onDeleteSelected,
  onToggleSample,
  onDeleteOne,
}: InboxSectionProps) {
  return (
    <section className="faces-section">
      <h3>1. 模板人脸</h3>
      <div className="faces-actions">
        <button className="faces-btn" disabled={facesBusy} onClick={onAddTemplates}>
          选择模板图片
        </button>
        <button className="faces-btn" disabled={facesBusy} onClick={onRefreshInbox}>
          刷新收件箱
        </button>
        <button
          className="faces-btn danger"
          disabled={facesBusy || selectedSampleIds.size === 0}
          onClick={onDeleteSelected}
        >
          删除选中
        </button>
      </div>
      <div className="sample-grid">
        {inboxSamples.length === 0 ? (
          <span className="faces-hint">暂无未归类人脸，请先选模板图</span>
        ) : (
          inboxSamples.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              selected={selectedSampleIds.has(s.id)}
              disabled={facesBusy}
              onToggle={() => onToggleSample(s.id)}
              onDelete={() => onDeleteOne(s.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
