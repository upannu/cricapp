import { NavBar } from "@/components/NavBar";
import { AuthGuard } from "@/components/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-ink flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
    </AuthGuard>
  );
}
