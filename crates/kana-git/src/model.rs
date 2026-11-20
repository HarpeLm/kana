use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LineKind {
    Context,
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffLine {
    pub kind: LineKind,
    /// Numéro dans l'ancienne version (absent pour une ligne ajoutée).
    pub old_no: Option<u32>,
    /// Numéro dans la nouvelle version (absent pour une ligne supprimée).
    pub new_no: Option<u32>,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hunk {
    /// Ligne `@@ -a,b +c,d @@ …` telle que Git l'écrit.
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileDiff {
    pub path: String,
    /// Ancien chemin, pour un fichier renommé.
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    /// Fichier binaire ou trop volumineux : son contenu n'est pas détaillé.
    pub binary: bool,
    pub hunks: Vec<Hunk>,
}

/// Les changements d'un dépôt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffReport {
    /// Dossier racine du dépôt.
    pub root: String,
    pub files: Vec<FileDiff>,
}
