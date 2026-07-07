import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function SteamCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      login(token);
      setTimeout(() => navigate("/inventory"), 400);
    } else {
      navigate("/?auth=failed");
    }
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center" data-testid="steam-callback">
      <Loader2 className="w-8 h-8 animate-spin text-[#E4AE39] mb-4" />
      <div className="text-sm text-[#8A8A8A]">Signing you in with Steam…</div>
    </div>
  );
}
