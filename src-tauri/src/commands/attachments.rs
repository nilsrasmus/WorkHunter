use crate::commands::html_pdf::html_to_pdf_bytes;
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

/// Resolve an application attachment from editable content only.
/// `font_css` is optional @font-face CSS for custom fonts embedded in HTML→PDF.
pub fn resolve_attachment(
    format: &str,
    file_name: &str,
    md_content: &str,
    html_content: &str,
    _blob: Option<Vec<u8>>,
    font_css: &str,
) -> Result<ResolvedAttachment, String> {
    match format {
        "html" => {
            let source = if html_content.trim().is_empty() {
                if md_content.trim().is_empty() {
                    return Err("Missing HTML content for attachment".into());
                }
                return resolve_markdown_pdf(file_name, md_content);
            } else {
                html_content
            };
            let pdf_bytes = html_to_pdf_bytes(source, font_css)?;
            Ok(ResolvedAttachment {
                mime_type: "application/pdf".into(),
                file_name: pdf_file_name(file_name, ".html"),
                bytes: pdf_bytes,
            })
        }
        "markdown" => resolve_markdown_pdf(file_name, md_content),
        "pdf" | "docx" => Err(
            "Binary PDF/DOCX attachments are no longer supported. Convert the document to editable HTML first."
                .into(),
        ),
        other => Err(format!("Unsupported document format for attachment: {other}")),
    }
}

fn resolve_markdown_pdf(file_name: &str, md_content: &str) -> Result<ResolvedAttachment, String> {
    let pdf_bytes = markdown_to_pdf_bytes(md_content)?;
    Ok(ResolvedAttachment {
        mime_type: "application/pdf".into(),
        file_name: pdf_file_name(file_name, ".md"),
        bytes: pdf_bytes,
    })
}

fn pdf_file_name(file_name: &str, trim_ext: &str) -> String {
    if file_name.ends_with(".pdf") {
        file_name.to_string()
    } else {
        format!("{}.pdf", file_name.trim_end_matches(trim_ext))
    }
}
