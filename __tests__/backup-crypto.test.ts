import { webcrypto } from "node:crypto";

import {
  decryptAnalyticsBackup,
  encryptAnalyticsBackup,
  isEncryptedAnalyticsBackup,
} from "@/lib/backup-crypto";
import {
  isAnalyticsBackup,
  BACKUP_FORMAT_VERSION,
  type AnalyticsBackup,
} from "@/lib/backup-types";
import { parseBackupFile } from "@/lib/backup";
import { DEFAULT_DOCUMENT } from "@/lib/portfolio-types";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

function makeBackup(
  partial: Partial<AnalyticsBackup> = {},
): AnalyticsBackup {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: "2026-09-03T12:00:00.000Z",
    portfolio: {
      ...DEFAULT_DOCUMENT,
      lastBrokerFileName: "restore-drill.csv",
    },
    statements: [{ fileName: "restore-drill.csv", content: "date,amount\n" }],
    ...partial,
  };
}

describe("encrypted analytics backup", () => {
  const passphrase = "restore-drill-pass";

  it("round-trips a restore drill through AES-GCM", async () => {
    const backup = makeBackup();
    const envelope = await encryptAnalyticsBackup(backup, passphrase, {
      iterations: 1_000,
    });

    expect(isEncryptedAnalyticsBackup(envelope)).toBe(true);
    expect(isAnalyticsBackup(envelope)).toBe(false);
    expect(envelope.ciphertext).not.toContain("restore-drill.csv");
    expect(JSON.stringify(envelope)).not.toContain(passphrase);

    const restored = await decryptAnalyticsBackup(envelope, passphrase);
    expect(restored).toEqual(backup);
  });

  it("rejects a short passphrase and a wrong password", async () => {
    const backup = makeBackup();
    await expect(
      encryptAnalyticsBackup(backup, "short"),
    ).rejects.toThrow(/не короче 8/);

    const envelope = await encryptAnalyticsBackup(backup, passphrase, {
      iterations: 1_000,
    });
    await expect(
      decryptAnalyticsBackup(envelope, "wrong-password"),
    ).rejects.toThrow(/Неверный пароль/);
  });

  it("parses encrypted files only when a passphrase is supplied", async () => {
    const backup = makeBackup();
    const envelope = await encryptAnalyticsBackup(backup, passphrase, {
      iterations: 1_000,
    });
    const file = new File([JSON.stringify(envelope)], "backup.enc.json", {
      type: "application/json",
    });

    await expect(parseBackupFile(file)).rejects.toThrow(/нужен пароль/);
    await expect(parseBackupFile(file, "wrong-password")).rejects.toThrow(
      /Неверный пароль/,
    );

    const restored = await parseBackupFile(file, passphrase);
    expect(restored.portfolio.lastBrokerFileName).toBe("restore-drill.csv");
    expect(restored.statements[0]?.fileName).toBe("restore-drill.csv");
  });

  it("still accepts a plaintext backup file", async () => {
    const backup = makeBackup();
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).resolves.toEqual(backup);
  });
});
