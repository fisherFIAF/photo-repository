mod compare;
mod face;
mod image;
mod paths;
mod tags;
mod thumbnail;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            image::list_images,
            compare::compare_dirs,
            compare::copy_file,
            tags::list_person_tags,
            tags::create_person_tag,
            tags::attach_samples_to_tag,
            tags::list_inbox_face_samples,
            tags::list_tag_samples,
            tags::read_folder_tags,
            tags::delete_person_tag,
            tags::delete_inbox_samples,
            tags::delete_tag_samples,
            face::ensure_face_models,
            face::add_face_samples,
            face::tag_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
