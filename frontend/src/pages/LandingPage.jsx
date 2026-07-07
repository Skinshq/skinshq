import React, { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FaSteam } from "react-icons/fa";
import { ShieldCheck, DollarSign, Repeat, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user, loginWithSteam } = useAuth();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (params.get("auth") === "failed") {
      toast.error("Steam sign-in was not completed. Please try again.");
      params.delete("auth");
      setParams(params, { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/7862505/pexels-photo-7862505.jpeg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/40 via-[#0A0A0A]/80 to-[#0A0A0A]" />
        <div className="absolute inset-0 stripe-bg opacity-40" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-24 pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-[#E4AE39]/10 border border-[#E4AE39]/30 rounded-sm px-3 py-1 mb-6">
              <div className="w-1.5 h-1.5 bg-[#E4AE39] rounded-full animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#E4AE39] font-mono font-bold">
                Live marketplace
              </span>
            </div>

            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-7xl tracking-tighter leading-[0.95] mb-6">
              Trade CS2 skins.
              <br />
              <span className="text-[#E4AE39]">Real money.</span>
              <br />
              Zero friction.
            </h1>

            <p className="text-lg text-[#8A8A8A] max-w-2xl mb-10 leading-relaxed">
              Sign in with Steam, list skins from your inventory, and settle in
              your local currency. Payments held in escrow until both sides
              confirm. Built by traders, for traders.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              {!user ? (
                <button
                  onClick={loginWithSteam}
                  data-testid="hero-steam-login"
                  className="flex items-center gap-3 bg-[#171A21] hover:bg-[#2A475E] border border-[#2A475E] text-[#E0E0E0] px-6 py-4 rounded-sm transition-colors group"
                >
                  <FaSteam className="w-6 h-6" />
                  <span className="text-base font-semibold">Sign in with Steam</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              ) : (
                <Link
                  to="/inventory"
                  data-testid="hero-goto-inventory"
                  className="flex items-center gap-3 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] px-6 py-4 rounded-sm transition-colors group font-bold"
                >
                  Go to my inventory
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
              <Link
                to="/market"
                data-testid="hero-browse-market"
                className="flex items-center gap-2 text-[#E0E0E0] hover:text-[#E4AE39] px-6 py-4 border border-white/10 rounded-sm transition-colors font-medium"
              >
                Browse market
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl">
              <Stat label="Skins listed" value="8.4K+" />
              <Stat label="Volume 24h" value="$412K" />
              <Stat label="Traders" value="21.8K" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-24">
        <div className="grid md:grid-cols-3 gap-6">
          <Feature
            Icon={FaSteam}
            title="Steam OpenID"
            body="Authentic sign-in — we never see your password. Your Steam ID, avatar, and CS2 (730) inventory sync instantly."
          />
          <Feature
            Icon={ShieldCheck}
            title="Escrow protection"
            body="Buyer funds are held until skin delivery is confirmed via the mocked trade flow. No rug pulls."
          />
          <Feature
            Icon={DollarSign}
            title="15+ currencies"
            body="Prices in USD, converted live to EUR, INR, JPY, GBP, BRL, KRW and more."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 py-16 border-t border-white/5">
        <div className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-3">
            The Flow
          </div>
          <h2 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
            Three steps. That's it.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <Step n="01" title="Connect Steam" body="Login via Steam OpenID. We pull your CS2 inventory (public inventories only)." />
          <Step n="02" title="List or Buy" body="List any skin at your price, or browse the market with rarity/wear/price filters." />
          <Step n="03" title="Trade & Ship" body="Buyer pays via Stripe. Funds escrowed until buyer confirms trade completion." />
        </div>
      </section>

      <footer className="border-t border-white/5 mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[#555]">
          <div className="font-mono">SKIN.MRKT © 2026 — Not affiliated with Valve</div>
          <div className="flex gap-6">
            <span>Steam & CS2 are trademarks of Valve Corporation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border-l-2 border-[#E4AE39] pl-4">
      <div className="font-mono text-2xl font-black text-[#E0E0E0]">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] mt-1">{label}</div>
    </div>
  );
}

function Feature({ Icon, title, body }) {
  return (
    <div className="bg-[#121212] hover:bg-[#1C1C1C] transition-colors border border-white/5 hover:border-[#E4AE39]/30 p-6 rounded-sm">
      <Icon className="w-6 h-6 text-[#E4AE39] mb-4" />
      <h3 className="font-display font-bold text-lg mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-[#8A8A8A] leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="relative">
      <div className="font-mono text-6xl font-black text-[#1C1C1C] absolute -top-4 -left-2 select-none">
        {n}
      </div>
      <div className="relative pl-8">
        <h3 className="font-display font-bold text-xl mb-3 tracking-tight">{title}</h3>
        <p className="text-sm text-[#8A8A8A] leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
