use md5::{Digest, Md5};
use std::path::{Path, PathBuf};

const THUMB_MAX_DIM: u32 = 256;

pub(crate) fn get_thumb_cache_dir() -> Result<PathBuf, String> {
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

pub(crate) fn thumb_path_for(src: &Path) -> Result<PathBuf, String> {
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

pub(crate) fn generate_thumbnail(src: &Path, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }
    let img = image::open(src).map_err(|e| format!("open {}: {}", src.display(), e))?;
    let resized = img.resize(THUMB_MAX_DIM, THUMB_MAX_DIM, image::imageops::FilterType::Triangle);
    resized.save(dest).map_err(|e| format!("save {}: {}", dest.display(), e))?;
    Ok(())
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

        create_test_image(&src, 800, 600);

        generate_thumbnail(&src, &dest).unwrap();
        assert!(dest.exists());

        let thumb = image::open(&dest).unwrap();
        assert!(thumb.width() <= THUMB_MAX_DIM);
        assert!(thumb.height() <= THUMB_MAX_DIM);

        generate_thumbnail(&src, &dest).unwrap();

        std::fs::remove_dir_all(&tmp_dir).ok();
    }
}
