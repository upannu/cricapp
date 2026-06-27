import { NavBar } from "@/components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <NavBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
