use std::path::{Path, PathBuf};

use crate::thumbnail::{generate_thumbnail, thumb_path_for};

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
}

#[tauri::command]
pub async fn list_images(
    path: String,
    offset: usize,
    limit: usize,
) -> Result<ListImagesResponse, String> {
    let image_extensions = [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif",
    ];
    let dir_path = Path::new(&path);
    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    let mut all_paths: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if image_extensions.contains(&ext.to_lowercase().as_str()) {
                    all_paths.push(entry_path);
                }
            }
        }
    }

    let total = all_paths.len();
    let page = all_paths.into_iter().skip(offset).take(limit);

    let mut items: Vec<ImageEntry> = Vec::new();
    for entry_path in page {
        let tp = thumb_path_for(&entry_path)?;
        generate_thumbnail(&entry_path, &tp)?;
        items.push(ImageEntry {
            path: entry_path.to_string_lossy().to_string(),
            name: entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            thumb_path: tp.to_string_lossy().to_string(),
        });
    }

    Ok(ListImagesResponse { total, items })
}
