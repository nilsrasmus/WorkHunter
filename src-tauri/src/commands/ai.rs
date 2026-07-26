use crate::commands::settings::require_api_key;
use crate::db::{self, DbState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

const AI_TEMPERATURE: f64 = 0.5;

fn ai_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(crate::limits::AI_HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct VisionImage {
    pub mime_type: String,
    pub base64: String,
}

#[derive(Debug, Deserialize)]
pub struct AiGenerateRequest {
    pub profile_id: i64,
    pub provider: String,
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub response_json: Option<bool>,
    pub images: Option<Vec<VisionImage>>,
    pub max_output_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct AiGenerateResponse {
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiModelOption {
    pub id: String,
    pub label: String,
}

fn normalize_gemini_model(model: &str) -> String {
    model
        .strip_prefix("models/")
        .unwrap_or(model)
        .to_string()
}

fn extract_gemini_text(data: &Value) -> Result<String, String> {
    data.pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Gemini did not return text content".into())
}

async fn generate_gemini(req: &AiGenerateRequest, api_key: &str) -> Result<String, String> {
    let model = normalize_gemini_model(&req.model);
    let mut user_parts: Vec<Value> = Vec::new();
    if let Some(images) = &req.images {
        for image in images {
            user_parts.push(json!({
                "inline_data": {
                    "mime_type": image.mime_type,
                    "data": image.base64,
                }
            }));
        }
    }
    user_parts.push(json!({ "text": req.user_prompt }));

    let mut generation_config = json!({ "temperature": AI_TEMPERATURE });
    if let Some(max) = req.max_output_tokens {
        generation_config["maxOutputTokens"] = json!(max);
    }
    if req.response_json.unwrap_or(false) {
        generation_config["responseMimeType"] = "application/json".into();
    }

    let body = json!({
        "systemInstruction": { "parts": [{ "text": req.system_prompt }] },
        "contents": [{ "role": "user", "parts": user_parts }],
        "generationConfig": generation_config,
    });

    let client = ai_http_client()?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    );
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API error ({status}): {err}"));
    }
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    extract_gemini_text(&data)
}

async fn generate_anthropic(req: &AiGenerateRequest, api_key: &str) -> Result<String, String> {
    let mut content: Vec<Value> = Vec::new();
    if let Some(images) = &req.images {
        for image in images {
            content.push(json!({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.mime_type,
                    "data": image.base64,
                }
            }));
        }
    }
    let user_text = format!(
        "Aim for a natural, moderate level of variation in your wording and phrasing — \
not the single most predictable option every time, but not deliberately unusual either.\n\n{}",
        req.user_prompt
    );
    content.push(json!({ "type": "text", "text": user_text }));

    let body = json!({
        "model": req.model,
        "max_tokens": req.max_output_tokens.unwrap_or(16384),
        "system": [{
            "type": "text",
            "text": req.system_prompt,
            "cache_control": { "type": "ephemeral" },
        }],
        "messages": [{ "role": "user", "content": content }],
    });

    let client = ai_http_client()?;
    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({status}): {err}"));
    }
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    data.get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|b| {
                if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                    b.get("text").and_then(|t| t.as_str()).map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
        })
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Anthropic did not return text content".into())
}

#[tauri::command]
pub async fn ai_generate(
    state: State<'_, DbState>,
    req: AiGenerateRequest,
) -> Result<AiGenerateResponse, String> {
    crate::limits::check_char_len(
        &req.system_prompt,
        crate::limits::MAX_AI_PROMPT_CHARS,
        "System prompt",
    )?;
    crate::limits::check_char_len(
        &req.user_prompt,
        crate::limits::MAX_AI_PROMPT_CHARS,
        "User prompt",
    )?;
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        db::ensure_active_profile(&conn, req.profile_id)?;
    }
    let provider = if req.provider == "anthropic" {
        "anthropic"
    } else {
        "gemini"
    };
    let api_key = require_api_key(req.profile_id, provider)?;
    let text = if provider == "anthropic" {
        generate_anthropic(&req, &api_key).await?
    } else {
        generate_gemini(&req, &api_key).await?
    };
    Ok(AiGenerateResponse { text })
}

#[tauri::command]
pub async fn ai_list_models(
    state: State<'_, DbState>,
    profile_id: i64,
    provider: String,
) -> Result<Vec<AiModelOption>, String> {
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        db::ensure_active_profile(&conn, profile_id)?;
    }
    let provider = if provider == "anthropic" {
        "anthropic"
    } else {
        "gemini"
    };
    let api_key = require_api_key(profile_id, provider)?;
    if provider == "anthropic" {
        list_anthropic_models(&api_key).await
    } else {
        list_gemini_models(&api_key).await
    }
}

async fn list_gemini_models(api_key: &str) -> Result<Vec<AiModelOption>, String> {
    let client = ai_http_client()?;
    let mut models = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=100"
        );
        if let Some(token) = &page_token {
            url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
        }
        let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Gemini models API error ({status}): {err}"));
        }
        let data: Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(arr) = data.get("models").and_then(|m| m.as_array()) {
            for model in arr {
                let name = model.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let id = normalize_gemini_model(name);
                if !id.starts_with("gemini") {
                    continue;
                }
                let methods = model
                    .get("supportedGenerationMethods")
                    .and_then(|m| m.as_array())
                    .cloned()
                    .unwrap_or_default();
                if !methods.iter().any(|m| m.as_str() == Some("generateContent")) {
                    continue;
                }
                let label = model
                    .get("displayName")
                    .and_then(|d| d.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| id.clone());
                models.push(AiModelOption { id, label });
            }
        }
        page_token = data
            .get("nextPageToken")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());
        if page_token.is_none() {
            break;
        }
    }
    models.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(models)
}

async fn list_anthropic_models(api_key: &str) -> Result<Vec<AiModelOption>, String> {
    let client = ai_http_client()?;
    let mut models = Vec::new();
    let mut after_id: Option<String> = None;
    loop {
        let mut url = "https://api.anthropic.com/v1/models?limit=100".to_string();
        if let Some(id) = &after_id {
            url.push_str(&format!("&after_id={}", urlencoding::encode(id)));
        }
        let res = client
            .get(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            let status = res.status();
            let err = res.text().await.unwrap_or_default();
            return Err(format!("Anthropic models API error ({status}): {err}"));
        }
        let data: Value = res.json().await.map_err(|e| e.to_string())?;
        if let Some(arr) = data.get("data").and_then(|d| d.as_array()) {
            for model in arr {
                let id = model
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                if id.is_empty() {
                    continue;
                }
                let label = model
                    .get("display_name")
                    .and_then(|d| d.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| id.clone());
                models.push(AiModelOption { id, label });
            }
        }
        let has_more = data.get("has_more").and_then(|h| h.as_bool()).unwrap_or(false);
        after_id = if has_more {
            data.get("last_id")
                .and_then(|i| i.as_str())
                .map(|s| s.to_string())
        } else {
            None
        };
        if after_id.is_none() {
            break;
        }
    }
    Ok(models)
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
