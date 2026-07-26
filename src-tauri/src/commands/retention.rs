use chrono::{Duration, Utc};

#[tauri::command]
pub fn days_until_retention(sent_at: String) -> Result<i64, String> {
    let sent = chrono::DateTime::parse_from_rfc3339(&sent_at).map_err(|e| e.to_string())?;
    let expiry = sent + Duration::days(180);
    let now = Utc::now();
    let days = (expiry.with_timezone(&Utc) - now).num_days();
    Ok(days.max(0))
}
