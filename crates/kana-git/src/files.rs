//! Les fichiers d'un dépôt : liste, aperçu, et écriture d'un fichier existant.

use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};

use crate::{
    run::{GitError, git, repo_root},
    status::{ChangedFile, changed_files},
};

/// Au-delà, la liste est coupée (un dépôt énorme mettrait trop de temps à s'afficher).
const MAX_FILES: usize = 20_000;
/// Limites de scan pour extraire les symboles sans ralentir les gros dépôts.
const MAX_SYMBOL_FILES: usize = 400;
const MAX_SYMBOL_FILE_BYTES: u64 = 128 * 1024;
const MAX_SYMBOLS: usize = 1_500;
/// Taille maximale lue pour un aperçu.
const MAX_PREVIEW_BYTES: u64 = 256 * 1024;
/// Taille maximale d'un fichier qu'on accepte d'écrire.
const MAX_WRITE_BYTES: usize = 2 * 1024 * 1024;
/// Un fichier qui contient un octet nul dans ses premiers octets est considéré comme binaire.
const BINARY_SNIFF_BYTES: usize = 8000;

/// Un symbole (fonction, structure, composant…) repéré dans le dépôt pour l'autocomplétion `@`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RepoSymbol {
    pub name: String,
    pub kind: String,
    pub path: String,
    pub line: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileList {
    pub root: String,
    /// Chemins relatifs à la racine, séparés par `/`.
    pub files: Vec<String>,
    pub truncated: bool,
    /// Fichiers modifiés, ajoutés ou non suivis.
    pub changes: Vec<ChangedFile>,
    /// Symboles détectés dans les fichiers de code du dépôt.
    pub symbols: Vec<RepoSymbol>,
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
    let symbols = extract_symbols(&root, &files);
    Ok(FileList { root: root.display().to_string(), files, truncated, changes, symbols })
}

fn is_code_file(path: &str) -> bool {
    matches!(
        Path::new(path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go")
    )
}

fn symbol_on_line(raw: &str) -> Option<(&'static str, String)> {
    let trimmed = raw.trim_start();
    if trimmed.is_empty()
        || trimmed.starts_with("//")
        || trimmed.starts_with('#')
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
    {
        return None;
    }
    let exported = trimmed.starts_with("export const ") || trimmed.starts_with("pub const ");
    let mut rest = trimmed;
    loop {
        let stripped = ["pub(crate) ", "pub(super) ", "pub ", "export default ", "export ", "default ", "async ", "unsafe ", "declare "]
            .iter()
            .find_map(|prefix| rest.strip_prefix(prefix));
        match stripped {
            Some(next) => rest = next.trim_start(),
            None => break,
        }
    }
    let (kind, after) = if let Some(s) = rest.strip_prefix("fn ") {
        ("fn", s)
    } else if let Some(s) = rest.strip_prefix("function ") {
        ("fn", s)
    } else if let Some(s) = rest.strip_prefix("def ") {
        ("fn", s)
    } else if let Some(s) = rest.strip_prefix("func ") {
        let s = s.trim_start();
        if s.starts_with('(') {
            let close = s.find(')')?;
            ("fn", s[close + 1..].trim_start())
        } else {
            ("fn", s)
        }
    } else if let Some(s) = rest.strip_prefix("struct ") {
        ("struct", s)
    } else if let Some(s) = rest.strip_prefix("enum ") {
        ("enum", s)
    } else if let Some(s) = rest.strip_prefix("trait ") {
        ("trait", s)
    } else if let Some(s) = rest.strip_prefix("interface ") {
        ("interface", s)
    } else if let Some(s) = rest.strip_prefix("type ") {
        ("type", s)
    } else if let Some(s) = rest.strip_prefix("class ") {
        ("class", s)
    } else if exported && let Some(s) = rest.strip_prefix("const ") {
        ("const", s)
    } else {
        return None;
    };
    let name: String = after
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect();
    let first = name.chars().next()?;
    if name.len() < 2 || (!first.is_ascii_alphabetic() && first != '_') {
        return None;
    }
    Some((kind, name))
}

fn extract_symbols(root: &Path, files: &[String]) -> Vec<RepoSymbol> {
    let mut symbols = Vec::new();
    let mut seen = HashSet::new();
    for path in files.iter().filter(|p| is_code_file(p)).take(MAX_SYMBOL_FILES) {
        let full = root.join(path);
        let Ok(meta) = fs::metadata(&full) else { continue };
        if meta.len() > MAX_SYMBOL_FILE_BYTES {
            continue;
        }
        let Ok(text) = fs::read_to_string(&full) else { continue };
        for (idx, line) in text.lines().enumerate() {
            if let Some((kind, name)) = symbol_on_line(line) {
                if seen.insert((name.clone(), path.clone())) {
                    symbols.push(RepoSymbol {
                        name,
                        kind: kind.to_owned(),
                        path: path.clone(),
                        line: (idx + 1) as u32,
                    });
                    if symbols.len() >= MAX_SYMBOLS {
                        return symbols;
                    }
                }
            }
        }
    }
    symbols
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

/// Met un fichier du dépôt à la corbeille (macOS : `~/.Trash`, on peut le récupérer) ; ailleurs, il est supprimé.
pub fn trash_file(repo: &Path, relative: &str) -> Result<(), GitError> {
    let root = repo_root(repo)?;
    let full = resolve_inside(&root, relative)?;
    let trash = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".Trash")).filter(|t| t.is_dir());
    if let (true, Some(trash)) = (cfg!(target_os = "macos"), trash) {
        let name = full.file_name().and_then(|n| n.to_str()).unwrap_or("fichier").to_owned();
        let mut target = trash.join(&name);
        let mut n = 1;
        while target.exists() {
            let (stem, ext) = match name.rsplit_once('.') {
                Some((s, e)) => (s.to_owned(), format!(".{e}")),
                None => (name.clone(), String::new()),
            };
            target = trash.join(format!("{stem} {n}{ext}"));
            n += 1;
        }
        if fs::rename(&full, &target).is_ok() {
            return Ok(());
        }
        // Un autre volume : copie puis suppression.
        fs::copy(&full, &target).map_err(|e| GitError::Write(e.to_string()))?;
    }
    fs::remove_file(&full).map_err(|e| GitError::Write(e.to_string()))
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

/// Les fichiers de règles projet autorisés pour la lecture et la synchronisation.
pub const RULE_FILE_PATHS: [&str; 4] = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".kana/rules.md"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RuleFile {
    pub path: String,
    pub exists: bool,
    pub content: String,
}

fn validate_rule_path(relative: &str) -> Result<&'static str, GitError> {
    RULE_FILE_PATHS
        .iter()
        .copied()
        .find(|&allowed| allowed == relative)
        .ok_or_else(|| GitError::InvalidPath(relative.to_owned()))
}

fn resolve_rule_target(root: &Path, relative: &str) -> Result<(&'static str, PathBuf), GitError> {
    let allowed = validate_rule_path(relative)?;
    let root_real = fs::canonicalize(root).map_err(|e| GitError::Read(e.to_string()))?;
    let full = root_real.join(allowed);
    if let Some(parent) = full.parent()
        && parent.exists()
    {
        let parent_real = fs::canonicalize(parent).map_err(|e| GitError::Read(e.to_string()))?;
        if !parent_real.starts_with(&root_real) {
            return Err(GitError::InvalidPath(relative.to_owned()));
        }
    }
    if let Ok(meta) = fs::symlink_metadata(&full)
        && meta.file_type().is_symlink()
    {
        let full_real = fs::canonicalize(&full).map_err(|_| GitError::InvalidPath(relative.to_owned()))?;
        if !full_real.starts_with(&root_real) {
            return Err(GitError::InvalidPath(relative.to_owned()));
        }
    }
    Ok((allowed, full))
}

/// Lit les fichiers de règles du dépôt (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.kana/rules.md`).
pub fn read_rule_files(repo: &Path) -> Result<Vec<RuleFile>, GitError> {
    let root = repo_root(repo)?;
    let mut files = Vec::with_capacity(RULE_FILE_PATHS.len());
    for allowed in RULE_FILE_PATHS {
        let (_, full) = resolve_rule_target(&root, allowed)?;
        if full.is_file() {
            let content = fs::read_to_string(&full).map_err(|e| GitError::Read(e.to_string()))?;
            files.push(RuleFile { path: allowed.to_owned(), exists: true, content });
        } else {
            files.push(RuleFile { path: allowed.to_owned(), exists: false, content: String::new() });
        }
    }
    Ok(files)
}

/// Écrit (ou crée, y compris `.kana/`) l'un des fichiers de règles projet autorisés.
pub fn write_rule_file(repo: &Path, path: &str, content: &str) -> Result<RuleFile, GitError> {
    if content.len() > MAX_WRITE_BYTES {
        return Err(GitError::Write(format!(
            "fichier trop volumineux (max {} Mo)",
            MAX_WRITE_BYTES / 1024 / 1024
        )));
    }
    let root = repo_root(repo)?;
    let (allowed, full) = resolve_rule_target(&root, path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| GitError::Write(e.to_string()))?;
    }
    let name = full.file_name().and_then(|n| n.to_str()).unwrap_or("rules");
    let temp = full.with_file_name(format!(".{name}.kana-tmp"));
    let write = || -> std::io::Result<()> {
        let mut file = File::create(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, &full)
    };
    write().map_err(|e| {
        let _ = fs::remove_file(&temp);
        GitError::Write(e.to_string())
    })?;
    Ok(RuleFile {
        path: allowed.to_owned(),
        exists: true,
        content: content.to_owned(),
    })
}

/// Synchronise le même contenu de règles vers plusieurs cibles autorisées.
pub fn sync_rule_files(repo: &Path, content: &str, targets: &[String]) -> Result<Vec<RuleFile>, GitError> {
    let selected: Vec<&str> = if targets.is_empty() {
        RULE_FILE_PATHS.to_vec()
    } else {
        targets
            .iter()
            .map(|t| validate_rule_path(t))
            .collect::<Result<Vec<_>, _>>()?
    };
    let mut updated = Vec::with_capacity(selected.len());
    for target in selected {
        updated.push(write_rule_file(repo, target, content)?);
    }
    Ok(updated)
}

/// Diagnostic compilateur ou LSP remonté dans `FilesDock` et envoyé à l'agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CodeDiagnostic {
    pub file: String,
    pub line: u32,
    pub column: u32,
    /// `"error"` | `"warning"` | `"info"`
    pub severity: String,
    pub code: Option<String>,
    pub message: String,
    pub source: String,
}

fn parse_rustc_or_colon_line(line: &str, default_source: &str) -> Option<CodeDiagnostic> {
    // 1. Format tsc : `src/app.ts(14,7): error TS2322: Type 'string' is not assignable...`
    if let Some((loc, rest)) = line.split_once("): ")
        && let Some((file, coords)) = loc.rsplit_once('(')
    {
        let mut nums = coords.split(',');
        let l: u32 = nums.next()?.trim().parse().ok()?;
        let c: u32 = nums.next()?.trim().parse().ok()?;
        let (severity, code, message) = parse_severity_and_code(rest)?;
        return Some(CodeDiagnostic {
            file: file.trim().replace('\\', "/"),
            line: l,
            column: c,
            severity,
            code,
            message,
            source: default_source.to_string(),
        });
    }

    // 2. Format tsc pretty : `src/app.ts:14:7 - error TS2322: Message`
    if let Some((loc, rest)) = line.split_once(" - ")
        && let Some((file, l, c)) = split_file_line_col(loc)
    {
        let (severity, code, message) = parse_severity_and_code(rest)?;
        return Some(CodeDiagnostic {
            file,
            line: l,
            column: c,
            severity,
            code,
            message,
            source: default_source.to_string(),
        });
    }

    // 3. Format rustc / cargo --message-format=short : `crates/foo/src/lib.rs:42:9: error[E0308]: mismatched types`
    let (file_part, after_col) = split_short_diagnostic(line)?;
    let (severity, code, message) = parse_severity_and_code(after_col)?;
    Some(CodeDiagnostic {
        file: file_part.0,
        line: file_part.1,
        column: file_part.2,
        severity,
        code,
        message,
        source: default_source.to_string(),
    })
}

fn split_file_line_col(raw: &str) -> Option<(String, u32, u32)> {
    let mut parts = raw.rsplitn(3, ':');
    let col: u32 = parts.next()?.trim().parse().ok()?;
    let line: u32 = parts.next()?.trim().parse().ok()?;
    let file = parts.next()?.trim();
    if file.is_empty() {
        return None;
    }
    Some((file.replace('\\', "/"), line, col))
}

fn split_short_diagnostic(line: &str) -> Option<((String, u32, u32), &str)> {
    let colon_positions: Vec<usize> = line.match_indices(':').map(|(i, _)| i).collect();
    if colon_positions.len() < 3 {
        return None;
    }
    for w in colon_positions.windows(3) {
        let (c1, c2, c3) = (w[0], w[1], w[2]);
        let file = line[..c1].trim();
        if file.is_empty() {
            continue;
        }
        let Ok(l) = line[c1 + 1..c2].trim().parse::<u32>() else { continue };
        let Ok(col) = line[c2 + 1..c3].trim().parse::<u32>() else { continue };
        let rest = line[c3 + 1..].trim();
        return Some(((file.replace('\\', "/"), l, col), rest));
    }
    None
}

fn parse_severity_and_code(raw: &str) -> Option<(String, Option<String>, String)> {
    let trimmed = raw.trim();
    let (sev, after_sev) = if let Some(r) = trimmed.strip_prefix("error") {
        ("error", r)
    } else if let Some(r) = trimmed.strip_prefix("warning") {
        ("warning", r)
    } else if let Some(r) = trimmed.strip_prefix("info") {
        ("info", r)
    } else {
        return None;
    };

    let after_sev = after_sev.trim_start();
    // `[E0308]: message`
    if let Some(rest) = after_sev.strip_prefix('[')
        && let Some((code, msg_part)) = rest.split_once("]:")
    {
        let msg = msg_part.trim();
        if msg.is_empty() {
            return None;
        }
        return Some((sev.to_string(), Some(code.trim().to_string()), msg.to_string()));
    }
    // `TS2322: message`
    if let Some((code_candidate, msg_part)) = after_sev.split_once(':') {
        let code_clean = code_candidate.trim();
        if !code_clean.is_empty() && code_clean.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            let msg = msg_part.trim();
            if !msg.is_empty() {
                return Some((sev.to_string(), Some(code_clean.to_string()), msg.to_string()));
            }
        } else if code_clean.is_empty() {
            let msg = msg_part.trim();
            if !msg.is_empty() {
                return Some((sev.to_string(), None, msg.to_string()));
            }
        }
    }
    None
}

/// Analyse la sortie texte d'un compilateur ou serveur LSP (`cargo check --message-format=short`, `rustc`, `tsc --noEmit`).
pub fn parse_diagnostics_output(output: &str, default_source: &str) -> Vec<CodeDiagnostic> {
    let mut diagnostics = Vec::new();
    let mut seen = HashSet::new();
    for raw_line in output.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(diag) = parse_rustc_or_colon_line(line, default_source) {
            let key = (
                diag.file.clone(),
                diag.line,
                diag.column,
                diag.severity.clone(),
                diag.message.clone(),
            );
            if seen.insert(key) {
                diagnostics.push(diag);
            }
        }
    }
    diagnostics
}

/// Collecte les diagnostics compilateur/LSP d'un dépôt (analyse statique rapide + `.kana/diagnostics.json` éventuel).
pub fn collect_repo_diagnostics(repo: &Path) -> Result<Vec<CodeDiagnostic>, GitError> {
    let root = repo_root(repo)?;
    let custom_log = root.join(".kana").join("diagnostics.log");
    if custom_log.is_file()
        && let Ok(raw) = fs::read_to_string(&custom_log)
    {
        return Ok(parse_diagnostics_output(&raw, "rustc/tsc"));
    }

    let mut out = Vec::new();
    if root.join("tsconfig.json").is_file()
        && let Ok(res) = Command::new("npx")
            .args(["--no-install", "tsc", "--noEmit", "--pretty", "false"])
            .current_dir(&root)
            .output()
    {
        let combined = format!(
            "{}\n{}",
            String::from_utf8_lossy(&res.stdout),
            String::from_utf8_lossy(&res.stderr)
        );
        out.extend(parse_diagnostics_output(&combined, "tsc"));
    }
    Ok(out)
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

    #[test]
    fn extracts_symbols_from_source_files() {
        let dir = scratch_repo("symbols");
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(
            dir.join("src/app.rs"),
            "// fn ignored_comment()\npub struct AppState {}\npub async fn start_engine() {}\n",
        )
        .unwrap();
        fs::write(
            dir.join("src/ui.ts"),
            "export interface ComposerProps {}\nexport function sendMessage() {}\nexport const MAX_ITEMS = 10;\n",
        )
        .unwrap();

        let list = list_files(&dir).unwrap();
        let names: Vec<(&str, &str, &str)> = list
            .symbols
            .iter()
            .map(|s| (s.name.as_str(), s.kind.as_str(), s.path.as_str()))
            .collect();
        assert!(names.contains(&("AppState", "struct", "src/app.rs")));
        assert!(names.contains(&("start_engine", "fn", "src/app.rs")));
        assert!(names.contains(&("ComposerProps", "interface", "src/ui.ts")));
        assert!(names.contains(&("sendMessage", "fn", "src/ui.ts")));
        assert!(names.contains(&("MAX_ITEMS", "const", "src/ui.ts")));
        assert!(!names.iter().any(|(n, _, _)| *n == "ignored_comment"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_writes_and_syncs_project_rule_files() {
        let dir = scratch_repo("rules");
        let initial = read_rule_files(&dir).unwrap();
        assert_eq!(initial.len(), 4);
        assert!(initial.iter().all(|r| !r.exists && r.content.is_empty()));

        assert!(matches!(write_rule_file(&dir, "README.md", "nope"), Err(GitError::InvalidPath(_))));
        assert!(matches!(write_rule_file(&dir, "../CLAUDE.md", "nope"), Err(GitError::InvalidPath(_))));

        let saved = write_rule_file(&dir, ".kana/rules.md", "# Règles Kana\nUtilise cargo test.\n").unwrap();
        assert!(saved.exists);
        assert_eq!(
            fs::read_to_string(dir.join(".kana/rules.md")).unwrap(),
            "# Règles Kana\nUtilise cargo test.\n"
        );

        let synced = sync_rule_files(
            &dir,
            "# Règles unifiées\nToujours écrire des tests.\n",
            &["CLAUDE.md".into(), "AGENTS.md".into()],
        )
        .unwrap();
        assert_eq!(synced.len(), 2);
        assert_eq!(
            fs::read_to_string(dir.join("CLAUDE.md")).unwrap(),
            "# Règles unifiées\nToujours écrire des tests.\n"
        );
        assert_eq!(
            fs::read_to_string(dir.join("AGENTS.md")).unwrap(),
            "# Règles unifiées\nToujours écrire des tests.\n"
        );

        let after = read_rule_files(&dir).unwrap();
        assert!(after.iter().find(|r| r.path == "CLAUDE.md").unwrap().exists);
        assert!(after.iter().find(|r| r.path == "AGENTS.md").unwrap().exists);
        assert!(!after.iter().find(|r| r.path == "GEMINI.md").unwrap().exists);
        assert!(after.iter().find(|r| r.path == ".kana/rules.md").unwrap().exists);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn parses_rustc_and_tsc_diagnostics_outputs() {
        let sample = "\
crates/kana-core/src/lib.rs:18:5: error[E0308]: mismatched types
crates/kana-git/src/files.rs:92:13: warning: unused variable `tmp`
apps/desktop/src/App.tsx(144,9): error TS2322: Type 'number' is not assignable to type 'string'.
apps/desktop/src/components/FilesDock.tsx:62:11 - error TS2551: Property 'openFile' does not exist.
";
        let diags = parse_diagnostics_output(sample, "rustc");
        assert_eq!(diags.len(), 4);
        assert_eq!(
            diags[0],
            CodeDiagnostic {
                file: "crates/kana-core/src/lib.rs".into(),
                line: 18,
                column: 5,
                severity: "error".into(),
                code: Some("E0308".into()),
                message: "mismatched types".into(),
                source: "rustc".into(),
            }
        );
        assert_eq!(diags[1].severity, "warning");
        assert_eq!(diags[1].code, None);
        assert_eq!(diags[2].file, "apps/desktop/src/App.tsx");
        assert_eq!(diags[2].line, 144);
        assert_eq!(diags[2].column, 9);
        assert_eq!(diags[2].code.as_deref(), Some("TS2322"));
        assert_eq!(diags[3].file, "apps/desktop/src/components/FilesDock.tsx");
        assert_eq!(diags[3].code.as_deref(), Some("TS2551"));
    }
}
