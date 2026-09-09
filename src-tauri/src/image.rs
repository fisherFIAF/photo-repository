use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use tauri::{AppHandle, Emitter};

use crate::thumbnail::{generate_thumbnail, thumb_path_for};

const EVENT_THUMB_PROGRESS: &str = "thumb-progress";
const MAX_CONCURRENT: usize = 10;

type ThumbTask = (PathBuf, PathBuf);

#[derive(Clone, serde::Serialize)]
struct ThumbProgress {
    index: usize,
    current: usize,
    total: usize,
}

#[derive(serde::Serialize)]
pub(crate) struct ListImagesResponse {
    total: usize,
    items: Vec<ImageEntry>,
}

#[derive(serde::Serialize)]
pub(crate) struct ImageEntry {
    path: String,
    name: String,
    thumb_path: String,
    thumb_ready: bool,
}

fn scan_image_files(dir_path: &Path) -> Result<Vec<PathBuf>, String> {
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
    paths.sort_by(|a, b| {
        let a_name = a.file_name().map(|n| n.to_string_lossy().to_lowercase());
        let b_name = b.file_name().map(|n| n.to_string_lossy().to_lowercase());
        a_name.cmp(&b_name)
    });
    Ok(paths)
}

fn build_entries(
    all_paths: &[PathBuf],
    offset: usize,
    limit: usize,
) -> Result<(Vec<ImageEntry>, Vec<ThumbTask>), String> {
    let page = all_paths.iter().skip(offset).take(limit);
    let mut items = Vec::new();
    let mut thumb_tasks: Vec<ThumbTask> = Vec::new();
    for entry_path in page {
        let tp = thumb_path_for(entry_path)?;
        let ready = tp.exists();
        if !ready {
            thumb_tasks.push((entry_path.clone(), tp.clone()));
        }
        items.push(ImageEntry {
            path: entry_path.to_string_lossy().to_string(),
            name: entry_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            thumb_path: tp.to_string_lossy().to_string(),
            thumb_ready: ready,
        });
    }
    Ok((items, thumb_tasks))
}

#[tauri::command]
pub(crate) async fn list_images(
    app: AppHandle,
    path: String,
    offset: usize,
    limit: usize,
) -> Result<ListImagesResponse, String> {
    eprintln!("[list_images] start: path={}, offset={}, limit={}", path, offset, limit);
    let dir_path = Path::new(&path);
    let all_paths = scan_image_files(dir_path)?;
    let total = all_paths.len();
    eprintln!("[list_images] scanned {} image files", total);
    let (items, thumb_tasks) = build_entries(&all_paths, offset, limit)?;
    eprintln!("[list_images] built {} entries, {} thumb tasks", items.len(), thumb_tasks.len());

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let total = thumb_tasks.len();
        eprintln!("[thumb] spawning {} worker threads", MAX_CONCURRENT.min(total));
        let queue = Arc::new(Mutex::new(
            thumb_tasks
                .into_iter()
                .enumerate()
                .collect::<Vec<_>>(),
        ));
        let cv = Arc::new(Condvar::new());
        let completed = Arc::new(AtomicUsize::new(0));

        for worker_id in 0..MAX_CONCURRENT.min(total) {
            let queue = queue.clone();
            let cv = cv.clone();
            let app = app_clone.clone();
            let completed = completed.clone();
            std::thread::spawn(move || {
                eprintln!("[thumb] worker-{} started", worker_id);
                loop {
                    let task = {
                        let mut guard = queue.lock().unwrap();
                        if guard.is_empty() {
                            cv.notify_one();
                            return;
                        }
                        guard.pop()
                    };
                    let Some((i, (src, dest))) = task else {
                        return;
                    };
                    eprintln!("[thumb] worker-{} processing task {}: {}", worker_id, i, src.display());
                    if generate_thumbnail(&src, &dest).is_ok() {
                        let current = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        eprintln!("[thumb] task {} done ({}/{})", i, current, total);
                        let _ = app.emit(
                            EVENT_THUMB_PROGRESS,
                            ThumbProgress {
                                index: i,
                                current,
                                total,
                            },
                        );
                    } else {
                        eprintln!("[thumb] task {} generate_thumbnail FAILED", i);
                    }
                }
            });
        }
        eprintln!("[thumb] all workers spawned");
    });

    eprintln!("[list_images] returning response with {} items", items.len());
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

        assert_eq!(names, vec!["a.png", "b.jpg", "d.gif"]);

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

    #[test]
    fn test_build_entries_thumb_ready_reflects_cache() {
        use crate::thumbnail::generate_thumbnail;

        let dir = std::env::var("TEST_DIR").expect("需要设置 TEST_DIR 环境变量，如: TEST_DIR=/home/fisher/Pictures cargo test");
        let dir = PathBuf::from(dir);
        let all_paths = scan_image_files(&dir).expect("扫描目录失败");
        assert!(!all_paths.is_empty(), "目录中未找到图片: {}", dir.display());
        eprintln!("[test] 目录: {} ({} 张图片)", dir.display(), all_paths.len());

        // 清理缓存，从"无缓存"状态开始
        for p in &all_paths {
            if let Ok(tp) = crate::thumbnail::thumb_path_for(p) {
                std::fs::remove_file(&tp).ok();
            }
        }

        // 阶段 1：无缓存 → 全部 false
        let (items, tasks) = build_entries(&all_paths, 0, 100).unwrap();
        assert_eq!(tasks.len(), all_paths.len());
        for item in &items {
            assert!(!item.thumb_ready, "无缓存应为 false: {}", item.name);
        }
        eprintln!("[test] 阶段 1 通过: 无缓存, {} 个任务", tasks.len());

        // 阶段 2：生成全部缩略图后再查 → 全部 true，0 个任务
        for (src, dest) in &tasks {
            generate_thumbnail(src, dest).unwrap();
        }
        let (items, tasks) = build_entries(&all_paths, 0, 100).unwrap();
        assert_eq!(tasks.len(), 0, "全部缓存后不应有任务");
        for item in &items {
            assert!(item.thumb_ready, "有缓存应为 true: {}", item.name);
            assert!(Path::new(&item.thumb_path).exists(), "文件应存在: {}", item.thumb_path);
        }
        eprintln!("[test] 阶段 2 通过: 全部缓存, 0 个任务");
    }
}
