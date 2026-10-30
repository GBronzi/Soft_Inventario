use argon2::{
    password_hash::{
        rand_core::{OsRng, RngCore},
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use base64::{engine::general_purpose::STANDARD as b64, Engine as _};
use rsa::{
    pkcs1v15::{Signature, VerifyingKey},
    pkcs8::DecodePublicKey,
    signature::Verifier,
    RsaPublicKey,
};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const SUPPORT_PUBLIC_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAy8dvOwi/BJE9Dj7mkkxt
k1XG4ivhPAxbTq3GuuEb50mpR8ljEddzz1mpTVfdWYEECx9iyAsODhMWeaEpRXW/
p3Br2zO9KrdHMykY5LpPTlFSWC0UBzj5DnDzoWpnL1Z+dDCNyROQRRtVjZ3b3Obj
KtdeiHOxcO0h+W+n22uyUavWkdl2zeoX2Ld6CRoMSlQ9JY0l8Z02aHSuBHB4jNRY
IjLR1Wavh2f+fSAmBdsmeTNbmBTtQSTtH8XZ2mMvmUQ3G+X2OR+hMBDpmilMNoDC
undKlMZpBMRr/T2ADIo5BlhRWBbMgiQgQonliC+P/cqgn7/H1fvC4ITZMJoISwM9
K+TiZ8DH0LLI9dJ1WhTkZFrqYmNkxnM41Hx0O8s231buDP6Hoy/7FXV80uWuJUmi
6Rv2uZJFmh3ybKHCiUarhrLiNKg9lgQNjtyryTe9TA9od3XlTXFJbe05hJuJ6/wg
V/AEW466TwZch/U/qpjXyFVaIuEy3XyHrRHlP4+5usOxAgMBAAE=
-----END PUBLIC KEY-----"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub configured: bool,
    pub username: Option<String>,
    pub recovery_configured: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredCredentials {
    username: String,
    password_hash: String,
    #[serde(default)]
    recovery_hash: Option<String>,
    #[serde(default)]
    installation_id: Option<String>,
    #[serde(default)]
    support_request: Option<PendingSupportRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingSupportRequest {
    nonce: String,
    expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupportPayload {
    purpose: String,
    installation_id: String,
    nonce: String,
    expires_at: u64,
}

fn validate_credentials(username: &str, password: &str) -> Result<(), String> {
    if username.trim().chars().count() < 3 {
        return Err("El usuario debe tener al menos 3 caracteres.".to_string());
    }
    if password.chars().count() < 8 {
        return Err("La contraseña debe tener al menos 8 caracteres.".to_string());
    }
    Ok(())
}

fn hash_secret(secret: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "No se pudo proteger la credencial.".to_string())
}

fn random_code(length: usize) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut random = vec![0_u8; length];
    OsRng.fill_bytes(&mut random);
    random
        .iter()
        .map(|byte| ALPHABET[*byte as usize % ALPHABET.len()] as char)
        .collect()
}

fn unix_time() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .map_err(|_| "No se pudo validar la hora del sistema.".to_string())
}

fn verify_secret(secret: &str, hash: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|_| "La configuración de acceso está dañada.".to_string())?;
    Ok(Argon2::default()
        .verify_password(secret.as_bytes(), &parsed_hash)
        .is_ok())
}

fn auth_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No se pudo obtener la carpeta de datos: {error}"))?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("No se pudo crear la carpeta de datos: {error}"))?;
    path.push("auth.json");
    Ok(path)
}

fn read_credentials(app: &AppHandle) -> Result<Option<StoredCredentials>, String> {
    let path = auth_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "No se pudo leer la configuración de acceso.".to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|_| "La configuración de acceso está dañada.".to_string())
}

fn write_credentials(app: &AppHandle, credentials: &StoredCredentials) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(credentials)
        .map_err(|_| "No se pudo preparar la configuración de acceso.".to_string())?;
    fs::write(auth_path(app)?, serialized)
        .map_err(|_| "No se pudo guardar la configuración de acceso.".to_string())
}

fn status_from(credentials: Option<&StoredCredentials>) -> AuthStatus {
    AuthStatus {
        configured: credentials.is_some(),
        username: credentials.map(|value| value.username.clone()),
        recovery_configured: credentials
            .and_then(|value| value.recovery_hash.as_ref())
            .is_some(),
    }
}

pub fn current_status(app: AppHandle) -> Result<AuthStatus, String> {
    let credentials = read_credentials(&app)?;
    Ok(status_from(credentials.as_ref()))
}

pub fn setup(app: AppHandle, username: String, password: String) -> Result<AuthStatus, String> {
    let username = username.trim();
    validate_credentials(username, &password)?;
    if read_credentials(&app)?.is_some() {
        return Err("El acceso ya está configurado.".to_string());
    }

    let credentials = StoredCredentials {
        username: username.to_string(),
        password_hash: hash_secret(&password)?,
        recovery_hash: None,
        installation_id: None,
        support_request: None,
    };
    write_credentials(&app, &credentials)?;
    Ok(status_from(Some(&credentials)))
}

pub fn login(app: AppHandle, username: String, password: String) -> Result<bool, String> {
    let credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    let password_valid = verify_secret(&password, &credentials.password_hash)?;
    Ok(credentials.username.eq_ignore_ascii_case(username.trim()) && password_valid)
}

pub fn change_credentials(
    app: AppHandle,
    current_password: String,
    username: String,
    password: String,
) -> Result<AuthStatus, String> {
    let mut credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    if !verify_secret(&current_password, &credentials.password_hash)? {
        return Err("La contraseña actual es incorrecta.".to_string());
    }
    let username = username.trim();
    validate_credentials(username, &password)?;
    credentials.username = username.to_string();
    credentials.password_hash = hash_secret(&password)?;
    write_credentials(&app, &credentials)?;
    Ok(status_from(Some(&credentials)))
}

pub fn generate_recovery_code(app: AppHandle, current_password: String) -> Result<String, String> {
    let mut credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    if !verify_secret(&current_password, &credentials.password_hash)? {
        return Err("La contraseña actual es incorrecta.".to_string());
    }

    let raw = random_code(20);
    let code = raw
        .as_bytes()
        .chunks(5)
        .map(|part| std::str::from_utf8(part).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-");
    credentials.recovery_hash = Some(hash_secret(&code)?);
    write_credentials(&app, &credentials)?;
    Ok(code)
}

pub fn reset_with_recovery(
    app: AppHandle,
    recovery_code: String,
    username: String,
    password: String,
) -> Result<AuthStatus, String> {
    let mut credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    let recovery_hash = credentials
        .recovery_hash
        .as_deref()
        .ok_or_else(|| "No hay un código de recuperación configurado.".to_string())?;
    if !verify_secret(&recovery_code.trim().to_uppercase(), recovery_hash)? {
        return Err("El código de recuperación no es válido.".to_string());
    }
    let username = username.trim();
    validate_credentials(username, &password)?;
    credentials.username = username.to_string();
    credentials.password_hash = hash_secret(&password)?;
    credentials.recovery_hash = None;
    write_credentials(&app, &credentials)?;
    Ok(status_from(Some(&credentials)))
}

pub fn generate_support_request(app: AppHandle) -> Result<String, String> {
    let mut credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    let installation_id = credentials
        .installation_id
        .clone()
        .unwrap_or_else(|| random_code(16));
    let nonce = random_code(24);
    let expires_at = unix_time()? + 24 * 60 * 60;
    let payload = SupportPayload {
        purpose: "soft-inventario-support-reset".to_string(),
        installation_id: installation_id.clone(),
        nonce: nonce.clone(),
        expires_at,
    };
    credentials.installation_id = Some(installation_id);
    credentials.support_request = Some(PendingSupportRequest { nonce, expires_at });
    write_credentials(&app, &credentials)?;
    let json = serde_json::to_vec(&payload)
        .map_err(|_| "No se pudo crear la solicitud de soporte.".to_string())?;
    Ok(b64.encode(json))
}

pub fn reset_with_support(
    app: AppHandle,
    support_response: String,
    username: String,
    password: String,
) -> Result<AuthStatus, String> {
    let mut credentials = read_credentials(&app)?
        .ok_or_else(|| "El acceso todavía no está configurado.".to_string())?;
    let pending = credentials
        .support_request
        .as_ref()
        .ok_or_else(|| "No existe una solicitud de soporte activa.".to_string())?;
    let parts: Vec<&str> = support_response.trim().split('.').collect();
    if parts.len() != 2 {
        return Err("La respuesta de soporte tiene un formato inválido.".to_string());
    }
    let payload_bytes = b64
        .decode(parts[0])
        .map_err(|_| "La respuesta de soporte está dañada.".to_string())?;
    let signature_bytes = b64
        .decode(parts[1])
        .map_err(|_| "La firma de soporte está dañada.".to_string())?;
    let public_key = RsaPublicKey::from_public_key_pem(SUPPORT_PUBLIC_KEY_PEM)
        .map_err(|_| "No se pudo cargar la clave pública de soporte.".to_string())?;
    let signature = Signature::try_from(signature_bytes.as_slice())
        .map_err(|_| "La firma de soporte es inválida.".to_string())?;
    VerifyingKey::<Sha256>::new(public_key)
        .verify(&payload_bytes, &signature)
        .map_err(|_| "La respuesta no fue firmada por el soporte autorizado.".to_string())?;
    let payload: SupportPayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "La respuesta de soporte contiene datos inválidos.".to_string())?;
    let installation_id = credentials.installation_id.as_deref().unwrap_or_default();
    if payload.purpose != "soft-inventario-support-reset"
        || payload.installation_id != installation_id
        || payload.nonce != pending.nonce
        || payload.expires_at != pending.expires_at
        || unix_time()? > payload.expires_at
    {
        return Err("La respuesta no corresponde a esta instalación o ha vencido.".to_string());
    }
    let username = username.trim();
    validate_credentials(username, &password)?;
    credentials.username = username.to_string();
    credentials.password_hash = hash_secret(&password)?;
    credentials.recovery_hash = None;
    credentials.support_request = None;
    write_credentials(&app, &credentials)?;
    Ok(status_from(Some(&credentials)))
}
