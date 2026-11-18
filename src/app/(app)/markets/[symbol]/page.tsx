"use client";
import Link from "next/link";
import { use, useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import PriceChart from "@/components/PriceChart";
import OrderTicket from "@/components/OrderTicket";
import { Card, ErrorBox, Field, Ok, Pct, QuoteMeta, Signed, Spinner, fmtINR, fmtNum, fmtTime } from "@/components/ui";

export default function Instrument({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const { data: me } = useMe();
  const { data, error, reload } = useApi<any>(`/instruments/${encodeURIComponent(symbol)}`, { refreshMs: 15_000 });
  const { data: wallet, reload: reloadWallet } = useApi<any>(me?.canTrade ? "/wallet?limit=1" : null);
  const { data: wl, reload: reloadWl } = useApi<any>(me?.canTrade ? "/watchlists" : null);
  const [cond, setCond] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  const { instrument: i, quote: q, position: pos } = data;
  const lists = wl?.watchlists ?? [];
  const inList = lists.find((l: any) => l.items.some((it: any) => it.instrumentId === i.id));

  async function toggleWatch() {
    setErr(null); setMsg(null);
    try {
      if (inList) await apiFetch(`/watchlists/${inList.id}/items/${i.id}`, { method: "DELETE" });
      else if (lists[0]) await apiFetch(`/watchlists/${lists[0].id}/items`, { method: "POST", json: { instrumentId: i.id } });
      else { const w = await apiFetch(`/watchlists`, { method: "POST", json: { name: "My Watchlist" } }); await apiFetch(`/watchlists/${w.id}/items`, { method: "POST", json: { instrumentId: i.id } }); }
      reloadWl();
    } catch (e: any) { setErr(e.message); }
  }
  async function addAlert(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null);
    try { await apiFetch(`/alerts`, { method: "POST", json: { instrumentId: i.id, condition: cond, targetPrice: target } }); setMsg(`Alert set: ${i.symbol} ${cond} ${fmtINR(target)}`); setTarget(""); }
    catch (e: any) { setErr(e.message); }
  }
  const qty = Number(pos?.quantity ?? 0);
  const unreal = qty > 0 && q ? (Number(q.lastPrice) - Number(pos.avgBuyPrice)) * qty : 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/markets" className="text-xs text-mist-400 hover:text-brand">← Markets</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{i.symbol} <span className="text-base font-normal text-mist-400">{i.companyName}</span></h1>
          <div className="mt-1 text-xs text-mist-500">{i.exchange} · {i.sector}</div>
        </div>
        <div className="text-right">
          <div className="num text-3xl font-semibold">{fmtINR(q?.lastPrice)}</div>
          <div className="mt-0.5"><Pct v={q?.changePct} /> <span className="text-xs text-mist-500">vs 24h ago ({fmtINR(q?.prevClose)})</span></div>
          <div className="mt-1.5"><QuoteMeta q={q} /></div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Price chart"><PriceChart symbol={i.symbol} advanced={me?.user.role === "trader"} /></Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card card-pad"><div className="label">Volume (24h)</div><div className="num mt-1 text-lg font-semibold">{fmtNum(q?.volume)}</div></div>
            <div className="card card-pad"><div className="label">Quote time</div><div className="num mt-1 text-lg font-semibold">{fmtTime(q?.quotedAt, false)}</div></div>
            <div className="card card-pad"><div className="label">Data age</div><div className="num mt-1 text-lg font-semibold">{q?.ageSeconds ?? "—"}s</div></div>
          </div>
          {me?.canTrade && (
            <Card title="Your position">
              {qty > 0 ? (
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div><dt className="label">Quantity</dt><dd className="num mt-1 font-semibold">{qty}</dd></div>
                  <div><dt className="label">Avg buy price</dt><dd className="num mt-1 font-semibold">{fmtINR(pos.avgBuyPrice)}</dd></div>
                  <div><dt className="label">Unrealised</dt><dd className="mt-1 font-semibold"><Signed v={unreal.toFixed(2)} /></dd></div>
                  <div><dt className="label">Realised</dt><dd className="mt-1 font-semibold"><Signed v={pos.realizedPnl} /></dd></div>
                </dl>
              ) : <p className="text-sm text-mist-400">You don&apos;t hold {i.symbol}.{Number(pos?.realizedPnl) ? <> Realised P&L so far: <Signed v={pos.realizedPnl} /></> : null}</p>}
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {me?.canTrade ? (
            <>
              <Card title="Paper order ticket" action={<button onClick={toggleWatch} className="text-sm text-brand" aria-label={inList ? "Remove from watchlist" : "Add to watchlist"}>{inList ? "★ Watching" : "☆ Watch"}</button>}>
                <OrderTicket instrument={i} quote={q} position={pos} cash={wallet?.wallet.availableBalance ?? null} onDone={() => { reload(); reloadWallet(); }} />
              </Card>
              <Card title="Price alert">
                <form onSubmit={addAlert} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Condition"><select className="input" value={cond} onChange={(e) => setCond(e.target.value as any)}><option value="above">Price above</option><option value="below">Price below</option></select></Field>
                    <Field label="Target ₹"><input className="input num" inputMode="decimal" required value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={q?.lastPrice} /></Field>
                  </div>
                  <ErrorBox msg={err} /><Ok msg={msg} />
                  <button className="btn-ghost w-full">Create alert</button>
                </form>
              </Card>
            </>
          ) : me ? <Card title="Trading"><p className="text-sm text-mist-400">Administrator accounts cannot place trades. Admin access never includes trading permissions.</p></Card> : null}
        </div>
      </div>
    </>
  );
}
