use crate::db::{self, DbState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobAdRecord {
    pub id: i64,
    pub profile_id: i64,
    pub af_ad_id: String,
    pub headline: String,
    pub employer_name: Option<String>,
    pub location: Option<String>,
    pub publication_date: Option<String>,
    pub application_email: Option<String>,
    pub application_url: Option<String>,
    pub contact_name: Option<String>,
    pub raw_json: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdDecision {
    pub id: i64,
    pub profile_id: i64,
    pub job_ad_id: i64,
    pub role_id: i64,
    pub status: String,
    pub decided_at: String,
    pub resume_version_id: Option<i64>,
    pub letter_version_id: Option<i64>,
    pub tailor_resume: bool,
    pub tailor_letter: bool,
    pub application_method: Option<String>,
}

fn row_to_decision(row: &rusqlite::Row) -> rusqlite::Result<AdDecision> {
    Ok(AdDecision {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        job_ad_id: row.get(2)?,
        role_id: row.get(3)?,
        status: row.get(4)?,
        decided_at: row.get(5)?,
        resume_version_id: row.get(6)?,
        letter_version_id: row.get(7)?,
        tailor_resume: row.get::<_, i64>(8)? != 0,
        tailor_letter: row.get::<_, i64>(9)? != 0,
        application_method: row.get(10).ok(),
    })
}

const DECISION_SELECT: &str =
    "SELECT id, profile_id, job_ad_id, role_id, status, decided_at, resume_version_id, letter_version_id, tailor_resume, tailor_letter, application_method";

fn first_application_contact<'a>(ad: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
    let contacts = ad.get("application_contacts")?;
    if let Some(arr) = contacts.as_array() {
        return arr.first();
    }
    if contacts.is_object() {
        return Some(contacts);
    }
    None
}

pub fn detect_application_method(ad: &serde_json::Value) -> String {
    let details = ad.get("application_details");
    let email = details
        .and_then(|d| d.get("email"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if email.is_some() {
        return "email".into();
    }
    let via_af = details
        .and_then(|d| d.get("via_af"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if via_af {
        return "via_af".into();
    }
    let url = details
        .and_then(|d| d.get("url"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if url.is_some() {
        return "external_url".into();
    }
    "unknown".into()
}

fn extract_location(ad: &serde_json::Value) -> Option<String> {
    ad.get("workplace_address")
        .and_then(|w| {
            w.get("city")
                .or_else(|| w.get("municipality"))
                .or_else(|| w.get("region"))
                .and_then(|v| v.as_str())
        })
        .map(|s| s.to_string())
}

fn extract_contact(ad: &serde_json::Value) -> Option<String> {
    first_application_contact(ad)
        .and_then(|c| c.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
}

pub fn upsert_job_ad(
    conn: &rusqlite::Connection,
    profile_id: i64,
    ad: &serde_json::Value,
) -> rusqlite::Result<i64> {
    let af_id = ad
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let headline = ad
        .get("headline")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let employer = ad
        .get("employer")
        .and_then(|e| e.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let location = extract_location(ad);
    let pub_date = ad
        .get("publication_date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let app_email = ad
        .get("application_details")
        .and_then(|d| d.get("email"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let app_url = ad
        .get("application_details")
        .and_then(|d| d.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let contact = extract_contact(ad);
    let raw = serde_json::to_string(ad).unwrap_or_default();
    let now = db::now_iso();

    conn.execute(
        "INSERT INTO job_ads (profile_id, af_ad_id, headline, employer_name, location, publication_date,
         application_email, application_url, contact_name, raw_json, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(profile_id, af_ad_id) DO UPDATE SET
           headline = excluded.headline,
           employer_name = excluded.employer_name,
           location = excluded.location,
           publication_date = excluded.publication_date,
           application_email = excluded.application_email,
           application_url = excluded.application_url,
           contact_name = excluded.contact_name,
           raw_json = excluded.raw_json,
           fetched_at = excluded.fetched_at",
        rusqlite::params![
            profile_id,
            af_id,
            headline,
            employer,
            location,
            pub_date,
            app_email,
            app_url,
            contact,
            raw,
            now
        ],
    )?;
    conn.query_row(
        "SELECT id FROM job_ads WHERE profile_id = ?1 AND af_ad_id = ?2",
        rusqlite::params![profile_id, af_id],
        |r| r.get(0),
    )
}

#[tauri::command]
pub fn reject_ad(
    state: State<DbState>,
    profile_id: i64,
    role_id: i64,
    ad_json: String,
) -> Result<(), String> {
    let ad: serde_json::Value = serde_json::from_str(&ad_json).map_err(|e| e.to_string())?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let job_ad_id = upsert_job_ad(&conn, profile_id, &ad).map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO ad_decisions (profile_id, job_ad_id, role_id, status, decided_at) VALUES (?1, ?2, ?3, 'rejected', ?4)",
        rusqlite::params![profile_id, job_ad_id, role_id, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn proceed_ad(
    state: State<DbState>,
    profile_id: i64,
    role_id: i64,
    ad_json: String,
    resume_version_id: Option<i64>,
    letter_version_id: Option<i64>,
    tailor_resume: bool,
    tailor_letter: bool,
) -> Result<AdDecision, String> {
    let ad: serde_json::Value = serde_json::from_str(&ad_json).map_err(|e| e.to_string())?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let resume_vid = resume_version_id.or_else(|| {
        crate::commands::roles::default_version_id(&conn, role_id, "resume")
            .ok()
            .flatten()
    });
    let letter_vid = letter_version_id.or_else(|| {
        crate::commands::roles::default_version_id(&conn, role_id, "letter")
            .ok()
            .flatten()
    });

    // Binary pdf/docx versions are converted to HTML on the Review page before tailoring.
    let application_method = detect_application_method(&ad);

    let job_ad_id = upsert_job_ad(&conn, profile_id, &ad).map_err(|e| e.to_string())?;
    let now = db::now_iso();
    conn.execute(
        "INSERT INTO ad_decisions (profile_id, job_ad_id, role_id, status, decided_at,
         resume_version_id, letter_version_id, tailor_resume, tailor_letter, application_method)
         VALUES (?1, ?2, ?3, 'in_progress', ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            profile_id,
            job_ad_id,
            role_id,
            now,
            resume_vid,
            letter_vid,
            tailor_resume as i64,
            tailor_letter as i64,
            application_method,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_decision_by_id(&conn, id)
}

fn get_decision_by_id(conn: &rusqlite::Connection, id: i64) -> Result<AdDecision, String> {
    conn.query_row(
        &format!("{DECISION_SELECT} FROM ad_decisions WHERE id = ?1"),
        [id],
        row_to_decision,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_decision_with_ad(
    state: State<DbState>,
    decision_id: i64,
) -> Result<(AdDecision, JobAdRecord), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let decision = get_decision_by_id(&conn, decision_id)?;
    let ad = conn
        .query_row(
            "SELECT id, profile_id, af_ad_id, headline, employer_name, location, publication_date,
             application_email, application_url, contact_name, raw_json FROM job_ads WHERE id = ?1",
            [decision.job_ad_id],
            |row| {
                Ok(JobAdRecord {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    af_ad_id: row.get(2)?,
                    headline: row.get(3)?,
                    employer_name: row.get(4)?,
                    location: row.get(5)?,
                    publication_date: row.get(6)?,
                    application_email: row.get(7)?,
                    application_url: row.get(8)?,
                    contact_name: row.get(9)?,
                    raw_json: row.get(10)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    Ok((decision, ad))
}

#[tauri::command]
pub fn update_decision_status(
    state: State<DbState>,
    decision_id: i64,
    status: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ad_decisions SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, decision_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
