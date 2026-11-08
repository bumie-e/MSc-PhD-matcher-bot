// AES-256-GCM, format: base64(iv[12] || ciphertext || tag[16]). Matches
// agents/crypto.py so the GitHub Actions agents can decrypt what Edge
// Functions write. Key: COOKIE_ENCRYPTION_KEY (base64, 32 raw bytes).

const COOKIE_ENCRYPTION_KEY = Deno.env.get("COOKIE_ENCRYPTION_KEY")!;

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const keyBytes = base64ToBytes(COOKIE_ENCRYPTION_KEY);
  if (keyBytes.length !== 32) {
    throw new Error("COOKIE_ENCRYPTION_KEY must decode to 32 bytes for AES-256");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

export async function decryptSecret(token: string): Promise<string> {
  const keyBytes = base64ToBytes(COOKIE_ENCRYPTION_KEY);
  if (keyBytes.length !== 32) {
    throw new Error("COOKIE_ENCRYPTION_KEY must decode to 32 bytes for AES-256");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const raw = base64ToBytes(token);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(plaintext);
}
