import type { UserProfile } from "@shared/schemas";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || `请求失败 (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  auth: {
    me: () => requestJson<{ user: UserProfile | null }>("/api/auth/me"),
    login: (username: string, password: string) =>
      requestJson<{ user: UserProfile }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, password: string) =>
      requestJson<{ user: UserProfile }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    logout: () => requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  },
  health: () =>
    requestJson<{ status: string; runtime: string; cardsCdnUrl: string }>("/api/health"),
};
