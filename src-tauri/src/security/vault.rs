use std::path::PathBuf;
use crate::models::ApiKeysConfig;

fn get_vault_path() -> Result<PathBuf, String> {
    let mut base = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata)
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join(".dubber_studio_pro")
    } else {
        std::env::temp_dir()
    };
    base.push("DubberStudioPro");
    std::fs::create_dir_all(&base).map_err(|e| format!("Failed to create vault directory: {e}"))?;
    Ok(base.join("credentials.vault"))
}

#[cfg(windows)]
#[repr(C)]
#[allow(non_snake_case)]
struct DataBlob {
    cbData: u32,
    pbData: *mut u8,
}

#[cfg(windows)]
#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        pDataIn: *mut DataBlob,
        szDataDescr: *const u16,
        pOptionalEntropy: *mut DataBlob,
        pvReserved: *mut std::ffi::c_void,
        pPromptStruct: *mut std::ffi::c_void,
        dwFlags: u32,
        pDataOut: *mut DataBlob,
    ) -> i32;

    fn CryptUnprotectData(
        pDataIn: *mut DataBlob,
        ppszDataDescr: *mut *mut u16,
        pOptionalEntropy: *mut DataBlob,
        pvReserved: *mut std::ffi::c_void,
        pPromptStruct: *mut std::ffi::c_void,
        dwFlags: u32,
        pDataOut: *mut DataBlob,
    ) -> i32;

    fn LocalFree(hMem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
}

#[cfg(windows)]
fn encrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() {
        return Ok(Vec::new());
    }
    let mut input = DataBlob {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = DataBlob {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let result = unsafe {
        CryptProtectData(
            &mut input,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0x01, // CRYPTPROTECT_UI_FORBIDDEN
            &mut output,
        )
    };

    if result == 0 || output.pbData.is_null() {
        return Err("Windows DPAPI encryption failed".to_string());
    }

    let encrypted = unsafe {
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let vec = slice.to_vec();
        LocalFree(output.pbData as *mut std::ffi::c_void);
        vec
    };

    Ok(encrypted)
}

#[cfg(windows)]
fn decrypt_bytes(encrypted: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted.is_empty() {
        return Ok(Vec::new());
    }
    let mut input = DataBlob {
        cbData: encrypted.len() as u32,
        pbData: encrypted.as_ptr() as *mut u8,
    };
    let mut output = DataBlob {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let result = unsafe {
        CryptUnprotectData(
            &mut input,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0x01, // CRYPTPROTECT_UI_FORBIDDEN
            &mut output,
        )
    };

    if result == 0 || output.pbData.is_null() {
        return Err("Windows DPAPI decryption failed (keys may belong to another user or session)".to_string());
    }

    let decrypted = unsafe {
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let vec = slice.to_vec();
        LocalFree(output.pbData as *mut std::ffi::c_void);
        vec
    };

    Ok(decrypted)
}

#[cfg(not(windows))]
fn encrypt_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    // Non-windows fallback
    Ok(data.to_vec())
}

#[cfg(not(windows))]
fn decrypt_bytes(encrypted: &[u8]) -> Result<Vec<u8>, String> {
    // Non-windows fallback
    Ok(encrypted.to_vec())
}

pub fn save_secure_keys(keys: &ApiKeysConfig) -> Result<(), String> {
    let vault_file = get_vault_path()?;
    let json_bytes = serde_json::to_vec(keys)
        .map_err(|e| format!("Failed to serialize API keys: {e}"))?;
    let encrypted = encrypt_bytes(&json_bytes)?;
    std::fs::write(&vault_file, encrypted)
        .map_err(|e| format!("Failed to write encrypted vault file: {e}"))?;
    Ok(())
}

pub fn load_secure_keys() -> Result<ApiKeysConfig, String> {
    let vault_file = get_vault_path()?;
    if !vault_file.exists() {
        return Ok(ApiKeysConfig::default());
    }
    let encrypted = std::fs::read(&vault_file)
        .map_err(|e| format!("Failed to read vault file: {e}"))?;
    if encrypted.is_empty() {
        return Ok(ApiKeysConfig::default());
    }
    let decrypted = decrypt_bytes(&encrypted)?;
    let keys: ApiKeysConfig = serde_json::from_slice(&decrypted)
        .map_err(|e| format!("Failed to parse decrypted API keys: {e}"))?;
    Ok(keys)
}

pub fn has_secure_keys() -> Result<bool, String> {
    let vault_file = get_vault_path()?;
    Ok(vault_file.exists() && std::fs::metadata(&vault_file).map(|m| m.len() > 0).unwrap_or(false))
}

pub fn delete_secure_keys() -> Result<(), String> {
    let vault_file = get_vault_path()?;
    if vault_file.exists() {
        std::fs::remove_file(&vault_file)
            .map_err(|e| format!("Failed to remove vault file: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_roundtrip() {
        let keys = ApiKeysConfig {
            gemini_api_key: Some("test-gemini-secret-12345".to_string()),
            openai_api_key: Some("sk-test-secret-abc".to_string()),
            elevenlabs_api_key: None,
            whisper_api_key: None,
            groq_api_key: Some("gsk-test-groq-key".to_string()),
            ollama_base_url: Some("http://localhost:11434".to_string()),
        };

        let raw = serde_json::to_vec(&keys).unwrap();
        let enc = encrypt_bytes(&raw).unwrap();
        assert_ne!(raw, enc);

        let dec = decrypt_bytes(&enc).unwrap();
        assert_eq!(raw, dec);

        let recovered: ApiKeysConfig = serde_json::from_slice(&dec).unwrap();
        assert_eq!(recovered.gemini_api_key, keys.gemini_api_key);
        assert_eq!(recovered.groq_api_key, keys.groq_api_key);
    }
}
