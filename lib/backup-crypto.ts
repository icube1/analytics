import {
  isAnalyticsBackup,
  type AnalyticsBackup,
} from "./backup-types";

export const ENCRYPTED_BACKUP_FORMAT = "analytics.backup.encrypted.v1" as const;
export const BACKUP_KDF_ITERATIONS = 120_000;

export interface EncryptedAnalyticsBackup {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  exportedAt: string;
  kdf: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptBackupOptions {
  iterations?: number;
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is required to encrypt or decrypt a backup");
  }
  return subtle;
}

function viewToArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: viewToArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isEncryptedAnalyticsBackup(
  value: unknown,
): value is EncryptedAnalyticsBackup {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<EncryptedAnalyticsBackup>;
  return (
    envelope.format === ENCRYPTED_BACKUP_FORMAT &&
    envelope.kdf === "PBKDF2" &&
    envelope.hash === "SHA-256" &&
    typeof envelope.iterations === "number" &&
    typeof envelope.salt === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.ciphertext === "string" &&
    typeof envelope.exportedAt === "string"
  );
}

export async function encryptAnalyticsBackup(
  backup: AnalyticsBackup,
  passphrase: string,
  options: EncryptBackupOptions = {},
): Promise<EncryptedAnalyticsBackup> {
  if (passphrase.length < 8) {
    throw new Error("Пароль шифрования должен быть не короче 8 символов");
  }
  const subtle = requireSubtle();
  const iterations = options.iterations ?? BACKUP_KDF_ITERATIONS;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv: viewToArrayBuffer(iv) },
    key,
    plaintext,
  );
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    exportedAt: backup.exportedAt,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptAnalyticsBackup(
  envelope: EncryptedAnalyticsBackup,
  passphrase: string,
): Promise<AnalyticsBackup> {
  const subtle = requireSubtle();
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt, envelope.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: viewToArrayBuffer(iv) },
      key,
      viewToArrayBuffer(ciphertext),
    );
  } catch {
    throw new Error("Неверный пароль или повреждённый зашифрованный бэкап");
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!isAnalyticsBackup(parsed)) {
    throw new Error("Расшифрованный файл не является бэкапом Analytics");
  }
  return parsed;
}
