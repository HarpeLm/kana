//! Pièces jointes de la zone de saisie : aperçu des images choisies ou déposées.

use std::{fs, path::Path};

use base64::{Engine, engine::general_purpose::STANDARD};

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

/// L'image sous forme d'adresse `data:` pour l'afficher, ou `None` si ce n'est pas une image
/// connue ou si elle est trop lourde.
#[tauri::command]
pub fn image_preview(path: String) -> Option<String> {
    let path = Path::new(&path);
    let mime = image_mime(path)?;
    if fs::metadata(path).ok()?.len() > MAX_PREVIEW_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
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
        assert_eq!(image_preview(png.to_string_lossy().into()), Some("data:image/png;base64,AQID".into()));
        assert_eq!(image_preview(text.to_string_lossy().into()), None);
        assert_eq!(image_preview("/nonexistent/x.png".into()), None);
    }
}
