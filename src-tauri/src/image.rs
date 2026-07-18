use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter};

use crate::thumbnail::{generate_thumbnail, thumb_path_for};

const EVENT_THUMB_PROGRESS: &str = "thumb-progress";

type ThumbTask = (PathBuf, PathBuf);

#[derive(Clone, serde::Serialize)]
pub struct ThumbProgress {
    pub current: usize,
    pub total: usize,
}

#[derive(serde::Serialize)]
pub struct ListImagesResponse {
    pub total: usize,
    pub items: Vec<ImageEntry>,
}

#[derive(serde::Serialize)]
pub struct ImageEntry {
    pub path: String,
    pub name: String,
    pub thumb_path: String,
    pub thumb_ready: bool,
}

pub(crate) fn scan_image_files(dir_path: &Path) -> Result<Vec<PathBuf>, String> {
    let image_extensions = [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif",
    ];
    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if image_extensions.contains(&ext.to_lowercase().as_str()) {
                    paths.push(entry_path);
                }
            }
        }
    }
    Ok(paths)
}

pub(crate) fn build_entries(
    all_paths: &[PathBuf],
    offset: usize,
    limit: usize,
) -> Result<(Vec<ImageEntry>, Vec<ThumbTask>), String> {
    let page = all_paths.iter().skip(offset).take(limit);
    let mut items = Vec::new();
    let mut thumb_tasks: Vec<ThumbTask> = Vec::new();
    for entry_path in page {
        let tp = thumb_path_for(entry_path)?;
        thumb_tasks.push((entry_path.clone(), tp.clone()));
        items.push(ImageEntry {
            path: entry_path.to_string_lossy().to_string(),
            name: entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            thumb_path: tp.to_string_lossy().to_string(),
            thumb_ready: false,
        });
    }
    Ok((items, thumb_tasks))
}

#[tauri::command]
pub async fn list_images(
    app: AppHandle,
    path: String,
    offset: usize,
    limit: usize,
) -> Result<ListImagesResponse, String> {
    let dir_path = Path::new(&path);
    let all_paths = scan_image_files(dir_path)?;
    let total = all_paths.len();
    let (items, thumb_tasks) = build_entries(&all_paths, offset, limit)?;

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let total = thumb_tasks.len();
        for (i, (src, dest)) in thumb_tasks.into_iter().enumerate() {
            if generate_thumbnail(&src, &dest).is_ok() {
                let _ = app_clone.emit(
                    EVENT_THUMB_PROGRESS,
                    ThumbProgress {
                        current: i + 1,
                        total,
                    },
                );
            }
        }
    });

    Ok(ListImagesResponse { total, items })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn create_test_image(path: &Path, width: u32, height: u32) {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(width, height, |_, _| Rgba([255, 0, 0, 255]));
        img.save(path).unwrap();
    }

    #[test]
    fn test_scan_image_files() {
        let tmp_dir = std::env::temp_dir().join("scan_image_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        for name in &["a.png", "b.jpg", "c.txt", "d.gif"] {
            std::fs::write(tmp_dir.join(name), b"fake").unwrap();
        }

        let paths = scan_image_files(&tmp_dir).unwrap();
        let names: Vec<String> = paths
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert_eq!(names.len(), 3);
        assert!(names.contains(&"a.png".to_string()));
        assert!(names.contains(&"b.jpg".to_string()));
        assert!(names.contains(&"d.gif".to_string()));
        assert!(!names.contains(&"c.txt".to_string()));

        std::fs::remove_dir_all(&tmp_dir).ok();
    }

    #[test]
    fn test_build_entries_pagination() {
        let tmp_dir = std::env::temp_dir().join("build_entries_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let mut all_paths = Vec::new();
        for i in 0..5 {
            let path = tmp_dir.join(format!("img_{i}.png"));
            create_test_image(&path, 100, 100);
            all_paths.push(path);
        }

        let (items, tasks) = build_entries(&all_paths, 0, 2).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(tasks.len(), 2);
        assert!(!items[0].thumb_ready);

        let (items, _) = build_entries(&all_paths, 4, 2).unwrap();
        assert_eq!(items.len(), 1);

        let (items, _) = build_entries(&all_paths, 10, 2).unwrap();
        assert_eq!(items.len(), 0);

        std::fs::remove_dir_all(&tmp_dir).ok();
    }
}
