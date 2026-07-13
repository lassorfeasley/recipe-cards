import ModeSwitch from "@/components/ModeSwitch";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black">
      <ModeSwitch />
      {children}
    </div>
  );
}
