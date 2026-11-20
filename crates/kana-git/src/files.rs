//! Les fichiers d'un dépôt : liste, aperçu, et écriture d'un fichier existant.

use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;

use crate::{
    run::{GitError, git, repo_root},
    status::{ChangedFile, changed_files},
};

/// Au-delà, la liste est coupée (un dépôt énorme mettrait trop de temps à s'afficher).
const MAX_FILES: usize = 20_000;
/// Taille maximale lue pour un aperçu.
const MAX_PREVIEW_BYTES: u64 = 256 * 1024;
/// Taille maximale d'un fichier qu'on accepte d'écrire.
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
/// Un fichier qui contient un octet nul dans ses premiers octets est considéré comme binaire.
const BINARY_SNIFF_BYTES: usize = 8000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileList {
    pub root: String,
    /// Chemins relatifs à la racine, séparés par `/`.
    pub files: Vec<String>,
    pub truncated: bool,
    /// Fichiers modifiés, ajoutés ou non suivis.
    pub changes: Vec<ChangedFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FilePreview {
    pub path: String,
    pub size: u64,
    pub binary: bool,
    /// Le texte est coupé : le fichier dépasse la taille d'aperçu (il ne doit pas être modifié).
    pub truncated: bool,
    /// Date de dernière modification (ms depuis 1970) ; sert à repérer une modification ailleurs.
    pub modified: u64,
    /// Vide pour un fichier binaire.
    pub text: String,
}

/// Les fichiers suivis et non suivis du dépôt, sans ceux que `.gitignore` écarte.
pub fn list_files(repo: &Path) -> Result<FileList, GitError> {
    let root = repo_root(repo)?;
    let out = git(&root, &["ls-files", "-z", "--cached", "--others", "--exclude-standard"], &[])?;

    let mut files: Vec<String> = out
        .split('\0')
        .filter(|path| !path.is_empty())
        // Un fichier suivi mais supprimé du disque n'a rien à montrer.
        .filter(|path| root.join(path).is_file())
        .map(str::to_owned)
        .collect();
    files.sort();
    files.dedup();

    let truncated = files.len() > MAX_FILES;
    files.truncate(MAX_FILES);
    // Les modifications sont un plus : un échec ne doit pas empêcher d'afficher les fichiers.
    let changes = changed_files(&root).unwrap_or_default();
    Ok(FileList { root: root.display().to_string(), files, truncated, changes })
}

/// Chemin réel d'un fichier existant du dépôt. Refuse tout ce qui sortirait de la racine :
/// `..`, chemin absolu, lien symbolique pointant dehors.
fn resolve_inside(root: &Path, relative: &str) -> Result<PathBuf, GitError> {
    let requested = Path::new(relative);
    let escapes = requested.is_absolute()
        || requested.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)));
    if escapes {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }

    let full = fs::canonicalize(root.join(requested)).map_err(|e| GitError::Read(e.to_string()))?;
    let root_real = fs::canonicalize(root).map_err(|e| GitError::Read(e.to_string()))?;
    if !full.starts_with(&root_real) {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    if !full.is_file() {
        return Err(GitError::Read(format!("{relative} n'est pas un fichier")));
    }
    Ok(full)
}

fn modified_ms(path: &Path) -> Result<u64, GitError> {
    let modified = fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(|e| GitError::Read(e.to_string()))?;
    Ok(modified.duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64))
}

/// Lit le début d'un fichier du dépôt.
pub fn read_preview(repo: &Path, relative: &str) -> Result<FilePreview, GitError> {
    let root = repo_root(repo)?;
    let full = resolve_inside(&root, relative)?;

    let size = fs::metadata(&full).map_err(|e| GitError::Read(e.to_string()))?.len();
    let mut bytes = Vec::new();
    File::open(&full)
        .and_then(|file| file.take(MAX_PREVIEW_BYTES).read_to_end(&mut bytes))
        .map_err(|e| GitError::Read(e.to_string()))?;

    let binary = bytes.iter().take(BINARY_SNIFF_BYTES).any(|&b| b == 0);
    Ok(FilePreview {
        path: relative.to_owned(),
        size,
        binary,
        truncated: size > MAX_PREVIEW_BYTES,
        modified: modified_ms(&full)?,
        text: if binary { String::new() } else { String::from_utf8_lossy(&bytes).into_owned() },
    })
}

/// Remplace le contenu d'un fichier existant du dépôt et renvoie sa nouvelle date de modification.
///
/// Si `expected_modified` est donné et que le fichier a changé depuis, rien n'est écrit
/// (`GitError::Conflict`) : on ne veut pas écraser le travail fait ailleurs. L'écriture passe par
/// un fichier temporaire puis un renommage, pour ne jamais laisser un fichier à moitié écrit.
pub fn write_text(
    repo: &Path,
    relative: &str,
    content: &str,
    expected_modified: Option<u64>,
) -> Result<u64, GitError> {
    if content.len() > MAX_WRITE_BYTES {
        return Err(GitError::Write(format!("fichier trop volumineux (max {} Mo)", MAX_WRITE_BYTES / 1024 / 1024)));
    }
    let root = repo_root(repo)?;
    let full = resolve_inside(&root, relative)?;

    if let Some(expected) = expected_modified
        && modified_ms(&full)? != expected
    {
        return Err(GitError::Conflict(relative.to_owned()));
    }

    let name = full.file_name().and_then(|n| n.to_str()).unwrap_or("fichier");
    let temp = full.with_file_name(format!(".{name}.kana-tmp"));
    let write = || -> std::io::Result<()> {
        let mut file = File::create(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::set_permissions(&temp, fs::metadata(&full)?.permissions())?;
        fs::rename(&temp, &full)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&temp);
        GitError::Write(e.to_string())
    })?;

    modified_ms(&full)
}

#[cfg(test)]
mod tests {
    use std::{env, process::Command, thread, time::Duration};

    use super::*;

    fn scratch_repo(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("kana-files-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let status = Command::new("git").args(["init", "-q"]).current_dir(&dir).status().unwrap();
        assert!(status.success());
        dir
    }

    #[test]
    fn lists_visible_files_and_skips_ignored_ones() {
        let dir = scratch_repo("list");
        fs::write(dir.join(".gitignore"), "cible/\n").unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("cible")).unwrap();
        fs::write(dir.join("src/main.rs"), "fn main() {}\n").unwrap();
        fs::write(dir.join("cible/gros.bin"), "x").unwrap();

        let list = list_files(&dir).unwrap();
        assert_eq!(list.files, vec![".gitignore", "src/main.rs"]);
        assert!(!list.truncated);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn list_reports_git_changes() {
        let dir = scratch_repo("changes");
        fs::write(dir.join("a.txt"), "un\n").unwrap();
        let list = list_files(&dir).unwrap();
        let paths: Vec<_> = list.changes.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(paths, vec!["a.txt"]);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn previews_a_text_file() {
        let dir = scratch_repo("text");
        fs::write(dir.join("a.txt"), "un\ndeux\n").unwrap();
        let preview = read_preview(&dir, "a.txt").unwrap();
        assert_eq!(preview.text, "un\ndeux\n");
        assert_eq!((preview.size, preview.binary, preview.truncated), (8, false, false));
        assert!(preview.modified > 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn detects_binary_files() {
        let dir = scratch_repo("bin");
        fs::write(dir.join("img.bin"), [0u8, 1, 2, 3]).unwrap();
        let preview = read_preview(&dir, "img.bin").unwrap();
        assert!(preview.binary);
        assert!(preview.text.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn cuts_long_files() {
        let dir = scratch_repo("long");
        fs::write(dir.join("long.txt"), "a".repeat(300 * 1024)).unwrap();
        let preview = read_preview(&dir, "long.txt").unwrap();
        assert!(preview.truncated);
        assert_eq!(preview.text.len() as u64, MAX_PREVIEW_BYTES);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn refuses_paths_that_leave_the_repository() {
        let dir = scratch_repo("escape");
        fs::write(dir.join("a.txt"), "x").unwrap();
        for bad in ["../secret", "/etc/hosts", "src/../../x"] {
            assert!(matches!(read_preview(&dir, bad), Err(GitError::InvalidPath(_))), "{bad}");
            assert!(matches!(write_text(&dir, bad, "x", None), Err(GitError::InvalidPath(_))), "{bad}");
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_pointing_outside() {
        let dir = scratch_repo("symlink");
        std::os::unix::fs::symlink("/etc/hosts", dir.join("lien")).unwrap();
        assert!(matches!(read_preview(&dir, "lien"), Err(GitError::InvalidPath(_))));
        assert!(matches!(write_text(&dir, "lien", "x", None), Err(GitError::InvalidPath(_))));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn writes_a_file_and_returns_its_new_date() {
        let dir = scratch_repo("write");
        fs::write(dir.join("a.txt"), "avant\n").unwrap();
        let opened = read_preview(&dir, "a.txt").unwrap();

        let saved = write_text(&dir, "a.txt", "après\n", Some(opened.modified)).unwrap();

        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "après\n");
        assert_eq!(saved, read_preview(&dir, "a.txt").unwrap().modified);
        assert!(!dir.join(".a.txt.kana-tmp").exists(), "fichier temporaire laissé");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn refuses_to_overwrite_a_file_changed_elsewhere() {
        let dir = scratch_repo("conflict");
        fs::write(dir.join("a.txt"), "avant\n").unwrap();
        let opened = read_preview(&dir, "a.txt").unwrap();

        thread::sleep(Duration::from_millis(20));
        fs::write(dir.join("a.txt"), "modifié ailleurs\n").unwrap();

        let result = write_text(&dir, "a.txt", "ma version\n", Some(opened.modified));
        assert!(matches!(result, Err(GitError::Conflict(_))));
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "modifié ailleurs\n");

        // Sans date attendue, on écrase volontairement.
        write_text(&dir, "a.txt", "ma version\n", None).unwrap();
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "ma version\n");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn does_not_create_new_files() {
        let dir = scratch_repo("nocreate");
        assert!(write_text(&dir, "nouveau.txt", "x", None).is_err());
        assert!(!dir.join("nouveau.txt").exists());
        let _ = fs::remove_dir_all(dir);
    }
}
