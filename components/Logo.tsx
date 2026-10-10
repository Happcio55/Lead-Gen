import Mascot from "@/components/Mascot";

export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mascot awake zzz={false} className="h-8 w-8 -mt-1" />
      <span className="font-display text-lg font-bold tracking-tight text-fg">IdleAgents</span>
    </span>
  );
}
