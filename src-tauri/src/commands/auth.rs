use crate::commands::profiles::{get_oauth_tokens, update_oauth_tokens, upsert_profile, Profile};
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

const REDIRECT_PORT: u16 = 1422;
const REDIRECT_PATH: &str = "/oauth/callback";

#[derive(Debug, Serialize, Deserialize)]
struct OAuthTokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: Option<String>,
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: String,
    name: String,
    picture: Option<String>,
}

fn google_client_id() -> Result<String, String> {
    std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set in .env".into())
}

fn google_client_secret() -> Result<String, String> {
    std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET not set in .env".into())
}

fn auth_url() -> Result<String, String> {
    let client_id = google_client_id()?;
    let redirect = format!("http://127.0.0.1:{REDIRECT_PORT}{REDIRECT_PATH}");
    let scope = urlencoding::encode(
        "openid email profile https://www.googleapis.com/auth/gmail.compose",
    );
    Ok(format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={}&response_type=code&scope={scope}&access_type=offline&prompt=consent",
        urlencoding::encode(&redirect)
    ))
}

async fn exchange_code(code: &str) -> Result<OAuthTokens, String> {
    let client_id = google_client_id()?;
    let client_secret = google_client_secret()?;
    let redirect = format!("http://127.0.0.1:{REDIRECT_PORT}{REDIRECT_PATH}");
    let client = reqwest::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("redirect_uri", &redirect),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {text}"));
    }
    res.json::<OAuthTokens>().await.map_err(|e| e.to_string())
}

async fn fetch_user_info(access_token: &str) -> Result<GoogleUserInfo, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json::<GoogleUserInfo>().await.map_err(|e| e.to_string())
}

async fn refresh_access_token(refresh_token: &str) -> Result<OAuthTokens, String> {
    let client_id = google_client_id()?;
    let client_secret = google_client_secret()?;
    let client = reqwest::Client::new();
    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {text}"));
    }
    res.json::<OAuthTokens>().await.map_err(|e| e.to_string())
}

pub async fn get_valid_access_token(state: &DbState, profile_id: i64) -> Result<String, String> {
    let tokens_json = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        get_oauth_tokens(&conn, profile_id)?
    };
    let mut tokens: OAuthTokens =
        serde_json::from_str(&tokens_json).map_err(|e| e.to_string())?;
    if let Some(refresh) = tokens.refresh_token.as_deref() {
        let refreshed = refresh_access_token(refresh).await?;
        tokens.access_token = refreshed.access_token;
        if refreshed.refresh_token.is_some() {
            tokens.refresh_token = refreshed.refresh_token;
        }
        let new_json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        update_oauth_tokens(&conn, profile_id, &new_json)?;
    }
    Ok(tokens.access_token)
}

#[tauri::command]
pub async fn start_google_auth(app: AppHandle, state: State<'_, DbState>) -> Result<Profile, String> {
    let _ = dotenvy::dotenv();
    let url = auth_url()?;

    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();

    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(format!("127.0.0.1:{REDIRECT_PORT}")) {
            Ok(s) => s,
            Err(e) => {
                let _ = tx.send(Err(format!("OAuth server error: {e}")));
                return;
            }
        };

        // Browsers may hit the callback more than once (favicon, prefetch, etc.).
        // Keep listening until we receive a request that contains a non-empty code.
        loop {
            match server.recv() {
                Ok(request) => {
                    let url = request.url();
                    if let Some(err) = extract_oauth_error(url) {
                        let _ = request.respond(oauth_response_html(
                            "Login failed",
                            &format!("Google returned an error: {err}"),
                        ));
                        let _ = tx.send(Err(err));
                        return;
                    }

                    if let Some(code) = extract_oauth_code(url) {
                        let _ = request.respond(oauth_response_html(
                            "Login successful!",
                            "You can close this window and return to WorkHunter.",
                        ));
                        let _ = tx.send(Ok(code));
                        return;
                    }

                    // Ignore unrelated requests (e.g. favicon.ico).
                    let _ = request.respond(tiny_http::Response::empty(404));
                }
                Err(e) => {
                    let _ = tx.send(Err(format!("OAuth request error: {e}")));
                    return;
                }
            }
        }
    });

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())?;

    let code = rx.recv().map_err(|e| e.to_string())??;
    if code.is_empty() {
        return Err("No authorization code received from Google".into());
    }
    let tokens = exchange_code(&code).await?;
    let user = fetch_user_info(&tokens.access_token).await?;
    let tokens_json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;

    let profile = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let id = upsert_profile(
            &conn,
            &user.sub,
            &user.email,
            &user.name,
            user.picture.as_deref(),
            &tokens_json,
        )
        .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, google_sub, email, display_name, avatar_url, setup_completed FROM profiles WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row([id], |row| {
            Ok(Profile {
                id: row.get(0)?,
                google_sub: row.get(1)?,
                email: row.get(2)?,
                display_name: row.get(3)?,
                avatar_url: row.get(4)?,
                setup_completed: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
    };

    Ok(profile)
}

fn oauth_response_html(title: &str, message: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let body = format!(
        "<html><body><h2>{title}</h2><p>{message}</p></body></html>"
    );
    tiny_http::Response::from_string(body).with_header(
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap(),
    )
}

fn extract_oauth_error(url: &str) -> Option<String> {
    let query = query_string(url)?;
    let error = query_param(query, "error")?;
    let desc = query_param(query, "error_description").unwrap_or_default();
    if desc.is_empty() {
        Some(error)
    } else {
        Some(format!("{error}: {desc}"))
    }
}

fn query_string(url: &str) -> Option<&str> {
    let without_fragment = url.split('#').next()?;
    without_fragment.split('?').nth(1)
}

fn query_param(query: &str, name: &str) -> Option<String> {
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if key == name {
            return Some(value.into_owned());
        }
    }
    None
}

fn extract_oauth_code(url: &str) -> Option<String> {
    let query = query_string(url)?;
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if key == "code" && !value.is_empty() {
            return Some(value.into_owned());
        }
    }
    None
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
