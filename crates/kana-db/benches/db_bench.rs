//! Micro-benchmark autonome de `kana-db` : insertion en masse et requêtes plein texte SQLite FTS5
//! (`Store::search_messages`) sur un corpus de milliers de messages.

use std::time::Instant;

use kana_db::{Store, StoredConversation, StoredMessage};
use serde_json::json;

fn make_conversation(id: &str) -> StoredConversation {
    StoredConversation {
        id: id.into(),
        title: format!("Session {id}"),
        project: "kana".into(),
        agent_id: "claude".into(),
        pinned: false,
        unread: false,
        archived: false,
        opened_at: Some(1_700_000_000),
        worktree: None,
        branch: Some("main".into()),
        forked_from: None,
        fork_context: None,
        project_path: Some("/Users/dev/kana".into()),
        use_worktree: true,
        model_id: Some("claude-opus-4-7".into()),
        extra_folders: None,
        acp_session_id: Some(format!("acp-{id}")),
        environment: None,
        parent_id: None,
        role_label: None,
    }
}

fn main() {
    let store = Store::open_in_memory().expect("base SQLite en mémoire");
    let conv_count = 10usize;
    let msgs_per_conv = 500usize;
    let total_messages = conv_count * msgs_per_conv;

    let convs: Vec<StoredConversation> = (0..conv_count)
        .map(|i| make_conversation(&format!("c{i}")))
        .collect();

    let insert_start = Instant::now();
    store.save_conversations(&convs).expect("insertion conversations");
    for (c_idx, conv) in convs.iter().enumerate() {
        let messages: Vec<StoredMessage> = (0..msgs_per_conv)
            .map(|m_idx| StoredMessage {
                id: format!("m-{c_idx}-{m_idx}"),
                role: if m_idx % 2 == 0 { "user".into() } else { "agent".into() },
                text: format!(
                    "Analyse du module kana_acp worktree_{c_idx} itération {m_idx} avec requête FTS5_TOKEN_{}",
                    (c_idx * msgs_per_conv + m_idx) % 97
                ),
                thought: format!("Vérification cross_review_step_{} et sécurité Seatbelt", m_idx % 19),
                tools: json!([{ "id": "t1", "title": "cargo test", "status": "completed" }]),
                started_at: Some(100),
                ended_at: Some(200),
            })
            .collect();
        store
            .save_messages(&conv.id, &messages)
            .expect("insertion messages + FTS5");
    }
    let insert_elapsed = insert_start.elapsed();

    let queries = [
        "FTS5_TOKEN_42",
        "cross_review_step_7",
        "Seatbelt worktree_3",
        "kana_acp itération",
        "FTS5_TOKEN_13",
    ];
    let query_rounds = 100usize;
    let total_queries = queries.len() * query_rounds;

    let search_start = Instant::now();
    let mut total_hits = 0usize;
    for _ in 0..query_rounds {
        for q in queries {
            let hits = store.search_messages(q, 20).expect("recherche FTS5");
            total_hits += hits.len();
        }
    }
    let search_elapsed = search_start.elapsed();
    let us_per_query = search_elapsed.as_micros() as f64 / total_queries as f64;
    let queries_per_sec = (total_queries as f64 / search_elapsed.as_secs_f64()).round() as u64;

    assert!(total_hits > 0);
    println!(
        "kana-db FTS5 bench: indexed {total_messages} messages in {:.2?}; {total_queries} FTS5 queries in {:.2?} -> {:.1} µs/query ({queries_per_sec} queries/sec, {total_hits} hits)",
        insert_elapsed, search_elapsed, us_per_query
    );
}
