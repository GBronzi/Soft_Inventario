mod auth;
mod license;

use crate::license::LicenseStatus;

#[tauri::command]
fn get_license_status(app: tauri::AppHandle) -> LicenseStatus {
    license::current_license_status(app)
}

#[tauri::command]
fn activate_license(app: tauri::AppHandle, license_key: String) -> Result<LicenseStatus, String> {
    license::activate_license(app, license_key)
}

#[tauri::command]
fn get_auth_status(app: tauri::AppHandle) -> Result<auth::AuthStatus, String> {
    auth::current_status(app)
}

#[tauri::command]
fn setup_auth(
    app: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<auth::AuthStatus, String> {
    auth::setup(app, username, password)
}

#[tauri::command]
fn login(app: tauri::AppHandle, username: String, password: String) -> Result<bool, String> {
    auth::login(app, username, password)
}

#[tauri::command]
fn change_credentials(
    app: tauri::AppHandle,
    current_password: String,
    username: String,
    password: String,
) -> Result<auth::AuthStatus, String> {
    auth::change_credentials(app, current_password, username, password)
}

#[tauri::command]
fn generate_recovery_code(
    app: tauri::AppHandle,
    current_password: String,
) -> Result<String, String> {
    auth::generate_recovery_code(app, current_password)
}

#[tauri::command]
fn reset_with_recovery(
    app: tauri::AppHandle,
    recovery_code: String,
    username: String,
    password: String,
) -> Result<auth::AuthStatus, String> {
    auth::reset_with_recovery(app, recovery_code, username, password)
}

#[tauri::command]
fn generate_support_request(app: tauri::AppHandle) -> Result<String, String> {
    auth::generate_support_request(app)
}

#[tauri::command]
fn reset_with_support(
    app: tauri::AppHandle,
    support_response: String,
    username: String,
    password: String,
) -> Result<auth::AuthStatus, String> {
    auth::reset_with_support(app, support_response, username, password)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // single-instance debe registrarse primero. Con la feature `deep-link`,
    // reenvía el deep link a la instancia primaria (dispara onOpenUrl) en
    // lugar de abrir una segunda ventana.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_license_status,
            activate_license,
            get_auth_status,
            setup_auth,
            login,
            change_credentials,
            generate_recovery_code,
            reset_with_recovery,
            generate_support_request,
            reset_with_support
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
