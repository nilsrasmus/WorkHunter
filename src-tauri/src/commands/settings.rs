use crate::db::DbState;
use crate::defaults::{
    default_applications_export_dir, DEFAULT_EMAIL_NOTE_PROMPT, DEFAULT_EMAIL_TEMPLATE,
    DEFAULT_TAILOR_PROMPT,
};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

pub fn get_export_dir_for_profile(
    conn: &rusqlite::Connection,
    profile_id: i64,
) -> Result<String, String> {
    let custom: Option<String> = conn
        .query_row(
            "SELECT value FROM profile_settings WHERE profile_id = ?1 AND key = 'applications_export_dir'",
            [profile_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(custom
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(default_applications_export_dir))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfileSettings {
    pub ai_provider: String,
    pub gemini_api_key: String,
    pub gemini_model: String,
    pub anthropic_api_key: String,
    pub anthropic_model: String,
    pub test_mode: bool,
    pub test_email: String,
    pub prompt_tailor_docs: String,
    pub prompt_email_note: String,
    pub email_body_template: String,
    pub your_name: String,
    pub language: String,
    pub applications_export_dir: String,
}

fn map_settings(map: HashMap<String, String>) -> ProfileSettings {
    ProfileSettings {
        ai_provider: map
            .get("ai_provider")
            .cloned()
            .unwrap_or_else(|| "gemini".into()),
        gemini_api_key: map.get("gemini_api_key").cloned().unwrap_or_default(),
        gemini_model: map
            .get("gemini_model")
            .cloned()
            .unwrap_or_else(|| "gemini-2.0-flash".into()),
        anthropic_api_key: map.get("anthropic_api_key").cloned().unwrap_or_default(),
        anthropic_model: map
            .get("anthropic_model")
            .cloned()
            .unwrap_or_else(|| "claude-sonnet-4-5".into()),
        test_mode: map
            .get("test_mode")
            .map(|v| v == "true")
            .unwrap_or(true),
        test_email: map.get("test_email").cloned().unwrap_or_default(),
        prompt_tailor_docs: map
            .get("prompt_tailor_docs")
            .cloned()
            .unwrap_or_else(|| DEFAULT_TAILOR_PROMPT.into()),
        prompt_email_note: map
            .get("prompt_email_note")
            .cloned()
            .unwrap_or_else(|| DEFAULT_EMAIL_NOTE_PROMPT.into()),
        email_body_template: map
            .get("email_body_template")
            .cloned()
            .unwrap_or_else(|| DEFAULT_EMAIL_TEMPLATE.into()),
        your_name: map.get("your_name").cloned().unwrap_or_default(),
        language: map
            .get("language")
            .cloned()
            .unwrap_or_else(|| "sv".into()),
        applications_export_dir: map
            .get("applications_export_dir")
            .cloned()
            .unwrap_or_else(default_applications_export_dir),
    }
}

#[tauri::command]
pub fn get_settings(state: State<DbState>, profile_id: i64) -> Result<ProfileSettings, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM profile_settings WHERE profile_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([profile_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map_settings(map))
}

#[tauri::command]
pub fn save_settings(
    state: State<DbState>,
    profile_id: i64,
    settings: ProfileSettings,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let pairs = [
        ("ai_provider", settings.ai_provider),
        ("gemini_api_key", settings.gemini_api_key),
        ("gemini_model", settings.gemini_model),
        ("anthropic_api_key", settings.anthropic_api_key),
        ("anthropic_model", settings.anthropic_model),
        (
            "test_mode",
            if settings.test_mode {
                "true".into()
            } else {
                "false".into()
            },
        ),
        ("test_email", settings.test_email),
        ("prompt_tailor_docs", settings.prompt_tailor_docs),
        ("prompt_email_note", settings.prompt_email_note),
        ("email_body_template", settings.email_body_template),
        ("your_name", settings.your_name),
        ("language", settings.language),
        ("applications_export_dir", settings.applications_export_dir),
    ];
    for (key, value) in pairs {
        conn.execute(
            "INSERT INTO profile_settings (profile_id, key, value) VALUES (?1, ?2, ?3)
             ON CONFLICT(profile_id, key) DO UPDATE SET value = excluded.value",
            rusqlite::params![profile_id, key, value],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reset_prompt(state: State<DbState>, profile_id: i64, prompt_key: String) -> Result<String, String> {
    let default = match prompt_key.as_str() {
        "prompt_tailor_docs" => DEFAULT_TAILOR_PROMPT,
        "prompt_email_note" => DEFAULT_EMAIL_NOTE_PROMPT,
        "email_body_template" => DEFAULT_EMAIL_TEMPLATE,
        _ => return Err("Unknown prompt key".into()),
    };
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO profile_settings (profile_id, key, value) VALUES (?1, ?2, ?3)
         ON CONFLICT(profile_id, key) DO UPDATE SET value = excluded.value",
        rusqlite::params![profile_id, prompt_key, default],
    )
    .map_err(|e| e.to_string())?;
    Ok(default.to_string())
}

#[tauri::command]
pub fn clear_workflow_data(state: State<DbState>, profile_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM applications_fts WHERE rowid IN (
            SELECT id FROM applications WHERE profile_id = ?1
        )",
        [profile_id],
    )
    .map_err(|e| format!("Failed to clear search index: {e}"))?;
    tx.execute(
        "DELETE FROM applications WHERE profile_id = ?1",
        [profile_id],
    )
    .map_err(|e| format!("Failed to clear applications: {e}"))?;
    tx.execute(
        "DELETE FROM ad_decisions WHERE profile_id = ?1",
        [profile_id],
    )
    .map_err(|e| format!("Failed to clear ad decisions: {e}"))?;
    tx.execute(
        "DELETE FROM job_ads WHERE profile_id = ?1",
        [profile_id],
    )
    .map_err(|e| format!("Failed to clear job ads: {e}"))?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_default_prompts() -> Result<HashMap<String, String>, String> {
    let mut m = HashMap::new();
    m.insert("prompt_tailor_docs".into(), DEFAULT_TAILOR_PROMPT.into());
    m.insert("prompt_email_note".into(), DEFAULT_EMAIL_NOTE_PROMPT.into());
    m.insert("email_body_template".into(), DEFAULT_EMAIL_TEMPLATE.into());
    Ok(m)
}
