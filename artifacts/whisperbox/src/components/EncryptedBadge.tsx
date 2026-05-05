import { Lock } from "lucide-react";

export function EncryptedBadge() {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-teal-500/80 bg-teal-500/10 px-2 py-1 rounded-full border border-teal-500/20 shadow-[0_0_10px_rgba(0,191,165,0.1)]">
      <Lock className="w-3 h-3" />
      <span>End-to-End Encrypted</span>
    </div>
  );
}
