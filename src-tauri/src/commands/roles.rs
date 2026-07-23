use crate::db::{self, DbState};
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Role {
    pub id: i64,
    pub profile_id: i64,
    pub name: String,
    pub prompt_tailor_docs: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_role(row: &rusqlite::Row) -> rusqlite::Result<Role> {
    Ok(Role {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        name: row.get(2)?,
        prompt_tailor_docs: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const ROLE_SELECT: &str =
    "SELECT id, profile_id, name, prompt_tailor_docs, created_at, updated_at";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoleDocumentVersion {
    pub id: i64,
    pub role_id: i64,
    pub doc_type: String,
    pub name: String,
    pub format: String,
    pub content_md: String,
    pub content_html: String,
    pub file_name: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoleWithDocs {
    pub role: Role,
    pub resume: String,
    pub letter: String,
}

const VERSION_SELECT: &str =
    "SELECT id, role_id, doc_type, name, format, content_md, content_html, file_name, is_default, created_at, updated_at";

fn row_to_version(row: &rusqlite::Row) -> rusqlite::Result<RoleDocumentVersion> {
    Ok(RoleDocumentVersion {
        id: row.get(0)?,
        role_id: row.get(1)?,
        doc_type: row.get(2)?,
        name: row.get(3)?,
        format: row.get(4)?,
        content_md: row.get(5)?,
        content_html: row.get(6)?,
        file_name: row.get(7)?,
        is_default: row.get::<_, i64>(8)? != 0,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub fn get_version_by_id(conn: &rusqlite::Connection, id: i64) -> Result<RoleDocumentVersion, String> {
    conn.query_row(
        &format!("{VERSION_SELECT} FROM role_document_versions WHERE id = ?1"),
        [id],
        row_to_version,
    )
    .map_err(|e| e.to_string())
}

fn default_version_content(
    conn: &rusqlite::Connection,
    role_id: i64,
    doc_type: &str,
) -> Result<String, String> {
    let row: Option<(String, String, String)> = conn
        .query_row(
            "SELECT format, content_md, content_html FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2 AND is_default = 1",
            params![role_id, doc_type],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row
        .map(|(format, md, html)| {
            if format == "html" {
                html
            } else {
                md
            }
        })
        .unwrap_or_default())
}

fn clear_default_for_type(
    conn: &rusqlite::Connection,
    role_id: i64,
    doc_type: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE role_document_versions SET is_default = 0 WHERE role_id = ?1 AND doc_type = ?2",
        params![role_id, doc_type],
    )?;
    Ok(())
}

fn sync_legacy_document(
    conn: &rusqlite::Connection,
    role_id: i64,
    doc_type: &str,
    content_md: &str,
    now: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO role_documents (role_id, doc_type, content_md, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(role_id, doc_type) DO UPDATE SET content_md = excluded.content_md, updated_at = excluded.updated_at",
        params![role_id, doc_type, content_md, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn create_default_versions(conn: &rusqlite::Connection, role_id: i64) -> Result<(), String> {
    let now = db::now_iso();
    for doc_type in ["resume", "letter"] {
        conn.execute(
            "INSERT INTO role_document_versions (role_id, doc_type, name, format, content_md, content_html, is_default, created_at, updated_at)
             VALUES (?1, ?2, 'Default', 'html', '', '', 1, ?3, ?3)",
            params![role_id, doc_type, now],
        )
        .map_err(|e| e.to_string())?;
        sync_legacy_document(conn, role_id, doc_type, "", &now)?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_roles(state: State<DbState>, profile_id: i64) -> Result<Vec<Role>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("{ROLE_SELECT} FROM roles WHERE profile_id = ?1 ORDER BY name"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([profile_id], row_to_role)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_role(state: State<DbState>, role_id: i64) -> Result<RoleWithDocs, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let role = conn
        .query_row(
            &format!("{ROLE_SELECT} FROM roles WHERE id = ?1"),
            [role_id],
            row_to_role,
        )
        .map_err(|e| e.to_string())?;
    Ok(RoleWithDocs {
        role,
        resume: default_version_content(&conn, role_id, "resume")?,
        letter: default_version_content(&conn, role_id, "letter")?,
    })
}

#[tauri::command]
pub fn list_role_document_versions(
    state: State<DbState>,
    role_id: i64,
    doc_type: Option<String>,
) -> Result<Vec<RoleDocumentVersion>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    if let Some(dt) = doc_type {
        let mut stmt = conn
            .prepare(&format!(
                "{VERSION_SELECT} FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2 ORDER BY is_default DESC, name"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![role_id, dt], row_to_version)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    } else {
        let mut stmt = conn
            .prepare(&format!(
                "{VERSION_SELECT} FROM role_document_versions WHERE role_id = ?1 ORDER BY doc_type, is_default DESC, name"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([role_id], row_to_version)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_role_document_version(
    state: State<DbState>,
    version_id: i64,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    get_version_by_id(&conn, version_id)
}

#[derive(Debug, Serialize)]
pub struct DocumentFilePayload {
    pub format: String,
    pub file_name: Option<String>,
    pub data_base64: String,
}

#[tauri::command]
pub fn get_role_document_file_base64(
    state: State<DbState>,
    version_id: i64,
) -> Result<DocumentFilePayload, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let (version, blob) = get_version_with_blob(&conn, version_id)?;
    if version.format == "markdown" {
        return Err("Document version is markdown, not a file".into());
    }
    if version.format == "html" {
        return Err("Document version is HTML, not a file".into());
    }
    let bytes = blob.ok_or("Missing file data for this document version")?;
    Ok(DocumentFilePayload {
        format: version.format,
        file_name: version.file_name,
        data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

#[tauri::command]
pub fn create_role_document_markdown(
    state: State<DbState>,
    role_id: i64,
    doc_type: String,
    name: String,
    content_md: String,
    set_default: bool,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    if set_default {
        clear_default_for_type(&conn, role_id, &doc_type).map_err(|e| e.to_string())?;
    }
    let is_default = if set_default { 1 } else { 0 };
    conn.execute(
        "INSERT INTO role_document_versions (role_id, doc_type, name, format, content_md, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'markdown', ?4, ?5, ?6, ?6)",
        params![role_id, doc_type, name, content_md, is_default, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    if set_default {
        sync_legacy_document(&conn, role_id, &doc_type, &content_md, &now)?;
    }
    conn.execute(
        "UPDATE roles SET updated_at = ?1 WHERE id = ?2",
        params![now, role_id],
    )
    .map_err(|e| e.to_string())?;
    get_version_by_id(&conn, id)
}

#[tauri::command]
pub fn create_role_document_html(
    state: State<DbState>,
    role_id: i64,
    doc_type: String,
    name: String,
    content_html: String,
    set_default: bool,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    if set_default {
        clear_default_for_type(&conn, role_id, &doc_type).map_err(|e| e.to_string())?;
    }
    let is_default = if set_default { 1 } else { 0 };
    conn.execute(
        "INSERT INTO role_document_versions (role_id, doc_type, name, format, content_md, content_html, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'html', '', ?4, ?5, ?6, ?6)",
        params![role_id, doc_type, name, content_html, is_default, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.execute(
        "UPDATE roles SET updated_at = ?1 WHERE id = ?2",
        params![now, role_id],
    )
    .map_err(|e| e.to_string())?;
    get_version_by_id(&conn, id)
}

#[tauri::command]
pub fn update_role_document_html(
    state: State<DbState>,
    version_id: i64,
    content_html: String,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let version = get_version_by_id(&conn, version_id)?;
    if version.format != "html" && version.format != "markdown" {
        return Err("Only HTML or markdown versions can be edited as rich documents".into());
    }
    let now = db::now_iso();
    // Editing always persists as HTML (migrates legacy markdown in place).
    conn.execute(
        "UPDATE role_document_versions
         SET format = 'html', content_html = ?1, content_md = '', file_blob = NULL, file_name = NULL, updated_at = ?2
         WHERE id = ?3",
        params![content_html, now, version_id],
    )
    .map_err(|e| e.to_string())?;
    get_version_by_id(&conn, version_id)
}

/// Convert any version (including legacy pdf/docx) into editable HTML and drop the binary blob.
#[tauri::command]
pub fn convert_role_document_to_html(
    state: State<DbState>,
    version_id: i64,
    content_html: String,
) -> Result<RoleDocumentVersion, String> {
    if content_html.trim().is_empty() {
        return Err("Converted HTML is empty".into());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let _version = get_version_by_id(&conn, version_id)?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE role_document_versions
         SET format = 'html', content_html = ?1, content_md = '', file_blob = NULL, file_name = NULL, updated_at = ?2
         WHERE id = ?3",
        params![content_html, now, version_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE roles SET updated_at = ?1 WHERE id = (SELECT role_id FROM role_document_versions WHERE id = ?2)",
        params![now, version_id],
    )
    .map_err(|e| e.to_string())?;
    get_version_by_id(&conn, version_id)
}

#[tauri::command]
pub fn update_role_document_markdown(
    state: State<DbState>,
    version_id: i64,
    content_md: String,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let version = get_version_by_id(&conn, version_id)?;
    if version.format != "markdown" {
        return Err("Only Markdown versions can be edited as text".into());
    }
    let now = db::now_iso();
    conn.execute(
        "UPDATE role_document_versions SET content_md = ?1, updated_at = ?2 WHERE id = ?3",
        params![content_md, now, version_id],
    )
    .map_err(|e| e.to_string())?;
    if version.is_default {
        sync_legacy_document(
            &conn,
            version.role_id,
            &version.doc_type,
            &content_md,
            &now,
        )?;
    }
    get_version_by_id(&conn, version_id)
}

/// Deprecated: PDF/DOCX must be converted to HTML on the client and saved via create_role_document_html.
#[tauri::command]
pub fn upload_role_document_file(
    _state: State<DbState>,
    _role_id: i64,
    _doc_type: String,
    _name: String,
    _format: String,
    _file_name: String,
    _file_base64: String,
) -> Result<RoleDocumentVersion, String> {
    Err(
        "Binary document upload is no longer supported. Convert PDF/DOCX to HTML and save as a rich document."
            .into(),
    )
}

#[tauri::command]
pub fn rename_role_document_version(
    state: State<DbState>,
    version_id: i64,
    name: String,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE role_document_versions SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, version_id],
    )
    .map_err(|e| e.to_string())?;
    get_version_by_id(&conn, version_id)
}

#[tauri::command]
pub fn set_default_role_document_version(
    state: State<DbState>,
    version_id: i64,
) -> Result<RoleDocumentVersion, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let version = get_version_by_id(&conn, version_id)?;
    let now = db::now_iso();
    clear_default_for_type(&conn, version.role_id, &version.doc_type).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE role_document_versions SET is_default = 1, updated_at = ?1 WHERE id = ?2",
        params![now, version_id],
    )
    .map_err(|e| e.to_string())?;
    if version.format == "markdown" {
        sync_legacy_document(
            &conn,
            version.role_id,
            &version.doc_type,
            &version.content_md,
            &now,
        )?;
    }
    get_version_by_id(&conn, version_id)
}

#[tauri::command]
pub fn delete_role_document_version(state: State<DbState>, version_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let version = get_version_by_id(&conn, version_id)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2",
            params![version.role_id, version.doc_type],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count <= 1 {
        return Err("Cannot delete the only document version for this type".into());
    }
    let was_default = version.is_default;
    let role_id = version.role_id;
    let doc_type = version.doc_type.clone();
    conn.execute(
        "DELETE FROM role_document_versions WHERE id = ?1",
        [version_id],
    )
    .map_err(|e| e.to_string())?;
    if was_default {
        let replacement: i64 = conn
            .query_row(
                "SELECT id FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2 ORDER BY id LIMIT 1",
                params![role_id, doc_type],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        drop(conn);
        set_default_role_document_version(state, replacement)?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_role(state: State<DbState>, profile_id: i64, name: String) -> Result<Role, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO roles (profile_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        rusqlite::params![profile_id, name, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    create_default_versions(&conn, id)?;
    Ok(Role {
        id,
        profile_id,
        name,
        prompt_tailor_docs: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn save_role_tailor_prompt(
    state: State<DbState>,
    role_id: i64,
    prompt: String,
) -> Result<Role, String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err("Prompt cannot be empty. Use delete to remove a role-specific prompt.".into());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE roles SET prompt_tailor_docs = ?1, updated_at = ?2 WHERE id = ?3",
        params![trimmed, now, role_id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{ROLE_SELECT} FROM roles WHERE id = ?1"),
        [role_id],
        row_to_role,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_role_tailor_prompt(state: State<DbState>, role_id: i64) -> Result<Role, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE roles SET prompt_tailor_docs = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, role_id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{ROLE_SELECT} FROM roles WHERE id = ?1"),
        [role_id],
        row_to_role,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_role_name(state: State<DbState>, role_id: i64, name: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE roles SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, now, role_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_role_document(
    state: State<DbState>,
    role_id: i64,
    doc_type: String,
    content_md: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let version_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2 AND is_default = 1",
            params![role_id, doc_type],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(id) = version_id {
        drop(conn);
        update_role_document_markdown(state, id, content_md)?;
    } else {
        let now = db::now_iso();
        sync_legacy_document(&conn, role_id, &doc_type, &content_md, &now)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_role(state: State<DbState>, role_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roles WHERE id = ?1", [role_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_version_with_blob(
    conn: &rusqlite::Connection,
    version_id: i64,
) -> Result<(RoleDocumentVersion, Option<Vec<u8>>), String> {
    let version = get_version_by_id(conn, version_id)?;
    let blob: Option<Vec<u8>> = conn
        .query_row(
            "SELECT file_blob FROM role_document_versions WHERE id = ?1",
            [version_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((version, blob))
}

pub fn default_version_id(
    conn: &rusqlite::Connection,
    role_id: i64,
    doc_type: &str,
) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT id FROM role_document_versions WHERE role_id = ?1 AND doc_type = ?2 AND is_default = 1",
        params![role_id, doc_type],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}
