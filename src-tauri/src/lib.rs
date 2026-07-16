mod commands;
mod crypto;
mod db;
mod defaults;

use commands::{
    applications::{
        approve_application, export_application_package, get_application, get_application_by_decision,
        get_application_file_base64, list_in_progress, mark_application_sent, save_application, save_apply_notes, search_archive,
        set_gmail_draft_id,
    },
    auth::start_google_auth,
    decisions::{get_decision_with_ad, proceed_ad, reject_ad, update_decision_status},
    gmail::create_gmail_draft,
    jobsearch::{
        delete_search_preset, get_processed_ad_ids, jobsearch_complete, jobsearch_get_ad,
        jobsearch_search,         list_search_presets, save_search_preset, taxonomy_list_concepts, taxonomy_municipalities,
        taxonomy_municipalities_for_regions, taxonomy_search, taxonomy_swedish_regions,
    },
    pdf::generate_pdf_base64,
    profiles::{complete_setup, get_session, logout},
    retention::{days_until_retention, run_retention_cleanup},
    roles::{
        clear_role_tailor_prompt, create_role, create_role_document_markdown, delete_role,
        delete_role_document_version, get_role, get_role_document_file_base64, get_role_document_version,
        list_role_document_versions, list_roles, rename_role_document_version, save_role_tailor_prompt,
        set_default_role_document_version, update_role_document, update_role_document_markdown,
        update_role_name, upload_role_document_file,
    },
    settings::{clear_workflow_data, get_default_prompts, get_settings, reset_prompt, save_settings},
};
use db::{init_db, DbState};
use tauri::Manager;

#[cfg(debug_assertions)]
fn clear_dev_webview_cache(app: &tauri::App) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.clear_all_browsing_data();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    let conn = init_db().expect("Failed to initialize database");
    let db_state = DbState {
        conn: std::sync::Mutex::new(conn),
    };

    // Run retention cleanup on startup
    if let Ok(conn) = db_state.conn.lock() {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(180);
        let cutoff_str = cutoff.to_rfc3339();
        let _ = conn.execute(
            "DELETE FROM applications WHERE sent_at IS NOT NULL AND sent_at < ?1",
            [&cutoff_str],
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(db_state)
        .setup(|app| {
            #[cfg(debug_assertions)]
            clear_dev_webview_cache(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_session,
            logout,
            complete_setup,
            start_google_auth,
            list_roles,
            get_role,
            create_role,
            update_role_name,
            update_role_document,
            delete_role,
            save_role_tailor_prompt,
            clear_role_tailor_prompt,
            list_role_document_versions,
            get_role_document_version,
            get_role_document_file_base64,
            create_role_document_markdown,
            update_role_document_markdown,
            upload_role_document_file,
            rename_role_document_version,
            set_default_role_document_version,
            delete_role_document_version,
            get_settings,
            save_settings,
            reset_prompt,
            clear_workflow_data,
            get_default_prompts,
            jobsearch_search,
            jobsearch_get_ad,
            jobsearch_complete,
            taxonomy_search,
            taxonomy_list_concepts,
            taxonomy_swedish_regions,
            taxonomy_municipalities,
            taxonomy_municipalities_for_regions,
            list_search_presets,
            save_search_preset,
            delete_search_preset,
            get_processed_ad_ids,
            reject_ad,
            proceed_ad,
            get_decision_with_ad,
            update_decision_status,
            save_application,
            get_application,
            get_application_by_decision,
            get_application_file_base64,
            approve_application,
            mark_application_sent,
            set_gmail_draft_id,
            export_application_package,
            save_apply_notes,
            search_archive,
            list_in_progress,
            create_gmail_draft,
            generate_pdf_base64,
            run_retention_cleanup,
            days_until_retention,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
