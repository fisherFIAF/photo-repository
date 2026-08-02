use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use md5::{Digest, Md5};

#[derive(Clone, serde::Serialize)]
pub(crate) struct FileEntry {
    name: String,
    path: String,
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct CompareResult {
    left_only: Vec<FileEntry>,
    right_only: Vec<FileEntry>,
    same: Vec<FileEntry>,
    different: Vec<FileEntry>,
}

const MEDIA_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff", "tif",
    "mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp",
];

fn scan_media_files(dir_path: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                if MEDIA_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                    paths.push(entry_path);
                }
            }
        }
    }
    Ok(paths)
}

fn compute_md5(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Md5::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub(crate) fn compare_dirs(left: String, right: String) -> Result<CompareResult, String> {
    let left_paths = scan_media_files(Path::new(&left))?;
    let right_paths = scan_media_files(Path::new(&right))?;

    let left_map: HashMap<String, PathBuf> = left_paths
        .into_iter()
        .map(|p| {
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            (name, p)
        })
        .collect();

    let right_map: HashMap<String, PathBuf> = right_paths
        .into_iter()
        .map(|p| {
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            (name, p)
        })
        .collect();

    let mut left_only = Vec::new();
    let mut right_only = Vec::new();
    let mut same = Vec::new();
    let mut different = Vec::new();

    for (name, path) in &left_map {
        if let Some(right_path) = right_map.get(name) {
            let left_md5 = compute_md5(path).unwrap_or_default();
            let right_md5 = compute_md5(right_path).unwrap_or_default();
            let entry = FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
            };
            if left_md5 == right_md5 {
                same.push(entry);
            } else {
                different.push(entry);
            }
        } else {
            left_only.push(FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    for (name, path) in &right_map {
        if !left_map.contains_key(name) {
            right_only.push(FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    left_only.sort_by(|a, b| a.name.cmp(&b.name));
    right_only.sort_by(|a, b| a.name.cmp(&b.name));
    same.sort_by(|a, b| a.name.cmp(&b.name));
    different.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(CompareResult {
        left_only,
        right_only,
        same,
        different,
    })
}

#[tauri::command]
pub(crate) fn copy_file(src: String, dest_dir: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let file_name = src_path
        .file_name()
        .ok_or_else(|| "invalid source path".to_string())?;
    let dest_path = Path::new(&dest_dir).join(file_name);
    std::fs::copy(src_path, &dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_media_files() {
        let tmp_dir = std::env::temp_dir().join("compare_scan_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();

        for name in &["a.png", "b.mp4", "c.txt", "d.mkv", "e.log"] {
            std::fs::write(tmp_dir.join(name), b"fake").unwrap();
        }

        let paths = scan_media_files(&tmp_dir).unwrap();
        let names: Vec<String> = paths
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert_eq!(names.len(), 3);
        assert!(names.contains(&"a.png".to_string()));
        assert!(names.contains(&"b.mp4".to_string()));
        assert!(names.contains(&"d.mkv".to_string()));
        assert!(!names.contains(&"c.txt".to_string()));
        assert!(!names.contains(&"e.log".to_string()));

        std::fs::remove_dir_all(&tmp_dir).ok();
    }

    #[test]
    fn test_compare_dirs() {
        let left_dir = std::env::temp_dir().join("compare_left_test");
        let right_dir = std::env::temp_dir().join("compare_right_test");
        std::fs::create_dir_all(&left_dir).unwrap();
        std::fs::create_dir_all(&right_dir).unwrap();

        // Same file in both
        std::fs::write(left_dir.join("same.png"), b"identical").unwrap();
        std::fs::write(right_dir.join("same.png"), b"identical").unwrap();

        // Different MD5
        std::fs::write(left_dir.join("diff.png"), b"left_content").unwrap();
        std::fs::write(right_dir.join("diff.png"), b"right_content").unwrap();

        // Left only
        std::fs::write(left_dir.join("left_only.jpg"), b"left").unwrap();

        // Right only
        std::fs::write(right_dir.join("right_only.mp4"), b"right").unwrap();

        // Non-media file (should be ignored)
        std::fs::write(left_dir.join("readme.txt"), b"ignore").unwrap();

        let result = compare_dirs(
            left_dir.to_string_lossy().to_string(),
            right_dir.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result.same.len(), 1);
        assert_eq!(result.same[0].name, "same.png");

        assert_eq!(result.different.len(), 1);
        assert_eq!(result.different[0].name, "diff.png");

        assert_eq!(result.left_only.len(), 1);
        assert_eq!(result.left_only[0].name, "left_only.jpg");

        assert_eq!(result.right_only.len(), 1);
        assert_eq!(result.right_only[0].name, "right_only.mp4");

        std::fs::remove_dir_all(&left_dir).ok();
        std::fs::remove_dir_all(&right_dir).ok();
    }
}
