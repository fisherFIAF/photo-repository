use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::paths::{
    inbox_dir, person_dir, person_samples_dir, tags_json_path,
};

pub(crate) const SIMILARITY_THRESHOLD: f32 = 0.40;
pub(crate) const EMBEDDING_DIM: usize = 512;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PersonTag {
    pub id: String,
    pub name: String,
    /// Relative to faces/: e.g. `people/p_8f3a`
    pub data_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct TagsFile {
    pub version: u32,
    pub tags: Vec<PersonTag>,
}

impl Default for TagsFile {
    fn default() -> Self {
        Self {
            version: 1,
            tags: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct FolderImagesInfo {
    pub version: u32,
    /// filename -> list of person tag ids
    pub images: HashMap<String, Vec<String>>,
}

impl Default for FolderImagesInfo {
    fn default() -> Self {
        Self {
            version: 1,
            images: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PersonMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct FaceSampleDto {
    pub id: String,
    pub thumb_path: String,
    pub source_path: String,
    /// Where the sample currently lives: `inbox` or person id
    pub location: String,
}

fn new_id(prefix: &str) -> String {
    use md5::{Digest, Md5};
    let mut hasher = Md5::new();
    hasher.update(prefix.as_bytes());
    hasher.update(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    // Extra entropy from address of a stack value
    let n = std::ptr::addr_of!(hasher) as usize;
    hasher.update(n.to_le_bytes());
    let hash = format!("{:x}", hasher.finalize());
    format!("{}_{}", prefix, &hash[..8])
}

pub(crate) fn load_tags() -> Result<TagsFile, String> {
    let path = tags_json_path()?;
    if !path.exists() {
        return Ok(TagsFile::default());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub(crate) fn save_tags(file: &TagsFile) -> Result<(), String> {
    let path = tags_json_path()?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn images_info_path(folder: &Path) -> PathBuf {
    folder.join("images.info")
}

pub(crate) fn load_folder_images_info(folder: &Path) -> Result<FolderImagesInfo, String> {
    let path = images_info_path(folder);
    if !path.exists() {
        return Ok(FolderImagesInfo::default());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub(crate) fn save_folder_images_info(folder: &Path, info: &FolderImagesInfo) -> Result<(), String> {
    let path = images_info_path(folder);
    let tmp = folder.join("images.info.tmp");
    let text = serde_json::to_string_pretty(info).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn write_embedding(path: &Path, embedding: &[f32]) -> Result<(), String> {
    if embedding.len() != EMBEDDING_DIM {
        return Err(format!(
            "embedding dim {} != {}",
            embedding.len(),
            EMBEDDING_DIM
        ));
    }
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn read_embedding(path: &Path) -> Result<Vec<f32>, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() != EMBEDDING_DIM * 4 {
        return Err(format!(
            "bad embedding file {}: {} bytes",
            path.display(),
            bytes.len()
        ));
    }
    let mut out = Vec::with_capacity(EMBEDDING_DIM);
    for chunk in bytes.chunks_exact(4) {
        out.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(out)
}

pub(crate) fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom <= f32::EPSILON {
        return 0.0;
    }
    dot / denom
}

pub(crate) fn load_person_embeddings(person_id: &str) -> Result<Vec<Vec<f32>>, String> {
    let dir = person_samples_dir(person_id)?;
    let mut embeddings = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("bin") {
            embeddings.push(read_embedding(&path)?);
        }
    }
    Ok(embeddings)
}

/// Save a new sample into the inbox. Returns sample id.
pub(crate) fn save_inbox_sample(
    embedding: &[f32],
    thumb: &image::DynamicImage,
    source_path: &str,
) -> Result<FaceSampleDto, String> {
    let id = new_id("s");
    let inbox = inbox_dir()?;
    let bin_path = inbox.join(format!("{id}.bin"));
    let jpg_path = inbox.join(format!("{id}.jpg"));
    let meta_path = inbox.join(format!("{id}.meta.json"));

    write_embedding(&bin_path, embedding)?;
    thumb
        .save(&jpg_path)
        .map_err(|e| format!("save thumb: {e}"))?;

    let meta = serde_json::json!({
        "id": id,
        "source_path": source_path,
    });
    std::fs::write(&meta_path, meta.to_string()).map_err(|e| e.to_string())?;

    Ok(FaceSampleDto {
        id,
        thumb_path: jpg_path.to_string_lossy().to_string(),
        source_path: source_path.to_string(),
        location: "inbox".to_string(),
    })
}

pub(crate) fn list_inbox_samples() -> Result<Vec<FaceSampleDto>, String> {
    let inbox = inbox_dir()?;
    let mut samples = Vec::new();
    for entry in std::fs::read_dir(&inbox).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jpg") {
            continue;
        }
        let id = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let meta_path = inbox.join(format!("{id}.meta.json"));
        let source_path = if meta_path.exists() {
            let text = std::fs::read_to_string(&meta_path).unwrap_or_default();
            serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("source_path")?.as_str().map(|s| s.to_string()))
                .unwrap_or_default()
        } else {
            String::new()
        };
        samples.push(FaceSampleDto {
            id,
            thumb_path: path.to_string_lossy().to_string(),
            source_path,
            location: "inbox".to_string(),
        });
    }
    samples.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(samples)
}

#[tauri::command]
pub(crate) fn list_person_tags() -> Result<Vec<PersonTag>, String> {
    Ok(load_tags()?.tags)
}

#[tauri::command]
pub(crate) fn create_person_tag(name: String) -> Result<PersonTag, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("标签名不能为空".into());
    }
    let mut file = load_tags()?;
    if file.tags.iter().any(|t| t.name == name) {
        return Err(format!("标签已存在: {name}"));
    }
    let id = new_id("p");
    let data_dir = format!("people/{id}");
    let dir = person_dir(&id)?;
    person_samples_dir(&id)?;
    let meta = PersonMeta {
        id: id.clone(),
        name: name.clone(),
        created_at: chrono_like_now(),
    };
    std::fs::write(
        dir.join("meta.json"),
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let tag = PersonTag {
        id,
        name,
        data_dir,
    };
    file.tags.push(tag.clone());
    save_tags(&file)?;
    Ok(tag)
}

fn chrono_like_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{secs}")
}

#[tauri::command]
pub(crate) fn attach_samples_to_tag(tag_id: String, sample_ids: Vec<String>) -> Result<usize, String> {
    let file = load_tags()?;
    if !file.tags.iter().any(|t| t.id == tag_id) {
        return Err(format!("标签不存在: {tag_id}"));
    }
    let inbox = inbox_dir()?;
    let dest = person_samples_dir(&tag_id)?;
    let mut moved = 0usize;
    for sample_id in sample_ids {
        let bin_src = inbox.join(format!("{sample_id}.bin"));
        let jpg_src = inbox.join(format!("{sample_id}.jpg"));
        let meta_src = inbox.join(format!("{sample_id}.meta.json"));
        if !bin_src.exists() {
            return Err(format!("样本不存在: {sample_id}"));
        }
        std::fs::rename(&bin_src, dest.join(format!("{sample_id}.bin")))
            .map_err(|e| e.to_string())?;
        if jpg_src.exists() {
            std::fs::rename(&jpg_src, dest.join(format!("{sample_id}.jpg")))
                .map_err(|e| e.to_string())?;
        }
        if meta_src.exists() {
            std::fs::rename(&meta_src, dest.join(format!("{sample_id}.meta.json")))
                .map_err(|e| e.to_string())?;
        }
        moved += 1;
    }
    Ok(moved)
}

#[tauri::command]
pub(crate) fn list_inbox_face_samples() -> Result<Vec<FaceSampleDto>, String> {
    list_inbox_samples()
}

#[tauri::command]
pub(crate) fn list_tag_samples(tag_id: String) -> Result<Vec<FaceSampleDto>, String> {
    let dir = person_samples_dir(&tag_id)?;
    let mut samples = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jpg") {
            continue;
        }
        let id = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let meta_path = dir.join(format!("{id}.meta.json"));
        let source_path = if meta_path.exists() {
            let text = std::fs::read_to_string(&meta_path).unwrap_or_default();
            serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("source_path")?.as_str().map(|s| s.to_string()))
                .unwrap_or_default()
        } else {
            String::new()
        };
        samples.push(FaceSampleDto {
            id,
            thumb_path: path.to_string_lossy().to_string(),
            source_path,
            location: tag_id.clone(),
        });
    }
    samples.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(samples)
}

#[tauri::command]
pub(crate) fn read_folder_tags(folder: String) -> Result<FolderImagesInfo, String> {
    load_folder_images_info(Path::new(&folder))
}

#[tauri::command]
pub(crate) fn delete_person_tag(tag_id: String) -> Result<(), String> {
    let mut file = load_tags()?;
    let before = file.tags.len();
    file.tags.retain(|t| t.id != tag_id);
    if file.tags.len() == before {
        return Err(format!("标签不存在: {tag_id}"));
    }
    save_tags(&file)?;
    let dir = person_dir(&tag_id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical() {
        let a = vec![1.0f32; EMBEDDING_DIM];
        let b = vec![1.0f32; EMBEDDING_DIM];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_embedding_roundtrip() {
        let tmp = std::env::temp_dir().join("emb_roundtrip.bin");
        let mut emb = vec![0.0f32; EMBEDDING_DIM];
        for i in 0..EMBEDDING_DIM {
            emb[i] = (i as f32) * 0.001;
        }
        write_embedding(&tmp, &emb).unwrap();
        let got = read_embedding(&tmp).unwrap();
        assert_eq!(emb, got);
        std::fs::remove_file(&tmp).ok();
    }
}
