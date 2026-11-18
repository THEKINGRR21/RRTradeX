"use client";
import Link from "next/link";
import { useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, Empty, ErrorBox, Field, PageHeader, Spinner, fmtINR, fmtTime } from "@/components/ui";

export default function Alerts() {
  const { data: me } = useMe();
  const { data, error, reload } = useApi<any>("/alerts", { refreshMs: 15_000 });
  const { data: inst } = useApi<any>("/instruments");
  const [f, setF] = useState({ instrumentId: "", condition: "above", targetPrice: "" });
  const [err, setErr] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { await apiFetch("/alerts", { method: "POST", json: f }); setF({ ...f, targetPrice: "" }); reload(); } catch (e: any) { setErr(e.message); }
  }
  async function del(id: string) { try { await apiFetch(`/alerts/${id}`, { method: "DELETE" }); reload(); } catch (e: any) { setErr(e.message); } }
  const sel = inst?.instruments.find((i: any) => i.id === f.instrumentId);
  if (!data) return error ? <ErrorBox msg={error} /> : <Spinner />;
  const active = data.alerts.filter((a: any) => a.isActive), fired = data.alerts.filter((a: any) => !a.isActive);
  return (
    <>
      <PageHeader title="Price alerts" sub={`${active.length}${me?.limits ? "/" + me.limits.active_alerts : ""} active · evaluated on every fresh quote · never on stale data`} />
      <Card title="New alert">
        <form onSubmit={create} className="grid items-end gap-3 sm:grid-cols-4">
          <Field label="Instrument"><select className="input" required value={f.instrumentId} onChange={(e) => setF({ ...f, instrumentId: e.target.value })}><option value="">Choose…</option>{inst?.instruments.map((i: any) => <option key={i.id} value={i.id}>{i.symbol}</option>)}</select></Field>
          <Field label="Condition"><select className="input" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}><option value="above">Price rises above</option><option value="below">Price falls below</option></select></Field>
          <Field label="Target price ₹" hint={sel ? `Last ${fmtINR(sel.quote?.lastPrice)}` : undefined}><input className="input num" inputMode="decimal" required value={f.targetPrice} onChange={(e) => setF({ ...f, targetPrice: e.target.value.replace(/[^0-9.]/g, "") })} /></Field>
          <button className="btn-primary sm:mb-[2px]">Create alert</button>
        </form>
        <div className="mt-3"><ErrorBox msg={err} /></div>
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Active" pad={false}>
          {active.length ? <table className="tbl"><tbody>{active.map((a: any) => (
            <tr key={a.id}><td><Link href={`/markets/${a.symbol}`} className="font-semibold hover:text-brand">{a.symbol}</Link></td><td className="text-mist-300">{a.condition} <span className="num font-semibold text-mist-100">{fmtINR(a.targetPrice)}</span></td>
              <td className="num text-right text-xs text-mist-400">now {fmtINR(a.quote?.lastPrice)}</td><td className="w-8"><button aria-label="Delete alert" className="text-mist-500 hover:text-loss" onClick={() => del(a.id)}>✕</button></td></tr>))}</tbody></table>
            : <Empty>No active alerts.</Empty>}
        </Card>
        <Card title="Triggered" pad={false}>
          {fired.length ? <table className="tbl"><tbody>{fired.map((a: any) => (
            <tr key={a.id}><td className="font-semibold">{a.symbol}</td><td className="text-xs text-mist-300">{a.condition} {fmtINR(a.targetPrice)} · hit at <span className="num">{fmtINR(a.triggeredPrice)}</span></td>
              <td className="text-right text-xs text-mist-500">{fmtTime(a.triggeredAt)}</td><td className="w-8"><button aria-label="Delete alert" className="text-mist-500 hover:text-loss" onClick={() => del(a.id)}>✕</button></td></tr>))}</tbody></table>
            : <Empty>Nothing triggered yet.</Empty>}
        </Card>
      </div>
    </>
  );
}
