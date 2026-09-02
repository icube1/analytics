use crate::error::{ApiError, ApiResult};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
pub fn hash_password(password: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| ApiError::Internal)?
        .to_string())
}
pub fn verify_password(password: &str, password_hash: &str) -> ApiResult<bool> {
    let parsed = PasswordHash::new(password_hash).map_err(|_| ApiError::Internal)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
