use crate::db::DbState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomFont {
    pub id: String,
    pub family: String,
    pub file_name: String,
    pub format: String,
}

fn fonts_root() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("No data directory")?;
    Ok(base.join("WorkHunter").join("fonts"))
}

fn profile_fonts_dir(profile_id: i64) -> Result<PathBuf, String> {
    Ok(fonts_root()?.join(profile_id.to_string()))
}

fn manifest_path(profile_id: i64) -> Result<PathBuf, String> {
    Ok(profile_fonts_dir(profile_id)?.join("fonts.json"))
}

fn read_manifest(profile_id: i64) -> Result<Vec<CustomFont>, String> {
    let path = manifest_path(profile_id)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn write_manifest(profile_id: i64, fonts: &[CustomFont]) -> Result<(), String> {
    let dir = profile_fonts_dir(profile_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = manifest_path(profile_id)?;
    let raw = serde_json::to_string_pretty(fonts).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn format_from_name(file_name: &str) -> Result<&'static str, String> {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".woff2") {
        Ok("woff2")
    } else if lower.ends_with(".woff") {
        Ok("woff")
    } else if lower.ends_with(".ttf") {
        Ok("truetype")
    } else if lower.ends_with(".otf") {
        Ok("opentype")
    } else {
        Err("Unsupported font type. Use .ttf, .otf, .woff, or .woff2".into())
    }
}

fn mime_for_format(format: &str) -> &'static str {
    match format {
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "truetype" => "font/ttf",
        "opentype" => "font/otf",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub fn list_custom_fonts(
    _state: State<DbState>,
    profile_id: i64,
) -> Result<Vec<CustomFont>, String> {
    read_manifest(profile_id)
}

#[tauri::command]
pub fn add_custom_font(
    _state: State<DbState>,
    profile_id: i64,
    family: String,
    file_name: String,
    file_base64: String,
) -> Result<CustomFont, String> {
    let family = family.trim().to_string();
    if family.is_empty() {
        return Err("Font family name is required".into());
    }
    let format = format_from_name(&file_name)?.to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(file_base64.trim())
        .map_err(|e| format!("Invalid font data: {e}"))?;
    if bytes.is_empty() {
        return Err("Font file is empty".into());
    }
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Font file is too large (max 8 MB)".into());
    }

    let id = Uuid::new_v4().to_string();
    let ext = file_name
        .rsplit('.')
        .next()
        .unwrap_or("ttf")
        .to_lowercase();
    let stored_name = format!("{id}.{ext}");
    let dir = profile_fonts_dir(profile_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(&stored_name), &bytes).map_err(|e| e.to_string())?;

    let font = CustomFont {
        id: id.clone(),
        family,
        file_name: stored_name,
        format,
    };
    let mut fonts = read_manifest(profile_id)?;
    fonts.push(font.clone());
    write_manifest(profile_id, &fonts)?;
    Ok(font)
}

#[tauri::command]
pub fn delete_custom_font(
    _state: State<DbState>,
    profile_id: i64,
    font_id: String,
) -> Result<(), String> {
    let mut fonts = read_manifest(profile_id)?;
    let Some(idx) = fonts.iter().position(|f| f.id == font_id) else {
        return Err("Font not found".into());
    };
    let removed = fonts.remove(idx);
    let path = profile_fonts_dir(profile_id)?.join(&removed.file_name);
    let _ = fs::remove_file(path);
    write_manifest(profile_id, &fonts)?;
    Ok(())
}

/// Build @font-face CSS with base64 data URLs for editor + PDF embedding.
#[tauri::command]
pub fn get_custom_fonts_css(
    _state: State<DbState>,
    profile_id: i64,
) -> Result<String, String> {
    build_custom_fonts_css(profile_id)
}

pub fn build_custom_fonts_css(profile_id: i64) -> Result<String, String> {
    let fonts = read_manifest(profile_id)?;
    if fonts.is_empty() {
        return Ok(String::new());
    }
    let dir = profile_fonts_dir(profile_id)?;
    let mut css = String::new();
    for font in fonts {
        let path = dir.join(&font.file_name);
        if !path.exists() {
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = mime_for_format(&font.format);
        let family = font.family.replace('\\', "\\\\").replace('"', "\\\"");
        css.push_str(&format!(
            "@font-face {{\n  font-family: \"{family}\";\n  src: url(data:{mime};base64,{b64}) format(\"{}\");\n  font-display: swap;\n}}\n",
            font.format
        ));
    }
    Ok(css)
}
