//! Micro-benchmark autonome de `kana-git` : `parse_diff` et `parse_diagnostics_output`
//! sur un diff multi-fichiers/multi-hunks volumineux avec mesure en `µs/diff` et `MB/s`.

use std::time::Instant;

use kana_git::{parse_diagnostics_output, parse_diff};

fn build_synthetic_diff(file_count: usize, hunks_per_file: usize) -> String {
    let mut out = String::with_capacity(file_count * hunks_per_file * 320);
    for f in 0..file_count {
        out.push_str(&format!(
            "diff --git a/crates/mod_{f}/src/lib.rs b/crates/mod_{f}/src/lib.rs\nindex 1111111..2222222 100644\n--- a/crates/mod_{f}/src/lib.rs\n+++ b/crates/mod_{f}/src/lib.rs\n"
        ));
        for h in 0..hunks_per_file {
            let base = h * 20 + 1;
            out.push_str(&format!("@@ -{base},6 +{base},8 @@ pub fn handler_{h}() {{\n"));
            out.push_str("     let state = Engine::boot();\n");
            out.push_str("-    let legacy = state.run_old();\n");
            out.push_str("-    println!(\"{legacy}\");\n");
            out.push_str("+    let modern = state.run_verified();\n");
            out.push_str("+    tracing::info!(?modern, \"ok\");\n");
            out.push_str("+    metrics::record(modern.latency_ns);\n");
            out.push_str("+    assert!(modern.is_valid());\n");
            out.push_str("     Ok(())\n");
        }
    }
    out
}

fn build_synthetic_diagnostics(count: usize) -> String {
    let mut out = String::with_capacity(count * 96);
    for i in 0..count {
        if i % 2 == 0 {
            out.push_str(&format!(
                "crates/kana-core/src/mod_{i}.rs:{}:9: error[E0308]: mismatched types in slot {i}\n",
                i + 10
            ));
        } else {
            out.push_str(&format!(
                "apps/desktop/src/view_{i}.tsx({},5): error TS2322: Type 'number' is not assignable in view {i}.\n",
                i + 20
            ));
        }
    }
    out
}

fn main() {
    let diff_payload = build_synthetic_diff(80, 6);
    let diag_payload = build_synthetic_diagnostics(120);
    let bytes_per_iter = diff_payload.len() + diag_payload.len();
    let iterations = 150usize;

    let start = Instant::now();
    let mut total_files = 0usize;
    let mut total_diags = 0usize;
    for _ in 0..iterations {
        let files = parse_diff(&diff_payload);
        let diags = parse_diagnostics_output(&diag_payload, "rustc/tsc");
        total_files += files.len();
        total_diags += diags.len();
    }
    let elapsed = start.elapsed();
    let us_per_diff = elapsed.as_micros() as f64 / iterations as f64;
    let total_mb = (bytes_per_iter * iterations) as f64 / (1024.0 * 1024.0);
    let mb_per_sec = total_mb / elapsed.as_secs_f64();

    assert_eq!(total_files, 80 * iterations);
    assert_eq!(total_diags, 120 * iterations);
    println!(
        "kana-git diff+diagnostics bench: {iterations} runs ({:.2} MB total) in {:.2?} -> {:.1} µs/diff ({:.1} MB/s)",
        total_mb, elapsed, us_per_diff, mb_per_sec
    );
}
