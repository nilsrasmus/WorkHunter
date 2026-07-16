use crate::crypto::{retrieve_token, store_token};
use crate::db::{self, DbState};
use crate::defaults::default_settings;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: i64,
    pub google_sub: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub setup_completed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub profile: Option<Profile>,
}

fn row_to_profile(row: &rusqlite::Row) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get(0)?,
        google_sub: row.get(1)?,
        email: row.get(2)?,
        display_name: row.get(3)?,
        avatar_url: row.get(4)?,
        setup_completed: row.get::<_, i64>(5)? != 0,
    })
}

pub fn seed_profile_settings(conn: &rusqlite::Connection, profile_id: i64) -> rusqlite::Result<()> {
    for (key, value) in default_settings() {
        conn.execute(
            "INSERT OR IGNORE INTO profile_settings (profile_id, key, value) VALUES (?1, ?2, ?3)",
            rusqlite::params![profile_id, key, value],
        )?;
    }
    // Load API keys from env if present
    if let Ok(key) = std::env::var("GEMINI_API_KEY") {
        if !key.is_empty() {
            conn.execute(
                "UPDATE profile_settings SET value = ?1 WHERE profile_id = ?2 AND key = 'gemini_api_key' AND (value = '' OR value IS NULL)",
                rusqlite::params![key, profile_id],
            )?;
        }
    }
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            conn.execute(
                "UPDATE profile_settings SET value = ?1 WHERE profile_id = ?2 AND key = 'anthropic_api_key' AND (value = '' OR value IS NULL)",
                rusqlite::params![key, profile_id],
            )?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_session(state: State<DbState>) -> Result<SessionInfo, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let profile_id = db::active_profile_id(&conn).map_err(|e| e.to_string())?;
    if let Some(id) = profile_id {
        let mut stmt = conn
            .prepare("SELECT id, google_sub, email, display_name, avatar_url, setup_completed FROM profiles WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let profile = stmt
            .query_row([id], row_to_profile)
            .map_err(|e| e.to_string())?;
        return Ok(SessionInfo {
            profile: Some(profile),
        });
    }
    Ok(SessionInfo { profile: None })
}

#[tauri::command]
pub fn logout(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::clear_active_profile(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn complete_setup(state: State<DbState>, profile_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE profiles SET setup_completed = 1 WHERE id = ?1",
        [profile_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_profile(
    conn: &rusqlite::Connection,
    google_sub: &str,
    email: &str,
    display_name: &str,
    avatar_url: Option<&str>,
    tokens_json: &str,
) -> rusqlite::Result<i64> {
    let now = db::now_iso();
    let encrypted = store_token(tokens_json);
    conn.execute(
        "INSERT INTO profiles (google_sub, email, display_name, avatar_url, oauth_tokens_encrypted, setup_completed, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
         ON CONFLICT(google_sub) DO UPDATE SET
           email = excluded.email,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           oauth_tokens_encrypted = excluded.oauth_tokens_encrypted,
           last_login_at = excluded.last_login_at",
        rusqlite::params![google_sub, email, display_name, avatar_url, encrypted, now],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM profiles WHERE google_sub = ?1",
        [google_sub],
        |r| r.get(0),
    )?;
    seed_profile_settings(conn, id)?;
    db::set_active_profile_id(conn, id)?;
    Ok(id)
}

pub fn get_oauth_tokens(conn: &rusqlite::Connection, profile_id: i64) -> Result<String, String> {
    let encrypted: String = conn
        .query_row(
            "SELECT oauth_tokens_encrypted FROM profiles WHERE id = ?1",
            [profile_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    retrieve_token(&encrypted).ok_or_else(|| "Failed to decrypt tokens".into())
}

pub fn update_oauth_tokens(
    conn: &rusqlite::Connection,
    profile_id: i64,
    tokens_json: &str,
) -> Result<(), String> {
    let encrypted = store_token(tokens_json);
    conn.execute(
        "UPDATE profiles SET oauth_tokens_encrypted = ?1 WHERE id = ?2",
        rusqlite::params![encrypted, profile_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
