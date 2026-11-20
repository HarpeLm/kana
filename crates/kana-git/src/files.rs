//! Les fichiers d'un dépôt et l'aperçu de leur contenu.

use std::{
    fs::{self, File},
    io::Read,
    path::{Component, Path},
};

use serde::Serialize;

use crate::run::{GitError, git, repo_root};

/// Au-delà, la liste est coupée (un dépôt énorme mettrait trop de temps à s'afficher).
const MAX_FILES: usize = 20_000;
/// Taille maximale lue pour un aperçu.
const MAX_PREVIEW_BYTES: u64 = 256 * 1024;
/// Un fichier qui contient un octet nul dans ses premiers octets est considéré comme binaire.
const BINARY_SNIFF_BYTES: usize = 8000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileList {
    pub root: String,
    /// Chemins relatifs à la racine, séparés par `/`.
    pub files: Vec<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FilePreview {
    pub path: String,
    pub size: u64,
    pub binary: bool,
    /// Le texte est coupé : le fichier dépasse la taille d'aperçu.
    pub truncated: bool,
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
    Ok(FileList { root: root.display().to_string(), files, truncated })
}

/// Lit le début d'un fichier du dépôt. Refuse tout chemin qui sortirait de la racine.
pub fn read_preview(repo: &Path, relative: &str) -> Result<FilePreview, GitError> {
    let root = repo_root(repo)?;
    let requested = Path::new(relative);
    let escapes = requested.is_absolute()
        || requested.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)));
    if escapes {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }

    // Un lien symbolique ne doit pas non plus mener hors du dépôt.
    let full = fs::canonicalize(root.join(requested)).map_err(|e| GitError::Read(e.to_string()))?;
    let root_real = fs::canonicalize(&root).map_err(|e| GitError::Read(e.to_string()))?;
    if !full.starts_with(&root_real) {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    if !full.is_file() {
        return Err(GitError::Read(format!("{relative} n'est pas un fichier")));
    }

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
        text: if binary { String::new() } else { String::from_utf8_lossy(&bytes).into_owned() },
    })
}

#[cfg(test)]
mod tests {
    use std::{env, path::PathBuf, process::Command};

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
    fn previews_a_text_file() {
        let dir = scratch_repo("text");
        fs::write(dir.join("a.txt"), "un\ndeux\n").unwrap();
        let preview = read_preview(&dir, "a.txt").unwrap();
        assert_eq!(preview.text, "un\ndeux\n");
        assert_eq!((preview.size, preview.binary, preview.truncated), (8, false, false));
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
        }
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_pointing_outside() {
        let dir = scratch_repo("symlink");
        std::os::unix::fs::symlink("/etc/hosts", dir.join("lien")).unwrap();
        assert!(matches!(read_preview(&dir, "lien"), Err(GitError::InvalidPath(_))));
        let _ = fs::remove_dir_all(dir);
    }
}
