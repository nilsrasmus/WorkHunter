/** Allow only http(s) URLs suitable for opening externally or rendering as links. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Return the URL if safe, otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  return isSafeHttpUrl(value) ? value.trim() : null;
}
