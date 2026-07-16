use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

mod migrations;
use migrations::run_migrations;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

pub fn db_path() -> PathBuf {
    let base = dirs::data_dir().expect("data dir");
    let dir = base.join("WorkHunter");
    std::fs::create_dir_all(&dir).ok();
    dir.join("workhunter.db")
}

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open(db_path())?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_sub TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            oauth_tokens_encrypted TEXT,
            setup_completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_login_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS role_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            doc_type TEXT NOT NULL CHECK(doc_type IN ('resume', 'letter')),
            content_md TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(role_id, doc_type)
        );

        CREATE TABLE IF NOT EXISTS role_document_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            doc_type TEXT NOT NULL CHECK(doc_type IN ('resume', 'letter')),
            name TEXT NOT NULL,
            format TEXT NOT NULL CHECK(format IN ('markdown', 'docx', 'pdf')),
            content_md TEXT NOT NULL DEFAULT '',
            file_blob BLOB,
            file_name TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS search_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            filters_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS job_ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            af_ad_id TEXT NOT NULL,
            headline TEXT NOT NULL,
            employer_name TEXT,
            location TEXT,
            publication_date TEXT,
            application_email TEXT,
            application_url TEXT,
            contact_name TEXT,
            raw_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            UNIQUE(profile_id, af_ad_id)
        );

        CREATE TABLE IF NOT EXISTS ad_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            job_ad_id INTEGER NOT NULL REFERENCES job_ads(id) ON DELETE CASCADE,
            role_id INTEGER NOT NULL REFERENCES roles(id),
            status TEXT NOT NULL CHECK(status IN ('rejected', 'in_progress', 'approved', 'sent')),
            decided_at TEXT NOT NULL,
            resume_version_id INTEGER,
            letter_version_id INTEGER,
            tailor_resume INTEGER NOT NULL DEFAULT 0,
            tailor_letter INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            ad_decision_id INTEGER NOT NULL REFERENCES ad_decisions(id) ON DELETE CASCADE,
            tailored_resume_md TEXT NOT NULL DEFAULT '',
            tailored_letter_md TEXT NOT NULL DEFAULT '',
            email_subject TEXT,
            email_body TEXT,
            email_to TEXT,
            email_cc TEXT,
            email_bcc TEXT,
            gmail_draft_id TEXT,
            approved_at TEXT,
            sent_at TEXT,
            created_at TEXT NOT NULL,
            resume_format TEXT,
            letter_format TEXT,
            resume_file_name TEXT,
            letter_file_name TEXT,
            resume_file_blob BLOB,
            letter_file_blob BLOB
        );

        CREATE TABLE IF NOT EXISTS profile_settings (
            profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (profile_id, key)
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS applications_fts USING fts5(
            headline,
            employer_name,
            contact_name,
            email_to,
            location,
            email_body
        );
        "#,
    )?;

    // Triggers for FTS — recreated on startup so fixes apply to existing databases
    conn.execute_batch(
        r#"
        DROP TRIGGER IF EXISTS applications_ai;
        DROP TRIGGER IF EXISTS applications_ad;

        CREATE TRIGGER applications_ai AFTER INSERT ON applications BEGIN
            INSERT INTO applications_fts(rowid, headline, employer_name, contact_name, email_to, location, email_body)
            SELECT NEW.id, j.headline, j.employer_name, j.contact_name, NEW.email_to, j.location, NEW.email_body
            FROM job_ads j
            JOIN ad_decisions d ON d.job_ad_id = j.id
            WHERE d.id = NEW.ad_decision_id;
        END;

        CREATE TRIGGER applications_ad AFTER DELETE ON applications BEGIN
            DELETE FROM applications_fts WHERE rowid = OLD.id;
        END;
        "#,
    )
    .ok();

    run_migrations(&conn)?;

    Ok(conn)
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn active_profile_id(conn: &Connection) -> Result<Option<i64>> {
    let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = 'active_profile_id'")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let v: String = row.get(0)?;
        return Ok(v.parse().ok());
    }
    Ok(None)
}

pub fn set_active_profile_id(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES ('active_profile_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [id.to_string()],
    )?;
    Ok(())
}

pub fn clear_active_profile(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM app_state WHERE key = 'active_profile_id'", [])?;
    Ok(())
}
