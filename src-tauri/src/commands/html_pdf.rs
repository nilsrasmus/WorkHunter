use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn wrap_html_for_print(body: &str, font_css: &str) -> String {
    let fonts = if font_css.trim().is_empty() {
        String::new()
    } else {
        format!("\n{font_css}\n")
    };
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {{ size: A4; margin: 20mm; }}
{fonts}body {{
  margin: 0;
  color: #12161A;
  font-family: 'Geist Variable', Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.5;
  background: #ffffff;
}}
h1 {{ font-size: 18pt; margin: 0 0 8pt; }}
h2 {{ font-size: 14pt; margin: 12pt 0 6pt; }}
h3 {{ font-size: 12pt; margin: 10pt 0 4pt; }}
p {{ margin: 0 0 8pt; }}
ul, ol {{ margin: 0 0 8pt; padding-left: 20pt; }}
hr {{ border: none; border-top: 1px solid #CDD1D6; margin: 12pt 0; }}
blockquote {{ margin: 0 0 8pt; padding-left: 12pt; border-left: 3px solid #CDD1D6; }}
</style>
</head>
<body>{body}</body>
</html>"#
    )
}

fn find_chromium() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ];
        for candidate in candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ];
        for candidate in candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for name in ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"] {
            if let Ok(output) = Command::new("which").arg(name).output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Some(PathBuf::from(path));
                    }
                }
            }
        }
    }

    None
}

pub fn html_to_pdf_bytes(html: &str, font_css: &str) -> Result<Vec<u8>, String> {
    let chromium = find_chromium().ok_or_else(|| {
        "No Chromium browser found. Install Microsoft Edge or Google Chrome to export PDFs.".to_string()
    })?;

    let temp_dir = std::env::temp_dir().join(format!("workhunter-pdf-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let html_path = temp_dir.join("document.html");
    let pdf_path = temp_dir.join("document.pdf");

    fs::write(&html_path, wrap_html_for_print(html, font_css))
        .map_err(|e| format!("Failed to write HTML: {e}"))?;

    let html_url = path_to_file_url(&html_path);
    let output = Command::new(&chromium)
        .args([
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            &format!("--print-to-pdf={}", pdf_path.display()),
            &html_url,
        ])
        .output()
        .map_err(|e| format!("Failed to run browser for PDF: {e}"))?;

    let result = if output.status.success() && pdf_path.exists() {
        fs::read(&pdf_path).map_err(|e| format!("Failed to read PDF: {e}"))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("PDF generation failed: {stderr}"))
    };

    let _ = fs::remove_dir_all(&temp_dir);
    result
}

fn path_to_file_url(path: &Path) -> String {
    let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let s = abs.to_string_lossy().replace('\\', "/");
    if s.starts_with("//") {
        format!("file:{s}")
    } else if s.chars().nth(1) == Some(':') {
        format!("file:///{s}")
    } else {
        format!("file://{s}")
    }
}

pub fn html_to_pdf_base64(html: &str, font_css: &str) -> Result<String, String> {
    let bytes = html_to_pdf_bytes(html, font_css)?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &bytes,
    ))
}

#[tauri::command]
pub fn generate_html_pdf_base64(html: String, font_css: Option<String>) -> Result<String, String> {
    html_to_pdf_base64(&html, font_css.as_deref().unwrap_or(""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_html_includes_body() {
        let wrapped = wrap_html_for_print("<p>Hello</p>", "");
        assert!(wrapped.contains("<p>Hello</p>"));
        assert!(wrapped.contains("@page"));
    }

    #[test]
    fn wrap_html_includes_fonts() {
        let wrapped = wrap_html_for_print("<p>Hi</p>", "@font-face { font-family: X; }");
        assert!(wrapped.contains("@font-face"));
    }
}
