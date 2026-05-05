// All E2EE primitives. Plaintext never leaves these helpers.
// Note: spec says AES-KW for wrapping the RSA private key, but PKCS8-encoded
// RSA-2048 keys are not guaranteed to be 8-byte aligned (a hard AES-KW
// requirement). The server stores the wrapping blob verbatim, so we use
// AES-GCM with the IV prepended — fully interoperable with our own client.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  // Be tolerant of URL-safe base64, data-URL prefixes, PEM wrappers,
  // literal escaped newlines ("\\n"), whitespace/newlines, misplaced
  // padding, and stray non-base64 characters. Native atob() throws otherwise
  // with "The string to be decoded is not correctly encoded."
  let normalized = String(b64 ?? "").trim();

  const dataUrlComma = normalized.indexOf(",");
  if (/^data:/i.test(normalized) && dataUrlComma !== -1) {
    normalized = normalized.slice(dataUrlComma + 1);
  }

  normalized = normalized
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=/g, "")
    .replace(/[^A-Za-z0-9+/]/g, "");

  const pad = normalized.length % 4;
  if (pad === 2) normalized += "==";
  else if (pad === 3) normalized += "=";
  else if (pad === 1) normalized = normalized.slice(0, -1);

  if (!normalized) return new Uint8Array(new ArrayBuffer(0));

  const s = atob(normalized);
  const ab = new ArrayBuffer(s.length);
  const out = new Uint8Array(ab);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randBytes(n: number): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(n);
  const v = new Uint8Array(ab);
  crypto.getRandomValues(v);
  return v;
}

function strToBuf(s: string): Uint8Array<ArrayBuffer> {
  const bytes = enc.encode(s);
  const ab = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(ab);
  out.set(bytes);
  return out;
}

export interface RegistrationKeys {
  publicKeyB64: string;
  wrappedPrivateKeyB64: string;
  pbkdf2SaltB64: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

async function deriveWrappingKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", strToBuf(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

export async function generateRegistrationKeys(password: string): Promise<RegistrationKeys> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );

  const salt = randBytes(16);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const iv = randBytes(12);

  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, pkcs8);

  // Pack: [12-byte IV][ciphertext]
  const packed = new ArrayBuffer(iv.byteLength + wrapped.byteLength);
  const blob = new Uint8Array(packed);
  blob.set(iv, 0);
  blob.set(new Uint8Array(wrapped), iv.byteLength);

  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);

  return {
    publicKeyB64: bufToB64(spki),
    wrappedPrivateKeyB64: bufToB64(blob),
    pbkdf2SaltB64: bufToB64(salt),
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

export async function unwrapPrivateKey(
  password: string,
  pbkdf2SaltB64: string,
  wrappedPrivateKeyB64: string,
): Promise<CryptoKey> {
  const salt = b64ToBuf(pbkdf2SaltB64);
  const blob = b64ToBuf(wrappedPrivateKeyB64);
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ct);
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, true, [
    "decrypt",
    "unwrapKey",
  ]);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    b64ToBuf(b64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"],
  );
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

export async function encryptMessage(
  plaintext: string,
  recipientPubKey: CryptoKey,
  ownPubKey: CryptoKey,
): Promise<EncryptedPayload> {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, strToBuf(plaintext));
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPubKey, rawAes);
  const encryptedKeyForSelf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, ownPubKey, rawAes);
  return {
    ciphertext: bufToB64(ct),
    iv: bufToB64(iv),
    encryptedKey: bufToB64(encryptedKey),
    encryptedKeyForSelf: bufToB64(encryptedKeyForSelf),
  };
}

export async function decryptMessage(
  payload: EncryptedPayload,
  privateKey: CryptoKey,
  fromSelf: boolean,
): Promise<string> {
  const wrappedAes = b64ToBuf(fromSelf ? payload.encryptedKeyForSelf : payload.encryptedKey);
  const rawAes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, wrappedAes);
  const aesKey = await crypto.subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const iv = b64ToBuf(payload.iv);
  const ct = b64ToBuf(payload.ciphertext);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return dec.decode(pt);
}
