import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function SteamCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    (async () => {
      const token = params.get("token");
      if (!token) {
        toast.error("Steam sign-in did not return a token");
        navigate("/?auth=failed", { replace: true });
        return;
      }
      try {
        await login(token);
        toast.success("Signed in with Steam");
        navigate("/inventory", { replace: true });
      } catch {
        toast.error("Failed to complete Steam sign-in");
        navigate("/?auth=failed", { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center" data-testid="steam-callback">
      <Loader2 className="w-8 h-8 animate-spin text-[#E4AE39] mb-4" />
      <div className="text-sm text-[#8A8A8A]">Signing you in with Steam…</div>
    </div>
  );
}
