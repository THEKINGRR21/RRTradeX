"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card card-pad mx-auto max-w-md text-center">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-mist-400">Your virtual balances and orders are unaffected. Please try again.</p>
      <button onClick={reset} className="btn-primary mt-4">Retry</button>
    </div>
  );
}
