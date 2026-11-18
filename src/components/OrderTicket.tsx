"use client";
import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { apiFetch, newIdempotencyKey } from "@/lib/client";
import { ErrorBox, Field, Modal, Ok, Tabs, fmtINR, OrderStatus } from "./ui";

// Mirrors the server fee model for the confirmation estimate only; the server is authoritative.
const est = (qty: number, price: number) => {
  const gross = qty * price;
  const fees = Math.round(Math.min(20, gross * 0.0003) * 100) / 100 + Math.round(gross * 0.0005 * 100) / 100;
  return { gross, fees, total: gross + fees };
};

export default function OrderTicket({ instrument, quote, position, cash, onDone }: {
  instrument: { id: string; symbol: string; isActive: boolean }; quote: any; position: any; cash: string | null; onDone: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("1");
  const [limit, setLimit] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const keyRef = useRef<string>(newIdempotencyKey());

  const ltp = Number(quote?.lastPrice ?? 0);
  const price = type === "limit" ? Number(limit || 0) : ltp * (side === "buy" ? 1.0005 : 0.9995);
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const e = useMemo(() => est(q, price), [q, price]);
  const held = Number(position?.quantity ?? 0) - Number(position?.openSellQty ?? 0);
  const tradable = quote && ["live", "delayed", "simulated"].includes(quote.feedStatus) && instrument.isActive;
  const invalid = !q || (type === "limit" && !(Number(limit) > 0)) || !tradable;

  async function submit() {
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await apiFetch("/orders", {
        method: "POST", headers: { "Idempotency-Key": keyRef.current },
        json: { instrumentId: instrument.id, side, orderType: type, quantity: String(q), limitPrice: type === "limit" ? limit : null },
      });
      keyRef.current = newIdempotencyKey(); // new key only after the server has answered
      setConfirm(false);
      if (r.order.status === "filled") setOk(`${side === "buy" ? "Bought" : "Sold"} ${r.trade.executedQty} ${instrument.symbol} at ${fmtINR(r.trade.executionPrice)} · fees ${fmtINR(r.trade.fees)}`);
      else if (r.order.status === "open") setOk(`Limit order placed and open. It fills when the price reaches ${fmtINR(r.order.limitPrice)}.`);
      else setErr(`Order ${r.order.status}: ${r.order.rejectReason ?? ""}`);
      onDone();
    } catch (e: any) { setErr(e.message); setConfirm(false); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-850 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className={clsx("rounded-md py-2 text-sm font-bold uppercase transition", side === s ? (s === "buy" ? "bg-gain text-ink-950" : "bg-loss text-white") : "text-mist-400 hover:text-mist-100")}>{s}</button>
        ))}
      </div>
      <Tabs value={type} onChange={setType} options={[{ value: "market", label: "Market" }, { value: "limit", label: "Limit" }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity"><input className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Quantity" /></Field>
        <Field label={type === "limit" ? "Limit price ₹" : "Price"}>
          {type === "limit" ? <input className="input num" inputMode="decimal" placeholder={ltp.toFixed(2)} value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Limit price" />
            : <div className="input num text-mist-400">Market</div>}
        </Field>
      </div>
      <dl className="space-y-1.5 rounded-lg bg-ink-850 p-3 text-xs">
        <div className="flex justify-between"><dt className="text-mist-400">Est. {side === "buy" ? "cost" : "proceeds"}</dt><dd className="num">{fmtINR(side === "buy" ? e.total : e.gross - e.fees)}</dd></div>
        <div className="flex justify-between"><dt className="text-mist-400">Est. fees</dt><dd className="num">{fmtINR(e.fees)}</dd></div>
        {side === "buy" ? <div className="flex justify-between"><dt className="text-mist-400">Virtual cash</dt><dd className="num">{fmtINR(cash)}</dd></div>
          : <div className="flex justify-between"><dt className="text-mist-400">Available to sell</dt><dd className="num">{held} sh</dd></div>}
      </dl>
      <ErrorBox msg={err} /><Ok msg={ok} />
      {!tradable && <ErrorBox msg="Trading is paused: no current quote for this instrument." />}
      <button className={clsx("w-full py-2.5", side === "buy" ? "btn-buy" : "btn-sell")} disabled={invalid} onClick={() => { setErr(null); setOk(null); setConfirm(true); }}>
        Review {side} order
      </button>
      <p className="text-[11px] leading-4 text-mist-500">Paper trade with virtual funds. Market orders fill at the simulated price ± 0.05% slippage.</p>

      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} title="Confirm paper order">
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-semibold text-brand">Simulated order · virtual funds · no real exchange order</div>
          <dl className="space-y-2">
            {[["Action", <span key="a" className={side === "buy" ? "font-bold text-gain" : "font-bold text-loss"}>{side.toUpperCase()} {q} × {instrument.symbol}</span>],
              ["Order type", type === "market" ? "Market" : `Limit @ ${fmtINR(limit)}`],
              ["Reference price", `${fmtINR(ltp)} (${quote?.feedStatus})`],
              ["Est. turnover", fmtINR(e.gross)], ["Est. fees", fmtINR(e.fees)],
              [side === "buy" ? "Est. total debit" : "Est. net credit", <strong key="t" className="num">{fmtINR(side === "buy" ? e.total : e.gross - e.fees)}</strong>]].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4"><dt className="text-mist-400">{k}</dt><dd className="num text-right">{v}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-mist-500">Final price and fees are set by the simulator at execution.</p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setConfirm(false)} disabled={busy}>Back</button>
            <button className={clsx("flex-1", side === "buy" ? "btn-buy" : "btn-sell")} onClick={submit} disabled={busy}>{busy ? "Submitting…" : `Confirm ${side}`}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { OrderStatus };
