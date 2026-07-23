use crate::commands::applications::get_application_attachments;
use crate::commands::attachments::resolve_attachment;
use crate::commands::auth::get_valid_access_token;
use crate::db::DbState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
struct DraftResponse {
    id: String,
}

/// RFC 2047 encoded-word for non-ASCII MIME header values (e.g. Subject).
fn encode_mime_header_value(value: &str) -> String {
    if value.is_ascii() {
        return value.to_string();
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(value.as_bytes());
    format!("=?UTF-8?B?{encoded}?=")
}

struct AttachmentPart {
    mime_type: String,
    file_name: String,
    content_b64: String,
}

fn attachment_part_from_resolved(resolved: &crate::commands::attachments::ResolvedAttachment) -> AttachmentPart {
    AttachmentPart {
        mime_type: resolved.mime_type.clone(),
        file_name: resolved.file_name.clone(),
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
) -> String {
    let boundary = format!("boundary_{}", uuid::Uuid::new_v4());
    let mut msg = format!("To: {to}\r\n");
    if !cc.is_empty() {
        msg.push_str(&format!("Cc: {cc}\r\n"));
    }
    if !bcc.is_empty() {
        msg.push_str(&format!("Bcc: {bcc}\r\n"));
    }
    msg.push_str(&format!(
        "Subject: {}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n",
        encode_mime_header_value(subject),
    ));
    msg.push_str(&format!(
        "--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{body}\r\n\r\n"
    ));
    for part in [resume, letter] {
        msg.push_str(&format!(
            "--{boundary}\r\nContent-Type: {}; name=\"{}\"\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{}\r\n\r\n",
            part.mime_type, part.file_name, part.file_name, part.content_b64
        ));
    }
    msg.push_str(&format!("--{boundary}--"));
    msg
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
    let access_token = get_valid_access_token(&state, req.profile_id).await?;

    let (to, cc, bcc) = if req.test_mode && !req.test_email.is_empty() {
        (req.test_email.clone(), String::new(), String::new())
    } else {
        (req.to.clone(), req.cc.clone(), req.bcc.clone())
    };

    let (resume_md, letter_md, resume_html, letter_html, resume_fmt, letter_fmt, resume_name, letter_name, resume_blob, letter_blob) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        get_application_attachments(&conn, req.application_id)?
    };

    let font_css = crate::commands::fonts::build_custom_fonts_css(req.profile_id).unwrap_or_default();
    let resume = attachment_part_from_resolved(&resolve_attachment(
        &resume_fmt, &resume_name, &resume_md, &resume_html, resume_blob, &font_css,
    )?);
    let letter = attachment_part_from_resolved(&resolve_attachment(
        &letter_fmt, &letter_name, &letter_md, &letter_html, letter_blob, &font_css,
    )?);

    let mime = build_mime_message(&to, &cc, &bcc, &req.subject, &req.body, &resume, &letter);
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mime.as_bytes());

    let client = reqwest::Client::new();
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
