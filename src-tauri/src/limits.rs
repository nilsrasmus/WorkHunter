//! Shared input validation and size bounds for Tauri command payloads.

pub const MAX_DOCUMENT_HTML_BYTES: usize = 2_000_000; // ~2 MiB
pub const MAX_DOCUMENT_NAME_CHARS: usize = 200;
pub const MAX_EMAIL_BODY_CHARS: usize = 100_000;
pub const MAX_EMAIL_SUBJECT_CHARS: usize = 500;
pub const MAX_EMAIL_ADDRESS_CHARS: usize = 500;
pub const MAX_APPLY_NOTES_CHARS: usize = 20_000;
pub const MAX_JOB_AD_JSON_BYTES: usize = 1_000_000;
pub const MAX_SEARCH_QUERY_CHARS: usize = 500;
pub const MAX_SEARCH_PARAM_VALUE_CHARS: usize = 500;
pub const MAX_SEARCH_LIMIT: u32 = 100;
pub const MAX_TAXONOMY_LIMIT: u32 = 2_000;
pub const MAX_TAXONOMY_QUERY_CHARS: usize = 200;
pub const MAX_REGION_IDS: usize = 50;
pub const MAX_AD_ID_CHARS: usize = 64;
pub const MAX_AI_PROMPT_CHARS: usize = 500_000;
pub const HTTP_TIMEOUT_SECS: u64 = 30;
pub const AI_HTTP_TIMEOUT_SECS: u64 = 120;

pub fn check_byte_len(value: &str, max: usize, field: &str) -> Result<(), String> {
    if value.len() > max {
        return Err(format!("{field} exceeds maximum size of {max} bytes"));
    }
    Ok(())
}

pub fn check_char_len(value: &str, max: usize, field: &str) -> Result<(), String> {
    if value.chars().count() > max {
        return Err(format!("{field} exceeds maximum length of {max} characters"));
    }
    Ok(())
}

pub fn require_document_html(html: &str) -> Result<(), String> {
    check_byte_len(html, MAX_DOCUMENT_HTML_BYTES, "Document HTML")
}

pub fn require_document_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Document name is required".into());
    }
    check_char_len(trimmed, MAX_DOCUMENT_NAME_CHARS, "Document name")
}

/// JobTech ad IDs are opaque tokens; allow only URL-safe characters.
pub fn validate_ad_id(ad_id: &str) -> Result<&str, String> {
    let trimmed = ad_id.trim();
    if trimmed.is_empty() {
        return Err("Ad id is required".into());
    }
    check_char_len(trimmed, MAX_AD_ID_CHARS, "Ad id")?;
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("Ad id contains invalid characters".into());
    }
    Ok(trimmed)
}

pub fn validate_taxonomy_type(concept_type: &str) -> Result<&str, String> {
    match concept_type {
        "occupation-name"
        | "occupation-field"
        | "occupation-group"
        | "skill"
        | "language"
        | "municipality"
        | "region"
        | "country"
        | "employment-type"
        | "employment-duration"
        | "worktime-extent"
        | "wage-type"
        | "occupation-collection" => Ok(concept_type),
        _ => Err(format!("Unsupported taxonomy type: {concept_type}")),
    }
}

pub fn clamp_u32(value: Option<u32>, default: u32, max: u32) -> u32 {
    value.unwrap_or(default).min(max).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_oversized_html() {
        let big = "x".repeat(MAX_DOCUMENT_HTML_BYTES + 1);
        assert!(require_document_html(&big).is_err());
    }

    #[test]
    fn accepts_valid_ad_id() {
        assert_eq!(validate_ad_id("abc-123_X.9").unwrap(), "abc-123_X.9");
    }

    #[test]
    fn rejects_unsafe_ad_id() {
        assert!(validate_ad_id("../etc/passwd").is_err());
        assert!(validate_ad_id("a b").is_err());
        assert!(validate_ad_id("").is_err());
    }

    #[test]
    fn taxonomy_type_allowlist() {
        assert!(validate_taxonomy_type("municipality").is_ok());
        assert!(validate_taxonomy_type("evil").is_err());
    }

    #[test]
    fn clamp_respects_bounds() {
        assert_eq!(clamp_u32(None, 20, 100), 20);
        assert_eq!(clamp_u32(Some(0), 20, 100), 1);
        assert_eq!(clamp_u32(Some(500), 20, 100), 100);
    }
}
