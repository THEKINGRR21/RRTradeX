"use client";
import { useApi } from "@/lib/client";
import { Card, Empty, ErrorBox, PageHeader, Spinner, Stat, fmtINR, fmtTime } from "@/components/ui";

const TYPE: Record<string, string> = { initial_credit: "Starting balance", trade_buy: "Buy", trade_sell: "Sell", adjustment_credit: "Adjustment (credit)", adjustment_debit: "Adjustment (debit)" };

export default function Wallet() {
  const { data, error } = useApi<any>("/wallet", { refreshMs: 20_000 });
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  const w = data.wallet;
  return (
    <>
      <PageHeader title="Virtual wallet" sub={data.notice} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Available balance · ${w.currency}`} value={fmtINR(w.availableBalance)} sub="Virtual paper-trading funds" />
        <Stat label="Starting balance" value={fmtINR(w.startingBalance)} />
        <Stat label="Ledger reconciliation" value={data.reconciliation.matches ? "✓ Balanced" : "⚠ Mismatch"} tone={data.reconciliation.matches ? "gain" : "loss"} sub={`Ledger total ${fmtINR(data.reconciliation.ledgerBalance)}`} />
      </div>
      <Card title="Ledger (append-only)" className="mt-6" pad={false}>
        {data.ledger.length ? (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Time</th><th>Type</th><th>Description</th><th className="text-right">Amount</th><th className="text-right">Balance after</th></tr></thead>
            <tbody>{data.ledger.map((l: any) => (
              <tr key={l.id}><td className="whitespace-nowrap text-xs text-mist-400">{fmtTime(l.createdAt)}</td><td className="whitespace-nowrap">{TYPE[l.type] ?? l.type}</td>
                <td className="text-xs text-mist-300">{l.note}</td>
                <td className={`num text-right font-semibold ${l.direction === "credit" ? "text-gain" : "text-loss"}`}>{l.direction === "credit" ? "+" : "−"}{fmtINR(l.amount)}</td>
                <td className="num text-right">{fmtINR(l.balanceAfter)}</td></tr>))}
            </tbody></table></div>
        ) : <Empty>No ledger entries.</Empty>}
      </Card>
      <p className="mt-4 text-xs text-mist-500">Entries are never edited or deleted. Any correction is posted as a separate, audited adjustment entry.</p>
    </>
  );
}
