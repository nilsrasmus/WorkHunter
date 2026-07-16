use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 2 {
        migrate_to_v2(conn)?;
        conn.pragma_update(None, "user_version", 2)?;
    }

    if version < 3 {
        migrate_to_v3(conn)?;
        conn.pragma_update(None, "user_version", 3)?;
    }

    if version < 4 {
        migrate_to_v4(conn)?;
        conn.pragma_update(None, "user_version", 4)?;
    }

    Ok(())
}

fn migrate_to_v2(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
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

        INSERT INTO role_document_versions (role_id, doc_type, name, format, content_md, is_default, created_at, updated_at)
        SELECT role_id, doc_type, 'Default', 'markdown', content_md, 1, updated_at, updated_at
        FROM role_documents
        WHERE NOT EXISTS (SELECT 1 FROM role_document_versions LIMIT 1);
        "#,
    )?;

    add_column_if_missing(conn, "ad_decisions", "resume_version_id", "INTEGER")?;
    add_column_if_missing(conn, "ad_decisions", "letter_version_id", "INTEGER")?;
    add_column_if_missing(conn, "ad_decisions", "tailor_resume", "INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "ad_decisions", "tailor_letter", "INTEGER NOT NULL DEFAULT 0")?;

    add_column_if_missing(conn, "applications", "resume_format", "TEXT")?;
    add_column_if_missing(conn, "applications", "letter_format", "TEXT")?;
    add_column_if_missing(conn, "applications", "resume_file_name", "TEXT")?;
    add_column_if_missing(conn, "applications", "letter_file_name", "TEXT")?;
    add_column_if_missing(conn, "applications", "resume_file_blob", "BLOB")?;
    add_column_if_missing(conn, "applications", "letter_file_blob", "BLOB")?;

    Ok(())
}

fn migrate_to_v3(conn: &Connection) -> Result<()> {
    add_column_if_missing(conn, "ad_decisions", "application_method", "TEXT")?;
    add_column_if_missing(conn, "applications", "application_method", "TEXT")?;
    add_column_if_missing(conn, "applications", "export_path", "TEXT")?;
    add_column_if_missing(conn, "applications", "apply_notes", "TEXT")?;
    Ok(())
}

fn migrate_to_v4(conn: &Connection) -> Result<()> {
    add_column_if_missing(conn, "roles", "prompt_tailor_docs", "TEXT")?;
    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    match conn.execute(&sql, []) {
        Ok(_) => Ok(()),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("duplicate column") {
                Ok(())
            } else {
                Err(e)
            }
        }
    }
}
