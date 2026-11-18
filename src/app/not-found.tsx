import Link from "next/link";
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div><div className="text-6xl font-semibold text-brand">404</div><p className="mt-3 text-mist-300">This page doesn&apos;t exist.</p><Link href="/" className="btn-primary mt-6">Go home</Link></div>
    </div>
  );
}
