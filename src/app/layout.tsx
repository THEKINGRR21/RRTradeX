import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RRTradeX — Paper Trading & Investing Academy", template: "%s · RRTradeX" },
  description: "Learn investing and practise trading Indian equities with virtual funds. Simulated market data, real-world mechanics.",
};
export const viewport: Viewport = { themeColor: "#070b12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
