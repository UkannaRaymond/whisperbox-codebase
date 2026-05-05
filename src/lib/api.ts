export const API_BASE = "https://whisperbox.koyeb.app";
export const WS_BASE = "wss://whisperbox.koyeb.app";

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  public_key: string;
  wrapped_private_key: string;
  pbkdf2_salt: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface SearchResult {
  id: string;
  username: string;
  display_name: string;
}

export interface Conversation {
  user_id: string;
  display_name: string;
  username: string;
  last_message_at: string;
}

export interface MessagePayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

export interface MessageResponse {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: MessagePayload;
  delivered: boolean;
  created_at: string;
}

let currentAccessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(t: string | null) {
  currentAccessToken = t;
}
export function getAccessToken() {
  return currentAccessToken;
}
export function setOnUnauthorized(cb: () => void) {
  onUnauthorized = cb;
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (init.auth !== false && currentAccessToken) {
    headers.set("Authorization", `Bearer ${currentAccessToken}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && init.auth !== false) onUnauthorized?.();
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? JSON.stringify(j);
    } catch {
      // ignore
    }
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register: (body: {
    username: string;
    display_name: string;
    password: string;
    public_key: string;
    wrapped_private_key: string;
    pbkdf2_salt: string;
  }) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  login: (body: { username: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      auth: false,
    }),
  me: () => request<UserProfile>("/auth/me"),
  refresh: (refresh_token: string) =>
    request<{ access_token: string; expires_in: number }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
      auth: false,
    }),
  logout: (refresh_token: string) =>
    request<{ detail: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
  search: (q: string) => request<SearchResult[]>(`/users/search?q=${encodeURIComponent(q)}`),
  publicKey: (userId: string) =>
    request<{ public_key: string }>(`/users/${userId}/public-key`),
  conversations: () => request<Conversation[]>("/conversations"),
  history: (userId: string, before?: string) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (before) qs.set("before", before);
    return request<MessageResponse[]>(`/conversations/${userId}/messages?${qs.toString()}`);
  },
  sendMessage: (to: string, payload: MessagePayload) =>
    request<MessageResponse>("/messages", {
      method: "POST",
      body: JSON.stringify({ to, payload }),
    }),
};
