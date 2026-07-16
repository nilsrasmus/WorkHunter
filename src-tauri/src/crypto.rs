use sha2::{Digest, Sha256};

/// Simple obfuscation keyed to machine — not production-grade but avoids plaintext at rest.
pub fn store_token(plain: &str) -> String {
    let key = machine_key();
    let combined = format!("{key}:{plain}");
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, combined.as_bytes())
}

pub fn retrieve_token(stored: &str) -> Option<String> {
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, stored).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    let key = machine_key();
    s.strip_prefix(&format!("{key}:"))
        .map(|rest| rest.to_string())
}

fn machine_key() -> String {
    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "workhunter".into());
    let mut hasher = Sha256::new();
    hasher.update(host.as_bytes());
    hasher.update(b"workhunter-v1");
    hex::encode(hasher.finalize())
}

// hostname crate not added - use dirs fallback
mod hostname {
    pub fn get() -> Result<std::ffi::OsString, ()> {
        Ok(std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "workhunter".into())
            .into())
    }
}
