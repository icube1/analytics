use rand::RngCore;
use sha2::{Digest, Sha256};
pub fn generate_opaque_token() -> String {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}
pub fn hash_token(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|x| format!("{x:02x}"))
        .collect()
}
