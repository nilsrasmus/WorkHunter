use crate::db::DbState;
use chrono::{Duration, Utc};
use tauri::State;

#[tauri::command]
pub fn run_retention_cleanup(state: State<DbState>, profile_id: Option<i64>) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let cutoff = (Utc::now() - Duration::days(180)).to_rfc3339();
    let deleted = if let Some(pid) = profile_id {
        conn.execute(
            "DELETE FROM applications WHERE profile_id = ?1 AND sent_at IS NOT NULL AND sent_at < ?2",
            rusqlite::params![pid, cutoff],
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.execute(
            "DELETE FROM applications WHERE sent_at IS NOT NULL AND sent_at < ?1",
            [&cutoff],
        )
        .map_err(|e| e.to_string())?
    };
    Ok(deleted as u32)
}

#[tauri::command]
pub fn days_until_retention(sent_at: String) -> Result<i64, String> {
    let sent = chrono::DateTime::parse_from_rfc3339(&sent_at)
        .map_err(|e| e.to_string())?;
    let expiry = sent + Duration::days(180);
    let now = Utc::now();
    let days = (expiry.with_timezone(&Utc) - now).num_days();
    Ok(days.max(0))
}
