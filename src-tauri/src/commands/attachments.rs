use crate::commands::pdf::markdown_to_pdf_bytes;
use base64::Engine;

pub struct ResolvedAttachment {
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

impl ResolvedAttachment {
    pub fn content_b64(&self) -> String {
        base64::engine::general_purpose::STANDARD.encode(&self.bytes)
    }
}

pub fn resolve_attachment(
    format: &str,
    file_name: &str,
    md_content: &str,
    blob: Option<Vec<u8>>,
) -> Result<ResolvedAttachment, String> {
    match format {
        "pdf" => {
            let bytes = blob.ok_or("Missing PDF file data")?;
            Ok(ResolvedAttachment {
                mime_type: "application/pdf".into(),
                file_name: file_name.to_string(),
                bytes,
            })
        }
        "docx" => {
            let bytes = blob.ok_or("Missing DOCX file data")?;
            Ok(ResolvedAttachment {
                mime_type:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        .into(),
                file_name: file_name.to_string(),
                bytes,
            })
        }
        _ => {
            let pdf_bytes = markdown_to_pdf_bytes(md_content)?;
            let pdf_name = if file_name.ends_with(".pdf") {
                file_name.to_string()
            } else {
                format!("{}.pdf", file_name.trim_end_matches(".md"))
            };
            Ok(ResolvedAttachment {
                mime_type: "application/pdf".into(),
                file_name: pdf_name,
                bytes: pdf_bytes,
            })
        }
    }
}
