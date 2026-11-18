"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { apiFetch, useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, Empty, ErrorBox, Field, Modal, Ok, PageHeader, Spinner, Stat, Tabs, fmtINR, fmtTime } from "@/components/ui";

type Tab = "overview" | "users" | "content" | "audit" | "config";
const PERMS = ["users:manage", "content:manage", "audit:read", "config:manage", "reports:read", "finance:adjust"];

export default function Admin() {
  const { data: me } = useMe();
  const perms = me?.user.permissions ?? [];
  const tabs = ([
    ["overview", "Overview", "reports:read"], ["users", "Users", "users:manage"], ["content", "Learning content", "content:manage"],
    ["audit", "Audit log", "audit:read"], ["config", "Configuration", "config:manage"],
  ] as const).filter(([, , p]) => perms.includes(p));
  const [tab, setTab] = useState<Tab | null>(null);
  useEffect(() => { if (!tab && tabs.length) setTab(tabs[0][0]); }, [tabs, tab]);
  if (!me) return <Spinner />;
  if (me.user.role !== "admin") return <ErrorBox msg="Administrator access required." />;
  return (
    <>
      <PageHeader title="Admin console" sub="Least-privilege administration · every privileged action is audit-logged" action={tab && <Tabs value={tab} onChange={setTab} options={tabs.map(([v, l]) => ({ value: v, label: l }))} />} />
      {!tabs.length && <ErrorBox msg="Your admin account has no permissions assigned." />}
      {tab === "overview" && <Overview />}
      {tab === "users" && <Users canAdjust={perms.includes("finance:adjust")} myId={me.user.id} />}
      {tab === "content" && <Content />}
      {tab === "audit" && <Audit />}
      {tab === "config" && <Config />}
    </>
  );
}

function Overview() {
  const { data: r, error } = useApi<any>("/admin/reports", { refreshMs: 30_000 });
  if (error) return <ErrorBox msg={error} />;
  if (!r) return <Spinner />;
  const total = r.users.reduce((s: number, u: any) => s + u.n, 0);
  const lastQuoteAge = r.marketFeed.last_quote ? Math.round((Date.now() - new Date(r.marketFeed.last_quote).getTime()) / 1000) : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={total} sub={r.users.map((u: any) => `${u.n} ${u.role}/${u.status}`).join(" · ")} />
        <Stat label="Executions (7d)" value={r.tradesLast7d.n} sub={`Turnover ${fmtINR(r.tradesLast7d.turnover, true)} · fees ${fmtINR(r.tradesLast7d.fees, true)}`} />
        <Stat label="Wallet reconciliation" value={r.walletReconciliation.ok ? "✓ All balanced" : `⚠ ${r.walletReconciliation.mismatches.length} mismatch`} tone={r.walletReconciliation.ok ? "gain" : "loss"} sub="Cached balance vs ledger sum" />
        <Stat label="Market feed" value={r.marketFeed.status} sub={`${r.marketFeed.provider} · last quote ${lastQuoteAge == null ? "never" : lastQuoteAge + "s ago"} · ${r.marketFeed.quotes_24h} quotes/24h`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Orders by status (7d)">{r.ordersLast7d.length ? <ul className="space-y-2 text-sm">{r.ordersLast7d.map((o: any) => <li key={o.status} className="flex justify-between capitalize"><span className="text-mist-300">{o.status}</span><span className="num font-semibold">{o.n}</span></li>)}</ul> : <Empty>No orders.</Empty>}</Card>
        <Card title="Engagement">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-mist-300">Active price alerts</span><span className="num font-semibold">{r.alerts.active}</span></li>
            <li className="flex justify-between"><span className="text-mist-300">Alerts triggered (7d)</span><span className="num font-semibold">{r.alerts.triggered_7d}</span></li>
            <li className="flex justify-between"><span className="text-mist-300">Lesson completions</span><span className="num font-semibold">{r.learning.completions}</span></li>
            <li className="flex justify-between"><span className="text-mist-300">AI messages / sessions (7d)</span><span className="num font-semibold">{r.aiLast7d.messages} / {r.aiLast7d.sessions}</span></li>
          </ul>
        </Card>
        <Card title="Daily executions (30d)">
          {r.dailyTrades.length ? <div className="h-40"><ResponsiveContainer><BarChart data={r.dailyTrades}><CartesianGrid stroke="#1c2738" vertical={false} /><XAxis dataKey="day" stroke="#5f6e86" fontSize={10} tickFormatter={(d) => String(d).slice(5, 10)} tickLine={false} axisLine={false} /><YAxis stroke="#5f6e86" fontSize={10} width={30} allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#0f1724", border: "1px solid #2a3850", borderRadius: 8, fontSize: 12 }} /><Bar dataKey="trades" fill="#f5b93a" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty>No trades yet.</Empty>}
        </Card>
      </div>
      {!r.walletReconciliation.ok && <Card title="Reconciliation mismatches"><ul className="text-sm">{r.walletReconciliation.mismatches.map((m: any) => <li key={m.wallet_id}>{m.email}: cached {m.available_balance} vs ledger {m.ledger_balance}</li>)}</ul></Card>}
    </div>
  );
}

function Users({ canAdjust, myId }: { canAdjust: boolean; myId: string }) {
  const [q, setQ] = useState("");
  const { data, reload } = useApi<any>(`/admin/users?q=${encodeURIComponent(q)}`);
  const [edit, setEdit] = useState<any>(null);
  const [adj, setAdj] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function saveUser(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { await apiFetch(`/admin/users/${edit.id}`, { method: "PATCH", json: { role: edit.role, status: edit.status, permissions: edit.role === "admin" ? edit.permissions : [], reason: edit.reason } }); setEdit(null); setOk("User updated and change audited."); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  async function saveAdj(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const r = await apiFetch(`/admin/wallets/${adj.id}/adjust`, { method: "POST", json: { direction: adj.direction, amount: adj.amount, reason: adj.reason } }); setAdj(null); setOk(`Adjustment posted. New balance ${fmtINR(r.balance)}.`); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <div className="mb-4 flex gap-3"><input className="input max-w-sm" placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>
      <Ok msg={ok} />
      <Card pad={false} className="mt-3">
        {!data ? <Spinner /> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th className="text-right">Virtual balance</th><th className="text-right">Orders</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>{data.users.map((u: any) => (
              <tr key={u.id}>
                <td><div className="font-semibold">{u.fullName}</div><div className="text-xs text-mist-400">{u.email}</div></td>
                <td className="capitalize">{u.role}{u.permissions.length > 0 && <div className="text-[10px] text-mist-500">{u.permissions.join(", ")}</div>}</td>
                <td><span className={`chip capitalize ${u.status === "active" ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"}`}>{u.status}</span></td>
                <td className="num text-right">{u.walletBalance ? fmtINR(u.walletBalance) : "—"}</td><td className="num text-right">{u.orders}</td>
                <td className="text-xs text-mist-400">{fmtTime(u.lastLoginAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {u.id !== myId && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setErr(null); setEdit({ ...u, reason: "" }); }}>Edit</button>}
                  {canAdjust && u.walletBalance && u.id !== myId && <button className="btn-ghost ml-1 px-2 py-1 text-xs" onClick={() => { setErr(null); setAdj({ ...u, direction: "credit", amount: "", reason: "" }); }}>Adjust</button>}
                </td>
              </tr>))}
            </tbody></table></div>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.email}`}>
        {edit && <form onSubmit={saveUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="retail">Retail (learner)</option><option value="trader">Trader</option><option value="admin">Admin</option></select></Field>
            <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></Field>
          </div>
          {edit.role === "admin" && <fieldset><legend className="label mb-2">Admin permissions</legend><div className="grid grid-cols-2 gap-1.5">{PERMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#f5b93a]" checked={edit.permissions.includes(p)} onChange={(e) => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, p] : edit.permissions.filter((x: string) => x !== p) })} />{p}</label>))}</div>
            <p className="mt-2 text-xs text-mist-500">Admin roles never include trading. Content admins should not hold finance:adjust.</p></fieldset>}
          <Field label="Reason (audited)"><textarea className="input" rows={2} required minLength={5} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
          <ErrorBox msg={err} />
          <p className="text-xs text-mist-500">Role, status or permission changes sign the user out of all sessions.</p>
          <button className="btn-primary w-full">Save & audit</button>
        </form>}
      </Modal>
      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Wallet adjustment · ${adj?.email}`}>
        {adj && <form onSubmit={saveAdj} className="space-y-4">
          <div className="rounded-lg border border-orange-800 bg-orange-950/40 px-3 py-2 text-xs text-orange-300">Exceptional action. Posts a compensating ledger entry (history is never edited) and creates an immutable audit record.</div>
          <div className="text-sm text-mist-300">Current virtual balance: <span className="num font-semibold text-mist-100">{fmtINR(adj.walletBalance)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction"><select className="input" value={adj.direction} onChange={(e) => setAdj({ ...adj, direction: e.target.value })}><option value="credit">Credit</option><option value="debit">Debit</option></select></Field>
            <Field label="Amount ₹"><input className="input num" required value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></Field>
          </div>
          <Field label="Justification (min 15 chars)"><textarea className="input" rows={3} required minLength={15} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></Field>
          <ErrorBox msg={err} />
          <button className="btn-primary w-full">Post adjustment</button>
        </form>}
      </Modal>
    </>
  );
}

const BLANK = { title: "", description: "", body: "", contentType: "article", url: "", categoryId: "", difficulty: "beginner", durationMin: 5, status: "draft" };
function Content() {
  const { data, reload } = useApi<any>("/admin/content");
  const { data: cats } = useApi<any>("/learning/categories");
  const [ed, setEd] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const payload = { ...ed, durationMin: Number(ed.durationMin), categoryId: ed.categoryId || null, url: ed.url || "" };
    delete payload.id;
    try {
      if (ed.id) await apiFetch(`/admin/content/${ed.id}`, { method: "PATCH", json: payload });
      else await apiFetch(`/admin/content`, { method: "POST", json: payload });
      setEd(null); reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function setStatus(id: string, status: string) { try { await apiFetch(`/admin/content/${id}`, { method: "PATCH", json: { status } }); reload(); } catch (e: any) { setErr(e.message); } }
  const ST: Record<string, string> = { published: "bg-gain-soft text-gain", draft: "bg-ink-700 text-mist-300", unpublished: "bg-orange-950 text-orange-300", archived: "bg-ink-800 text-mist-500" };
  if (ed) return (
    <Card title={ed.id ? "Edit content" : "New content"} action={<button className="text-sm text-mist-400" onClick={() => setEd(null)}>Cancel</button>}>
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className="input" required value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={ed.categoryId ?? ""} onChange={(e) => setEd({ ...ed, categoryId: e.target.value })}><option value="">None</option>{cats?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Description"><input className="input" value={ed.description} onChange={(e) => setEd({ ...ed, description: e.target.value })} /></Field>
        <Field label="External URL (https, optional)"><input className="input" value={ed.url ?? ""} onChange={(e) => setEd({ ...ed, url: e.target.value })} placeholder="https://…" /></Field>
        <div className="grid grid-cols-4 gap-3 md:col-span-2">
          <Field label="Type"><select className="input" value={ed.contentType} onChange={(e) => setEd({ ...ed, contentType: e.target.value })}><option value="article">Article</option><option value="video">Video</option><option value="tutorial">Tutorial</option></select></Field>
          <Field label="Difficulty"><select className="input" value={ed.difficulty} onChange={(e) => setEd({ ...ed, difficulty: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></Field>
          <Field label="Minutes"><input className="input num" type="number" min={1} max={600} value={ed.durationMin} onChange={(e) => setEd({ ...ed, durationMin: e.target.value })} /></Field>
          <Field label="Status"><select className="input" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="unpublished">Unpublished</option><option value="archived">Archived</option></select></Field>
        </div>
        <div className="md:col-span-2"><Field label="Body (Markdown: ## headings, - lists, **bold**, > formula)"><textarea className="input font-mono text-xs" rows={16} value={ed.body} onChange={(e) => setEd({ ...ed, body: e.target.value })} /></Field></div>
        <div className="md:col-span-2 space-y-2"><ErrorBox msg={err} /><button className="btn-primary">Save content</button></div>
      </form>
    </Card>
  );
  return (
    <>
      <div className="mb-4 flex justify-end"><button className="btn-primary" onClick={() => { setErr(null); setEd({ ...BLANK }); }}>+ New content</button></div>
      <ErrorBox msg={err} />
      <Card pad={false}>
        {!data ? <Spinner /> : <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Title</th><th>Category</th><th>Level</th><th>Status</th><th className="text-right">Learners / done</th><th>Updated</th><th /></tr></thead>
          <tbody>{data.contents.map((c: any) => (
            <tr key={c.id}>
              <td className="font-semibold">{c.title}<div className="text-[11px] font-normal capitalize text-mist-500">{c.content_type} · {c.duration_min} min</div></td>
              <td className="text-xs text-mist-300">{c.category ?? "—"}</td><td className="text-xs capitalize">{c.difficulty}</td>
              <td><span className={`chip capitalize ${ST[c.status]}`}>{c.status}</span></td>
              <td className="num text-right">{c.learners} / {c.completions}</td><td className="text-xs text-mist-400">{fmtTime(c.updated_at)}</td>
              <td className="whitespace-nowrap text-right text-xs">
                <button className="text-brand" onClick={() => { setErr(null); setEd({ id: c.id, title: c.title, description: c.description, body: c.body, contentType: c.content_type, url: c.url ?? "", categoryId: c.category_id ?? "", difficulty: c.difficulty, durationMin: c.duration_min, status: c.status }); }}>Edit</button>
                {c.status !== "published" && c.status !== "archived" && <button className="ml-3 text-gain" onClick={() => setStatus(c.id, "published")}>Publish</button>}
                {c.status === "published" && <button className="ml-3 text-orange-300" onClick={() => setStatus(c.id, "unpublished")}>Unpublish</button>}
                {c.status !== "archived" && <button className="ml-3 text-mist-400" onClick={() => confirm("Archive this content?") && setStatus(c.id, "archived")}>Archive</button>}
              </td>
            </tr>))}
          </tbody></table></div>}
      </Card>
    </>
  );
}

function Audit() {
  const [action, setAction] = useState("");
  const { data, error } = useApi<any>(`/admin/audit-logs?action=${encodeURIComponent(action)}`);
  return (
    <>
      <div className="mb-4 flex gap-3">
        <select className="input max-w-xs" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option><option value="auth.">Authentication</option><option value="admin.user">User administration</option><option value="admin.content">Content</option><option value="admin.config">Configuration</option><option value="admin.wallet">Wallet adjustments</option><option value="admin.audit">Audit access</option>
        </select>
      </div>
      <ErrorBox msg={error} />
      <Card pad={false}>
        {!data ? <Spinner /> : data.logs.length ? <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason / details</th><th>IP</th></tr></thead>
          <tbody>{data.logs.map((l: any) => (
            <tr key={l.audit_id} className="align-top">
              <td className="whitespace-nowrap text-xs text-mist-400">{fmtTime(l.created_at)}</td><td className="text-xs">{l.actor_email ?? "—"}</td>
              <td><code className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px]">{l.action}</code></td>
              <td className="text-xs text-mist-400">{l.target_type}{l.target_id && <div className="max-w-[160px] truncate text-mist-500">{l.target_id}</div>}</td>
              <td className="max-w-md text-xs text-mist-300">{l.reason && <div className="text-mist-100">“{l.reason}”</div>}{Object.keys(l.metadata ?? {}).length > 0 && <details><summary className="cursor-pointer text-mist-500">metadata</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-mist-400">{JSON.stringify(l.metadata, null, 1)}</pre></details>}</td>
              <td className="text-xs text-mist-500">{l.ip ?? "—"}</td>
            </tr>))}
          </tbody></table></div> : <Empty>No audit events.</Empty>}
      </Card>
      <p className="mt-3 text-xs text-mist-500">Audit records are append-only at the database level. Viewing this log is itself recorded.</p>
    </>
  );
}

function Config() {
  const { data, reload } = useApi<any>("/admin/config");
  const [drafts, setDrafts] = useState<Record<string, { text: string; reason: string }>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  async function save(key: string) {
    const d = drafts[key];
    try { await apiFetch("/admin/config", { method: "PUT", json: { key, value: JSON.parse(d.text), reason: d.reason } }); setMsg({ ...msg, [key]: "✓ Saved and audited" }); reload(); }
    catch (e: any) { setMsg({ ...msg, [key]: e instanceof SyntaxError ? "Invalid JSON" : e.message }); }
  }
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {data.config.map((c: any) => {
        const d = drafts[c.key] ?? { text: JSON.stringify(c.value, null, 2), reason: "" };
        return (
          <Card key={c.key} title={<code>{c.key}</code>} action={<span className="text-[11px] text-mist-500">updated {fmtTime(c.updated_at)}</span>}>
            <textarea className="input font-mono text-xs" rows={10} value={d.text} onChange={(e) => setDrafts({ ...drafts, [c.key]: { ...d, text: e.target.value } })} aria-label={`${c.key} JSON`} />
            <div className="mt-3 flex gap-2"><input className="input" placeholder="Reason for change (required)" value={d.reason} onChange={(e) => setDrafts({ ...drafts, [c.key]: { ...d, reason: e.target.value } })} /><button className="btn-primary" disabled={d.reason.trim().length < 5} onClick={() => save(c.key)}>Save</button></div>
            {msg[c.key] && <p className="mt-2 text-xs text-mist-300">{msg[c.key]}</p>}
          </Card>
        );
      })}
    </div>
  );
}
