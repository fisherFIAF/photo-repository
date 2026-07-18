use md5::{Digest, Md5};
use std::path::{Path, PathBuf};

const THUMB_MAX_DIM: u32 = 256;

fn get_thumb_cache_dir() -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "linux") {
        let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
        PathBuf::from(home).join(".cache").join("photo-repository").join("thumbs")
    } else {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        exe.parent()
            .ok_or("cannot resolve exe parent")?
            .join("cache")
            .join("thumbs")
    };
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

fn thumb_path_for(src: &Path) -> Result<PathBuf, String> {
    let cache_dir = get_thumb_cache_dir()?;
    let abs = std::fs::canonicalize(src).map_err(|e| e.to_string())?;
    let mut hasher = Md5::new();
    hasher.update(abs.to_string_lossy().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let ext = src.extension().unwrap_or_default().to_string_lossy();
    let name = format!("{}_{}.{}", stem, hash, ext);
    Ok(cache_dir.join(name))
}

fn generate_thumbnail(src: &Path, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }
    let img = image::open(src).map_err(|e| format!("open {}: {}", src.display(), e))?;
    let resized = img.resize(THUMB_MAX_DIM, THUMB_MAX_DIM, image::imageops::FilterType::Triangle);
    resized.save(dest).map_err(|e| format!("save {}: {}", dest.display(), e))?;
    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn list_images(path: String, offset: usize, limit: usize) -> Result<ListImagesResponse, String> {
    let image_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif"];
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
            name: entry_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            thumb_path: tp.to_string_lossy().to_string(),
        });
    }

    Ok(ListImagesResponse { total, items })
}

#[derive(serde::Serialize)]
struct ListImagesResponse {
    total: usize,
    items: Vec<ImageEntry>,
}

#[derive(serde::Serialize)]
struct ImageEntry {
    path: String,
    name: String,
    thumb_path: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, list_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
    fn test_cache_dir_exists() {
        let dir = get_thumb_cache_dir().unwrap();
        assert!(dir.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn test_thumb_path_naming() {
        let tmp = std::env::temp_dir().join("thumb_test_photo.jpg");
        std::fs::write(&tmp, b"fake").unwrap();

        let tp = thumb_path_for(&tmp).unwrap();
        let name = tp.file_name().unwrap().to_string_lossy().to_string();

        assert!(name.starts_with("thumb_test_photo_"));
        assert!(name.ends_with(".jpg"));
        // md5 hex is 32 chars
        let hash_part = name.strip_prefix("thumb_test_photo_").unwrap().strip_suffix(".jpg").unwrap();
        assert_eq!(hash_part.len(), 32);

        std::fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_generate_thumbnail() {
        let tmp_dir = std::env::temp_dir().join("thumb_gen_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let src = tmp_dir.join("source.png");
        let dest = tmp_dir.join("thumb.png");

        // Create a 800x600 test image
        create_test_image(&src, 800, 600);

        generate_thumbnail(&src, &dest).unwrap();
        assert!(dest.exists());

        // Verify dimensions are within THUMB_MAX_DIM
        let thumb = image::open(&dest).unwrap();
        assert!(thumb.width() <= THUMB_MAX_DIM);
        assert!(thumb.height() <= THUMB_MAX_DIM);

        // Second call should be a no-op (cache hit)
        generate_thumbnail(&src, &dest).unwrap();

        std::fs::remove_dir_all(&tmp_dir).ok();
    }

    #[tokio::test]
    async fn test_list_images_pagination() {
        let tmp_dir = std::env::temp_dir().join("list_pagination_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        // Create 5 test images
        for i in 0..5 {
            let path = tmp_dir.join(format!("img_{i}.png"));
            create_test_image(&path, 100, 100);
        }

        let dir = tmp_dir.to_string_lossy().to_string();

        // First page: offset=0, limit=2
        let resp = list_images(dir.clone(), 0, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 2);
        for item in &resp.items {
            assert!(!item.thumb_path.is_empty());
            assert!(Path::new(&item.thumb_path).exists());
        }

        // Second page: offset=2, limit=2
        let resp = list_images(dir.clone(), 2, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 2);

        // Last page: offset=4, limit=2 → only 1 item
        let resp = list_images(dir.clone(), 4, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 1);

        // Beyond end: offset=10, limit=2 → 0 items
        let resp = list_images(dir.clone(), 10, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 0);

        std::fs::remove_dir_all(&tmp_dir).ok();
    }
}
