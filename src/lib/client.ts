"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ClientError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

export async function apiFetch<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth")) window.location.href = "/login?next=" + encodeURIComponent(location.pathname);
    const e = data?.error;
    const detail = Array.isArray(e?.details) && e.details.length ? `: ${e.details.map((d: any) => d.message).join("; ")}` : "";
    throw new ClientError(res.status, e?.code ?? "error", (e?.message ?? "Request failed") + detail, e?.details);
  }
  return data as T;
}

/** Minimal data hook with optional polling. */
export function useApi<T = any>(path: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await apiFetch<T>(path);
      if (alive.current) { setData(d); setError(null); }
    } catch (e: any) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    setLoading(!!path);
    load();
    if (!opts.refreshMs) return () => { alive.current = false; };
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, opts.refreshMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, opts.refreshMs, path]);
  return { data, error, loading, reload: load, setData };
}

export const newIdempotencyKey = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, "");
