use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use insight_face_rs::{FaceDetector, FaceRecognizer};
use tauri::{AppHandle, Emitter};

use crate::paths::models_dir;
use crate::tags::{
    cosine_similarity, load_folder_images_info, load_person_embeddings, save_folder_images_info,
    save_inbox_sample, FaceSampleDto, SIMILARITY_THRESHOLD,
};

const EVENT_FACE_TAG_PROGRESS: &str = "face-tag-progress";
const MAX_FACE_WORKERS: usize = 10;
const DET_MODEL_NAME: &str = "det_10g.onnx";
const REC_MODEL_NAME: &str = "w600k_r50.onnx";
const BUFFALO_L_URL: &str =
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip";

#[derive(Clone, serde::Serialize)]
struct FaceTagProgress {
    current: usize,
    total: usize,
    matched: usize,
    path: String,
}

struct FacePipeline {
    detector: FaceDetector,
    recognizer: FaceRecognizer,
}

impl FacePipeline {
    fn load(det_path: &Path, rec_path: &Path) -> Result<Self, String> {
        let detector = FaceDetector::new(det_path, None, None, None)
            .map_err(|e| format!("load detector: {e}"))?;
        let recognizer =
            FaceRecognizer::new(rec_path, None).map_err(|e| format!("load recognizer: {e}"))?;
        Ok(Self {
            detector,
            recognizer,
        })
    }

    /// Returns (embedding, face crop) for each detected face.
    fn extract_faces(
        &mut self,
        img_path: &Path,
    ) -> Result<Vec<(Vec<f32>, image::DynamicImage)>, String> {
        let dyn_img = image::open(img_path).map_err(|e| format!("open {}: {e}", img_path.display()))?;
        let rgb = dyn_img.to_rgb8();
        let w = rgb.width();
        let h = rgb.height();

        let faces = self
            .detector
            .detect(&rgb)
            .map_err(|e| format!("detect: {e}"))?;
        if faces.is_empty() {
            return Ok(Vec::new());
        }

        let embeddings = self
            .recognizer
            .extract_embedding(&rgb, &faces)
            .map_err(|e| format!("embed: {e}"))?;

        let mut out = Vec::with_capacity(faces.len());
        for (face, emb) in faces.into_iter().zip(embeddings.into_iter()) {
            let bbox = face.bbox.to_absolute(w, h);
            let x1 = bbox.x1.max(0.0).min(w as f32 - 1.0) as u32;
            let y1 = bbox.y1.max(0.0).min(h as f32 - 1.0) as u32;
            let x2 = bbox.x2.max(0.0).min(w as f32) as u32;
            let y2 = bbox.y2.max(0.0).min(h as f32) as u32;
            let cw = x2.saturating_sub(x1).max(1);
            let ch = y2.saturating_sub(y1).max(1);
            let crop = dyn_img.crop_imm(x1, y1, cw, ch);
            let thumb = crop.resize(128, 128, image::imageops::FilterType::Triangle);
            out.push((emb.to_vec(), thumb));
        }
        Ok(out)
    }

    fn match_any(&mut self, img_path: &Path, templates: &[Vec<f32>]) -> Result<bool, String> {
        if templates.is_empty() {
            return Ok(false);
        }
        let faces = self.extract_faces(img_path)?;
        for (emb, _) in faces {
            for tpl in templates {
                if cosine_similarity(&emb, tpl) >= SIMILARITY_THRESHOLD {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
}

fn model_paths() -> Result<(PathBuf, PathBuf), String> {
    let dir = models_dir()?;
    Ok((dir.join(DET_MODEL_NAME), dir.join(REC_MODEL_NAME)))
}

/// Ensure buffalo_l detection + recognition ONNX models exist under models/.
pub(crate) fn ensure_models() -> Result<(PathBuf, PathBuf), String> {
    let (det, rec) = model_paths()?;
    if det.exists() && rec.exists() {
        return Ok((det, rec));
    }

    let dir = models_dir()?;
    eprintln!("[face] downloading buffalo_l models to {}", dir.display());

    let zip_path = dir.join("buffalo_l.zip");
    download_file(BUFFALO_L_URL, &zip_path)?;
    extract_needed_models(&zip_path, &dir)?;
    let _ = std::fs::remove_file(&zip_path);

    if !det.exists() || !rec.exists() {
        return Err(format!(
            "模型下载后仍缺失: {} / {}",
            det.display(),
            rec.display()
        ));
    }
    Ok((det, rec))
}

fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let response = ureq::get(url)
        .call()
        .map_err(|e| format!("download {url}: {e}"))?;
    let mut reader = response.into_reader();
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read download: {e}"))?;
    std::fs::write(dest, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_needed_models(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip: {e}"))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let file_name = Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if file_name != DET_MODEL_NAME && file_name != REC_MODEL_NAME {
            continue;
        }
        let out_path = dest_dir.join(file_name);
        let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        eprintln!("[face] extracted {}", out_path.display());
    }
    Ok(())
}

fn new_pipeline() -> Result<FacePipeline, String> {
    let (det, rec) = ensure_models()?;
    FacePipeline::load(&det, &rec)
}

#[tauri::command]
pub(crate) async fn ensure_face_models() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        ensure_models()?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn add_face_samples(paths: Vec<String>) -> Result<Vec<FaceSampleDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut pipeline = new_pipeline()?;
        let mut samples = Vec::new();
        for path in paths {
            let faces = pipeline.extract_faces(Path::new(&path))?;
            if faces.is_empty() {
                eprintln!("[face] no face in {path}");
                continue;
            }
            for (emb, thumb) in faces {
                let dto = save_inbox_sample(&emb, &thumb, &path)?;
                samples.push(dto);
            }
        }
        Ok(samples)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub(crate) struct TagFolderResult {
    scanned: usize,
    matched: usize,
    skipped: usize,
}

#[tauri::command]
pub(crate) async fn tag_folder(
    app: AppHandle,
    folder: String,
    tag_ids: Vec<String>,
    force: bool,
) -> Result<TagFolderResult, String> {
    tauri::async_runtime::spawn_blocking(move || tag_folder_sync(app, folder, tag_ids, force))
        .await
        .map_err(|e| e.to_string())?
}

fn tag_folder_sync(
    app: AppHandle,
    folder: String,
    tag_ids: Vec<String>,
    force: bool,
) -> Result<TagFolderResult, String> {
    if tag_ids.is_empty() {
        return Err("请至少选择一个人物标签".into());
    }

    // Preload all template embeddings for selected tags
    let mut templates_by_tag: Vec<(String, Vec<Vec<f32>>)> = Vec::new();
    for tag_id in &tag_ids {
        let embs = load_person_embeddings(tag_id)?;
        if embs.is_empty() {
            return Err(format!("标签 {tag_id} 没有模板样本，请先绑定人脸"));
        }
        templates_by_tag.push((tag_id.clone(), embs));
    }

    let folder_path = PathBuf::from(&folder);
    let image_exts = [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif",
    ];
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(&folder_path).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            if image_exts.contains(&ext.to_lowercase().as_str()) {
                paths.push(p);
            }
        }
    }
    paths.sort();

    let info = load_folder_images_info(&folder_path)?;
    let completed = Arc::new(AtomicUsize::new(0));
    let matched_count = Arc::new(AtomicUsize::new(0));
    let skipped_count = Arc::new(AtomicUsize::new(0));
    let info_lock = Arc::new(Mutex::new(info));

    // Flatten work items: (path, tag_id, templates) — skip already tagged unless force
    let mut work: Vec<(PathBuf, String, Vec<Vec<f32>>)> = Vec::new();
    {
        let info_guard = info_lock.lock().unwrap();
        for path in &paths {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let existing = info_guard.images.get(&name).cloned().unwrap_or_default();
            for (tag_id, embs) in &templates_by_tag {
                if !force && existing.contains(tag_id) {
                    skipped_count.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
                work.push((path.clone(), tag_id.clone(), embs.clone()));
            }
        }
    }

    // Re-structure: process per image once with all tag templates
    // Better approach: group by path
    let mut by_path: std::collections::BTreeMap<PathBuf, Vec<(String, Vec<Vec<f32>>)>> =
        std::collections::BTreeMap::new();
    for (path, tag_id, embs) in work {
        by_path.entry(path).or_default().push((tag_id, embs));
    }
    let jobs: Vec<_> = by_path.into_iter().collect();
    let job_total = jobs.len().max(1);

    let queue = Arc::new(Mutex::new(jobs));
    let workers = MAX_FACE_WORKERS.min(job_total);

    // Ensure models exist before spawning workers
    ensure_models()?;

    let mut handles = Vec::new();
    for worker_id in 0..workers {
        let queue = queue.clone();
        let app = app.clone();
        let info_lock = info_lock.clone();
        let completed = completed.clone();
        let matched_count = matched_count.clone();
        let folder_path = folder_path.clone();
        let job_total = job_total;

        handles.push(std::thread::spawn(move || -> Result<(), String> {
            let mut pipeline = new_pipeline()?;
            loop {
                let job = {
                    let mut q = queue.lock().unwrap();
                    q.pop()
                };
                let Some((path, tag_jobs)) = job else {
                    break;
                };

                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                // Extract faces once per image
                let faces = match pipeline.extract_faces(&path) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("[face] worker-{worker_id} skip {}: {e}", path.display());
                        let cur = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        let _ = app.emit(
                            EVENT_FACE_TAG_PROGRESS,
                            FaceTagProgress {
                                current: cur,
                                total: job_total,
                                matched: matched_count.load(Ordering::Relaxed),
                                path: name,
                            },
                        );
                        continue;
                    }
                };

                let mut hit_tags = Vec::new();
                for (tag_id, templates) in &tag_jobs {
                    let mut hit = false;
                    for (emb, _) in &faces {
                        for tpl in templates {
                            if cosine_similarity(emb, tpl) >= SIMILARITY_THRESHOLD {
                                hit = true;
                                break;
                            }
                        }
                        if hit {
                            break;
                        }
                    }
                    if hit {
                        hit_tags.push(tag_id.clone());
                    }
                }

                if !hit_tags.is_empty() {
                    matched_count.fetch_add(1, Ordering::Relaxed);
                    let mut info = info_lock.lock().unwrap();
                    let entry = info.images.entry(name.clone()).or_default();
                    for tag_id in hit_tags {
                        if !entry.contains(&tag_id) {
                            entry.push(tag_id);
                        }
                    }
                    // Periodic flush every image for crash safety
                    let _ = save_folder_images_info(&folder_path, &info);
                }

                let cur = completed.fetch_add(1, Ordering::Relaxed) + 1;
                let _ = app.emit(
                    EVENT_FACE_TAG_PROGRESS,
                    FaceTagProgress {
                        current: cur,
                        total: job_total,
                        matched: matched_count.load(Ordering::Relaxed),
                        path: name,
                    },
                );
            }
            Ok(())
        }));
    }

    for h in handles {
        h.join()
            .map_err(|_| "face worker panicked".to_string())??;
    }

    // Final save
    {
        let info = info_lock.lock().unwrap();
        save_folder_images_info(&folder_path, &info)?;
    }

    Ok(TagFolderResult {
        scanned: completed.load(Ordering::Relaxed),
        matched: matched_count.load(Ordering::Relaxed),
        skipped: skipped_count.load(Ordering::Relaxed),
    })
}

// Silence unused warning if match_any not used externally
#[allow(dead_code)]
fn _match_any_bridge(
    pipeline: &mut FacePipeline,
    path: &Path,
    templates: &[Vec<f32>],
) -> Result<bool, String> {
    pipeline.match_any(path, templates)
}
