use keyring::Entry;

const SERVICE: &str = "com.nrasm.workhunter";
pub const OAUTH_KEYRING_MARKER: &str = "keyring:v1";

fn entry(user: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, user).map_err(|e| format!("Keyring error: {e}"))
}

fn set_secret(user: &str, value: &str) -> Result<(), String> {
    entry(user)?
        .set_password(value)
        .map_err(|e| format!("Failed to store secret: {e}"))
}

fn get_secret(user: &str) -> Result<Option<String>, String> {
    match entry(user)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read secret: {e}")),
    }
}

fn delete_secret(user: &str) -> Result<(), String> {
    match entry(user)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete secret: {e}")),
    }
}

fn oauth_user(profile_id: i64) -> String {
    format!("oauth:{profile_id}")
}

fn api_key_user(profile_id: i64, provider: &str) -> String {
    format!("api_key:{provider}:{profile_id}")
}

/// Legacy obfuscation used before OS keyring migration.
pub fn retrieve_legacy_token(stored: &str) -> Option<String> {
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, stored).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    let key = legacy_machine_key();
    s.strip_prefix(&format!("{key}:"))
        .map(|rest| rest.to_string())
}

fn legacy_machine_key() -> String {
    use sha2::{Digest, Sha256};
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "workhunter".into());
    let mut hasher = Sha256::new();
    hasher.update(host.as_bytes());
    hasher.update(b"workhunter-v1");
    hex::encode(hasher.finalize())
}

pub fn store_oauth_tokens(profile_id: i64, tokens_json: &str) -> Result<(), String> {
    set_secret(&oauth_user(profile_id), tokens_json)
}

pub fn load_oauth_tokens(profile_id: i64) -> Result<Option<String>, String> {
    get_secret(&oauth_user(profile_id))
}

pub fn delete_oauth_tokens(profile_id: i64) -> Result<(), String> {
    delete_secret(&oauth_user(profile_id))
}

pub fn store_api_key(profile_id: i64, provider: &str, key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return delete_api_key(profile_id, provider);
    }
    set_secret(&api_key_user(profile_id, provider), key.trim())
}

pub fn load_api_key(profile_id: i64, provider: &str) -> Result<Option<String>, String> {
    get_secret(&api_key_user(profile_id, provider))
}

pub fn api_key_is_set(profile_id: i64, provider: &str) -> Result<bool, String> {
    Ok(load_api_key(profile_id, provider)?.is_some_and(|k| !k.trim().is_empty()))
}

pub fn delete_api_key(profile_id: i64, provider: &str) -> Result<(), String> {
    delete_secret(&api_key_user(profile_id, provider))
}
