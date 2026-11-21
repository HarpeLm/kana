//! Pièces jointes de la zone de saisie : aperçu des images choisies ou déposées.

use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD};

static CLIPBOARD_SEQ: AtomicU64 = AtomicU64::new(1);

/// Au-delà, on n'affiche pas d'aperçu : l'image est envoyée à l'agent, mais pas montrée.
const MAX_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

pub(crate) fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Au-delà, on n'essaie même pas de lire l'image pour la réduire.
const MAX_THUMBNAIL_SOURCE_BYTES: u64 = 120 * 1024 * 1024;
/// Côté maximal d'une miniature réduite.
const THUMBNAIL_SIDE: u32 = 320;

/// Une image lourde réduite en miniature (JPEG), pour l'afficher sans envoyer des dizaines de Mo à l'interface.
fn thumbnail(path: &Path) -> Option<String> {
    use image::ImageReader;
    let mut reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
    // Une image aux dimensions démesurées est refusée plutôt que décodée en mémoire.
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(512 * 1024 * 1024);
    reader.limits(limits);
    let small = reader.decode().ok()?.thumbnail(THUMBNAIL_SIDE, THUMBNAIL_SIDE).to_rgb8();
    let mut out = std::io::Cursor::new(Vec::new());
    small.write_to(&mut out, image::ImageFormat::Jpeg).ok()?;
    Some(format!("data:image/jpeg;base64,{}", STANDARD.encode(out.into_inner())))
}

fn preview(path: &Path) -> Option<String> {
    let mime = image_mime(path)?;
    let size = fs::metadata(path).ok()?.len();
    if size > MAX_PREVIEW_BYTES {
        return if size <= MAX_THUMBNAIL_SOURCE_BYTES { thumbnail(path) } else { None };
    }
    let bytes = fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

/// L'image sous forme d'adresse `data:` pour l'afficher : telle quelle jusqu'à 10 Mo, sinon réduite en miniature.
/// `None` si ce n'est pas une image connue, ou si elle est illisible ou démesurée.
#[tauri::command]
pub async fn image_preview(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || preview(Path::new(&path))).await.ok()?
}

fn clipboard_ext(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn write_clipboard_image(mime: &str, data: &str) -> Result<String, String> {
    let ext = clipboard_ext(mime).ok_or_else(|| "format d'image non pris en charge".to_string())?;
    let bytes = STANDARD.decode(data.trim()).map_err(|_| "image illisible".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_PREVIEW_BYTES as usize {
        return Err("taille d'image non prise en charge".into());
    }
    let dir = std::env::temp_dir().join("kana-clipboard");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis());
    let seq = CLIPBOARD_SEQ.fetch_add(1, Ordering::Relaxed);
    let path = dir.join(format!("collage-{now}-{seq}.{ext}"));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Enregistre une image collée depuis le presse-papiers dans un fichier temporaire, pour la joindre au message.
#[tauri::command]
pub async fn save_clipboard_image(mime: String, data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || write_clipboard_image(&mime, &data))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_images_only() {
        let dir = std::env::temp_dir().join("kana-preview-test");
        fs::create_dir_all(&dir).unwrap();
        let png = dir.join("a.PNG");
        let text = dir.join("a.txt");
        fs::write(&png, [1u8, 2, 3]).unwrap();
        fs::write(&text, "x").unwrap();
        assert_eq!(preview(&png), Some("data:image/png;base64,AQID".into()));
        assert_eq!(preview(&text), None);
        assert_eq!(preview(Path::new("/nonexistent/x.png")), None);
    }

    #[test]
    fn heavy_images_are_shrunk_to_a_thumbnail() {
        let dir = std::env::temp_dir().join("kana-thumb-test");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("big.png");
        image::RgbImage::from_fn(1200, 900, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 7])).save(&file).unwrap();
        let url = thumbnail(&file).expect("miniature");
        assert!(url.starts_with("data:image/jpeg;base64,"));
        assert!(url.len() < 60_000);
        assert_eq!(thumbnail(&dir.join("absent.png")), None);
    }

    #[test]
    fn saves_clipboard_images_and_rejects_invalid_data() {
        let path = write_clipboard_image("image/png", "AQID").expect("png valide");
        assert!(path.ends_with(".png"));
        assert_eq!(fs::read(&path).unwrap(), vec![1u8, 2, 3]);
        let _ = fs::remove_file(path);

        assert!(write_clipboard_image("text/plain", "AQID").is_err());
        assert!(write_clipboard_image("image/png", "!!!").is_err());
        assert!(write_clipboard_image("image/png", "").is_err());
    }
}
