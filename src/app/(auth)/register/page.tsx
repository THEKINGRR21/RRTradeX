"use client";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { ErrorBox, Field } from "@/components/ui";

export default function RegisterPage() {
  const [f, setF] = useState({ fullName: "", email: "", password: "", experienceLevel: "beginner", acceptTerms: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await apiFetch("/auth/register", { method: "POST", json: f }); window.location.href = "/dashboard"; }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card card-pad space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Create your practice account</h1>
        <p className="mt-1 text-sm text-mist-400">You&apos;ll get ₹10,00,000 in virtual funds to practise with.</p>
      </div>
      <ErrorBox msg={err} />
      <Field label="Full name"><input className="input" required autoComplete="name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
      <Field label="Email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
      <Field label="Password" hint="At least 10 characters, including a letter and a number.">
        <input className="input" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} />
      </Field>
      <Field label="Experience">
        <select className="input" value={f.experienceLevel} onChange={(e) => set("experienceLevel", e.target.value)}>
          <option value="beginner">Beginner, new to markets</option><option value="intermediate">Intermediate, some trading</option><option value="advanced">Advanced, trade regularly</option>
        </select>
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-mist-300">
        <input type="checkbox" className="mt-1 accent-[#f5b93a]" checked={f.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} required />
        <span>I understand RRTradeX is a <strong className="text-mist-100">simulated, educational</strong> platform: balances are virtual, prices are simulated, no real orders are placed, and nothing here is investment advice.</span>
      </label>
      <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      <p className="text-center text-sm text-mist-400">Already registered? <Link href="/login" className="text-brand hover:underline">Sign in</Link></p>
    </form>
  );
}
