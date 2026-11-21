//! Micro-benchmark autonome de `kana-acp` : débit de parsing JSON-RPC et décodage `AcpEvent`
//! (`agent_message_chunk`, `tool_call`, `available_commands_update`, `usage`).

use std::time::Instant;

use kana_acp::AcpEvent;
use serde_json::Value;

const RAW_FRAMES: &[&str] = &[
    r#"{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Voici le correctif complet sur le module de relais ACP avec gestion du fallback."}}"#,
    r#"{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"Vérifions les invariants de concurrence sur les 10 worktrees."}}"#,
    r#"{"sessionUpdate":"tool_call","toolCallId":"tc-42","title":"cargo test --workspace","status":"in_progress","rawInput":{"command":"cargo test --workspace"}}"#,
    r#"{"sessionUpdate":"tool_call_update","toolCallId":"tc-42","status":"completed","rawOutput":{"output":"test result: ok. 128 passed; 0 failed"}}"#,
    r#"{"sessionUpdate":"available_commands_update","availableCommands":[{"name":"/advisor","description":"Conseiller multi-fournisseurs","input":{"hint":"tâche"}},{"name":"/rewind","description":"Restaurer un tour"}]}"#,
    r#"{"sessionUpdate":"usage_update","used":48200,"size":200000}"#,
];

const RAW_USAGE_RESULT: &str = r#"{"stopReason":"end_turn","usage":{"inputTokens":14200,"outputTokens":1850,"totalTokens":16050,"cacheReadInputTokens":9400,"cacheCreationInputTokens":600}}"#;

fn main() {
    let iterations: u64 = 10_000;
    let total_ops = iterations * (RAW_FRAMES.len() as u64 + 1);

    let start = Instant::now();
    let mut parsed_count = 0u64;
    for _ in 0..iterations {
        for raw in RAW_FRAMES {
            let val: Value = serde_json::from_str(raw).expect("JSON valide");
            if AcpEvent::from_update(&val).is_some() {
                parsed_count += 1;
            }
        }
        let usage_val: Value = serde_json::from_str(RAW_USAGE_RESULT).expect("JSON usage valide");
        if AcpEvent::turn_usage(&usage_val).is_some() {
            parsed_count += 1;
        }
    }
    let elapsed = start.elapsed();
    let ns_per_op = elapsed.as_nanos() as f64 / total_ops as f64;
    let ops_per_sec = (total_ops as f64 / elapsed.as_secs_f64()).round() as u64;

    assert_eq!(parsed_count, total_ops);
    println!(
        "kana-acp JSON-RPC parse bench: {total_ops} ops in {:.2?} -> {:.1} ns/op ({ops_per_sec} ops/sec)",
        elapsed, ns_per_op
    );
}
