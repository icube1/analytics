use hmac::{Hmac, Mac};
use sha2::Sha256;
pub trait SignatureVerifier: Send + Sync {
    fn verify(&self, raw_body: &[u8], signature: Option<&str>) -> Result<(), String>;
}
pub struct HmacSha256Verifier {
    secret: Vec<u8>,
}
impl HmacSha256Verifier {
    pub fn new(secret: impl Into<Vec<u8>>) -> Self {
        Self {
            secret: secret.into(),
        }
    }
}
impl SignatureVerifier for HmacSha256Verifier {
    fn verify(&self, raw_body: &[u8], signature: Option<&str>) -> Result<(), String> {
        let sig = signature.ok_or_else(|| "missing signature".to_owned())?;
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret).map_err(|e| e.to_string())?;
        mac.update(raw_body);
        let expected: String = mac
            .finalize()
            .into_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if sig.trim() == expected {
            Ok(())
        } else {
            Err("invalid signature".into())
        }
    }
}
