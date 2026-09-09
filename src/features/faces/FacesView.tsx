import type { PersonTag } from "../../types";
import { BatchTagSection } from "./BatchTagSection";
import { FacesStatusBar } from "./FacesStatusBar";
import { InboxSection } from "./InboxSection";
import { TagListSection } from "./TagListSection";
import { useFaces } from "./useFaces";
import "./faces.css";

interface FacesViewProps {
  folderPath: string;
  setFolderPath: (path: string) => void;
  personTags: PersonTag[];
  setPersonTags: (tags: PersonTag[]) => void;
  filterTagId: string;
  setFilterTagId: (id: string) => void;
  refreshFolderTags: (folder: string) => Promise<void>;
}

/** Renders faces work-area + status-bar as layout siblings (Fragment). */
export function FacesView({
  folderPath,
  setFolderPath,
  personTags,
  setPersonTags,
  filterTagId,
  setFilterTagId,
  refreshFolderTags,
}: FacesViewProps) {
  const faces = useFaces({
    folderPath,
    setFolderPath,
    personTags,
    setPersonTags,
    filterTagId,
    setFilterTagId,
    refreshFolderTags,
  });

  return (
    <>
      <div className="faces-work-area">
        <div className="faces-panel">
          <InboxSection
            inboxSamples={faces.inboxSamples}
            selectedSampleIds={faces.selectedSampleIds}
            facesBusy={faces.facesBusy}
            onAddTemplates={faces.handleAddTemplates}
            onRefreshInbox={faces.refreshInbox}
            onDeleteSelected={() =>
              faces.handleDeleteInboxSamples([...faces.selectedSampleIds])
            }
            onToggleSample={faces.toggleSample}
            onDeleteOne={(id) => faces.handleDeleteInboxSamples([id])}
          />

          <TagListSection
            personTags={personTags}
            tagSamplesMap={faces.tagSamplesMap}
            selectedTagIds={faces.selectedTagIds}
            selectedTagSampleKeys={faces.selectedTagSampleKeys}
            newTagName={faces.newTagName}
            editingTagId={faces.editingTagId}
            editingTagName={faces.editingTagName}
            facesBusy={faces.facesBusy}
            tagSampleKey={faces.tagSampleKey}
            onNewTagNameChange={faces.setNewTagName}
            onCreateTag={faces.handleCreateTag}
            onAttachSamples={faces.handleAttachSamples}
            onToggleTag={faces.toggleTag}
            onStartEditTag={faces.startEditTag}
            onEditingTagNameChange={faces.setEditingTagName}
            onRenameTag={faces.handleRenameTag}
            onCancelEdit={() => faces.setEditingTagId("")}
            onDeleteTag={faces.handleDeleteTag}
            onToggleTagSample={faces.toggleTagSample}
            onDeleteTagSamples={faces.handleDeleteTagSamples}
          />

          <BatchTagSection
            folderPath={folderPath}
            facesBusy={faces.facesBusy}
            selectedTagCount={faces.selectedTagIds.size}
            tagProgress={faces.tagProgress}
            onSelectFolder={faces.handleSelectTagFolder}
            onTagFolder={faces.handleTagFolder}
          />

          {faces.facesStatus && (
            <div className="faces-status">{faces.facesStatus}</div>
          )}
        </div>
      </div>
      <FacesStatusBar facesBusy={faces.facesBusy} facesStatus={faces.facesStatus} />
    </>
  );
}
