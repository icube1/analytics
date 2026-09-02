use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceFingerprint {
    pub hex: String,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn fingerprint_backup_sources(
    backup_json: &[u8],
    statement_files: &[(String, Vec<u8>)],
) -> SourceFingerprint {
    let mut hasher = Sha256::new();
    hasher.update(backup_json);
    let mut sorted = statement_files.to_owned();
    sorted.sort_by(|left, right| left.0.cmp(&right.0));
    for (name, bytes) in sorted {
        hasher.update(name.as_bytes());
        hasher.update(bytes);
    }
    SourceFingerprint {
        hex: format!("{:x}", hasher.finalize()),
    }
}
