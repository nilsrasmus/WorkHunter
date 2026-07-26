use crate::limits::{
    check_char_len, clamp_u32, validate_ad_id, validate_taxonomy_type, HTTP_TIMEOUT_SECS,
    MAX_AD_ID_CHARS, MAX_REGION_IDS, MAX_SEARCH_LIMIT, MAX_SEARCH_PARAM_VALUE_CHARS,
    MAX_SEARCH_QUERY_CHARS, MAX_TAXONOMY_LIMIT, MAX_TAXONOMY_QUERY_CHARS,
};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::command;

const JOBSEARCH_BASE: &str = "https://jobsearch.api.jobtechdev.se";
const TAXONOMY_BASE: &str = "https://taxonomy.api.jobtechdev.se/v1/taxonomy";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

fn push_query_value(query: &mut Vec<(String, String)>, key: &str, value: String) -> Result<(), String> {
    check_char_len(key, 64, "Search param key")?;
    check_char_len(&value, MAX_SEARCH_PARAM_VALUE_CHARS, "Search param value")?;
    if key == "q" {
        check_char_len(&value, MAX_SEARCH_QUERY_CHARS, "Search query")?;
    }
    if key == "limit" {
        let n: u32 = value.parse().unwrap_or(MAX_SEARCH_LIMIT);
        query.push((key.to_string(), clamp_u32(Some(n), 20, MAX_SEARCH_LIMIT).to_string()));
        return Ok(());
    }
    query.push((key.to_string(), value));
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchParams {
    pub params: HashMap<String, serde_json::Value>,
}

#[command]
pub async fn jobsearch_search(params: SearchParams) -> Result<serde_json::Value, String> {
    let client = http_client()?;
    let mut query: Vec<(String, String)> = Vec::new();
    for (key, value) in params.params {
        match value {
            serde_json::Value::Array(arr) => {
                for v in arr {
                    if let serde_json::Value::String(s) = v {
                        push_query_value(&mut query, &key, s)?;
                    } else if !v.is_null() {
                        push_query_value(&mut query, &key, v.to_string())?;
                    }
                }
            }
            serde_json::Value::Bool(b) => {
                push_query_value(&mut query, &key, b.to_string())?;
            }
            serde_json::Value::Number(n) => {
                push_query_value(&mut query, &key, n.to_string())?;
            }
            serde_json::Value::String(s) if !s.is_empty() => {
                push_query_value(&mut query, &key, s)?;
            }
            _ => {}
        }
    }
    let res = client
        .get(format!("{JOBSEARCH_BASE}/search"))
        .header("x-feature-disable-smart-freetext", "true")
        .query(&query)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("JobSearch API error: {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

#[command]
pub async fn jobsearch_get_ad(ad_id: String) -> Result<serde_json::Value, String> {
    let ad_id = validate_ad_id(&ad_id)?;
    let client = http_client()?;
    let encoded = urlencoding::encode(ad_id);
    let res = client
        .get(format!("{JOBSEARCH_BASE}/ad/{encoded}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Job ad not found: {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaxonomyConcept {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub concept_type: String,
}

fn parse_taxonomy_concepts(data: serde_json::Value) -> Vec<TaxonomyConcept> {
    let arr = data.as_array().cloned().unwrap_or_default();
    arr.into_iter()
        .filter_map(|item| {
            Some(TaxonomyConcept {
                id: item.get("taxonomy/id")?.as_str()?.to_string(),
                label: item.get("taxonomy/preferred-label")?.as_str()?.to_string(),
                concept_type: item.get("taxonomy/type")?.as_str()?.to_string(),
            })
        })
        .collect()
}

async fn fetch_taxonomy_concepts(
    concept_type: String,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<TaxonomyConcept>, String> {
    let concept_type = validate_taxonomy_type(&concept_type)?.to_string();
    let client = http_client()?;
    let limit = clamp_u32(limit, 500, MAX_TAXONOMY_LIMIT).to_string();
    let url = if concept_type == "municipality" || concept_type == "region" {
        format!("{TAXONOMY_BASE}/specific/concepts/{concept_type}")
    } else {
        format!("{TAXONOMY_BASE}/main/concepts")
    };

    let mut params: Vec<(&str, String)> = vec![("limit", limit)];
    if concept_type != "municipality" && concept_type != "region" {
        params.push(("type", concept_type));
    }
    if let Some(q) = query {
        let trimmed = q.trim().to_string();
        if !trimmed.is_empty() {
            check_char_len(&trimmed, MAX_TAXONOMY_QUERY_CHARS, "Taxonomy query")?;
            params.push(("q", trimmed));
        }
    }

    let res = client
        .get(&url)
        .query(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Taxonomy API error: {}", res.status()));
    }
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(parse_taxonomy_concepts(json))
}

#[command]
pub async fn taxonomy_list_concepts(
    concept_type: String,
    query: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<TaxonomyConcept>, String> {
    fetch_taxonomy_concepts(concept_type, query, limit).await
}

#[command]
pub async fn taxonomy_swedish_regions() -> Result<Vec<TaxonomyConcept>, String> {
    let all = fetch_taxonomy_concepts("region".into(), None, Some(2000)).await?;
    let mut regions: Vec<TaxonomyConcept> = all
        .into_iter()
        .filter(|c| c.label.ends_with(" län") || c.label == "Gotland" || c.label.ends_with("s län"))
        .collect();
    regions.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(regions)
}

#[command]
pub async fn taxonomy_municipalities_for_regions(
    region_ids: Vec<String>,
) -> Result<Vec<TaxonomyConcept>, String> {
    if region_ids.len() > MAX_REGION_IDS {
        return Err(format!("Too many region ids (max {MAX_REGION_IDS})"));
    }
    let client = http_client()?;
    let mut seen = std::collections::HashSet::new();
    let mut municipalities = Vec::new();

    for region_id in region_ids {
        let trimmed = region_id.trim();
        if trimmed.is_empty() {
            continue;
        }
        check_char_len(trimmed, MAX_AD_ID_CHARS, "Region id")?;
        if !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        {
            return Err("Region id contains invalid characters".into());
        }
        let res = client
            .get(format!("{TAXONOMY_BASE}/main/concepts"))
            .query(&[
                ("type", "municipality"),
                ("related-ids", trimmed),
                ("relation", "narrower"),
                ("limit", "500"),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Taxonomy API error: {}", res.status()));
        }
        let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        for item in parse_taxonomy_concepts(json) {
            if seen.insert(item.id.clone()) {
                municipalities.push(item);
            }
        }
    }

    municipalities.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(municipalities)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchPreset {
    pub id: i64,
    pub profile_id: i64,
    pub role_id: Option<i64>,
    pub name: String,
    pub filters_json: String,
    pub created_at: String,
}

#[command]
pub fn list_search_presets(
    state: tauri::State<crate::db::DbState>,
    profile_id: i64,
    role_id: Option<i64>,
) -> Result<Vec<SearchPreset>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let active = crate::db::ensure_active_profile(&conn, profile_id)?;
    if let Some(role_id) = role_id {
        let owner: Option<i64> = conn
            .query_row(
                "SELECT profile_id FROM roles WHERE id = ?1",
                [role_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if owner != Some(active) {
            return Err("Not found".into());
        }
    }
    let presets = if let Some(rid) = role_id {
        let mut stmt = conn
            .prepare("SELECT id, profile_id, role_id, name, filters_json, created_at FROM search_presets WHERE profile_id = ?1 AND role_id = ?2 ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![active, rid], |row| {
                Ok(SearchPreset {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    role_id: row.get(2)?,
                    name: row.get(3)?,
                    filters_json: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare("SELECT id, profile_id, role_id, name, filters_json, created_at FROM search_presets WHERE profile_id = ?1 ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([active], |row| {
                Ok(SearchPreset {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    role_id: row.get(2)?,
                    name: row.get(3)?,
                    filters_json: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    Ok(presets)
}

#[command]
pub fn save_search_preset(
    state: tauri::State<crate::db::DbState>,
    profile_id: i64,
    role_id: Option<i64>,
    name: String,
    filters_json: String,
) -> Result<SearchPreset, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let active = crate::db::ensure_active_profile(&conn, profile_id)?;
    if let Some(role_id) = role_id {
        let owner: Option<i64> = conn
            .query_row(
                "SELECT profile_id FROM roles WHERE id = ?1",
                [role_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if owner != Some(active) {
            return Err("Not found".into());
        }
    }
    let now = crate::db::now_iso();
    conn.execute(
        "INSERT INTO search_presets (profile_id, role_id, name, filters_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![active, role_id, name, filters_json, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(SearchPreset {
        id: conn.last_insert_rowid(),
        profile_id: active,
        role_id,
        name,
        filters_json,
        created_at: now,
    })
}

#[command]
pub fn delete_search_preset(
    state: tauri::State<crate::db::DbState>,
    preset_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let active = crate::db::require_active_profile(&conn)?;
    let owner: Option<i64> = conn
        .query_row(
            "SELECT profile_id FROM search_presets WHERE id = ?1",
            [preset_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if owner != Some(active) {
        return Err("Not found".into());
    }
    conn.execute("DELETE FROM search_presets WHERE id = ?1", [preset_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn get_processed_ad_ids(
    state: tauri::State<crate::db::DbState>,
    profile_id: i64,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let active = crate::db::ensure_active_profile(&conn, profile_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT j.af_ad_id FROM ad_decisions d
             JOIN job_ads j ON j.id = d.job_ad_id
             WHERE d.profile_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([active], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
