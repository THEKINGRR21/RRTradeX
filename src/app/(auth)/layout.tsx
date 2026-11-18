import { Logo, PaperBanner } from "@/components/Shell";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PaperBanner />
      <div className="mx-auto flex min-h-[calc(100vh-26px)] max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex justify-center"><Logo /></div>
        {children}
      </div>
    </div>
  );
}
