// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn list_images(path: String) -> Result<Vec<ImageEntry>, String> {
    use std::path::Path;
    let image_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif"];
    let dir_path = Path::new(&path);
    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut images: Vec<ImageEntry> = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if image_extensions.contains(&ext.to_lowercase().as_str()) {
                    images.push(ImageEntry {
                        path: entry_path.to_string_lossy().to_string(),
                        name: entry_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    Ok(images)
}

#[derive(serde::Serialize)]
struct ImageEntry {
    path: String,
    name: String,
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
