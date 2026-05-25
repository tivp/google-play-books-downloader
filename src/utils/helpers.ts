/**
 * Sanitizes names for filesystem safety.
 */
export function safeName(name: string): string {
  return name.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
}

/**
 * Clean formatting of file bytes.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Delay execution for pacing.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Unescape HTML entities.
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}
