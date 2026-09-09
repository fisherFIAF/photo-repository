import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  FaceSample,
  FaceTagProgress,
  PersonTag,
  TagFolderResult,
} from "../../types";

interface UseFacesOptions {
  folderPath: string;
  setFolderPath: (path: string) => void;
  personTags: PersonTag[];
  setPersonTags: (tags: PersonTag[]) => void;
  filterTagId: string;
  setFilterTagId: (id: string) => void;
  refreshFolderTags: (folder: string) => Promise<void>;
}

const tagSampleKey = (tagId: string, sampleId: string) => `${tagId}:${sampleId}`;

export function useFaces({
  folderPath,
  setFolderPath,
  personTags,
  setPersonTags,
  filterTagId,
  setFilterTagId,
  refreshFolderTags,
}: UseFacesOptions) {
  const [inboxSamples, setInboxSamples] = useState<FaceSample[]>([]);
  const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const [facesBusy, setFacesBusy] = useState(false);
  const [facesStatus, setFacesStatus] = useState("");
  const [tagProgress, setTagProgress] = useState<FaceTagProgress | null>(null);
  const [tagSamplesMap, setTagSamplesMap] = useState<Record<string, FaceSample[]>>({});
  const [selectedTagSampleKeys, setSelectedTagSampleKeys] = useState<Set<string>>(new Set());
  const [editingTagId, setEditingTagId] = useState("");
  const [editingTagName, setEditingTagName] = useState("");

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of personTags) m.set(t.id, t.name);
    return m;
  }, [personTags]);

  const refreshTagSamples = useCallback(async (tags: PersonTag[]) => {
    if (tags.length === 0) {
      setTagSamplesMap({});
      return;
    }
    const entries = await Promise.all(
      tags.map(async (t) => {
        try {
          const samples = await invoke<FaceSample[]>("list_tag_samples", { tagId: t.id });
          return [t.id, samples] as const;
        } catch (e) {
          console.error("list_tag_samples failed:", e);
          return [t.id, []] as const;
        }
      }),
    );
    setTagSamplesMap(Object.fromEntries(entries));
  }, []);

  const refreshOneTagSamples = useCallback(async (tagId: string) => {
    try {
      const samples = await invoke<FaceSample[]>("list_tag_samples", { tagId });
      setTagSamplesMap((prev) => ({ ...prev, [tagId]: samples }));
    } catch (e) {
      console.error("list_tag_samples failed:", e);
      setTagSamplesMap((prev) => ({ ...prev, [tagId]: [] }));
    }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      const tags = await invoke<PersonTag[]>("list_person_tags");
      setPersonTags(tags);
      await refreshTagSamples(tags);
    } catch (e) {
      console.error("list_person_tags failed:", e);
    }
  }, [refreshTagSamples, setPersonTags]);

  const refreshInbox = useCallback(async () => {
    try {
      const samples = await invoke<FaceSample[]>("list_inbox_face_samples");
      setInboxSamples(samples);
    } catch (e) {
      console.error("list_inbox_face_samples failed:", e);
    }
  }, []);

  useEffect(() => {
    refreshTags();
    refreshInbox();
  }, [refreshTags, refreshInbox]);

  async function handleSelectTagFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择要打标的文件夹",
      ...(folderPath ? { defaultPath: folderPath } : {}),
    });
    if (!selected || typeof selected !== "string") return;

    setFolderPath(selected);
    setFilterTagId("");
    await refreshFolderTags(selected);
    setFacesStatus(`已选择文件夹：${selected}`);
  }

  async function handleAddTemplates() {
    const selected = await open({
      multiple: true,
      title: "选择模板图片",
      // 不设 filters：Linux xdg-portal 的 glob 区分大小写（*.jpg 不匹配 .JPG），
      // 会导致常见相机照片无法选中；后端会校验是否为可解码的图片。
      ...(folderPath ? { defaultPath: folderPath } : {}),
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    setFacesBusy(true);
    setFacesStatus("准备模型并识别人脸…（首次会下载模型）");
    try {
      await invoke("ensure_face_models");
      const samples = await invoke<FaceSample[]>("add_face_samples", { paths });
      setFacesStatus(
        samples.length > 0
          ? `已提取 ${samples.length} 张人脸，请归类到标签`
          : "未检测到人脸",
      );
      await refreshInbox();
      setSelectedSampleIds(new Set(samples.map((s) => s.id)));
    } catch (e) {
      console.error(e);
      setFacesStatus(`失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setFacesBusy(true);
    try {
      const tag = await invoke<PersonTag>("create_person_tag", { name });
      setNewTagName("");
      await refreshTags();
      setSelectedTagIds(new Set([tag.id]));
      setFacesStatus(`已创建标签「${tag.name}」`);
    } catch (e) {
      setFacesStatus(`创建标签失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleAttachSamples() {
    if (selectedSampleIds.size === 0) {
      setFacesStatus("请先勾选待归类的人脸样本");
      return;
    }
    const tagId = [...selectedTagIds][0];
    if (!tagId) {
      setFacesStatus("请先选择一个目标人物标签");
      return;
    }
    setFacesBusy(true);
    try {
      const n = await invoke<number>("attach_samples_to_tag", {
        tagId,
        sampleIds: [...selectedSampleIds],
      });
      setSelectedSampleIds(new Set());
      await refreshInbox();
      await refreshOneTagSamples(tagId);
      setFacesStatus(`已将 ${n} 个样本绑定到「${tagNameById.get(tagId) ?? tagId}」`);
    } catch (e) {
      setFacesStatus(`绑定失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleDeleteInboxSamples(sampleIds: string[]) {
    if (sampleIds.length === 0) {
      setFacesStatus("请先勾选要删除的人脸样本");
      return;
    }
    const msg =
      sampleIds.length === 1
        ? "删除该未归类人脸样本？"
        : `删除选中的 ${sampleIds.length} 个未归类人脸样本？`;
    if (!confirm(msg)) return;
    setFacesBusy(true);
    try {
      const n = await invoke<number>("delete_inbox_samples", { sampleIds });
      setSelectedSampleIds((prev) => {
        const next = new Set(prev);
        for (const id of sampleIds) next.delete(id);
        return next;
      });
      await refreshInbox();
      setFacesStatus(`已删除 ${n} 个未归类样本`);
    } catch (e) {
      setFacesStatus(`删除失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleRenameTag(tagId: string) {
    const name = editingTagName.trim();
    if (!name) {
      setFacesStatus("标签名不能为空");
      return;
    }
    const current = personTags.find((t) => t.id === tagId);
    if (current?.name === name) {
      setEditingTagId("");
      return;
    }
    setFacesBusy(true);
    try {
      await invoke<PersonTag>("rename_person_tag", { tagId, name });
      setEditingTagId("");
      await refreshTags();
      setFacesStatus(`已重命名为「${name}」`);
    } catch (e) {
      setFacesStatus(`重命名失败: ${e}`);
    }
    setFacesBusy(false);
  }

  function startEditTag(tag: PersonTag) {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  }

  async function handleDeleteTagSamples(tagId: string, sampleIds: string[]) {
    if (sampleIds.length === 0) {
      setFacesStatus("请先勾选要删除的模板");
      return;
    }
    const tagName = tagNameById.get(tagId) ?? tagId;
    const msg =
      sampleIds.length === 1
        ? `删除「${tagName}」下的该模板？`
        : `删除「${tagName}」下选中的 ${sampleIds.length} 个模板？`;
    if (!confirm(msg)) return;
    setFacesBusy(true);
    try {
      const n = await invoke<number>("delete_tag_samples", { tagId, sampleIds });
      setSelectedTagSampleKeys((prev) => {
        const next = new Set(prev);
        for (const id of sampleIds) next.delete(tagSampleKey(tagId, id));
        return next;
      });
      await refreshOneTagSamples(tagId);
      setFacesStatus(`已从「${tagName}」删除 ${n} 个模板`);
    } catch (e) {
      setFacesStatus(`删除失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleDeleteTag(tagId: string) {
    if (!confirm(`删除标签「${tagNameById.get(tagId) ?? tagId}」及其模板数据？`)) return;
    setFacesBusy(true);
    try {
      await invoke("delete_person_tag", { tagId });
      await refreshTags();
      setSelectedTagIds((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
      setSelectedTagSampleKeys((prev) => {
        const next = new Set(prev);
        for (const key of prev) {
          if (key.startsWith(`${tagId}:`)) next.delete(key);
        }
        return next;
      });
      setTagSamplesMap((prev) => {
        const next = { ...prev };
        delete next[tagId];
        return next;
      });
      if (filterTagId === tagId) setFilterTagId("");
      setFacesStatus("标签已删除");
    } catch (e) {
      setFacesStatus(`删除失败: ${e}`);
    }
    setFacesBusy(false);
  }

  async function handleTagFolder() {
    let folder = folderPath;
    if (!folder) {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择要打标的文件夹",
      });
      if (!selected || typeof selected !== "string") return;
      folder = selected;
      setFolderPath(folder);
      await refreshFolderTags(folder);
    }
    if (selectedTagIds.size === 0) {
      setFacesStatus("请勾选要打标的人物标签");
      return;
    }
    setFacesBusy(true);
    setTagProgress({ current: 0, total: 0, matched: 0, path: "" });
    setFacesStatus("批量识别中…");

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<FaceTagProgress>("face-tag-progress", (ev) => {
        setTagProgress(ev.payload);
      });
      await invoke("ensure_face_models");
      const result = await invoke<TagFolderResult>("tag_folder", {
        folder,
        tagIds: [...selectedTagIds],
        force: false,
      });
      await refreshFolderTags(folder);
      setFacesStatus(
        `完成：扫描 ${result.scanned}，命中 ${result.matched}，跳过已有 ${result.skipped}`,
      );
    } catch (e) {
      setFacesStatus(`打标失败: ${e}`);
    } finally {
      unlisten?.();
      setFacesBusy(false);
      setTagProgress(null);
    }
  }

  function toggleSample(id: string) {
    setSelectedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTagSample(tagId: string, sampleId: string) {
    const key = tagSampleKey(tagId, sampleId);
    setSelectedTagSampleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    inboxSamples,
    selectedSampleIds,
    selectedTagIds,
    newTagName,
    setNewTagName,
    facesBusy,
    facesStatus,
    tagProgress,
    tagSamplesMap,
    selectedTagSampleKeys,
    editingTagId,
    editingTagName,
    setEditingTagName,
    setEditingTagId,
    tagSampleKey,
    refreshInbox,
    handleSelectTagFolder,
    handleAddTemplates,
    handleCreateTag,
    handleAttachSamples,
    handleDeleteInboxSamples,
    handleRenameTag,
    startEditTag,
    handleDeleteTagSamples,
    handleDeleteTag,
    handleTagFolder,
    toggleSample,
    toggleTagSample,
    toggleTag,
  };
}
