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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![get_license_status, activate_license])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
