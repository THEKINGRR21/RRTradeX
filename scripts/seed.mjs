// Idempotent seed: instrument catalogue, learning content, platform config,
// optional admin account (ADMIN_EMAIL / ADMIN_PASSWORD) and optional demo users.
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
const db = new pg.Client({ connectionString: url, ssl });
await db.connect();

const INSTRUMENTS = [
  ["RELIANCE", "Reliance Industries Ltd", "Energy", 2950, 0.018],
  ["TCS", "Tata Consultancy Services Ltd", "Information Technology", 4120, 0.015],
  ["HDFCBANK", "HDFC Bank Ltd", "Financials", 1680, 0.016],
  ["INFY", "Infosys Ltd", "Information Technology", 1860, 0.018],
  ["ICICIBANK", "ICICI Bank Ltd", "Financials", 1250, 0.017],
  ["HINDUNILVR", "Hindustan Unilever Ltd", "Consumer Staples", 2480, 0.012],
  ["ITC", "ITC Ltd", "Consumer Staples", 465, 0.013],
  ["SBIN", "State Bank of India", "Financials", 820, 0.021],
  ["BHARTIARTL", "Bharti Airtel Ltd", "Communication Services", 1620, 0.016],
  ["KOTAKBANK", "Kotak Mahindra Bank Ltd", "Financials", 1790, 0.016],
  ["LT", "Larsen & Toubro Ltd", "Industrials", 3650, 0.017],
  ["AXISBANK", "Axis Bank Ltd", "Financials", 1160, 0.019],
  ["ASIANPAINT", "Asian Paints Ltd", "Materials", 2890, 0.014],
  ["MARUTI", "Maruti Suzuki India Ltd", "Consumer Discretionary", 12500, 0.016],
  ["SUNPHARMA", "Sun Pharmaceutical Industries Ltd", "Health Care", 1780, 0.015],
  ["TITAN", "Titan Company Ltd", "Consumer Discretionary", 3420, 0.017],
  ["BAJFINANCE", "Bajaj Finance Ltd", "Financials", 7150, 0.022],
  ["WIPRO", "Wipro Ltd", "Information Technology", 540, 0.019],
  ["ULTRACEMCO", "UltraTech Cement Ltd", "Materials", 11200, 0.015],
  ["NTPC", "NTPC Ltd", "Utilities", 365, 0.017],
  ["POWERGRID", "Power Grid Corporation of India Ltd", "Utilities", 320, 0.014],
  ["TATAMOTORS", "Tata Motors Ltd", "Consumer Discretionary", 980, 0.026],
  ["TATASTEEL", "Tata Steel Ltd", "Materials", 158, 0.025],
  ["ONGC", "Oil & Natural Gas Corporation Ltd", "Energy", 275, 0.021],
  ["ADANIPORTS", "Adani Ports & SEZ Ltd", "Industrials", 1420, 0.027],
  ["HCLTECH", "HCL Technologies Ltd", "Information Technology", 1650, 0.017],
  ["NESTLEIND", "Nestle India Ltd", "Consumer Staples", 2450, 0.011],
  ["DRREDDY", "Dr. Reddy's Laboratories Ltd", "Health Care", 1290, 0.016],
  ["COALINDIA", "Coal India Ltd", "Energy", 470, 0.02],
  ["ZOMATO", "Zomato Ltd", "Consumer Discretionary", 245, 0.032],
];

for (const [symbol, name, sector, base, vol] of INSTRUMENTS) {
  await db.query(
    `INSERT INTO instruments (symbol, company_name, exchange, sector, sim_base_price, sim_volatility)
     VALUES ($1,$2,'NSE',$3,$4,$5) ON CONFLICT (symbol, exchange) DO NOTHING`,
    [symbol, name, sector, base, vol]
  );
}

const CONFIG = {
  paper_trading: { currency: "INR", starting_balance: "1000000.00" },
  fee_model: {
    brokerage_rate: "0.0003", brokerage_cap: "20.00", statutory_rate: "0.0005",
    description: "Brokerage = min(₹20, 0.03% of turnover) + simulated statutory charges 0.05% of turnover, per execution.",
  },
  simulator: {
    slippage_bps: 5, quote_ttl_seconds: 15, stale_after_seconds: 120, limit_band_pct: 20,
    limit_order_validity_days: 7, max_order_qty: 100000,
    description: "Market orders fill instantly at the latest simulated quote ± 5 bps slippage. Limit orders fill in full when the simulated price crosses the limit.",
  },
  limits: {
    retail: { watchlists: 5, items_per_watchlist: 25, active_alerts: 20 },
    trader: { watchlists: 20, items_per_watchlist: 100, active_alerts: 100 },
  },
};
for (const [k, v] of Object.entries(CONFIG)) {
  await db.query(`INSERT INTO platform_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, JSON.stringify(v)]);
}

// ── Admin & demo accounts ──
async function ensureUser(email, password, role, fullName, perms = []) {
  const e = email.toLowerCase();
  const existing = await db.query("SELECT user_id FROM users WHERE email=$1", [e]);
  if (existing.rowCount) return existing.rows[0].user_id;
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, role, admin_permissions) VALUES ($1,$2,$3,$4) RETURNING user_id`,
    [e, hash, role, perms]
  );
  const id = rows[0].user_id;
  await db.query(`INSERT INTO user_profiles (user_id, full_name) VALUES ($1,$2)`, [id, fullName]);
  if (role !== "admin") {
    const cfg = CONFIG.paper_trading;
    const w = await db.query(
      `INSERT INTO wallets (user_id, currency, available_balance, starting_balance) VALUES ($1,$2,$3,$3) RETURNING wallet_id`,
      [id, cfg.currency, cfg.starting_balance]
    );
    await db.query(
      `INSERT INTO wallet_transactions (wallet_id, txn_type, direction, amount, balance_after, reference_type, note)
       VALUES ($1,'initial_credit','credit',$2,$2,'system','Virtual paper-trading starting balance')`,
      [w.rows[0].wallet_id, cfg.starting_balance]
    );
  }
  console.log(`[seed] created ${role} ${e}`);
  return id;
}

let adminId = null;
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  adminId = await ensureUser(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, "admin", "Platform Administrator",
    ["users:manage", "content:manage", "audit:read", "config:manage", "reports:read", "finance:adjust"]);
}
if (process.env.SEED_DEMO_USERS === "true") {
  const pw = process.env.DEMO_PASSWORD || "Demo@12345";
  await ensureUser("demo@rrtradex.app", pw, "retail", "Demo Learner");
  await ensureUser("trader@rrtradex.app", pw, "trader", "Demo Trader");
  await ensureUser("content@rrtradex.app", pw, "admin", "Content Admin", ["content:manage", "reports:read"]);
}

// ── Learning centre ──
const CATS = ["Market Basics", "Orders & Execution", "Portfolio & Risk", "Technical Analysis", "Using RRTradeX"];
const catIds = {};
for (const [i, c] of CATS.entries()) {
  const { rows } = await db.query(
    `INSERT INTO learning_categories (name, sort_order) VALUES ($1,$2)
     ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order RETURNING category_id`, [c, i]);
  catIds[c] = rows[0].category_id;
}

const CONTENT = [
  ["What is a stock?", "Market Basics", "beginner", "article", 5,
   "Ownership, exchanges and why share prices move.",
`## Owning a slice of a company
A **share** (or stock) is a unit of ownership in a company. If a company has issued 1,00,000 shares and you own 1,000, you own 1% of it — and a matching share of its future profits and losses.

## Where shares trade
In India, listed shares trade mainly on the **NSE** (National Stock Exchange) and **BSE**. The exchange matches buyers and sellers; a registered **broker** connects you to the exchange; a **depository** (NSDL/CDSL) holds your shares electronically in a demat account.

## Why prices move
Prices move because the balance of buyers and sellers changes. That balance reacts to:
- company results and guidance
- interest rates and the wider economy
- sector news and competition
- sentiment, which can overshoot in either direction

## Key takeaway
A share price is the market's current, constantly-revised opinion of what a slice of a business is worth. It is not a guarantee of value.`],
  ["Reading a quote: LTP, change % and volume", "Market Basics", "beginner", "article", 4,
   "Understand every number in a quote panel.",
`## The fields
- **LTP (Last Traded Price)** — the price of the most recent trade.
- **Change %** — how far LTP is from the previous close, as a percentage.
- **Volume** — how many shares changed hands in the period.
- **Timestamp** — when the quote was observed. Always check it.

## Freshness labels in RRTradeX
Every price carries a status:
- **Live** — streaming from an entitled provider.
- **Delayed** — real data, published with a delay.
- **Simulated** — generated by the RRTradeX simulator for practice. *All prices in this release are simulated.*
- **Stale** — the last update is older than the freshness threshold.
- **Unavailable** — no usable quote.

A quote without a timestamp is a quote you cannot trust.`],
  ["Market orders vs limit orders", "Orders & Execution", "beginner", "tutorial", 6,
   "Choose the right order type for the situation.",
`## Market order
Buys or sells **immediately at the best available price**. You get certainty of execution but not of price — in fast markets the fill can differ from the price you saw (this is called **slippage**).

## Limit order
Buys only **at or below** your limit price (or sells only **at or above** it). You get price control, but the order may never fill.

## In RRTradeX
- Market orders fill instantly at the simulated quote ± 5 basis points of slippage.
- Limit orders stay **Open** until the simulated price crosses your limit, then fill in full.
- Open limit orders can be cancelled any time before they fill, and expire after 7 days.

## Rule of thumb
Use market orders for liquid stocks when getting in matters more than the exact price. Use limit orders when price matters more than timing.`],
  ["Order lifecycle: pending, open, filled, rejected", "Orders & Execution", "intermediate", "article", 5,
   "What each order status means and why an order is not a trade.",
`## An order is an instruction, a trade is a fact
When you click **Buy**, you create an **order**. Only when the order is executed does a **trade** (execution record) exist. Your cash and holdings change **only** when a trade is recorded.

## Statuses
- **Pending** — received and being validated.
- **Open** — accepted and waiting for its price (limit orders).
- **Partially filled** — some quantity has executed.
- **Filled** — fully executed.
- **Cancelled** — withdrawn by you before it filled.
- **Rejected** — failed validation (e.g. insufficient virtual funds).
- **Expired** — validity window passed.

Rejected, cancelled and expired orders never change your wallet or holdings.`],
  ["Fees and the cost of trading", "Orders & Execution", "beginner", "article", 4,
   "How brokerage and charges reduce returns — and how RRTradeX models them.",
`## Why fees matter
Every trade costs money. Frequent small trades can lose a meaningful share of returns to charges.

## The RRTradeX simulated fee model
For every execution:
- **Brokerage** = the lower of ₹20 or 0.03% of turnover
- **Statutory charges (simulated)** = 0.05% of turnover

*Example:* buying 10 shares at ₹1,000 = ₹10,000 turnover → brokerage ₹3.00 + charges ₹5.00 = **₹8.00**.

Fees on a buy are added to your cost basis; fees on a sell reduce your proceeds. Real brokers' charges and taxes differ — check your broker's schedule.`],
  ["Average cost and realised vs unrealised P&L", "Portfolio & Risk", "intermediate", "tutorial", 7,
   "The exact method RRTradeX uses to calculate profit and loss.",
`## Weighted-average cost basis
When you buy more of a stock you already hold, your **average buy price** is recalculated:

> new average = (old qty × old average + new cost incl. fees) ÷ new qty

## Unrealised P&L
Profit or loss on shares you **still hold**:

> unrealised = qty × current price − qty × average buy price

It changes with every price move and is only "on paper".

## Realised P&L
Locked in when you **sell**:

> realised = (sell qty × sell price − fees) − sell qty × average buy price

Selling does not change your average buy price for the remaining shares.

## Example
Buy 10 @ ₹100 (fee ₹1) → avg ₹100.10. Price rises to ₹110: unrealised = ₹99. Sell 4 @ ₹110 (fee ₹0.50): realised = 439.50 − 400.40 = **₹39.10**; 6 shares remain at avg ₹100.10.`],
  ["Diversification and position sizing", "Portfolio & Risk", "beginner", "article", 6,
   "Reduce the damage any single mistake can do.",
`## Don't put everything in one basket
Diversification means spreading money across companies and sectors so that one bad outcome doesn't sink the portfolio. Holding 10 stocks across 5 sectors behaves very differently from holding 10 banks.

## Position sizing
Decide in advance how much of the portfolio any one position may take — many beginners use 5–10%. The allocation chart on your **Portfolio** page shows your current concentration.

## Risk you can't diversify away
Market-wide events (rate changes, recessions) move almost everything together. Diversification reduces company-specific risk, not market risk.`],
  ["Stop losses and risk per trade", "Portfolio & Risk", "intermediate", "article", 5,
   "Plan your exit before you enter.",
`## The idea
Before entering a trade, decide the price at which you were wrong. The gap between entry and that price × quantity is your **risk per trade**.

## A simple rule
Risk a small fixed fraction of the portfolio — e.g. 1% — on any idea. With ₹10,00,000 that is ₹10,000. If your exit is ₹50 below entry, the position size is 200 shares.

## In RRTradeX
Use a **price alert** with condition *below* to be notified when your exit level is reached, then decide whether to sell. (Automatic stop orders are not part of this release.)`],
  ["Moving averages", "Technical Analysis", "intermediate", "tutorial", 6,
   "SMA and EMA, and how traders use them.",
`## Simple moving average (SMA)
The average closing price over the last N periods. A 20-day SMA smooths daily noise to show the short-term trend.

## Exponential moving average (EMA)
Like the SMA, but recent prices carry more weight, so it reacts faster.

## Common uses
- **Trend filter** — price above a rising 50-day average suggests an uptrend.
- **Crossovers** — a short average crossing a long one is watched as a possible trend change.

## Limits
Moving averages lag by design. They describe what has happened, not what will. *Trader accounts in RRTradeX can overlay SMA 20 and EMA 50 on instrument charts.*`],
  ["Support, resistance and volume", "Technical Analysis", "advanced", "article", 7,
   "Reading price levels where buyers and sellers have previously stepped in.",
`## Support and resistance
**Support** is a price area where buying has repeatedly halted declines; **resistance** is where selling has capped rallies. They are zones, not exact lines.

## Volume confirms
A break above resistance on rising volume is generally taken more seriously than one on thin volume.

## Caution
These are probabilistic patterns that fail often. Combine them with risk limits, and treat any single signal sceptically.`],
  ["Getting started with RRTradeX", "Using RRTradeX", "beginner", "tutorial", 4,
   "A tour of paper trading, watchlists, alerts and the AI assistant.",
`## 1. Your virtual wallet
Every new retail or trader account receives **₹10,00,000 of virtual funds**. These are not real money and cannot be withdrawn.

## 2. Explore markets
Open **Markets**, search for a company, and open its page to see the chart and quote. Every price shows its source, timestamp and status.

## 3. Place a paper order
On the instrument page, use the order ticket. Review the confirmation, which shows estimated fees, then submit.

## 4. Track it
**Orders** shows every order (including rejected ones) and every execution. **Portfolio** shows holdings and P&L; **Wallet** shows the full ledger.

## 5. Stay informed
Build **Watchlists**, set **Alerts**, and ask the **AI Assistant** to explain anything — it can read your portfolio summary but can never place trades.`],
  ["Investor protection and where to learn more", "Market Basics", "beginner", "article", 3,
   "Know who regulates markets in India.",
`## The regulator
The **Securities and Exchange Board of India (SEBI)** regulates securities markets, brokers and investment advisers in India. Only SEBI-registered intermediaries may offer brokerage or investment advice.

## Red flags
- guaranteed returns
- pressure to act immediately
- tips from unregistered "advisers" on messaging apps

## RRTradeX's position
RRTradeX is an educational, simulated-trading platform. It is not a broker, does not hold customer money and does not provide investment advice.`, "https://www.sebi.gov.in/"],
];
for (const [title, cat, diff, type, mins, desc, body, link] of CONTENT) {
  await db.query(
    `INSERT INTO learning_contents (title, description, body, content_type, url, category_id, difficulty, duration_min, published_by, status)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,'published'
     WHERE NOT EXISTS (SELECT 1 FROM learning_contents WHERE title=$1)`,
    [title, desc, body, type, link ?? null, catIds[cat], diff, mins, adminId]
  );
}

console.log("[seed] done");
await db.end();
