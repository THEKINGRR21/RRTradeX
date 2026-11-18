"use client";
import { useEffect, useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, ErrorBox, Field, Ok, PageHeader, Spinner, fmtDate, fmtTime } from "@/components/ui";

const KYC: Record<string, string> = { not_collected: "Not collected — not required for paper trading", self_declared: "Self-declared (no provider verification)", pending_provider: "Pending provider verification", provider_verified: "Verified by approved provider" };

export default function Profile() {
  const { data: me, reload } = useMe();
  const { data: ss } = useApi<any>("/me/sessions");
  const [f, setF] = useState({ fullName: "", phone: "", riskProfile: "moderate", experienceLevel: "beginner" });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => { if (me) { const p = me.user.profile; setF({ fullName: p.fullName ?? "", phone: p.phone ?? "", riskProfile: p.riskProfile, experienceLevel: p.experienceLevel }); } }, [me]);
  if (!me) return <Spinner />;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(null);
    try { await apiFetch("/me", { method: "PATCH", json: f }); setOk("Profile saved."); reload(); } catch (e: any) { setErr(e.message); }
  }
  async function signOutAll() { if (confirm("Sign out of all devices, including this one?")) { await apiFetch("/me/sessions", { method: "DELETE" }); window.location.href = "/login"; } }
  const u = me.user;
  return (
    <>
      <PageHeader title="Profile" sub={`${u.email} · ${u.role === "retail" ? "Learner" : u.role} account · member since ${fmtDate(u.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Personal details" className="lg:col-span-2">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input className="input" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
            <Field label="Phone (optional)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 …" /></Field>
            <Field label="Risk profile" hint="Used to tailor learning suggestions. Not an advisory suitability assessment.">
              <select className="input" value={f.riskProfile} onChange={(e) => setF({ ...f, riskProfile: e.target.value })}><option value="conservative">Conservative</option><option value="moderate">Moderate</option><option value="aggressive">Aggressive</option></select>
            </Field>
            <Field label="Experience"><select className="input" value={f.experienceLevel} onChange={(e) => setF({ ...f, experienceLevel: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></Field>
            <div className="space-y-2 sm:col-span-2"><ErrorBox msg={err} /><Ok msg={ok} /><button className="btn-primary">Save changes</button></div>
          </form>
        </Card>
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <div><dt className="label">Role</dt><dd className="mt-0.5 capitalize">{u.role === "retail" ? "Learner (retail)" : u.role}{u.role === "retail" && <div className="text-xs text-mist-500">Trader accounts (advanced charts, higher limits) are granted by an administrator.</div>}</dd></div>
            <div><dt className="label">Status</dt><dd className="mt-0.5 capitalize">{u.status}</dd></div>
            <div><dt className="label">Verification</dt><dd className="mt-0.5 text-mist-300">{KYC[u.kycStatus]}</dd></div>
            <div><dt className="label">Last sign-in</dt><dd className="mt-0.5">{fmtTime(u.lastLoginAt)}</dd></div>
            {u.permissions.length > 0 && <div><dt className="label">Admin permissions</dt><dd className="mt-1 flex flex-wrap gap-1">{u.permissions.map((p) => <span key={p} className="chip bg-ink-700 text-mist-300">{p}</span>)}</dd></div>}
          </dl>
        </Card>
        <Card title="Active sessions" className="lg:col-span-3" action={<button onClick={signOutAll} className="btn-danger px-2.5 py-1 text-xs">Sign out everywhere</button>} pad={false}>
          <table className="tbl"><thead><tr><th>Device</th><th>IP</th><th>Signed in</th><th>Last active</th><th>Expires</th></tr></thead>
            <tbody>{ss?.sessions.map((s: any) => (
              <tr key={s.session_id}><td className="max-w-xs truncate text-xs text-mist-300">{s.current && <span className="chip mr-2 bg-gain-soft text-gain">this device</span>}{s.user_agent ?? "Unknown"}</td>
                <td className="text-xs text-mist-400">{s.ip ?? "—"}</td><td className="text-xs">{fmtTime(s.created_at)}</td><td className="text-xs">{fmtTime(s.last_seen_at)}</td><td className="text-xs">{fmtTime(s.expires_at)}</td></tr>))}</tbody></table>
        </Card>
      </div>
      <p className="mt-6 text-xs text-mist-500">RRTradeX does not collect PAN, Aadhaar or bank details. Only the information above is stored.</p>
    </>
  );
}
