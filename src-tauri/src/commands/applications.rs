use crate::commands::attachments::resolve_attachment;
use crate::commands::roles::DocumentFilePayload;
use crate::commands::roles::get_version_with_blob;
use crate::commands::settings::get_export_dir_for_profile;
use crate::db::{self, DbState};
use base64::Engine;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Application {
    pub id: i64,
    pub profile_id: i64,
    pub ad_decision_id: i64,
    pub tailored_resume_md: String,
    pub tailored_letter_md: String,
    pub email_subject: Option<String>,
    pub email_body: Option<String>,
    pub email_to: Option<String>,
    pub email_cc: Option<String>,
    pub email_bcc: Option<String>,
    pub gmail_draft_id: Option<String>,
    pub approved_at: Option<String>,
    pub sent_at: Option<String>,
    pub created_at: String,
    pub resume_format: Option<String>,
    pub letter_format: Option<String>,
    pub resume_file_name: Option<String>,
    pub letter_file_name: Option<String>,
    pub application_method: Option<String>,
    pub export_path: Option<String>,
    pub apply_notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplicationWithMeta {
    pub application: Application,
    pub headline: String,
    pub employer_name: Option<String>,
    pub location: Option<String>,
    pub contact_name: Option<String>,
    pub af_ad_id: String,
    pub raw_json: String,
}

fn row_to_application(row: &rusqlite::Row) -> rusqlite::Result<Application> {
    Ok(Application {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        ad_decision_id: row.get(2)?,
        tailored_resume_md: row.get(3)?,
        tailored_letter_md: row.get(4)?,
        email_subject: row.get(5)?,
        email_body: row.get(6)?,
        email_to: row.get(7)?,
        email_cc: row.get(8)?,
        email_bcc: row.get(9)?,
        gmail_draft_id: row.get(10)?,
        approved_at: row.get(11)?,
        sent_at: row.get(12)?,
        created_at: row.get(13)?,
        resume_format: row.get(14)?,
        letter_format: row.get(15)?,
        resume_file_name: row.get(16)?,
        letter_file_name: row.get(17)?,
        application_method: row.get(18).ok(),
        export_path: row.get(19).ok(),
        apply_notes: row.get(20).ok(),
    })
}

const APP_SELECT: &str = "SELECT id, profile_id, ad_decision_id, tailored_resume_md, tailored_letter_md,
    email_subject, email_body, email_to, email_cc, email_bcc, gmail_draft_id,
    approved_at, sent_at, created_at, resume_format, letter_format, resume_file_name, letter_file_name,
    application_method, export_path, apply_notes";

#[derive(Debug, Deserialize)]
pub struct SaveApplicationRequest {
    pub profile_id: i64,
    pub ad_decision_id: i64,
    pub tailored_resume_md: String,
    pub tailored_letter_md: String,
    pub resume_format: Option<String>,
    pub letter_format: Option<String>,
    pub resume_file_name: Option<String>,
    pub letter_file_name: Option<String>,
}

#[tauri::command]
pub fn save_application(
    state: State<DbState>,
    req: SaveApplicationRequest,
) -> Result<Application, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();

    let (resume_blob, letter_blob) = load_version_blobs_for_decision(
        &conn,
        req.ad_decision_id,
        req.resume_format.as_deref(),
        req.letter_format.as_deref(),
    )?;

    let application_method: Option<String> = conn
        .query_row(
            "SELECT application_method FROM ad_decisions WHERE id = ?1",
            [req.ad_decision_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM applications WHERE ad_decision_id = ?1",
            [req.ad_decision_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(id) = existing {
        conn.execute(
            "UPDATE applications SET tailored_resume_md = ?1, tailored_letter_md = ?2,
             resume_format = ?3, letter_format = ?4, resume_file_name = ?5, letter_file_name = ?6,
             resume_file_blob = COALESCE(?7, resume_file_blob), letter_file_blob = COALESCE(?8, letter_file_blob)
             WHERE id = ?9",
            rusqlite::params![
                req.tailored_resume_md,
                req.tailored_letter_md,
                req.resume_format,
                req.letter_format,
                req.resume_file_name,
                req.letter_file_name,
                resume_blob,
                letter_blob,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;
        return get_application_by_id(&conn, id);
    }

    conn.execute(
        "INSERT INTO applications (profile_id, ad_decision_id, tailored_resume_md, tailored_letter_md,
         resume_format, letter_format, resume_file_name, letter_file_name, resume_file_blob, letter_file_blob,
         application_method, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            req.profile_id,
            req.ad_decision_id,
            req.tailored_resume_md,
            req.tailored_letter_md,
            req.resume_format,
            req.letter_format,
            req.resume_file_name,
            req.letter_file_name,
            resume_blob,
            letter_blob,
            application_method,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    get_application_by_id(&conn, conn.last_insert_rowid())
}

fn load_version_blobs_for_decision(
    conn: &rusqlite::Connection,
    decision_id: i64,
    resume_format: Option<&str>,
    letter_format: Option<&str>,
) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>), String> {
    let (resume_vid, letter_vid): (Option<i64>, Option<i64>) = conn
        .query_row(
            "SELECT resume_version_id, letter_version_id FROM ad_decisions WHERE id = ?1",
            [decision_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let resume_blob = if resume_format == Some("pdf") || resume_format == Some("docx") {
        resume_vid.and_then(|id| get_version_with_blob(conn, id).ok().and_then(|(_, b)| b))
    } else {
        None
    };
    let letter_blob = if letter_format == Some("pdf") || letter_format == Some("docx") {
        letter_vid.and_then(|id| get_version_with_blob(conn, id).ok().and_then(|(_, b)| b))
    } else {
        None
    };
    Ok((resume_blob, letter_blob))
}

fn get_application_by_id(conn: &rusqlite::Connection, id: i64) -> Result<Application, String> {
    conn.query_row(
        &format!("{APP_SELECT} FROM applications WHERE id = ?1"),
        [id],
        row_to_application,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_application(
    state: State<DbState>,
    application_id: i64,
) -> Result<ApplicationWithMeta, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let app = get_application_by_id(&conn, application_id)?;
    let meta = conn
        .query_row(
            "SELECT j.headline, j.employer_name, j.location, j.contact_name, j.af_ad_id, j.raw_json
             FROM applications a
             JOIN ad_decisions d ON d.id = a.ad_decision_id
             JOIN job_ads j ON j.id = d.job_ad_id
             WHERE a.id = ?1",
            [application_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(ApplicationWithMeta {
        application: app,
        headline: meta.0,
        employer_name: meta.1,
        location: meta.2,
        contact_name: meta.3,
        af_ad_id: meta.4,
        raw_json: meta.5,
    })
}

#[tauri::command]
pub fn get_application_by_decision(
    state: State<DbState>,
    decision_id: i64,
) -> Result<Option<Application>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id FROM applications WHERE ad_decision_id = ?1",
        [decision_id],
        |r| r.get::<_, i64>(0),
    );
    match result {
        Ok(id) => get_application_by_id(&conn, id).map(Some),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn approve_application(
    state: State<DbState>,
    application_id: i64,
    email_subject: String,
    email_body: String,
    email_to: String,
    email_cc: String,
    email_bcc: String,
    tailored_resume_md: String,
    tailored_letter_md: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE applications SET email_subject = ?1, email_body = ?2, email_to = ?3, email_cc = ?4,
         email_bcc = ?5, tailored_resume_md = ?6, tailored_letter_md = ?7, approved_at = ?8
         WHERE id = ?9",
        rusqlite::params![
            email_subject,
            email_body,
            email_to,
            email_cc,
            email_bcc,
            tailored_resume_md,
            tailored_letter_md,
            now,
            application_id
        ],
    )
    .map_err(|e| e.to_string())?;
    let decision_id: i64 = conn
        .query_row(
            "SELECT ad_decision_id FROM applications WHERE id = ?1",
            [application_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_decisions SET status = 'approved' WHERE id = ?1",
        [decision_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mark_application_sent(
    state: State<DbState>,
    application_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "UPDATE applications SET sent_at = ?1 WHERE id = ?2",
        rusqlite::params![now, application_id],
    )
    .map_err(|e| e.to_string())?;
    let decision_id: i64 = conn
        .query_row(
            "SELECT ad_decision_id FROM applications WHERE id = ?1",
            [application_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_decisions SET status = 'sent' WHERE id = ?1",
        [decision_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_gmail_draft_id(
    state: State<DbState>,
    application_id: i64,
    draft_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE applications SET gmail_draft_id = ?1 WHERE id = ?2",
        rusqlite::params![draft_id, application_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_application_attachments(
    conn: &rusqlite::Connection,
    application_id: i64,
) -> Result<
    (
        String,
        String,
        String,
        String,
        String,
        String,
        Option<Vec<u8>>,
        Option<Vec<u8>>,
    ),
    String,
> {
    conn.query_row(
        "SELECT tailored_resume_md, tailored_letter_md, resume_format, letter_format,
         resume_file_name, letter_file_name, resume_file_blob, letter_file_blob
         FROM applications WHERE id = ?1",
        [application_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "markdown".into()),
                row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "markdown".into()),
                row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "resume.pdf".into()),
                row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "personal_letter.pdf".into()),
                row.get::<_, Option<Vec<u8>>>(6)?,
                row.get::<_, Option<Vec<u8>>>(7)?,
            ))
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_archive(
    state: State<DbState>,
    profile_id: i64,
    query: String,
) -> Result<Vec<ApplicationWithMeta>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let apps: Vec<Application> = if query.trim().is_empty() {
        let mut stmt = conn
            .prepare(&format!(
                "{APP_SELECT} FROM applications
                 WHERE profile_id = ?1 AND sent_at IS NOT NULL ORDER BY sent_at DESC"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([profile_id], row_to_application)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.profile_id, a.ad_decision_id, a.tailored_resume_md, a.tailored_letter_md,
                 a.email_subject, a.email_body, a.email_to, a.email_cc, a.email_bcc, a.gmail_draft_id,
                 a.approved_at, a.sent_at, a.created_at, a.resume_format, a.letter_format, a.resume_file_name, a.letter_file_name,
                 a.application_method, a.export_path, a.apply_notes
                 FROM applications a
                 JOIN applications_fts fts ON fts.rowid = a.id
                 WHERE a.profile_id = ?1 AND a.sent_at IS NOT NULL AND applications_fts MATCH ?2
                 ORDER BY a.sent_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let fts_query = query
            .split_whitespace()
            .map(|w| format!("\"{w}\""))
            .collect::<Vec<_>>()
            .join(" OR ");
        let rows = stmt
            .query_map(rusqlite::params![profile_id, fts_query], row_to_application)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let mut results = Vec::new();
    for app in apps {
        let meta = conn
            .query_row(
                "SELECT j.headline, j.employer_name, j.location, j.contact_name, j.af_ad_id, j.raw_json
                 FROM ad_decisions d JOIN job_ads j ON j.id = d.job_ad_id WHERE d.id = ?1",
                [app.ad_decision_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        results.push(ApplicationWithMeta {
            application: app,
            headline: meta.0,
            employer_name: meta.1,
            location: meta.2,
            contact_name: meta.3,
            af_ad_id: meta.4,
            raw_json: meta.5,
        });
    }
    Ok(results)
}

#[tauri::command]
pub fn list_in_progress(
    state: State<DbState>,
    profile_id: i64,
) -> Result<Vec<(i64, String, String)>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT d.id, j.headline, j.employer_name
             FROM ad_decisions d
             JOIN job_ads j ON j.id = d.job_ad_id
             WHERE d.profile_id = ?1 AND d.status IN ('in_progress', 'approved')
             ORDER BY d.decided_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([profile_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_application_file_base64(
    state: State<DbState>,
    application_id: i64,
    doc_type: String,
) -> Result<DocumentFilePayload, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let (resume_md, letter_md, resume_fmt, letter_fmt, resume_name, letter_name, resume_blob, letter_blob) =
        get_application_attachments(&conn, application_id)?;

    let (format, file_name, md_content, blob) = if doc_type == "resume" {
        (resume_fmt, resume_name, resume_md, resume_blob)
    } else if doc_type == "letter" {
        (letter_fmt, letter_name, letter_md, letter_blob)
    } else {
        return Err("doc_type must be 'resume' or 'letter'".into());
    };

    if format == "markdown" {
        let attachment = resolve_attachment(&format, &file_name, &md_content, None)?;
        let data_base64 = attachment.content_b64();
        return Ok(DocumentFilePayload {
            format: "pdf".into(),
            file_name: Some(attachment.file_name),
            data_base64,
        });
    }

    let bytes = blob.ok_or("Missing file data for this application document")?;
    Ok(DocumentFilePayload {
        format,
        file_name: Some(file_name),
        data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

fn sanitize_folder_name(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|c| if r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        return "Application".into();
    }
    trimmed.chars().take(80).collect()
}

fn unique_export_dir(root: &Path, base_name: &str) -> PathBuf {
    let candidate = root.join(base_name);
    if !candidate.exists() {
        return candidate;
    }
    let mut counter = 2;
    loop {
        let next = root.join(format!("{base_name} ({counter})"));
        if !next.exists() {
            return next;
        }
        counter += 1;
    }
}

#[derive(Debug, Serialize)]
pub struct ExportPackageResult {
    pub export_path: String,
}

#[tauri::command]
pub fn export_application_package(
    state: State<DbState>,
    profile_id: i64,
    application_id: i64,
) -> Result<ExportPackageResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (resume_md, letter_md, resume_fmt, letter_fmt, resume_name, letter_name, resume_blob, letter_blob) =
        get_application_attachments(&conn, application_id)?;

    let (headline, employer_name, af_ad_id, raw_json, decision_id): (
        String,
        Option<String>,
        String,
        String,
        i64,
    ) = conn
        .query_row(
            "SELECT j.headline, j.employer_name, j.af_ad_id, j.raw_json, a.ad_decision_id
             FROM applications a
             JOIN ad_decisions d ON d.id = a.ad_decision_id
             JOIN job_ads j ON j.id = d.job_ad_id
             WHERE a.id = ?1",
            [application_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let resume = resolve_attachment(&resume_fmt, &resume_name, &resume_md, resume_blob)?;
    let letter = resolve_attachment(&letter_fmt, &letter_name, &letter_md, letter_blob)?;

    let export_root = PathBuf::from(get_export_dir_for_profile(&conn, profile_id)?);
    fs::create_dir_all(&export_root).map_err(|e| format!("Failed to create export folder: {e}"))?;

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let employer = employer_name.unwrap_or_else(|| "Unknown employer".into());
    let folder_name = sanitize_folder_name(&format!("{date} - {employer} - {headline}"));
    let export_dir = unique_export_dir(&export_root, &folder_name);
    fs::create_dir_all(&export_dir).map_err(|e| format!("Failed to create application folder: {e}"))?;

    fs::write(export_dir.join(&resume.file_name), &resume.bytes)
        .map_err(|e| format!("Failed to write resume: {e}"))?;
    fs::write(export_dir.join(&letter.file_name), &letter.bytes)
        .map_err(|e| format!("Failed to write letter: {e}"))?;

    let ad: serde_json::Value =
        serde_json::from_str(&raw_json).unwrap_or_else(|_| serde_json::json!({}));
    let application_url = ad
        .get("application_details")
        .and_then(|d| d.get("url"))
        .and_then(|v| v.as_str());
    let deadline = ad.get("application_deadline").and_then(|v| v.as_str());

    let job_meta = serde_json::json!({
        "headline": headline,
        "employer": employer,
        "application_url": application_url,
        "deadline": deadline,
        "af_ad_id": af_ad_id,
    });
    fs::write(
        export_dir.join("job.json"),
        serde_json::to_string_pretty(&job_meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write job.json: {e}"))?;

    let readme = if let Some(url) = application_url {
        format!("Apply at: {url}\n")
    } else {
        "See job.json for application details.\n".into()
    };
    fs::write(export_dir.join("README.txt"), readme)
        .map_err(|e| format!("Failed to write README.txt: {e}"))?;

    let export_path = export_dir.to_string_lossy().into_owned();
    let now = db::now_iso();
    conn.execute(
        "UPDATE applications SET export_path = ?1, approved_at = COALESCE(approved_at, ?2) WHERE id = ?3",
        rusqlite::params![export_path, now, application_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_decisions SET status = 'approved' WHERE id = ?1",
        [decision_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(ExportPackageResult { export_path })
}

#[tauri::command]
pub fn save_apply_notes(
    state: State<DbState>,
    application_id: i64,
    apply_notes: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE applications SET apply_notes = ?1 WHERE id = ?2",
        rusqlite::params![apply_notes, application_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
