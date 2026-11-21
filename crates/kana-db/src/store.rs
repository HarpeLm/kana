use std::{
    collections::{BTreeMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, params};

use crate::{StoredConversation, StoredMessage, StoredMessageHit, StoredProject};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("base de données : {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("données illisibles : {0}")]
    Json(#[from] serde_json::Error),
    #[error("la base est verrouillée")]
    Poisoned,
    #[error("impossible de créer le dossier de la base : {0}")]
    Io(#[from] std::io::Error),
}

const SCHEMA: &str = "
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    project TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    unread INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    opened_at INTEGER,
    worktree TEXT,
    branch TEXT,
    forked_from TEXT,
    fork_context TEXT
);
CREATE TABLE IF NOT EXISTS projects (
    path TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    last_used INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    thought TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT 'null',
    started_at INTEGER,
    ended_at INTEGER,
    PRIMARY KEY (conversation_id, position)
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    conversation_id UNINDEXED,
    message_id UNINDEXED,
    role UNINDEXED,
    text,
    thought
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
);
";

/// La base de Kana. Une seule connexion, protégée par un verrou : les accès sont courts.
pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    /// Ouvre (ou crée) la base à cet emplacement.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::from_connection(Connection::open(path)?)
    }

    /// Base en mémoire, pour les tests.
    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> Result<Self, StoreError> {
        conn.execute_batch(SCHEMA)?;
        // Colonnes ajoutées après la première version de la base : ignorées si elles existent déjà.
        for column in [
            "project_path TEXT",
            "use_worktree INTEGER NOT NULL DEFAULT 1",
            "model_id TEXT",
            "extra_folders TEXT",
            "acp_session_id TEXT",
            "environment TEXT",
            "parent_id TEXT",
            "role_label TEXT",
        ] {
            let _ = conn.execute(&format!("ALTER TABLE conversations ADD COLUMN {column}"), []);
        }
        let has_messages: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM messages)", [], |row| row.get(0))
            .unwrap_or(false);
        let has_fts: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM messages_fts)", [], |row| row.get(0))
            .unwrap_or(false);
        if has_messages && !has_fts {
            conn.execute(
                "INSERT INTO messages_fts (conversation_id, message_id, role, text, thought)
                 SELECT conversation_id, id, role, text, thought FROM messages",
                [],
            )?;
        }
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, StoreError> {
        self.conn.lock().map_err(|_| StoreError::Poisoned)
    }

    /// Les conversations, dans l'ordre où elles ont été enregistrées.
    pub fn conversations(&self) -> Result<Vec<StoredConversation>, StoreError> {
        let conn = self.lock()?;
        let mut statement = conn.prepare(
            "SELECT id, title, project, agent_id, pinned, unread, archived, opened_at,
                    worktree, branch, forked_from, fork_context, project_path, use_worktree, model_id, extra_folders,
                    acp_session_id, environment, parent_id, role_label
             FROM conversations ORDER BY position",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(StoredConversation {
                id: row.get(0)?,
                title: row.get(1)?,
                project: row.get(2)?,
                agent_id: row.get(3)?,
                pinned: row.get(4)?,
                unread: row.get(5)?,
                archived: row.get(6)?,
                opened_at: row.get(7)?,
                worktree: row.get(8)?,
                branch: row.get(9)?,
                forked_from: row.get(10)?,
                fork_context: row.get(11)?,
                project_path: row.get(12)?,
                use_worktree: row.get(13)?,
                model_id: row.get(14)?,
                extra_folders: row.get(15)?,
                acp_session_id: row.get(16)?,
                environment: row.get(17)?,
                parent_id: row.get(18)?,
                role_label: row.get(19)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Remplace la liste des conversations : les nouvelles sont ajoutées, les autres mises à jour,
    /// et celles qui ont disparu de la liste sont supprimées avec leurs messages.
    pub fn save_conversations(&self, items: &[StoredConversation]) -> Result<(), StoreError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        {
            let mut upsert = tx.prepare(
                "INSERT INTO conversations
                    (id, position, title, project, agent_id, pinned, unread, archived, opened_at,
                     worktree, branch, forked_from, fork_context, project_path, use_worktree, model_id, extra_folders,
                     acp_session_id, environment, parent_id, role_label)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
                 ON CONFLICT(id) DO UPDATE SET
                    position = excluded.position, title = excluded.title, project = excluded.project,
                    agent_id = excluded.agent_id, pinned = excluded.pinned, unread = excluded.unread,
                    archived = excluded.archived, opened_at = excluded.opened_at,
                    worktree = excluded.worktree, branch = excluded.branch,
                    forked_from = excluded.forked_from, fork_context = excluded.fork_context,
                    project_path = excluded.project_path, use_worktree = excluded.use_worktree,
                    model_id = excluded.model_id, extra_folders = excluded.extra_folders,
                    acp_session_id = excluded.acp_session_id, environment = excluded.environment,
                    parent_id = excluded.parent_id, role_label = excluded.role_label",
            )?;
            for (position, c) in items.iter().enumerate() {
                upsert.execute(params![
                    c.id, position as i64, c.title, c.project, c.agent_id, c.pinned, c.unread,
                    c.archived, c.opened_at, c.worktree, c.branch, c.forked_from, c.fork_context,
                    c.project_path, c.use_worktree, c.model_id, c.extra_folders, c.acp_session_id,
                    c.environment, c.parent_id, c.role_label,
                ])?;
            }
        }
        // Les conversations absentes de la liste sont supprimées.
        let keep: Vec<&str> = items.iter().map(|c| c.id.as_str()).collect();
        let existing: Vec<String> = {
            let mut statement = tx.prepare("SELECT id FROM conversations")?;
            statement.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?
        };
        for id in existing.iter().filter(|id| !keep.contains(&id.as_str())) {
            tx.execute("DELETE FROM messages_fts WHERE conversation_id = ?1", params![id])?;
            tx.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Les projets connus, dans l'ordre où ils ont été enregistrés.
    pub fn projects(&self) -> Result<Vec<StoredProject>, StoreError> {
        let conn = self.lock()?;
        let mut statement = conn.prepare("SELECT name, path, last_used FROM projects ORDER BY position")?;
        let rows = statement.query_map([], |row| {
            Ok(StoredProject { name: row.get(0)?, path: row.get(1)?, last_used: row.get(2)? })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Remplace la liste des projets.
    pub fn save_projects(&self, items: &[StoredProject]) -> Result<(), StoreError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM projects", [])?;
        {
            let mut insert =
                tx.prepare("INSERT OR REPLACE INTO projects (path, position, name, last_used) VALUES (?1, ?2, ?3, ?4)")?;
            for (position, p) in items.iter().enumerate() {
                insert.execute(params![p.path, position as i64, p.name, p.last_used])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Les messages d'une conversation, dans l'ordre.
    pub fn messages(&self, conversation_id: &str) -> Result<Vec<StoredMessage>, StoreError> {
        let conn = self.lock()?;
        let mut statement = conn.prepare(
            "SELECT id, role, text, thought, tools, started_at, ended_at
             FROM messages WHERE conversation_id = ?1 ORDER BY position",
        )?;
        let rows = statement.query_map(params![conversation_id], |row| {
            let tools: String = row.get(4)?;
            Ok(StoredMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                text: row.get(2)?,
                thought: row.get(3)?,
                tools: serde_json::from_str(&tools).unwrap_or(serde_json::Value::Null),
                started_at: row.get(5)?,
                ended_at: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Remplace tous les messages d'une conversation. Sans effet si la conversation n'existe pas.
    pub fn save_messages(&self, conversation_id: &str, messages: &[StoredMessage]) -> Result<(), StoreError> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let known: bool = tx
            .query_row("SELECT 1 FROM conversations WHERE id = ?1", params![conversation_id], |_| Ok(true))
            .unwrap_or(false);
        if !known {
            return Ok(());
        }
        tx.execute("DELETE FROM messages WHERE conversation_id = ?1", params![conversation_id])?;
        tx.execute("DELETE FROM messages_fts WHERE conversation_id = ?1", params![conversation_id])?;
        {
            let mut insert = tx.prepare(
                "INSERT INTO messages
                    (conversation_id, position, id, role, text, thought, tools, started_at, ended_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            let mut insert_fts = tx.prepare(
                "INSERT INTO messages_fts (conversation_id, message_id, role, text, thought)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (position, m) in messages.iter().enumerate() {
                insert.execute(params![
                    conversation_id, position as i64, m.id, m.role, m.text, m.thought,
                    serde_json::to_string(&m.tools)?, m.started_at, m.ended_at,
                ])?;
                insert_fts.execute(params![conversation_id, m.id, m.role, m.text, m.thought])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Recherche plein texte dans les messages enregistrés (index FTS5 puis repli `LIKE`).
    pub fn search_messages(&self, query: &str, limit: usize) -> Result<Vec<StoredMessageHit>, StoreError> {
        let trimmed = query.trim();
        if trimmed.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }
        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.lock()?;
        let mut hits = Vec::new();
        let mut seen: HashSet<(String, String)> = HashSet::new();

        // Échappe chaque terme entre guillemets FTS5 avec préfixe `*` pour éviter toute erreur de syntaxe
        // sur les caractères spéciaux (`:`, `-`, `/`, `OR`, `AND`, etc.).
        let fts_tokens: Vec<String> = tokens
            .iter()
            .filter(|t| t.chars().any(|c| c.is_alphanumeric()))
            .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
            .collect();

        if !fts_tokens.is_empty() {
            let match_expr = fts_tokens.join(" ");
            if let Ok(mut stmt) = conn.prepare(
                "SELECT f.conversation_id, f.message_id, f.role,
                        snippet(messages_fts, -1, '', '', '…', 18)
                 FROM messages_fts AS f
                 JOIN conversations AS c ON c.id = f.conversation_id
                 WHERE messages_fts MATCH ?1
                 ORDER BY bm25(messages_fts)
                 LIMIT ?2",
            )
                && let Ok(rows) = stmt.query_map(params![match_expr, limit as i64], |row| {
                    Ok(StoredMessageHit {
                        conversation_id: row.get(0)?,
                        message_id: row.get(1)?,
                        role: row.get(2)?,
                        snippet: row.get(3)?,
                    })
                })
            {
                for hit in rows.flatten() {
                    let key = (hit.conversation_id.clone(), hit.message_id.clone());
                    if seen.insert(key) {
                        hits.push(hit);
                    }
                }
            }
        }

        if hits.len() < limit {
            let remaining = limit - hits.len();
            let like_pattern = format!("%{}%", escape_like(&trimmed.to_lowercase()));
            let mut stmt = conn.prepare(
                "SELECT m.conversation_id, m.id, m.role, m.text, m.thought
                 FROM messages AS m
                 JOIN conversations AS c ON c.id = m.conversation_id
                 WHERE LOWER(m.text) LIKE ?1 ESCAPE '\\' OR LOWER(m.thought) LIKE ?1 ESCAPE '\\'
                 ORDER BY COALESCE(c.opened_at, 0) DESC, m.position DESC
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![like_pattern, (remaining + hits.len()) as i64], |row| {
                let text: String = row.get(3)?;
                let thought: String = row.get(4)?;
                Ok(StoredMessageHit {
                    conversation_id: row.get(0)?,
                    message_id: row.get(1)?,
                    role: row.get(2)?,
                    snippet: make_snippet(&text, &thought, trimmed),
                })
            })?;
            for hit in rows.flatten() {
                if hits.len() >= limit {
                    break;
                }
                let key = (hit.conversation_id.clone(), hit.message_id.clone());
                if seen.insert(key) {
                    hits.push(hit);
                }
            }
        }

        Ok(hits)
    }

    /// Lit un réglage persistant par sa clé.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, StoreError> {
        let conn = self.lock()?;
        let value = conn
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
            .optional()?;
        Ok(value)
    }

    /// Enregistre ou met à jour un réglage persistant.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), StoreError> {
        let conn = self.lock()?;
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at",
            params![key, value, now_ms],
        )?;
        Ok(())
    }

    /// Retourne l'ensemble des réglages persistants triés par clé.
    pub fn all_settings(&self) -> Result<BTreeMap<String, String>, StoreError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut out = BTreeMap::new();
        for row in rows {
            let (k, v) = row?;
            out.insert(k, v);
        }
        Ok(out)
    }

    /// Supprime un réglage persistant par sa clé.
    pub fn delete_setting(&self, key: &str) -> Result<(), StoreError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }
}

/// Chemin du fichier miroir partagé entre l'App Desktop et la CLI (`~/.kana/config.json`).
pub fn shared_config_path(home: &Path) -> PathBuf {
    home.join(".kana").join("config.json")
}

/// Écrit de manière atomique (`tmp` + `rename`) les réglages partagés au format JSON.
pub fn write_shared_config(path: &Path, settings: &BTreeMap<String, String>) -> Result<(), StoreError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let payload = serde_json::to_string_pretty(settings)?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("config.json");
    let tmp_path = path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
    std::fs::write(&tmp_path, payload)?;
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

/// Lit le fichier miroir partagé (`~/.kana/config.json`). Retourne une map vide si absent ou illisible.
pub fn read_shared_config(path: &Path) -> BTreeMap<String, String> {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, String>>(&raw).unwrap_or_default()
}

fn escape_like(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn make_snippet(text: &str, thought: &str, query: &str) -> String {
    let source = if text.to_lowercase().contains(&query.to_lowercase()) || thought.trim().is_empty() {
        text
    } else {
        thought
    };
    let clean = source.split_whitespace().collect::<Vec<_>>().join(" ");
    if clean.chars().count() <= 140 {
        return clean;
    }
    let lower_clean = clean.to_lowercase();
    let needle = query.to_lowercase();
    if let Some(byte_pos) = lower_clean.find(&needle) {
        let char_pos = lower_clean[..byte_pos].chars().count();
        let start = char_pos.saturating_sub(40);
        let chars: Vec<char> = clean.chars().collect();
        let end = (start + 120).min(chars.len());
        let slice: String = chars[start..end].iter().collect();
        let prefix = if start > 0 { "…" } else { "" };
        let suffix = if end < chars.len() { "…" } else { "" };
        return format!("{prefix}{slice}{suffix}");
    }
    let slice: String = clean.chars().take(120).collect();
    format!("{slice}…")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn conversation(id: &str) -> StoredConversation {
        StoredConversation {
            id: id.into(),
            title: format!("titre {id}"),
            project: "kana".into(),
            agent_id: "opencode".into(),
            pinned: false,
            unread: false,
            archived: false,
            opened_at: Some(5),
            worktree: None,
            branch: None,
            forked_from: None,
            fork_context: None,
            project_path: Some("/a/kana".into()),
            use_worktree: true,
            model_id: Some("m".into()),
            extra_folders: Some("[\"/b\"]".into()),
            acp_session_id: None,
            environment: None,
            parent_id: None,
            role_label: None,
        }
    }

    fn message(id: &str, text: &str) -> StoredMessage {
        StoredMessage {
            id: id.into(),
            role: "agent".into(),
            text: text.into(),
            thought: "réflexion".into(),
            tools: json!([{ "id": "t1", "title": "execute", "status": "completed" }]),
            started_at: Some(1),
            ended_at: Some(2),
        }
    }

    #[test]
    fn conversations_keep_their_order_and_fields() {
        let store = Store::open_in_memory().unwrap();
        let mut first = conversation("a");
        first.worktree = Some("/tmp/wt".into());
        first.forked_from = Some("z".into());
        first.acp_session_id = Some("sess-1".into());
        let second = conversation("b");
        store.save_conversations(&[second.clone(), first.clone()]).unwrap();
        assert_eq!(store.conversations().unwrap(), vec![second, first]);
    }

    #[test]
    fn removed_conversations_take_their_messages_along() {
        let store = Store::open_in_memory().unwrap();
        store.save_conversations(&[conversation("a"), conversation("b")]).unwrap();
        store.save_messages("a", &[message("m1", "salut")]).unwrap();
        store.save_conversations(&[conversation("b")]).unwrap();
        assert!(store.messages("a").unwrap().is_empty());
        assert_eq!(store.conversations().unwrap().len(), 1);
    }

    #[test]
    fn messages_round_trip_with_their_tools() {
        let store = Store::open_in_memory().unwrap();
        store.save_conversations(&[conversation("a")]).unwrap();
        let messages = vec![message("m1", "un"), message("m2", "deux")];
        store.save_messages("a", &messages).unwrap();
        assert_eq!(store.messages("a").unwrap(), messages);
        // Une seconde sauvegarde remplace la première.
        store.save_messages("a", &messages[..1]).unwrap();
        assert_eq!(store.messages("a").unwrap().len(), 1);
    }

    #[test]
    fn an_older_database_gets_the_new_columns() {
        let path = std::env::temp_dir().join(format!("kana-old-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let old = Connection::open(&path).unwrap();
            old.execute_batch(
                "CREATE TABLE conversations (
                    id TEXT PRIMARY KEY, position INTEGER NOT NULL, title TEXT NOT NULL,
                    project TEXT NOT NULL, agent_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                    unread INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
                    opened_at INTEGER, worktree TEXT, branch TEXT, forked_from TEXT, fork_context TEXT);
                 INSERT INTO conversations (id, position, title, project, agent_id) VALUES ('a', 0, 't', 'p', 'x');",
            )
            .unwrap();
        }
        let store = Store::open(&path).unwrap();
        let items = store.conversations().unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].use_worktree);
        assert_eq!(items[0].project_path, None);
        assert_eq!(items[0].acp_session_id, None);
    }

    #[test]
    fn projects_round_trip_in_order() {
        let store = Store::open_in_memory().unwrap();
        let items = vec![
            StoredProject { name: "kana".into(), path: "/a/kana".into(), last_used: Some(3) },
            StoredProject { name: "autre".into(), path: "/a/autre".into(), last_used: None },
        ];
        store.save_projects(&items).unwrap();
        assert_eq!(store.projects().unwrap(), items);
        store.save_projects(&items[..1]).unwrap();
        assert_eq!(store.projects().unwrap().len(), 1);
    }

    #[test]
    fn saving_messages_of_an_unknown_conversation_is_ignored() {
        let store = Store::open_in_memory().unwrap();
        store.save_messages("nope", &[message("m1", "x")]).unwrap();
        assert!(store.messages("nope").unwrap().is_empty());
    }

    #[test]
    fn fts5_searches_text_and_thought_escapes_tokens_and_syncs_deletes() {
        let store = Store::open_in_memory().unwrap();
        store.save_conversations(&[conversation("a"), conversation("b")]).unwrap();
        store
            .save_messages(
                "a",
                &[
                    StoredMessage {
                        id: "m1".into(),
                        role: "user".into(),
                        text: "Migration PostgreSQL vers SQLite FTS5".into(),
                        thought: String::new(),
                        tools: json!([]),
                        started_at: Some(1),
                        ended_at: Some(2),
                    },
                    StoredMessage {
                        id: "m2".into(),
                        role: "agent".into(),
                        text: "Tout est prêt.".into(),
                        thought: "Vérifier l'indexation fulltext_custom_token".into(),
                        tools: json!([]),
                        started_at: Some(3),
                        ended_at: Some(4),
                    },
                ],
            )
            .unwrap();
        store
            .save_messages("b", &[message("m3", "Analyse OAuth2 et foo:bar")])
            .unwrap();

        let hits = store.search_messages("PostgreSQL", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].conversation_id, "a");
        assert_eq!(hits[0].message_id, "m1");
        assert!(hits[0].snippet.contains("PostgreSQL"));

        // Recherche dans `thought` et préfixe FTS5
        let thought_hits = store.search_messages("fulltext", 10).unwrap();
        assert_eq!(thought_hits.len(), 1);
        assert_eq!(thought_hits[0].message_id, "m2");

        // Repli LIKE pour sous-chaîne au milieu d'un mot
        let like_hits = store.search_messages("custom_tok", 10).unwrap();
        assert_eq!(like_hits.len(), 1);
        assert_eq!(like_hits[0].message_id, "m2");

        // Échappement des opérateurs et ponctuations FTS5 sans erreur SQL
        let escaped_hits = store.search_messages("foo:bar OR \"test\"", 10).unwrap();
        assert!(escaped_hits.is_empty());
        let colon_hits = store.search_messages("foo:bar", 10).unwrap();
        assert_eq!(colon_hits.len(), 1);
        assert_eq!(colon_hits[0].conversation_id, "b");

        // Suppression de la conversation "a" retire ses entrées de messages_fts
        store.save_conversations(&[conversation("b")]).unwrap();
        assert!(store.search_messages("PostgreSQL", 10).unwrap().is_empty());
        assert!(store.search_messages("   ", 10).unwrap().is_empty());
    }

    #[test]
    fn backfills_fts5_index_on_startup_for_existing_messages() {
        let path = std::env::temp_dir().join(format!("kana-fts-backfill-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE conversations (
                    id TEXT PRIMARY KEY, position INTEGER NOT NULL, title TEXT NOT NULL,
                    project TEXT NOT NULL, agent_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                    unread INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
                    opened_at INTEGER, worktree TEXT, branch TEXT, forked_from TEXT, fork_context TEXT);
                 CREATE TABLE messages (
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL, id TEXT NOT NULL, role TEXT NOT NULL,
                    text TEXT NOT NULL, thought TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT 'null',
                    started_at INTEGER, ended_at INTEGER, PRIMARY KEY (conversation_id, position));
                 INSERT INTO conversations (id, position, title, project, agent_id) VALUES ('c1', 0, 't', 'p', 'claude');
                 INSERT INTO messages (conversation_id, position, id, role, text, thought) VALUES ('c1', 0, 'm1', 'agent', 'Indice historique indexé', '');",
            )
            .unwrap();
        }
        let store = Store::open(&path).unwrap();
        let hits = store.search_messages("historique", 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].conversation_id, "c1");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn fts5_bulk_corpus_query_latency_stays_within_budget() {
        let store = Store::open_in_memory().unwrap();
        store.save_conversations(&[conversation("bulk")]).unwrap();
        let messages: Vec<StoredMessage> = (0..1_200)
            .map(|i| StoredMessage {
                id: format!("m-{i}"),
                role: "agent".into(),
                text: format!("Message indexé numéro {i} avec jeton_perf_{}", i % 53),
                thought: format!("Réflexion architecture lot4_{}", i % 17),
                tools: json!([]),
                started_at: Some(1),
                ended_at: Some(2),
            })
            .collect();
        store.save_messages("bulk", &messages).unwrap();

        let start = std::time::Instant::now();
        let mut total_hits = 0usize;
        for i in 0..50 {
            let q = format!("jeton_perf_{}", i % 53);
            let hits = store.search_messages(&q, 15).unwrap();
            total_hits += hits.len();
        }
        let elapsed = start.elapsed();
        assert!(total_hits >= 50);
        assert!(
            elapsed < std::time::Duration::from_millis(750),
            "50 requêtes FTS5 sur 1 200 messages ont dépassé le budget : {elapsed:?}"
        );
    }

    #[test]
    fn settings_crud_and_shared_config_round_trip() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_setting("kana-locale").unwrap(), None);
        assert!(store.all_settings().unwrap().is_empty());

        store.set_setting("kana-locale", "en").unwrap();
        store.set_setting("kana-permission-mode", "auto").unwrap();
        assert_eq!(store.get_setting("kana-locale").unwrap().as_deref(), Some("en"));

        // Mise à jour d'une clé existante
        store.set_setting("kana-locale", "fr").unwrap();
        assert_eq!(store.get_setting("kana-locale").unwrap().as_deref(), Some("fr"));

        let all = store.all_settings().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.get("kana-locale").map(String::as_str), Some("fr"));
        assert_eq!(all.get("kana-permission-mode").map(String::as_str), Some("auto"));

        // Miroir atomique `~/.kana/config.json`
        let tmp_home = std::env::temp_dir().join(format!("kana-shared-cfg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp_home);
        let cfg_path = shared_config_path(&tmp_home);
        assert_eq!(cfg_path, tmp_home.join(".kana").join("config.json"));
        assert!(read_shared_config(&cfg_path).is_empty());

        write_shared_config(&cfg_path, &all).unwrap();
        let reloaded = read_shared_config(&cfg_path);
        assert_eq!(reloaded, all);

        // Suppression d'une clé dans SQLite
        store.delete_setting("kana-locale").unwrap();
        assert_eq!(store.get_setting("kana-locale").unwrap(), None);
        assert_eq!(store.all_settings().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&tmp_home);
    }
}
