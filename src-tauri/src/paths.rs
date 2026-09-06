use std::path::PathBuf;

/// App cache root: `~/.cache/photo-repository` on Linux, else next to the exe.
pub(crate) fn app_cache_root() -> Result<PathBuf, String> {
    let base = if cfg!(target_os = "linux") {
        let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
        PathBuf::from(home).join(".cache").join("photo-repository")
    } else {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        exe.parent()
            .ok_or("cannot resolve exe parent")?
            .join("cache")
    };
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

pub(crate) fn models_dir() -> Result<PathBuf, String> {
    let dir = app_cache_root()?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn faces_dir() -> Result<PathBuf, String> {
    let dir = app_cache_root()?.join("faces");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn people_dir() -> Result<PathBuf, String> {
    let dir = faces_dir()?.join("people");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn inbox_dir() -> Result<PathBuf, String> {
    let dir = faces_dir()?.join("inbox");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn tags_json_path() -> Result<PathBuf, String> {
    Ok(faces_dir()?.join("tags.json"))
}

pub(crate) fn person_dir(person_id: &str) -> Result<PathBuf, String> {
    let dir = people_dir()?.join(person_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn person_samples_dir(person_id: &str) -> Result<PathBuf, String> {
    let dir = person_dir(person_id)?.join("samples");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
