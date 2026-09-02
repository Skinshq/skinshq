import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import SkinCard from "../components/SkinCard";
import { useAuth } from "../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export default function InventoryPage() {
  const { user, loginWithSteam } = useAuth();
  const [items, setItems] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [price, setPrice] = useState("");
  const [listing, setListing] = useState(false);
  const [myListings, setMyListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyStep, setVerifyStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const { refresh: refreshAuth } = useAuth();
  const startVerify = () => { setVerifyStep(1); setVerifyOpen(true); };
  const sendCode = async () => {
    setVerifyBusy(true);
    try {
      const { data } = await api.post("/auth/email/init", { email });
      toast.success(data.dev_hint || `Code sent to ${email}`);
      setVerifyStep(2);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send code"); }
    finally { setVerifyBusy(false); }
  };
  const checkCode = async () => {
    setVerifyBusy(true);
    try {
      await api.post("/auth/email/check", { code: otp });
      toast.success("Verified! You can now list and buy skins.");
      setVerifyOpen(false);
      await refreshAuth();
    } catch (e) { toast.error(e?.response?.data?.detail || "Wrong code"); }
    finally { setVerifyBusy(false); }
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [inv, mine, orders] = await Promise.all([
        api.get("/inventory/cs2"),
        api.get("/my/listings"),
        api.get("/my/orders"),
      ]);
      setItems(inv.data.items || []);
      setIsDemo(!!inv.data.is_demo);
      setMessage(inv.data.message || "");
      setMyListings(mine.data.items || []);
      setPurchases((orders.data.buys || []).filter(o => o.status === "paid"));
    } catch (e) {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const openList = (item) => {
    setSelected(item);
    setPrice("");
  };

  const submitListing = async () => {
    const p = parseFloat(price);
    if (!p || p <= 0) {
      toast.error("Enter a valid USD price");
      return;
    }
    setListing(true);
    try {
      // Server-authoritative: we send only the identifier + price. The backend
      // snapshots the real skin metadata directly from the seller's Steam inventory.
      await api.post("/marketplace/listings", {
        asset_id: selected.asset_id,
        price_usd: p,
        currency: "USD",
      });
      toast.success("Listed on the marketplace");
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to list");
    } finally {
      setListing(false);
    }
  };

  const removeListing = async (id) => {
    try {
      await api.delete(`/marketplace/listings/${id}`);
      toast.success("Listing removed");
      load();
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center" data-testid="inventory-guest">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-3">
          Your Inventory
        </div>
        <h2 className="font-display font-black text-3xl lg:text-4xl mb-4 tracking-tight">
          Sign in with Steam to see your CS2 items
        </h2>
        <p className="text-[#8A8A8A] mb-8 max-w-lg mx-auto">
          Once connected, we pull your CS2 (730) inventory directly from Steam — just like the in-game inventory — so you can list any skin for sale in one click.
        </p>
        <button
          onClick={loginWithSteam}
          data-testid="inv-login-cta"
          className="bg-[#171A21] hover:bg-[#2A475E] border border-[#2A475E] px-6 py-3 rounded-sm inline-flex items-center gap-2"
        >
          Sign in with Steam
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">
          Your Inventory
        </div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
          {user.display_name}'s CS2 vault
        </h1>
        <div className="text-sm text-[#8A8A8A] mt-2 font-mono">
          Steam ID: {user.steam_id}
        </div>
      </div>

      {user.auth_method !== "steam_openid" && (
        <div className="mb-6 bg-[#4B69FF]/10 border border-[#4B69FF]/40 rounded-sm p-4 flex flex-wrap items-center gap-4" data-testid="readonly-banner">
          <ShieldAlert className="w-6 h-6 text-[#4B69FF] flex-shrink-0" />
          <div className="flex-1 min-w-[240px] text-sm">
            <strong className="text-[#E0E0E0]">Read-only mode.</strong>{" "}
            <span className="text-[#8A8A8A]">You signed in with SteamID64 which only lets you view your inventory. To list or buy skins, sign out and sign in again using <strong className="text-[#E0E0E0]">Steam OpenID</strong> (the recommended option).</span>
          </div>
        </div>
      )}
      {user.auth_method === "steam_openid" && (
        <div className="mb-6 flex items-center gap-2 text-xs text-[#2ECC71]" data-testid="verified-badge">
          <ShieldCheck className="w-4 h-4" /> Steam verified — you can list and purchase
        </div>
      )}

      {isDemo && (
        <div className="mb-6 bg-[#E4AE39]/10 border border-[#E4AE39]/30 rounded-sm p-4 flex items-start gap-3" data-testid="demo-banner">
          <AlertTriangle className="w-5 h-5 text-[#E4AE39] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[#E0E0E0]">
            <strong>Demo inventory shown.</strong> {message} To fetch your real inventory, set your Steam profile & inventory to <em>Public</em> in your{" "}
            <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer" className="text-[#E4AE39] underline">
              Steam Privacy Settings
            </a>.
          </div>
        </div>
      )}

      {/* Purchased items — CS2 7-day trade hold */}
      {purchases.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-xl mb-1 tracking-tight">Recently purchased</h2>
          <p className="text-xs text-[#8A8A8A] mb-4 font-mono">
            Items you bought sit here during the CS2 7-day trade hold — same rule Steam enforces on freshly-received skins.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {purchases.map((o) => (
              <PurchasedCard key={o.id} order={o} />
            ))}
          </div>
        </section>
      )}

      {/* My active listings */}
      {myListings.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-xl mb-4 tracking-tight">My active listings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {myListings.filter(l => l.status === "active").map((l) => (
              <div key={l.id} className="relative">
                <SkinCard item={l} testid={`my-listing-${l.id}`} />
                <button
                  onClick={() => removeListing(l.id)}
                  data-testid={`remove-listing-${l.id}`}
                  className="absolute top-2 right-2 bg-[#EB4B4B] hover:bg-[#F56060] text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-sm"
                >
                  Unlist
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Inventory */}
      <h2 className="font-display font-bold text-xl mb-4 tracking-tight">Available to sell</h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">
          No CS2 items found in your inventory.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item, i) => (
            <div key={item.asset_id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <SkinCard
                item={item}
                onClick={() => openList(item)}
                actionLabel="List"
                testid={`inv-item-${item.asset_id}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Email OTP verify modal */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="bg-[#121212] border border-white/10 max-w-md rounded-sm" data-testid="verify-modal">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">
              {verifyStep === 1 ? "Verify via email" : "Enter the 6-digit code"}
            </DialogTitle>
          </DialogHeader>
          {verifyStep === 1 ? (
            <div className="space-y-4">
              <p className="text-xs text-[#8A8A8A] leading-relaxed">
                Enter your email — we'll send a 6-digit code. You'll need to confirm your email again before every high-value action (listing, purchase) for security.
              </p>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="verify-email-input" placeholder="you@example.com"
                className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-3 text-sm outline-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setVerifyOpen(false)} className="px-4 py-2 text-sm text-[#8A8A8A]">Cancel</button>
                <button onClick={sendCode} disabled={verifyBusy || !email}
                  data-testid="send-code-btn"
                  className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-2 rounded-sm disabled:opacity-50">
                  {verifyBusy ? "Sending…" : "Send code"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-[#8A8A8A]">Code sent to <strong className="text-[#E0E0E0]">{email}</strong>. Enter it below (expires in 15 min).</p>
              <input value={otp} onChange={(e) => setOtp(e.target.value)}
                data-testid="verify-otp-input" placeholder="123456" maxLength={6}
                className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-3 font-mono text-center text-2xl tracking-[0.5em] outline-none" />
              <div className="flex gap-2 justify-between">
                <button onClick={() => setVerifyStep(1)} className="text-xs text-[#8A8A8A] hover:text-white">← Change email</button>
                <button onClick={checkCode} disabled={verifyBusy || otp.length !== 6}
                  data-testid="verify-otp-btn"
                  className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-2 rounded-sm disabled:opacity-50">
                  {verifyBusy ? "Checking…" : "Verify"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Listing modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-[#121212] border border-white/10 max-w-md rounded-sm" data-testid="list-modal">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">List for sale</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {selected.image && (
                  <img src={selected.image} alt="" className="w-24 h-24 object-cover rounded-sm bg-black" />
                )}
                <div>
                  <div className={`text-[10px] uppercase tracking-widest font-bold rarity-text-${selected.rarity}`}>
                    {selected.rarity}
                  </div>
                  <div className="text-sm font-medium">{selected.market_name}</div>
                  {selected.wear && <div className="text-xs text-[#8A8A8A] mt-1">{selected.wear}</div>}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] mb-1 block">
                  Price in USD
                </label>
                <div className="flex items-center bg-[#0A0A0A] border border-white/10 focus-within:border-[#E4AE39] rounded-sm">
                  <span className="pl-3 text-[#E4AE39] font-mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    data-testid="list-price-input"
                    placeholder="0.00"
                    className="bg-transparent px-2 py-3 outline-none flex-1 font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setSelected(null)}
                  data-testid="cancel-list"
                  className="px-4 py-2 text-sm text-[#8A8A8A] hover:text-white rounded-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitListing}
                  disabled={listing}
                  data-testid="confirm-list"
                  className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-2 rounded-sm disabled:opacity-50"
                >
                  {listing ? "Listing…" : "Confirm listing"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchasedCard({ order }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const snap = order.listing_snapshot || {};
  const lockUntil = order.trade_locked_until ? new Date(order.trade_locked_until).getTime() : 0;
  const diff = lockUntil - now;
  const locked = diff > 0;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const unlockDate = lockUntil
    ? new Date(lockUntil).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  return (
    <div className="relative bg-[#121212] border border-white/5 rounded-sm overflow-hidden group"
         data-testid={`purchased-${order.id}`}>
      <div className="aspect-square bg-[#0A0A0A] flex items-center justify-center p-4 relative">
        {snap.image ? (
          <img src={snap.image} alt="" className={`max-w-full max-h-full object-contain transition-all ${locked ? "opacity-70" : ""}`} />
        ) : (
          <div className="text-[#333] text-xs">no image</div>
        )}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
            <div className="text-4xl">🔒</div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/5">
        <div className={`text-[9px] uppercase tracking-widest font-bold rarity-text-${snap.rarity || "consumer"}`}>
          {snap.rarity}
        </div>
        <div className="text-xs font-medium truncate mt-0.5">{snap.skin_name}</div>
        {snap.wear && <div className="text-[10px] text-[#8A8A8A] mt-0.5">{snap.wear}</div>}
        {locked ? (
          <div className="mt-2">
            <div className="inline-flex items-center gap-1 bg-[#EB4B4B]/15 border border-[#EB4B4B]/40 text-[#EB4B4B] text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">
              🔒 Locked · {parts}
            </div>
            <div className="text-[9px] text-[#555] font-mono mt-1">tradable {unlockDate}</div>
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-1 bg-[#2ECC71]/15 border border-[#2ECC71]/40 text-[#2ECC71] text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">
            ✓ Tradable
          </div>
        )}
      </div>
    </div>
  );
}
