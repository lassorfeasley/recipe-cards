import TopNav from "@/components/TopNav";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black">
      <TopNav />
      {children}
    </div>
  );
}
