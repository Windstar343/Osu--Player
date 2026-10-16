use image::{imageops::FilterType, ImageReader};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;
fn make_thumbnail(source: &Path, target: &Path) -> Result<(), String> {
    let mut reader = ImageReader::open(source)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|e| e.to_string())?
        .resize_to_fill(256, 256, FilterType::Triangle)
        .to_rgb8();
    let temporary = target.with_extension(format!("{}.tmp", std::process::id()));
    image
        .save_with_format(&temporary, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    fs::rename(temporary, target).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn artwork_thumbnail(app: tauri::AppHandle, path: PathBuf) -> Result<String, String> {
    let path = path
        .canonicalize()
        .map_err(|_| "Artwork is missing.".to_string())?;
    if !app.asset_protocol_scope().is_allowed(&path) {
        return Err("Artwork is outside the selected libraries.".into());
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("artwork-256-v1");
    let result = tauri::async_runtime::spawn_blocking(move || {
        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
        let key = format!(
            "{}:{}:{:?}",
            path.display(),
            metadata.len(),
            metadata.modified().ok()
        );
        let target = cache.join(format!("{:x}.jpg", Sha256::digest(key.as_bytes())));
        fs::create_dir_all(cache).map_err(|e| e.to_string())?;
        if !target.is_file() {
            make_thumbnail(&path, &target)?;
        }
        Ok::<PathBuf, String>(target)
    })
    .await
    .map_err(|e| e.to_string())??;
    app.asset_protocol_scope()
        .allow_file(&result)
        .map_err(|e| e.to_string())?;
    Ok(result.to_string_lossy().into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn large_hash_named_background_becomes_small_square() {
        let root = std::env::temp_dir().join(format!("osu-thumbnail-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("hash-with-no-extension");
        let target = root.join("thumbnail.jpg");
        image::RgbImage::from_pixel(3000, 2000, image::Rgb([40, 90, 180]))
            .save_with_format(&source, image::ImageFormat::Png)
            .unwrap();
        make_thumbnail(&source, &target).unwrap();
        let thumb = ImageReader::open(&target).unwrap().decode().unwrap();
        assert_eq!((thumb.width(), thumb.height()), (256, 256));
        assert!(fs::metadata(&target).unwrap().len() < 40000);
        fs::remove_dir_all(root).unwrap();
    }
}
