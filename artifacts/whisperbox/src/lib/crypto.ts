export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export async function generateRSAKeyPair() {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
}

export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveWrappingKey(password: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export async function wrapPrivateKey(privateKey: CryptoKey, wrappingKey: CryptoKey) {
  return crypto.subtle.wrapKey("pkcs8", privateKey, wrappingKey, "AES-KW");
}

export async function unwrapPrivateKey(wrappedKey: ArrayBuffer, wrappingKey: CryptoKey) {
  return crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey,
    wrappingKey,
    "AES-KW",
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

export async function exportPublicKey(publicKey: CryptoKey) {
  const buffer = await crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(buffer);
}

export async function importPublicKey(b64: string) {
  return crypto.subtle.importKey("spki", base64ToArrayBuffer(b64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

export async function encryptMessage(plaintext: string, recipientPublicKey: CryptoKey, senderPublicKey: CryptoKey) {
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext));
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  
  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawAesKey);
  const encryptedKeyForSelf = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPublicKey, rawAesKey);
  
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    encryptedKey: arrayBufferToBase64(encryptedKey),
    encryptedKeyForSelf: arrayBufferToBase64(encryptedKeyForSelf),
  };
}

export async function decryptMessage(
  payload: { ciphertext: string; iv: string; encryptedKey: string; encryptedKeyForSelf: string },
  privateKey: CryptoKey,
  isSentByMe: boolean
) {
  const keyToDecrypt = isSentByMe ? payload.encryptedKeyForSelf : payload.encryptedKey;
  const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToArrayBuffer(keyToDecrypt));
  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(payload.iv) },
    aesKey,
    base64ToArrayBuffer(payload.ciphertext)
  );
  
  return new TextDecoder().decode(plaintext);
}
