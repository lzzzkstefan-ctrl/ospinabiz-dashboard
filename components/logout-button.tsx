"use client";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

// Botão "Sair" no estilo do menu em pílula. iconeSo = só o ícone (barra do celular).
export function LogoutButton({ iconeSo = false, className }: { iconeSo?: boolean; className?: string }) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={logout}
      aria-label="Sair"
      className={cn(
        "shrink-0 rounded-full text-ink-faint transition-colors hover:bg-bg-raised-2 hover:text-white",
        iconeSo
          ? "flex h-10 w-10 items-center justify-center max-[360px]:h-8 max-[360px]:w-8"
          : "whitespace-nowrap px-3 py-2 text-[12.5px] font-medium",
        className,
      )}
    >
      {iconeSo ? <LogOut size={18} /> : "Sair"}
    </button>
  );
}
