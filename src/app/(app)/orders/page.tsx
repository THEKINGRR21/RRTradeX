"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { Card, Empty, ErrorBox, OrderStatus, PageHeader, Side, Signed, Spinner, Tabs, fmtINR, fmtTime } from "@/components/ui";

export default function Orders() {
  const [tab, setTab] = useState<"orders" | "trades">("orders");
  const [status, setStatus] = useState("");
  const { data, error, reload } = useApi<any>(`/orders${status ? "?status=" + status : ""}`, { refreshMs: 10_000 });
  const { data: tr } = useApi<any>(tab === "trades" ? "/trades" : null, { refreshMs: 10_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function cancel(id: string) {
    if (!confirm("Cancel this open order?")) return;
    setErr(null);
    try { await apiFetch(`/orders/${id}/cancel`, { method: "POST" }); reload(); } catch (e: any) { setErr(e.message); }
  }
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetail(null);
    setDetail(await apiFetch(`/orders/${id}`));
  }
  return (
    <>
      <PageHeader title="Orders & trades" sub="Every paper order — including rejected, cancelled and expired — and every simulated execution." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} options={[{ value: "orders", label: "Orders" }, { value: "trades", label: "Executions" }]} />
        {tab === "orders" && (
          <select className="input max-w-[180px] py-1.5" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>{["open", "filled", "rejected", "cancelled", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <ErrorBox msg={error || err} />
      {tab === "orders" ? (
        <Card pad={false}>
          {!data ? <Spinner /> : data.orders.length ? (
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Time</th><th>Instrument</th><th>Side</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Limit</th><th className="text-right">Avg fill</th><th>Status</th><th /></tr></thead>
              <tbody>{data.orders.map((o: any) => (
                <Fragment key={o.id}>
                  <tr className="cursor-pointer hover:bg-ink-850" onClick={() => toggle(o.id)}>
                    <td className="whitespace-nowrap text-xs text-mist-400">{fmtTime(o.createdAt)}</td>
                    <td><Link href={`/markets/${o.symbol}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-brand">{o.symbol}</Link></td>
                    <td><Side s={o.side} /></td><td className="capitalize text-mist-300">{o.orderType}</td>
                    <td className="num text-right">{Number(o.filledQty)}/{Number(o.quantity)}</td>
                    <td className="num text-right">{o.limitPrice ? fmtINR(o.limitPrice) : "—"}</td>
                    <td className="num text-right">{o.avgFillPrice ? fmtINR(o.avgFillPrice) : "—"}</td>
                    <td><OrderStatus s={o.status} />{o.rejectReason && <div className="mt-1 max-w-[260px] text-[11px] text-loss">{o.rejectReason}</div>}</td>
                    <td className="text-right">{["open", "partially_filled"].includes(o.status) && <button onClick={(e) => { e.stopPropagation(); cancel(o.id); }} className="btn-danger px-2 py-1 text-xs">Cancel</button>}</td>
                  </tr>
                  {open === o.id && (
                    <tr><td colSpan={9} className="bg-ink-850">
                      {!detail ? <Spinner /> : (
                        <div className="grid gap-4 py-2 md:grid-cols-2">
                          <div><div className="label mb-2">Lifecycle</div><ol className="space-y-1.5 border-l border-ink-600 pl-4 text-xs">{detail.events.map((ev: any, i: number) => (
                            <li key={i}><span className="font-semibold capitalize text-mist-100">{ev.event_type.replace("_", " ")}</span> <span className="text-mist-500">{fmtTime(ev.created_at, false)}</span>{ev.detail?.reason && <div className="text-loss">{ev.detail.reason}</div>}{ev.detail?.price && <div className="text-mist-400">{ev.detail.qty} @ ₹{ev.detail.price} · fees ₹{ev.detail.fees}</div>}</li>))}</ol></div>
                          <div><div className="label mb-2">Executions</div>{detail.trades.length ? detail.trades.map((t: any) => (
                            <div key={t.trade_id} className="text-xs text-mist-300">{Number(t.executed_qty)} @ {fmtINR(t.execution_price)} · gross {fmtINR(t.gross_amount)} · fees {fmtINR(t.fees)}{t.realized_pnl != null && <> · realised <Signed v={t.realized_pnl} /></>}</div>)) : <div className="text-xs text-mist-500">No executions — wallet and holdings unchanged.</div>}</div>
                        </div>)}
                    </td></tr>
                  )}
                </Fragment>))}
              </tbody></table></div>
          ) : <Empty>No orders yet.</Empty>}
        </Card>
      ) : (
        <Card pad={false}>
          {!tr ? <Spinner /> : tr.trades.length ? (
            <div className="overflow-x-auto"><table className="tbl">
              <thead><tr><th>Executed</th><th>Instrument</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Gross</th><th className="text-right">Fees</th><th className="text-right">Net cash</th><th className="text-right">Realised</th></tr></thead>
              <tbody>{tr.trades.map((t: any) => (
                <tr key={t.id}><td className="whitespace-nowrap text-xs text-mist-400">{fmtTime(t.executedAt)}</td><td className="font-semibold">{t.symbol}</td><td><Side s={t.side} /></td>
                  <td className="num text-right">{Number(t.executedQty)}</td><td className="num text-right">{fmtINR(t.executionPrice)}</td><td className="num text-right">{fmtINR(t.grossAmount)}</td>
                  <td className="num text-right text-mist-400">{fmtINR(t.fees)}</td><td className="text-right"><Signed v={t.netAmount} /></td><td className="text-right">{t.realizedPnl != null ? <Signed v={t.realizedPnl} /> : "—"}</td></tr>))}
              </tbody></table></div>
          ) : <Empty>No executions yet.</Empty>}
        </Card>
      )}
    </>
  );
}
