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

    #[test]
    fn test_list_images_pagination() {
        let tmp_dir = std::env::temp_dir().join("list_pagination_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let mut all_paths = Vec::new();
        for i in 0..5 {
            let path = tmp_dir.join(format!("img_{i}.png"));
            create_test_image(&path, 100, 100);
            all_paths.push(path);
        }

        // First page: offset=0, limit=2
        let (items, tasks) = image::build_entries(&all_paths, 0, 2).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(tasks.len(), 2);
        for item in &items {
            assert!(!item.thumb_ready);
            assert!(!item.thumb_path.is_empty());
        }

        // Second page: offset=2, limit=2
        let (items, _) = image::build_entries(&all_paths, 2, 2).unwrap();
        assert_eq!(items.len(), 2);

        // Last page: offset=4, limit=2 → only 1 item
        let (items, _) = image::build_entries(&all_paths, 4, 2).unwrap();
        assert_eq!(items.len(), 1);

        // Beyond end: offset=10, limit=2 → 0 items
        let (items, _) = image::build_entries(&all_paths, 10, 2).unwrap();
        assert_eq!(items.len(), 0);

        std::fs::remove_dir_all(&tmp_dir).ok();
    }
}
