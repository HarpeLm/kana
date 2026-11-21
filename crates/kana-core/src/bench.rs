//! Runner de datasets SWE-bench / Terminal-Bench + Docker pour `kana bench`.
//!
//! Fournit les structures compatibles avec le format officiel SWE-bench Verified
//! (`predictions.jsonl`) et Terminal-Bench, ainsi que les fonctions pures d'analyse,
//! de construction de prompt et de commandes Docker.

use serde::{Deserialize, Serialize};

/// Tâche issue d'un dataset JSON ou JSONL (SWE-bench Verified / Terminal-Bench).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BenchDatasetTask {
    #[serde(alias = "id")]
    pub instance_id: String,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub base_commit: Option<String>,
    #[serde(alias = "prompt", alias = "instruction")]
    pub problem_statement: String,
    #[serde(default)]
    pub docker_image: Option<String>,
    #[serde(default)]
    pub test_cmd: Option<String>,
    #[serde(default)]
    pub suite: Option<String>,
}

/// Prédiction produite pour une instance au format officiel SWE-bench `predictions.jsonl`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BenchPrediction {
    pub instance_id: String,
    pub model_name_or_path: String,
    pub model_patch: String,
    pub resolved: bool,
    pub duration_ms: u64,
    #[serde(default)]
    pub test_exit_code: Option<i32>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Analyse un dataset de benchmark au format tableau JSON (`[...]`) ou JSONL (1 objet JSON par ligne).
/// Les lignes vides sont ignorées en mode JSONL.
pub fn parse_bench_dataset(content: &str) -> Result<Vec<BenchDatasetTask>, String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    if trimmed.starts_with('[') {
        serde_json::from_str::<Vec<BenchDatasetTask>>(trimmed)
            .map_err(|e| format!("dataset JSON invalide : {e}"))
    } else {
        let mut tasks = Vec::new();
        for (idx, line) in content.lines().enumerate() {
            let clean = line.trim();
            if clean.is_empty() {
                continue;
            }
            let task = serde_json::from_str::<BenchDatasetTask>(clean)
                .map_err(|e| format!("dataset JSONL invalide à la ligne {} : {e}", idx + 1))?;
            tasks.push(task);
        }
        Ok(tasks)
    }
}

/// Sérialise une liste de prédictions au format JSONL standard SWE-bench (`predictions.jsonl`).
pub fn format_predictions_jsonl(predictions: &[BenchPrediction]) -> String {
    let lines: Vec<String> = predictions
        .iter()
        .filter_map(|p| serde_json::to_string(p).ok())
        .collect();
    if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    }
}

/// Construit les arguments passés à `docker` pour exécuter une commande de test
/// dans un conteneur isolé (`docker run --rm -v <workdir>:/workspace -w /workspace <image> sh -lc <cmd>`).
pub fn build_docker_bench_args(image: &str, workdir: &str, cmd: &str) -> Vec<String> {
    vec![
        "run".to_string(),
        "--rm".to_string(),
        "-v".to_string(),
        format!("{workdir}:/workspace"),
        "-w".to_string(),
        "/workspace".to_string(),
        image.to_string(),
        "sh".to_string(),
        "-lc".to_string(),
        cmd.to_string(),
    ]
}

/// Construit le prompt structuré envoyé à l'agent ACP pour résoudre une tâche de benchmark.
pub fn build_bench_prompt(task: &BenchDatasetTask) -> String {
    let mut sections = vec![format!("Instance : {}", task.instance_id)];

    if let Some(suite) = task.suite.as_deref().filter(|s| !s.trim().is_empty()) {
        sections.push(format!("Suite : {}", suite.trim()));
    }
    if let Some(repo) = task.repo.as_deref().filter(|s| !s.trim().is_empty()) {
        sections.push(format!("Dépôt : {}", repo.trim()));
    }
    if let Some(commit) = task.base_commit.as_deref().filter(|s| !s.trim().is_empty()) {
        sections.push(format!("Commit de base : {}", commit.trim()));
    }

    sections.push(String::new());
    sections.push("Énoncé du problème :".to_string());
    sections.push(task.problem_statement.trim().to_string());

    if let Some(test_cmd) = task.test_cmd.as_deref().filter(|s| !s.trim().is_empty()) {
        sections.push(String::new());
        sections.push(format!("Commande de vérification / tests : `{}`", test_cmd.trim()));
    }

    sections.push(String::new());
    sections.push(
        "Consigne : applique un correctif propre et minimal dans le dépôt, sans modifier de fichiers hors périmètre, afin que la suite de tests passe."
            .to_string(),
    );

    sections.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_array_dataset_with_aliases() {
        let json = r#"[
            {
                "instance_id": "django__django-16408",
                "repo": "django/django",
                "base_commit": "abc1234",
                "problem_statement": "Fix FilteredRelation select_related bug",
                "docker_image": "swebench/sweb.eval.x86_64.django_1776_django-16408:latest",
                "test_cmd": "pytest -q tests/known_related_objects",
                "suite": "swe-bench"
            },
            {
                "id": "terminal-bench/git-bisect",
                "instruction": "Find the regressing commit and cherry-pick the fix",
                "test_cmd": "bash verify.sh",
                "suite": "terminal-bench"
            }
        ]"#;

        let tasks = parse_bench_dataset(json).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].instance_id, "django__django-16408");
        assert_eq!(tasks[0].repo.as_deref(), Some("django/django"));
        assert_eq!(tasks[0].base_commit.as_deref(), Some("abc1234"));
        assert_eq!(
            tasks[0].docker_image.as_deref(),
            Some("swebench/sweb.eval.x86_64.django_1776_django-16408:latest")
        );
        assert_eq!(tasks[1].instance_id, "terminal-bench/git-bisect");
        assert_eq!(
            tasks[1].problem_statement,
            "Find the regressing commit and cherry-pick the fix"
        );
        assert_eq!(tasks[1].repo, None);
    }

    #[test]
    fn parses_jsonl_dataset_ignoring_blank_lines_and_supporting_prompt_alias() {
        let jsonl = "\n\
            {\"id\":\"tb-1\",\"prompt\":\"Fix Makefile target\",\"test_cmd\":\"make test\"}\n\
            \n\
            {\"instance_id\":\"swe-2\",\"repo\":\"astropy/astropy\",\"problem_statement\":\"Propagate mask\"}\n\
               \n";

        let tasks = parse_bench_dataset(jsonl).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].instance_id, "tb-1");
        assert_eq!(tasks[0].problem_statement, "Fix Makefile target");
        assert_eq!(tasks[1].instance_id, "swe-2");
        assert_eq!(tasks[1].repo.as_deref(), Some("astropy/astropy"));

        assert!(parse_bench_dataset("   \n\t  ").unwrap().is_empty());
        assert!(parse_bench_dataset("{\"broken\":").is_err());
    }

    #[test]
    fn formats_predictions_as_standard_swebench_jsonl() {
        let preds = vec![
            BenchPrediction {
                instance_id: "django__django-16408".into(),
                model_name_or_path: "kana/claude".into(),
                model_patch: "diff --git a/a.py b/a.py\n".into(),
                resolved: true,
                duration_ms: 1240,
                test_exit_code: Some(0),
                error: None,
            },
            BenchPrediction {
                instance_id: "tb-1".into(),
                model_name_or_path: "kana/codex".into(),
                model_patch: String::new(),
                resolved: false,
                duration_ms: 510,
                test_exit_code: Some(1),
                error: Some("test failed".into()),
            },
        ];

        let out = format_predictions_jsonl(&preds);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), 2);
        let first: BenchPrediction = serde_json::from_str(lines[0]).unwrap();
        let second: BenchPrediction = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first, preds[0]);
        assert_eq!(second, preds[1]);
        assert_eq!(format_predictions_jsonl(&[]), "");
    }

    #[test]
    fn builds_docker_bench_args_cleanly() {
        let args = build_docker_bench_args(
            "swebench/sweb.eval.x86_64.django_1776_django-16408:latest",
            "/tmp/repo-django",
            "pytest -q",
        );
        assert_eq!(
            args,
            vec![
                "run",
                "--rm",
                "-v",
                "/tmp/repo-django:/workspace",
                "-w",
                "/workspace",
                "swebench/sweb.eval.x86_64.django_1776_django-16408:latest",
                "sh",
                "-lc",
                "pytest -q",
            ]
        );
    }

    #[test]
    fn builds_structured_bench_prompt() {
        let task = BenchDatasetTask {
            instance_id: "django__django-16408".into(),
            repo: Some("django/django".into()),
            base_commit: Some("deadbeef".into()),
            problem_statement: "FilteredRelation fails with multi-level select_related.".into(),
            docker_image: None,
            test_cmd: Some("pytest -q".into()),
            suite: Some("swe-bench".into()),
        };

        let prompt = build_bench_prompt(&task);
        assert!(prompt.contains("Instance : django__django-16408"));
        assert!(prompt.contains("Dépôt : django/django"));
        assert!(prompt.contains("Commit de base : deadbeef"));
        assert!(prompt.contains("FilteredRelation fails with multi-level select_related."));
        assert!(prompt.contains("`pytest -q`"));
        assert!(prompt.contains("correctif propre et minimal"));
    }
}
