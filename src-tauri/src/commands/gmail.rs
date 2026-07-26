use crate::commands::applications::get_application_attachments;
use crate::commands::attachments::resolve_attachment;
use crate::commands::auth::get_valid_access_token;
use crate::db::{self, DbState};
use base64::Engine;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
struct DraftResponse {
    id: String,
}

pub(crate) fn reject_header_injection(value: &str, field: &str) -> Result<(), String> {
    if value.chars().any(|c| c == '\r' || c == '\n' || c == '\0') {
        return Err(format!("Invalid characters in {field}"));
    }
    Ok(())
}

pub(crate) fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| *c != '"' && *c != '\\' && *c != '\r' && *c != '\n' && *c != '\0')
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "attachment.bin".into()
    } else {
        trimmed.chars().take(180).collect()
    }
}

fn sanitize_address_list(value: &str, field: &str) -> Result<String, String> {
    reject_header_injection(value, field)?;
    Ok(value.trim().to_string())
}

/// RFC 2047 encoded-word for non-ASCII MIME header values (e.g. Subject).
fn encode_mime_header_value(value: &str) -> Result<String, String> {
    reject_header_injection(value, "subject")?;
    if value.is_ascii() {
        return Ok(value.to_string());
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
    Ok(format!("=?UTF-8?B?{encoded}?="))
}

struct AttachmentPart {
    mime_type: String,
    file_name: String,
    content_b64: String,
}

fn attachment_part_from_resolved(
    resolved: &crate::commands::attachments::ResolvedAttachment,
) -> AttachmentPart {
    AttachmentPart {
        mime_type: resolved.mime_type.clone(),
        file_name: sanitize_filename(&resolved.file_name),
        content_b64: resolved.content_b64(),
    }
}

fn build_mime_message(
    to: &str,
    cc: &str,
    bcc: &str,
    subject: &str,
    body: &str,
    resume: &AttachmentPart,
    letter: &AttachmentPart,
) -> Result<String, String> {
    let to = sanitize_address_list(to, "to")?;
    let cc = sanitize_address_list(cc, "cc")?;
    let bcc = sanitize_address_list(bcc, "bcc")?;
    let subject = encode_mime_header_value(subject)?;
    // Normalize body newlines; do not treat them as header injection.
    let body = body.replace("\r\n", "\n").replace('\r', "\n");

    let boundary = format!("boundary_{}", uuid::Uuid::new_v4());
    let mut msg = format!("To: {to}\r\n");
    if !cc.is_empty() {
        msg.push_str(&format!("Cc: {cc}\r\n"));
    }
    if !bcc.is_empty() {
        msg.push_str(&format!("Bcc: {bcc}\r\n"));
    }
    msg.push_str(&format!(
        "Subject: {subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n"
    ));
    msg.push_str(&format!(
        "--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{body}\r\n\r\n"
    ));
    for part in [resume, letter] {
        let name = sanitize_filename(&part.file_name);
        let mime = part
            .mime_type
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '/' || *c == '+' || *c == '.' || *c == '-')
            .collect::<String>();
        let mime = if mime.is_empty() {
            "application/octet-stream".into()
        } else {
            mime
        };
        msg.push_str(&format!(
            "--{boundary}\r\nContent-Type: {mime}; name=\"{name}\"\r\nContent-Disposition: attachment; filename=\"{name}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{}\r\n\r\n",
            part.content_b64
        ));
    }
    msg.push_str(&format!("--{boundary}--"));
    Ok(msg)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDraftRequest {
    pub profile_id: i64,
    pub application_id: i64,
    pub to: String,
    pub cc: String,
    pub bcc: String,
    pub subject: String,
    pub body: String,
    pub test_mode: bool,
    pub test_email: String,
}

#[derive(Debug, Serialize)]
pub struct CreateDraftResult {
    pub draft_id: String,
    pub actual_to: String,
    pub actual_cc: String,
    pub actual_bcc: String,
}

#[tauri::command]
pub async fn create_gmail_draft(
    state: State<'_, DbState>,
    req: CreateDraftRequest,
) -> Result<CreateDraftResult, String> {
    crate::limits::check_char_len(
        &req.subject,
        crate::limits::MAX_EMAIL_SUBJECT_CHARS,
        "Email subject",
    )?;
    crate::limits::check_char_len(
        &req.body,
        crate::limits::MAX_EMAIL_BODY_CHARS,
        "Email body",
    )?;
    for (value, field) in [
        (&req.to, "Email to"),
        (&req.cc, "Email cc"),
        (&req.bcc, "Email bcc"),
        (&req.test_email, "Test email"),
    ] {
        crate::limits::check_char_len(value, crate::limits::MAX_EMAIL_ADDRESS_CHARS, field)?;
    }
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let active = db::ensure_active_profile(&conn, req.profile_id)?;
        let owner: Option<i64> = conn
            .query_row(
                "SELECT profile_id FROM applications WHERE id = ?1",
                [req.application_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if owner != Some(active) {
            return Err("Not found".into());
        }
    }
    let access_token = get_valid_access_token(&state, req.profile_id).await?;

    let (to, cc, bcc) = if req.test_mode && !req.test_email.is_empty() {
        (req.test_email.clone(), String::new(), String::new())
    } else {
        (req.to.clone(), req.cc.clone(), req.bcc.clone())
    };

    let (
        resume_md,
        letter_md,
        resume_html,
        letter_html,
        resume_fmt,
        letter_fmt,
        resume_name,
        letter_name,
        resume_blob,
        letter_blob,
    ) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        get_application_attachments(&conn, req.application_id)?
    };

    let font_css =
        crate::commands::fonts::build_custom_fonts_css(req.profile_id).unwrap_or_default();
    let resume = attachment_part_from_resolved(&resolve_attachment(
        &resume_fmt,
        &resume_name,
        &resume_md,
        &resume_html,
        resume_blob,
        &font_css,
    )?);
    let letter = attachment_part_from_resolved(&resolve_attachment(
        &letter_fmt,
        &letter_name,
        &letter_md,
        &letter_html,
        letter_blob,
        &font_css,
    )?);

    let mime = build_mime_message(&to, &cc, &bcc, &req.subject, &req.body, &resume, &letter)?;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mime.as_bytes());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(crate::limits::HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/drafts")
        .bearer_auth(&access_token)
        .json(&serde_json::json!({ "message": { "raw": raw } }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Gmail API error: {text}"));
    }

    let draft: DraftResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(CreateDraftResult {
        draft_id: draft.id,
        actual_to: to,
        actual_cc: cc,
        actual_bcc: bcc,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_crlf_in_headers() {
        assert!(reject_header_injection("evil\r\nBcc: x@y.z", "to").is_err());
        assert!(reject_header_injection("ok@example.com", "to").is_ok());
    }

    #[test]
    fn sanitizes_filenames() {
        assert_eq!(sanitize_filename("resume.pdf"), "resume.pdf");
        assert_eq!(sanitize_filename("bad\"name\r\n.pdf"), "badname.pdf");
        assert_eq!(sanitize_filename("   "), "attachment.bin");
    }

    #[test]
    fn build_mime_rejects_injected_subject() {
        let part = AttachmentPart {
            mime_type: "application/pdf".into(),
            file_name: "a.pdf".into(),
            content_b64: "QQ==".into(),
        };
        let err = build_mime_message(
            "a@b.c",
            "",
            "",
            "Subject\r\nBcc: evil@x.y",
            "body",
            &part,
            &part,
        )
        .unwrap_err();
        assert!(err.contains("subject") || err.contains("Invalid"));
    }
}
