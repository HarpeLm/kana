use std::{path::Path, sync::Mutex};

use rusqlite::{Connection, params};

use crate::{StoredConversation, StoredMessage, StoredProject};

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
        for column in ["project_path TEXT", "use_worktree INTEGER NOT NULL DEFAULT 1"] {
            let _ = conn.execute(&format!("ALTER TABLE conversations ADD COLUMN {column}"), []);
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
                    worktree, branch, forked_from, fork_context, project_path, use_worktree
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
                     worktree, branch, forked_from, fork_context, project_path, use_worktree)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                 ON CONFLICT(id) DO UPDATE SET
                    position = excluded.position, title = excluded.title, project = excluded.project,
                    agent_id = excluded.agent_id, pinned = excluded.pinned, unread = excluded.unread,
                    archived = excluded.archived, opened_at = excluded.opened_at,
                    worktree = excluded.worktree, branch = excluded.branch,
                    forked_from = excluded.forked_from, fork_context = excluded.fork_context,
                    project_path = excluded.project_path, use_worktree = excluded.use_worktree",
            )?;
            for (position, c) in items.iter().enumerate() {
                upsert.execute(params![
                    c.id, position as i64, c.title, c.project, c.agent_id, c.pinned, c.unread,
                    c.archived, c.opened_at, c.worktree, c.branch, c.forked_from, c.fork_context,
                    c.project_path, c.use_worktree,
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
        {
            let mut insert = tx.prepare(
                "INSERT INTO messages
                    (conversation_id, position, id, role, text, thought, tools, started_at, ended_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for (position, m) in messages.iter().enumerate() {
                insert.execute(params![
                    conversation_id, position as i64, m.id, m.role, m.text, m.thought,
                    serde_json::to_string(&m.tools)?, m.started_at, m.ended_at,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
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
}
