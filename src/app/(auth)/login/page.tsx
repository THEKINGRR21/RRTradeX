"use client";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/client";
import { ErrorBox, Field } from "@/components/ui";

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await apiFetch("/auth/login", { method: "POST", json: { email, password } });
      const me = await apiFetch("/me");
      const next = sp.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : me.user.role === "admin" ? "/admin" : "/dashboard";
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card card-pad space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <ErrorBox msg={err} />
      <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm text-mist-400">New here? <Link href="/register" className="text-brand hover:underline">Create an account</Link></p>
    </form>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
