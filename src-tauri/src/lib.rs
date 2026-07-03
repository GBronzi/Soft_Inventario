mod auth;
mod license;

use crate::license::LicenseStatus;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const DATABASE_FILE: &str = "inventario_v4.db";
const PENDING_RESTORE_FILE: &str = "inventario_restore_pending.db";

fn validate_sqlite_file(path: &Path) -> Result<(), String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("No se pudo leer el respaldo: {error}"))?;
    if !metadata.is_file() || metadata.len() < 100 {
        return Err("El archivo seleccionado no es un respaldo SQLite válido.".to_string());
    }
    let header =
        fs::read(path).map_err(|error| format!("No se pudo abrir el respaldo: {error}"))?;
    if !header.starts_with(b"SQLite format 3\0") {
        return Err("El archivo seleccionado no tiene un formato SQLite válido.".to_string());
    }
    Ok(())
}

fn apply_pending_database_restore(app_data_dir: &Path) -> Result<(), String> {
    let pending_path = app_data_dir.join(PENDING_RESTORE_FILE);
    if !pending_path.exists() {
        return Ok(());
    }
    validate_sqlite_file(&pending_path)?;

    let database_path = app_data_dir.join(DATABASE_FILE);
    if database_path.exists() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_secs();
        let safety_backup = app_data_dir.join(format!(
            "inventario_backup_antes_restauracion_{timestamp}.db"
        ));
        fs::copy(&database_path, safety_backup)
            .map_err(|error| format!("No se pudo proteger la base actual: {error}"))?;
    }

    for suffix in ["-wal", "-shm"] {
        let auxiliary = PathBuf::from(format!("{}{}", database_path.display(), suffix));
        if auxiliary.exists() {
            fs::remove_file(auxiliary)
                .map_err(|error| format!("No se pudo preparar SQLite: {error}"))?;
        }
    }
    fs::copy(&pending_path, &database_path)
        .map_err(|error| format!("No se pudo restaurar la base de datos: {error}"))?;
    fs::remove_file(pending_path)
        .map_err(|error| format!("No se pudo finalizar la restauración: {error}"))?;
    Ok(())
}

#[tauri::command]
fn restore_database(app: tauri::AppHandle, source_path: String) -> Result<(), String> {
    let source = PathBuf::from(source_path);
    validate_sqlite_file(&source)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let pending_path = app_data_dir.join(PENDING_RESTORE_FILE);
    fs::copy(source, pending_path)
        .map_err(|error| format!("No se pudo preparar la restauración: {error}"))?;
    app.restart();
}

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
            let app_data_dir = app.path().app_data_dir()?;
            apply_pending_database_restore(&app_data_dir)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
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
            reset_with_support,
            restore_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sqlite_fixture(marker: u8) -> Vec<u8> {
        let mut bytes = vec![marker; 256];
        bytes[..16].copy_from_slice(b"SQLite format 3\0");
        bytes
    }

    #[test]
    fn restores_pending_database_and_preserves_previous_database() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("soft-inventario-restore-{unique}"));
        fs::create_dir_all(&directory).unwrap();

        let database_path = directory.join(DATABASE_FILE);
        let pending_path = directory.join(PENDING_RESTORE_FILE);
        let previous = sqlite_fixture(1);
        let restored = sqlite_fixture(2);
        fs::write(&database_path, &previous).unwrap();
        fs::write(&pending_path, &restored).unwrap();

        apply_pending_database_restore(&directory).unwrap();

        assert_eq!(fs::read(&database_path).unwrap(), restored);
        assert!(!pending_path.exists());
        let safety_backups: Vec<_> = fs::read_dir(&directory)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("inventario_backup_antes_restauracion_")
            })
            .collect();
        assert_eq!(safety_backups.len(), 1);
        assert_eq!(fs::read(safety_backups[0].path()).unwrap(), previous);

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_non_sqlite_restore_file() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("soft-inventario-invalid-{unique}.db"));
        fs::write(&path, vec![0; 256]).unwrap();
        assert!(validate_sqlite_file(&path).is_err());
        fs::remove_file(path).unwrap();
    }
}
