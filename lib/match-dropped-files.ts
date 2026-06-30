export function matchDroppedFiles(
  files: FileList | File[],
  accept: string[],
): File[] {
  const extensions = accept.map((ext) =>
    ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
  );

  return [...files].filter((file) => {
    const name = file.name.toLowerCase();
    if (extensions.some((ext) => name.endsWith(ext))) return true;

    // Файлы без расширения или с MIME из проводника Windows
    const mime = file.type.toLowerCase();
    if (mime === "text/csv" && extensions.includes(".csv")) return true;
    if (mime === "text/html" && extensions.includes(".html")) return true;

    return false;
  });
}
