export async function fetchStatements() {
  const res = await fetch("/api/statements");
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Не удалось загрузить выписки",
    );
  }

  return data as {
    transactions: import("./serialize").SerializedTransaction[];
    meta: {
      files: string[];
      directories: string[];
      totalRaw: number;
      totalUnique: number;
      duplicatesRemoved: number;
    };
    savedFiles?: string[];
  };
}

export async function uploadStatementFiles(files: FileList | File[]) {
  const form = new FormData();
  for (const file of [...files]) {
    form.append("file", file);
  }

  const res = await fetch("/api/statements", {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Не удалось сохранить выписки",
    );
  }

  return data as Awaited<ReturnType<typeof fetchStatements>>;
}

export async function deleteStatementFile(fileName: string) {
  const res = await fetch(
    `/api/statements?file=${encodeURIComponent(fileName)}`,
    { method: "DELETE" },
  );
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Не удалось удалить файл",
    );
  }

  return data as Awaited<ReturnType<typeof fetchStatements>>;
}
