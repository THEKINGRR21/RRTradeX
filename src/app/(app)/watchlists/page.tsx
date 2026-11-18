"use client";
import Link from "next/link";
import { useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, Empty, ErrorBox, PageHeader, Pct, Spinner, fmtINR } from "@/components/ui";

export default function Watchlists() {
  const { data: me } = useMe();
  const { data, error, reload } = useApi<any>("/watchlists", { refreshMs: 15_000 });
  const { data: inst } = useApi<any>("/instruments");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const act = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); reload(); } catch (e: any) { setErr(e.message); } };
  if (!data) return error ? <ErrorBox msg={error} /> : <Spinner />;
  const lim = me?.limits;
  return (
    <>
      <PageHeader title="Watchlists" sub={lim ? `${data.watchlists.length}/${lim.watchlists} watchlists · up to ${lim.items_per_watchlist} instruments each` : undefined}
        action={<form onSubmit={(e) => { e.preventDefault(); act(async () => { await apiFetch("/watchlists", { method: "POST", json: { name } }); setName(""); }); }} className="flex gap-2">
          <input className="input w-48" placeholder="New watchlist name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} aria-label="New watchlist name" />
          <button className="btn-primary">Create</button></form>} />
      <ErrorBox msg={err} />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {data.watchlists.map((w: any) => (
          <Card key={w.id} pad={false} title={w.name} action={
            <div className="flex gap-3 text-xs">
              <button className="text-mist-400 hover:text-brand" onClick={() => { const n = prompt("Rename watchlist", w.name); if (n && n !== w.name) act(() => apiFetch(`/watchlists/${w.id}`, { method: "PATCH", json: { name: n } })); }}>Rename</button>
              <button className="text-mist-400 hover:text-loss" onClick={() => confirm(`Delete "${w.name}"?`) && act(() => apiFetch(`/watchlists/${w.id}`, { method: "DELETE" }))}>Delete</button>
            </div>}>
            {w.items.length ? (
              <table className="tbl"><tbody>{w.items.map((i: any) => (
                <tr key={i.instrumentId}>
                  <td><Link href={`/markets/${i.symbol}`} className="font-semibold hover:text-brand">{i.symbol}</Link><div className="text-[11px] text-mist-500">{i.companyName}</div></td>
                  <td className="num text-right">{fmtINR(i.quote?.lastPrice)}</td><td className="text-right"><Pct v={i.quote?.changePct} /></td>
                  <td className="w-8 text-right"><button aria-label={`Remove ${i.symbol}`} className="text-mist-500 hover:text-loss" onClick={() => act(() => apiFetch(`/watchlists/${w.id}/items/${i.instrumentId}`, { method: "DELETE" }))}>✕</button></td>
                </tr>))}</tbody></table>
            ) : <Empty>Empty watchlist.</Empty>}
            <div className="flex gap-2 border-t border-ink-700 p-3">
              <select className="input py-1.5" value={adding[w.id] ?? ""} onChange={(e) => setAdding({ ...adding, [w.id]: e.target.value })} aria-label="Instrument to add">
                <option value="">Add instrument…</option>
                {inst?.instruments.filter((x: any) => !w.items.some((i: any) => i.instrumentId === x.id)).map((x: any) => <option key={x.id} value={x.id}>{x.symbol} — {x.companyName}</option>)}
              </select>
              <button className="btn-ghost py-1.5" disabled={!adding[w.id]} onClick={() => act(async () => { await apiFetch(`/watchlists/${w.id}/items`, { method: "POST", json: { instrumentId: adding[w.id] } }); setAdding({ ...adding, [w.id]: "" }); })}>Add</button>
            </div>
          </Card>
        ))}
        {!data.watchlists.length && <Card><Empty>No watchlists yet — create one above.</Empty></Card>}
      </div>
    </>
  );
}
