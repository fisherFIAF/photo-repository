mod image;
mod thumbnail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![image::list_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use ::image::{ImageBuffer, Rgba};

    fn create_test_image(path: &Path, width: u32, height: u32) {
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_fn(width, height, |_, _| Rgba([255, 0, 0, 255]));
        img.save(path).unwrap();
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
        let resp = image::list_images(dir.clone(), 0, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 2);
        for item in &resp.items {
            assert!(!item.thumb_path.is_empty());
            assert!(Path::new(&item.thumb_path).exists());
        }

        // Second page: offset=2, limit=2
        let resp = image::list_images(dir.clone(), 2, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 2);

        // Last page: offset=4, limit=2 → only 1 item
        let resp = image::list_images(dir.clone(), 4, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 1);

        // Beyond end: offset=10, limit=2 → 0 items
        let resp = image::list_images(dir.clone(), 10, 2).await.unwrap();
        assert_eq!(resp.total, 5);
        assert_eq!(resp.items.len(), 0);

        std::fs::remove_dir_all(&tmp_dir).ok();
    }
}
