# WhisperBox — End-to-End Encrypted Messaging

WhisperBox is a secure messaging web app where every message is encrypted **on the sender's device** and decrypted **on the recipient's device**. The backend at `https://whisperbox.koyeb.app` only ever stores opaque ciphertext — it has no access to message contents, AES keys, or unwrapped private keys.

Built with React 19, TanStack Start, Vite 7, Tailwind v4, shadcn/ui, and the browser-native **Web Crypto API**.

---

## Architecture

```
┌─────────────────────┐                       ┌─────────────────────┐
│   Sender (Browser)  │                       │ Recipient (Browser) │
│                     │                       │                     │
│  Plaintext "hello"  │                       │  Plaintext "hello"  │
│         │           │                       │         ▲           │
│         ▼           │                       │         │           │
│ AES-GCM encrypt     │                       │ AES-GCM decrypt     │
│ (random 256-bit K)  │                       │ (K)                 │
│         │           │                       │         ▲           │
│         ▼           │                       │         │           │
│ Wrap K with         │                       │ Unwrap K with own   │
│ recipient's RSA pub │                       │ RSA private key     │
│ + own RSA pub (self)│                       │                     │
│         │           │                       │         ▲           │
│         ▼           │                       │         │           │
│   { ciphertext,     │                       │   { ciphertext,     │
│     iv,             │                       │     iv,             │
│     encryptedKey,   │  ─── HTTPS / WSS ──►  │     encryptedKey,   │
│     encryptedKeyForSelf}                    │     encryptedKeyForSelf}
└─────────┬───────────┘                       └─────────────────────┘
          │                                              ▲
          ▼                                              │
   ┌──────────────────────────────────────────────────────┐
   │   Backend (whisperbox.koyeb.app) — sees only blobs   │
   │   • Auth (JWT access + refresh)                       │
   │   • Stores public_key, wrapped_private_key,          │
   │     pbkdf2_salt per user                             │
   │   • Stores message payloads verbatim                 │
   │   • Relays via WebSocket — never decrypts            │
   └──────────────────────────────────────────────────────┘
```

### Frontend layers
| File | Role |
|---|---|
| `src/lib/crypto.ts` | All Web Crypto primitives (key gen, wrap, encrypt, decrypt) |
| `src/lib/api.ts` | Typed REST client + token management |
| `src/lib/session.tsx` | React context for auth + in-memory keys |
| `src/components/AuthScreen.tsx` | Register / login UI |
| `src/components/ChatScreen.tsx` | Conversation list, message thread, WebSocket |

---

## Encryption flow

**Hybrid scheme: AES-GCM for content, RSA-OAEP for key wrapping.**

### Sending
1. Generate a fresh 256-bit AES-GCM key `K` (one per message).
2. Generate a 96-bit IV.
3. `ciphertext = AES-GCM(K, IV, plaintext)`.
4. `encryptedKey       = RSA-OAEP-encrypt(recipient_public_key, K)`.
5. `encryptedKeyForSelf= RSA-OAEP-encrypt(sender_public_key,    K)` so the sender can read their own history later.
6. Send `{ ciphertext, iv, encryptedKey, encryptedKeyForSelf }` to the server.

### Receiving
1. Pull the payload (history endpoint or WebSocket).
2. Decide which wrapped key to use: `encryptedKeyForSelf` if `from_user_id === me`, else `encryptedKey`.
3. `K = RSA-OAEP-decrypt(my_private_key, wrappedKey)`.
4. `plaintext = AES-GCM-decrypt(K, IV, ciphertext)`.

A new `K` is generated per message — compromise of one message key never affects others.

---

## Key management

| Key | Where it lives | How it's protected |
|---|---|---|
| **RSA-2048 keypair** | Generated client-side at registration | Public key uploaded; private key never leaves the device unwrapped |
| **PBKDF2 wrapping key** | Derived from password | 250,000 iterations, SHA-256, random 16-byte salt |
| **Wrapped private key** | Stored on server | AES-GCM-256 with 12-byte IV prepended; key derived from password — server can't unwrap |
| **AES-GCM message key** | Generated per message, in memory only | Wrapped with RSA-OAEP for each recipient |
| **Access / refresh JWT** | `localStorage` (refresh) + RAM (access) | Auto-refresh 60 s before expiry |
| **Unwrapped private key** | RAM only (`SessionProvider`) | Lost on reload — user must re-enter password |

The backend stores `public_key`, `wrapped_private_key`, and `pbkdf2_salt`, but cannot derive the wrapping key without the password.

---

## Security trade-offs

- **Web Crypto over libsodium / Signal Protocol.** Native, audited, no WASM ship cost. Trade-off: no forward secrecy, no double-ratchet — past messages stay decryptable as long as the long-term private key is intact.
- **AES-GCM (instead of AES-KW) for wrapping the PKCS#8 private key.** PKCS#8 RSA-2048 blobs aren't 8-byte aligned, which AES-KW requires. AES-GCM with a random IV is equivalent in practice and interoperates with our own client.
- **Refresh token in `localStorage`.** Simpler than secure cookies for an SPA backend without a same-origin proxy. Vulnerable to XSS — strict CSP and dependency hygiene matter. The unwrapped private key is **never** persisted, so an XSS exfil of `localStorage` alone cannot decrypt past messages.
- **Server is trusted for delivery / metadata, not content.** It sees who-talks-to-whom and timestamps. A malicious server could swap a recipient's published public key (TOFU attack) — see limitations.
- **Self-copy of the message key.** Sender can re-read sent messages but doubles the wrapped-key surface area (still bound to the same user's private key).

---

## Known limitations

- **No forward secrecy.** If a private key is ever compromised, all past ciphertexts can be decrypted.
- **No public-key verification (TOFU).** Clients trust whatever public key the server returns. A malicious or compromised server could MITM by substituting keys. A real deployment needs safety-number / fingerprint comparison out of band.
- **Password = master key.** Lose the password → lose access to all history (no recovery, no key escrow). This is by design.
- **Single device only.** The wrapped private key is tied to one password; there is no multi-device sync, key transport, or session export.
- **No message integrity beyond AES-GCM tag.** No per-conversation chain of custody, no replay protection beyond server message IDs.
- **Metadata leakage.** Sender, recipient, timestamps, and message sizes are visible to the server.
- **No attachments / group chat / disappearing messages.** Text-only 1:1.
- **Unread badges are in-memory.** Counts reset on page reload (the unwrapped key is lost on reload anyway, so this is consistent).

---

## Running locally

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). Test E2EE by opening two browsers / an incognito window, registering two accounts, and chatting between them.

---

## Deploying to Vercel

This project uses TanStack Start v1 + Vite. The default template targets Cloudflare Workers; for Vercel, swap to the Vercel preset.

### One-time setup

1. **Install the Vercel adapter:**
   ```bash
   npm install -D @vercel/node
   ```
2. **Edit `vite.config.ts`** — replace the `cloudflare()` plugin with TanStack's Vercel target. Minimal example:
   ```ts
   import { defineConfig } from "vite";
   import { tanstackStart } from "@tanstack/react-start/plugin/vite";
   import tsconfigPaths from "vite-tsconfig-paths";
   import tailwindcss from "@tailwindcss/vite";

   export default defineConfig({
     plugins: [
       tsconfigPaths(),
       tailwindcss(),
       tanstackStart({ target: "vercel" }),
     ],
   });
   ```
   Remove `@cloudflare/vite-plugin` and `wrangler.jsonc` if you don't plan to use Cloudflare anymore.

3. **Commit and push** to a GitHub/GitLab/Bitbucket repo.

### Deploy

**Option A — Vercel dashboard (easiest):**
1. Go to <https://vercel.com/new>.
2. Import your repo.
3. Framework preset: **Other** (Vercel auto-detects Vite).
4. Build command: `npm run build`
5. Output directory: leave default (TanStack writes `.vercel/output` automatically).
6. Click **Deploy**.

**Option B — Vercel CLI:**
```bash
npm i -g vercel
vercel login
vercel        # preview deploy
vercel --prod # production
```

### Environment variables
The frontend hard-codes `https://whisperbox.koyeb.app` in `src/lib/api.ts`. To make it configurable on Vercel:
1. Replace the constant with `import.meta.env.VITE_API_BASE`.
2. In Vercel → **Project Settings → Environment Variables**, add `VITE_API_BASE=https://whisperbox.koyeb.app` for Production / Preview / Development.
3. Redeploy.

That's it — Vercel serves the static assets from its edge CDN, no server runtime is required for this app since all crypto runs in the browser and the API lives on a separate host.
