use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use rsa::{RsaPublicKey, pkcs8::DecodePublicKey};
use rsa::pkcs1v15::VerifyingKey;
use sha2::Sha256;
use rsa::signature::Verifier;
use rsa::pkcs1v15::Signature;
use base64::{Engine as _, engine::general_purpose::STANDARD as b64};

const PUBLIC_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA/KGoxBVRQUiITvDMG9hy
Up9zStfTwoWRUa+DRCFfS0F3QMom+k8KW7hzTQYmz2+eE3UsSKq4YBLUZQJ0Co3P
yk+n63/kMXjSjV0gnXHSJwjTh4TwqJI+Ns//3O7g81qy8tPU7hro5PolAVytaJ0t
7acfVjxby4nbINaiPPgV6ClGRrePZjbJ2qiEmnDjQ8gFt2pKKZahThmCBHzzq7aA
tTJnCFtcDNILobV+NlU/QWRsbhdFBrWNtRkX4ANHIMmog1X4A81pTcSnNZD3xoFf
Afv6W7Ao3+kyRRDehmfZAJQcowPke5MudVT1HGW7OYscDL0P/qxG0C0lN97xNWpt
1QIDAQAB
-----END PUBLIC KEY-----"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    pub is_valid: bool,
    pub holder: Option<String>,
    pub expires_at: Option<String>,
    pub mode: String,
    pub message: String,
}

#[derive(Deserialize)]
struct Payload {
    holder: String,
}

fn get_license_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("Failed to get app data dir");
    fs::create_dir_all(&path).unwrap_or_default();
    path.push("license.key");
    path
}

fn verify_license(license_key: &str) -> Result<Payload, String> {
    let parts: Vec<&str> = license_key.split('.').collect();
    if parts.len() != 2 {
        return Err("Formato de licencia inválido (se esperaba PAYLOAD.SIGNATURE en B64)".into());
    }

    let payload_b64 = parts[0];
    let signature_b64 = parts[1];

    let payload_bytes = b64.decode(payload_b64).map_err(|e| format!("Error en payload base64: {}", e))?;
    let signature_bytes = b64.decode(signature_b64).map_err(|e| format!("Error en firma base64: {}", e))?;

    let public_key = RsaPublicKey::from_public_key_pem(PUBLIC_KEY_PEM).map_err(|e| format!("Llave pública inválida: {}", e))?;
    
    let verifying_key: VerifyingKey<Sha256> = VerifyingKey::new(public_key);
    let signature = Signature::try_from(signature_bytes.as_slice()).map_err(|_| "Firma malformada".to_string())?;

    verifying_key.verify(payload_bytes.as_slice(), &signature).map_err(|_| "Firma RSA inválida o licencia corrupta".to_string())?;

    let payload: Payload = serde_json::from_slice(&payload_bytes).map_err(|_| "JSON Payload inválido".to_string())?;

    Ok(payload)
}

pub fn current_license_status(app: AppHandle) -> LicenseStatus {
    let path = get_license_path(&app);
    if !path.exists() {
        return LicenseStatus {
            is_valid: false,
            holder: None,
            expires_at: None,
            mode: "unlicensed".to_string(),
            message: "No se encontró licencia instalada en este equipo.".to_string(),
        };
    }

    let saved_key = match fs::read_to_string(&path) {
        Ok(k) => k,
        Err(_) => {
            return LicenseStatus {
                is_valid: false,
                holder: None,
                expires_at: None,
                mode: "error".to_string(),
                message: "No se pudo leer el archivo local de la licencia.".to_string(),
            }
        }
    };

    match verify_license(&saved_key) {
        Ok(payload) => LicenseStatus {
            is_valid: true,
            holder: Some(payload.holder),
            expires_at: None,
            mode: "premium".to_string(),
            message: "Licencia verificada exitosamente (RSA Offline Valid).".to_string(),
        },
        Err(e) => LicenseStatus {
            is_valid: false,
            holder: None,
            expires_at: None,
            mode: "invalid".to_string(),
            message: format!("Licencia existente inválida: {}", e),
        },
    }
}

pub fn activate_license(app: AppHandle, license_key: String) -> Result<LicenseStatus, String> {
    match verify_license(&license_key) {
        Ok(payload) => {
            let path = get_license_path(&app);
            fs::write(path, &license_key).map_err(|e| format!("Error guardando licencia en disco local: {}", e))?;
            
            Ok(LicenseStatus {
                is_valid: true,
                holder: Some(payload.holder),
                expires_at: None,
                mode: "premium".to_string(),
                message: "Licencia guardada y verificada exitosamente. ¡Bienvenido!".to_string(),
            })
        },
        Err(e) => Err(e),
    }
}
