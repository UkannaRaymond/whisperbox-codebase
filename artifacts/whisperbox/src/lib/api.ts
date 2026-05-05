const BASE_URL = "https://whisperbox.koyeb.app";

export async function apiFetch(path: string, options?: RequestInit & { token?: string }) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.token ? { Authorization: "Bearer " + options.token } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
