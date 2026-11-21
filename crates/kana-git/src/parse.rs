//! Analyse de la sortie de `git diff` (format unifié) en fichiers, blocs et lignes.

use crate::model::{DiffLine, FileDiff, FileStatus, Hunk, LineKind};

fn new_file(header: &str) -> FileDiff {
    // « a/chemin b/chemin » : le chemin d'arrivée suit le dernier « b/ ».
    let path = header.rsplit_once(" b/").map_or(header, |(_, path)| path);
    FileDiff {
        path: path.to_owned(),
        old_path: None,
        status: FileStatus::Modified,
        additions: 0,
        deletions: 0,
        binary: false,
        hunks: Vec::new(),
    }
}

/// Lit `-a,b +c,d` dans un en-tête de bloc et renvoie les numéros de départ.
fn hunk_start(header: &str) -> (u32, u32) {
    let numbers = |marker: char| {
        header
            .split_whitespace()
            .find(|part| part.starts_with(marker))
            .and_then(|part| part[1..].split(',').next())
            .and_then(|n| n.parse().ok())
            .unwrap_or(1)
    };
    (numbers('-'), numbers('+'))
}

/// Analyse un texte `git diff`. Les fichiers sont renvoyés dans l'ordre du texte.
pub fn parse_diff(text: &str) -> Vec<FileDiff> {
    let mut files = Vec::new();
    let mut file: Option<FileDiff> = None;
    let mut hunk: Option<Hunk> = None;
    let (mut old_no, mut new_no) = (0u32, 0u32);

    fn finish_hunk(file: &mut Option<FileDiff>, hunk: &mut Option<Hunk>) {
        if let (Some(file), Some(hunk)) = (file.as_mut(), hunk.take()) {
            file.hunks.push(hunk);
        }
    }

    for line in text.lines() {
        if let Some(header) = line.strip_prefix("diff --git ") {
            finish_hunk(&mut file, &mut hunk);
            files.extend(file.take());
            file = Some(new_file(header));
            continue;
        }
        if file.is_none() {
            continue;
        }
        // Un nouvel en-tête de bloc ferme le bloc précédent.
        if hunk.is_some() && line.starts_with("@@") {
            finish_hunk(&mut file, &mut hunk);
        }
        let Some(current) = file.as_mut() else { continue };

        if let Some(open) = hunk.as_mut() {
            let (kind, text) = match line.chars().next() {
                Some('+') => (LineKind::Add, &line[1..]),
                Some('-') => (LineKind::Del, &line[1..]),
                Some(' ') => (LineKind::Context, &line[1..]),
                // « \ No newline at end of file » : information sans ligne de code.
                Some('\\') => continue,
                _ => (LineKind::Context, line),
            };
            let entry = match kind {
                LineKind::Add => {
                    current.additions += 1;
                    new_no += 1;
                    DiffLine { kind, old_no: None, new_no: Some(new_no - 1), text: text.into() }
                }
                LineKind::Del => {
                    current.deletions += 1;
                    old_no += 1;
                    DiffLine { kind, old_no: Some(old_no - 1), new_no: None, text: text.into() }
                }
                LineKind::Context => {
                    old_no += 1;
                    new_no += 1;
                    DiffLine {
                        kind,
                        old_no: Some(old_no - 1),
                        new_no: Some(new_no - 1),
                        text: text.into(),
                    }
                }
            };
            open.lines.push(entry);
            continue;
        }

        if line.starts_with("@@") {
            (old_no, new_no) = hunk_start(line);
            hunk = Some(Hunk { header: line.to_owned(), lines: Vec::new() });
        } else if line.starts_with("new file mode") {
            current.status = FileStatus::Added;
        } else if line.starts_with("deleted file mode") {
            current.status = FileStatus::Deleted;
        } else if let Some(from) = line.strip_prefix("rename from ") {
            current.status = FileStatus::Renamed;
            current.old_path = Some(from.to_owned());
        } else if let Some(to) = line.strip_prefix("rename to ") {
            current.path = to.to_owned();
        } else if line.starts_with("Binary files") || line.starts_with("GIT binary patch") {
            current.binary = true;
        }
    }

    finish_hunk(&mut file, &mut hunk);
    files.extend(file);
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
diff --git a/src/main.rs b/src/main.rs
index 1111111..2222222 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,4 +1,5 @@ fn main() {
 fn main() {
-    println!(\"salut\");
+    println!(\"bonjour\");
+    println!(\"monde\");
 }
\\ No newline at end of file
diff --git a/notes.txt b/notes.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/notes.txt
@@ -0,0 +1,2 @@
+un
+deux
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 4444444..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-adieu
diff --git a/img.png b/img.png
index 5555555..6666666 100644
Binary files a/img.png and b/img.png differ
diff --git a/a.txt b/b.txt
similarity index 100%
rename from a.txt
rename to b.txt
";

    #[test]
    fn parses_every_file_with_its_status() {
        let files = parse_diff(SAMPLE);
        let summary: Vec<_> = files.iter().map(|f| (f.path.as_str(), f.status)).collect();
        assert_eq!(
            summary,
            vec![
                ("src/main.rs", FileStatus::Modified),
                ("notes.txt", FileStatus::Added),
                ("old.txt", FileStatus::Deleted),
                ("img.png", FileStatus::Modified),
                ("b.txt", FileStatus::Renamed),
            ]
        );
        assert_eq!(files[4].old_path.as_deref(), Some("a.txt"));
    }

    #[test]
    fn counts_additions_and_deletions() {
        let files = parse_diff(SAMPLE);
        assert_eq!((files[0].additions, files[0].deletions), (2, 1));
        assert_eq!((files[1].additions, files[1].deletions), (2, 0));
        assert_eq!((files[2].additions, files[2].deletions), (0, 1));
    }

    #[test]
    fn numbers_lines_on_both_sides() {
        let lines = &parse_diff(SAMPLE)[0].hunks[0].lines;
        assert_eq!(lines[0].kind, LineKind::Context);
        assert_eq!((lines[0].old_no, lines[0].new_no), (Some(1), Some(1)));
        assert_eq!((lines[1].kind, lines[1].old_no, lines[1].new_no), (LineKind::Del, Some(2), None));
        assert_eq!((lines[2].kind, lines[2].old_no, lines[2].new_no), (LineKind::Add, None, Some(2)));
        assert_eq!(lines[3].new_no, Some(3));
        assert_eq!(lines[4].text, "}");
    }

    #[test]
    fn ignores_the_no_newline_marker() {
        let lines = &parse_diff(SAMPLE)[0].hunks[0].lines;
        assert_eq!(lines.len(), 5);
    }

    #[test]
    fn flags_binary_files() {
        assert!(parse_diff(SAMPLE)[3].binary);
        assert!(parse_diff(SAMPLE)[3].hunks.is_empty());
    }

    #[test]
    fn removed_line_starting_with_dashes_is_not_a_header() {
        let text = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,1 @@\n--- ligne\n reste\n";
        let file = &parse_diff(text)[0];
        assert_eq!(file.deletions, 1);
        assert_eq!(file.hunks[0].lines[0].text, "-- ligne");
    }

    #[test]
    fn empty_text_gives_no_files() {
        assert!(parse_diff("").is_empty());
    }

    #[test]
    fn large_multi_file_diff_parsing_stays_within_budget() {
        let mut big_diff = String::new();
        for f in 0..60 {
            big_diff.push_str(&format!(
                "diff --git a/src/file_{f}.rs b/src/file_{f}.rs\nindex 1111111..2222222 100644\n--- a/src/file_{f}.rs\n+++ b/src/file_{f}.rs\n"
            ));
            for h in 0..5 {
                let start_line = h * 15 + 1;
                big_diff.push_str(&format!(
                    "@@ -{start_line},4 +{start_line},5 @@\n fn step_{h}() {{\n-    old_call();\n+    new_call();\n+    verify();\n }}\n"
                ));
            }
        }
        let start = std::time::Instant::now();
        let parsed = parse_diff(&big_diff);
        let elapsed = start.elapsed();
        assert_eq!(parsed.len(), 60);
        assert!(parsed.iter().all(|f| f.hunks.len() == 5 && f.additions == 10 && f.deletions == 5));
        assert!(
            elapsed < std::time::Duration::from_millis(250),
            "parse_diff sur 60 fichiers / 300 hunks a dépassé le budget : {elapsed:?}"
        );
    }
}
