//! Commandes Tauri pour la dictée vocale (capacités, transcription Whisper locale et dictée native macOS).

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

static VOICE_SEQ: AtomicU64 = AtomicU64::new(1);

const WHISPER_MISSING_MSG: &str =
    "Whisper local introuvable. Installe whisper-cpp (brew install whisper-cpp) ou utilise la dictée native macOS.";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapabilities {
    pub whisper_available: bool,
    pub whisper_binary: Option<String>,
    pub macos_dictation_supported: bool,
    pub preferred_engine: String,
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            return (meta.permissions().mode() & 0o111) != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn find_in_path(binary: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if is_executable_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Détecte un binaire Whisper local (`whisper-cli`, `whisper-cpp`, `whisper`) dans `PATH`
/// ainsi que dans les emplacements Homebrew standards.
pub fn detect_whisper_binary() -> Option<String> {
    for name in ["whisper-cli", "whisper-cpp", "whisper"] {
        if let Some(found) = find_in_path(name) {
            return Some(found.to_string_lossy().into_owned());
        }
    }
    for fixed in ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"] {
        let path = Path::new(fixed);
        if is_executable_file(path) {
            return Some(fixed.to_string());
        }
    }
    None
}

fn detect_ffmpeg_binary() -> Option<String> {
    if let Some(found) = find_in_path("ffmpeg") {
        return Some(found.to_string_lossy().into_owned());
    }
    for fixed in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"] {
        let path = Path::new(fixed);
        if is_executable_file(path) {
            return Some(fixed.to_string());
        }
    }
    None
}

/// Nettoie les horodatages `[00:00:00.000 --> 00:00:03.200]` produits par `whisper-cli`
/// et normalise les espaces.
pub fn clean_whisper_transcript(raw: &str) -> String {
    let mut cleaned = String::with_capacity(raw.len());
    let mut rest = raw;

    while let Some(open_idx) = rest.find('[') {
        cleaned.push_str(&rest[..open_idx]);
        let after_open = &rest[open_idx + 1..];
        if let Some(close_idx) = after_open.find(']') {
            let inside = &after_open[..close_idx];
            if inside.contains("-->") {
                cleaned.push(' ');
            } else {
                cleaned.push('[');
                cleaned.push_str(inside);
                cleaned.push(']');
            }
            rest = &after_open[close_idx + 1..];
        } else {
            cleaned.push_str(&rest[open_idx..]);
            rest = "";
            break;
        }
    }
    cleaned.push_str(rest);

    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Déduit l'extension de fichier audio à partir d'un type MIME (paramètres éventuels ignorés).
pub fn audio_extension_for_mime(mime_type: &str) -> &'static str {
    let base = mime_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match base.as_str() {
        "audio/wav" | "audio/x-wav" | "audio/wave" => "wav",
        "audio/webm" => "webm",
        "audio/ogg" | "audio/opus" => "ogg",
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" | "audio/aac" => "m4a",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/flac" => "flac",
        _ => "webm",
    }
}

fn normalize_lang(lang: Option<&str>) -> String {
    let raw = lang.unwrap_or("fr").trim();
    if raw.is_empty() {
        return "fr".to_string();
    }
    raw.split(['-', '_'])
        .next()
        .unwrap_or("fr")
        .to_ascii_lowercase()
}

fn resolve_whisper_model() -> Option<PathBuf> {
    if let Ok(env_path) = std::env::var("KANA_WHISPER_MODEL") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let models_dir = home.join(".kana").join("models");
    for filename in ["ggml-base.bin", "ggml-small.bin", "ggml-tiny.bin"] {
        let candidate = models_dir.join(filename);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

struct TempCleanup(Vec<PathBuf>);

impl Drop for TempCleanup {
    fn drop(&mut self) {
        for path in &self.0 {
            if path.is_dir() {
                let _ = fs::remove_dir_all(path);
            } else {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn transcribe_audio_whisper_sync(
    audio_base64: &str,
    mime_type: &str,
    lang: Option<&str>,
) -> Result<String, String> {
    let payload = audio_base64
        .trim()
        .split_once(";base64,")
        .map(|(_, b64)| b64)
        .unwrap_or_else(|| audio_base64.trim());

    if payload.is_empty() {
        return Err("Audio vide : aucun échantillon à transcrire.".to_string());
    }

    let bytes = STANDARD
        .decode(payload)
        .map_err(|_| "Audio base64 invalide.".to_string())?;
    if bytes.is_empty() {
        return Err("Audio vide : aucun échantillon à transcrire.".to_string());
    }

    let whisper_bin = detect_whisper_binary().ok_or_else(|| WHISPER_MISSING_MSG.to_string())?;

    let ext = audio_extension_for_mime(mime_type);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let seq = VOICE_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp_dir = std::env::temp_dir();
    let input_path = tmp_dir.join(format!("kana-voice-{now}-{seq}.{ext}"));

    fs::write(&input_path, &bytes)
        .map_err(|e| format!("Impossible d'écrire le fichier audio temporaire : {e}"))?;

    let mut cleanup = TempCleanup(vec![input_path.clone()]);
    let lang_code = normalize_lang(lang);
    let bin_name = Path::new(&whisper_bin)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    if bin_name == "whisper-cli" || bin_name == "whisper-cpp" {
        let model = resolve_whisper_model().ok_or_else(|| {
            "Modèle Whisper introuvable. Place ggml-base.bin dans ~/.kana/models/ ou définis KANA_WHISPER_MODEL."
                .to_string()
        })?;

        let wav_path = if ext == "wav" {
            input_path.clone()
        } else {
            let ffmpeg = detect_ffmpeg_binary().ok_or_else(|| {
                "ffmpeg est requis pour convertir l'audio en WAV 16 kHz pour whisper-cpp.".to_string()
            })?;
            let converted = tmp_dir.join(format!("kana-voice-{now}-{seq}.wav"));
            cleanup.0.push(converted.clone());
            let status = Command::new(ffmpeg)
                .args(["-y", "-i"])
                .arg(&input_path)
                .args(["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"])
                .arg(&converted)
                .output()
                .map_err(|e| format!("Erreur lors de la conversion ffmpeg : {e}"))?;
            if !status.status.success() {
                let stderr = String::from_utf8_lossy(&status.stderr);
                return Err(format!("Conversion audio ffmpeg échouée : {}", stderr.trim()));
            }
            converted
        };

        let output = Command::new(&whisper_bin)
            .arg("-m")
            .arg(&model)
            .arg("-l")
            .arg(&lang_code)
            .arg("-nt")
            .arg("-f")
            .arg(&wav_path)
            .output()
            .map_err(|e| format!("Impossible d'exécuter {bin_name} : {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Transcription Whisper échouée : {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        return Ok(clean_whisper_transcript(&stdout));
    }

    // CLI Python `whisper`
    let out_dir = tmp_dir.join(format!("kana-whisper-out-{now}-{seq}"));
    fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Impossible de créer le dossier de sortie Whisper : {e}"))?;
    cleanup.0.push(out_dir.clone());

    let output = Command::new(&whisper_bin)
        .arg(&input_path)
        .args(["--language", &lang_code, "--output_format", "txt", "--output_dir"])
        .arg(&out_dir)
        .output()
        .map_err(|e| format!("Impossible d'exécuter whisper : {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Transcription Whisper échouée : {}", stderr.trim()));
    }

    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let txt_path = out_dir.join(format!("{stem}.txt"));
    let raw_txt = fs::read_to_string(&txt_path)
        .map_err(|e| format!("Impossible de lire la transcription Whisper : {e}"))?;
    Ok(clean_whisper_transcript(&raw_txt))
}

#[tauri::command]
pub fn voice_capabilities() -> VoiceCapabilities {
    let whisper_binary = detect_whisper_binary();
    let whisper_available = whisper_binary.is_some();
    let macos_dictation_supported = cfg!(target_os = "macos");
    let preferred_engine = if whisper_available {
        "whisper".to_string()
    } else if macos_dictation_supported {
        "macos-dictation".to_string()
    } else {
        "web-speech".to_string()
    };

    VoiceCapabilities {
        whisper_available,
        whisper_binary,
        macos_dictation_supported,
        preferred_engine,
    }
}

#[tauri::command]
pub async fn transcribe_audio_whisper(
    audio_base64: String,
    mime_type: String,
    lang: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_audio_whisper_sync(&audio_base64, &mime_type, lang.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn trigger_macos_dictation() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Déclenchement best-effort via AppleScript (menu Édition -> Démarrer la dictée).
        let script = r#"
            try
                tell application "System Events"
                    tell (first process whose frontmost is true)
                        tell menu bar 1
                            tell menu bar item 4
                                tell menu 1
                                    repeat with itemName in {"Démarrer la dictée…", "Start Dictation…", "Démarrer la dictée", "Start Dictation"}
                                        if exists menu item itemName then
                                            click menu item itemName
                                            exit repeat
                                        end if
                                    end repeat
                                end tell
                            end tell
                        end tell
                    end tell
                end tell
            end try
        "#;
        let _ = Command::new("osascript").args(["-e", script]).spawn();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_whisper_timestamps_and_whitespace() {
        let raw = "[00:00:00.000 --> 00:00:03.200]   Bonjour   Kana \n[00:00:03.200 --> 00:00:05.800]\tpeux-tu   lancer les tests ?  ";
        assert_eq!(
            clean_whisper_transcript(raw),
            "Bonjour Kana peux-tu lancer les tests ?"
        );

        let with_brackets = "[00:00:00.000 --> 00:00:01.000] Corrige [TODO] dans main.rs";
        assert_eq!(
            clean_whisper_transcript(with_brackets),
            "Corrige [TODO] dans main.rs"
        );
    }

    #[test]
    fn resolves_audio_extension_from_mime_type() {
        assert_eq!(audio_extension_for_mime("audio/webm;codecs=opus"), "webm");
        assert_eq!(audio_extension_for_mime("audio/wav"), "wav");
        assert_eq!(audio_extension_for_mime("audio/x-wav"), "wav");
        assert_eq!(audio_extension_for_mime("audio/ogg; codecs=opus"), "ogg");
        assert_eq!(audio_extension_for_mime("audio/mp4"), "m4a");
        assert_eq!(audio_extension_for_mime("audio/mpeg"), "mp3");
        assert_eq!(audio_extension_for_mime("audio/flac"), "flac");
        assert_eq!(audio_extension_for_mime("application/octet-stream"), "webm");
    }

    #[test]
    fn rejects_empty_and_invalid_base64_audio() {
        let empty = transcribe_audio_whisper_sync("", "audio/webm", Some("fr"));
        assert!(empty.is_err());

        let whitespace = transcribe_audio_whisper_sync("   ", "audio/webm", Some("fr"));
        assert!(whitespace.is_err());

        let invalid = transcribe_audio_whisper_sync("!!!not-base64!!!", "audio/webm", Some("fr"));
        assert!(invalid.is_err());
    }

    #[test]
    fn voice_capabilities_serializes_to_camel_case() {
        let caps = VoiceCapabilities {
            whisper_available: true,
            whisper_binary: Some("/opt/homebrew/bin/whisper-cli".into()),
            macos_dictation_supported: true,
            preferred_engine: "whisper".into(),
        };
        let json = serde_json::to_value(&caps).unwrap();
        assert_eq!(json["whisperAvailable"], true);
        assert_eq!(json["whisperBinary"], "/opt/homebrew/bin/whisper-cli");
        assert_eq!(json["macosDictationSupported"], true);
        assert_eq!(json["preferredEngine"], "whisper");
    }
}
