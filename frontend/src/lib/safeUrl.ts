/** Returns the URL only if it is http(s); otherwise "#" so javascript: links never render. */
export function safeUrl(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "#";
  } catch {
    return "#";
  }
}
