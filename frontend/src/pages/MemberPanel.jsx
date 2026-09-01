import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  User, Wallet, Receipt, Repeat2, Handshake, BellRing, Award, Crown, Star, Shield,
  CheckCircle2, Clock, Flame, Gem, Store, Twitter, Instagram, Youtube, Twitch,
  MessageCircle, ExternalLink, Loader2, Plus, Trash2, ArrowDownCircle, ArrowUpCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { timeAgo } from "../lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";

const BADGE_ICONS = {
  shield: Shield, star: Star, check: CheckCircle2, handshake: Handshake,
  repeat: Repeat2, flame: Flame, gem: Gem, crown: Crown,
  storefront: Store, clock: Clock, award: Award,
};
const TIER_STYLES = {
  normal: "bg-white/5 border-white/10 text-[#E0E0E0]",
  rare: "bg-[#3B82F6]/10 border-[#3B82F6]/30 text-[#60A5FA]",
  epic: "bg-[#A855F7]/10 border-[#A855F7]/30 text-[#C084FC]",
  platform: "bg-[#E4AE39]/10 border-[#E4AE39]/40 text-[#E4AE39]",
};

// =============== PROFILE TAB ===============
function ProfileTab({ profile, stats, badges, onSaved }) {
  const [tradeUrl, setTradeUrl] = useState(profile.trade_url || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [socials, setSocials] = useState(profile.socials || {});
  const [isPublic, setIsPublic] = useState(profile.profile_public !== false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/me/profile", {
        trade_url: tradeUrl, bio, socials, profile_public: isPublic,
      });
      toast.success("Profile saved");
      onSaved?.(data.user);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const SocialField = ({ k, Icon, placeholder }) => (
    <div className="flex items-center gap-2 bg-[#0A0A0A] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 transition-colors">
      <Icon className="w-4 h-4 text-[#555]" />
      <input
        value={socials[k] || ""}
        onChange={(e) => setSocials({ ...socials, [k]: e.target.value })}
        placeholder={placeholder}
        data-testid={`social-${k}`}
        className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]"
      />
    </div>
  );

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* LEFT: header + badges */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-[#121212] border border-white/10 rounded-sm p-5 text-center">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="w-24 h-24 rounded-sm mx-auto mb-3" />
          ) : <div className="w-24 h-24 bg-white/5 rounded-sm mx-auto mb-3" />}
          <div className="font-display font-black text-xl">{profile.display_name}</div>
          <div className="text-[10px] font-mono text-[#8A8A8A] mt-1">{profile.steam_id}</div>
          <div className="flex items-center justify-center gap-2 mt-3">
            {profile.is_verified && (
              <span className="text-[9px] font-mono bg-[#2ECC71]/15 text-[#2ECC71] border border-[#2ECC71]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Verified</span>
            )}
            {profile.is_premium && (
              <span className="text-[9px] font-mono bg-[#A855F7]/15 text-[#C084FC] border border-[#A855F7]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Premium</span>
            )}
            {profile.is_admin && (
              <span className="text-[9px] font-mono bg-[#E4AE39]/15 text-[#E4AE39] border border-[#E4AE39]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Admin</span>
            )}
          </div>
          {profile.profile_url && (
            <a href={profile.profile_url} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#E4AE39] hover:text-[#F5C75A]">
              <ExternalLink className="w-3 h-3" /> Steam profile
            </a>
          )}
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-3">Trader stats</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <StatBox label="Bought" value={stats.orders_bought} />
            <StatBox label="Sold" value={stats.orders_sold} />
            <StatBox label="Spent" value={`$${stats.total_spent_usd.toLocaleString()}`} />
            <StatBox label="Earned" value={`$${stats.total_earned_usd.toLocaleString()}`} />
            <StatBox label="Active listings" value={stats.listings_active} />
            <StatBox label="Completed trades" value={stats.completed_orders} />
          </div>
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-3">Badges ({badges.length})</div>
          {badges.length === 0 ? (
            <div className="text-xs text-[#8A8A8A]">No badges yet. Complete your first trade to earn one.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => {
                const Icon = BADGE_ICONS[b.icon] || Award;
                return (
                  <div key={b.key}
                    title={b.description}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border text-[11px] font-medium ${TIER_STYLES[b.tier] || TIER_STYLES.normal}`}
                    data-testid={`badge-${b.key}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {b.name}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: form */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Profile visibility</h3>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium">
                {isPublic ? "Public profile" : "Private profile"}
              </div>
              <div className="text-[11px] text-[#8A8A8A] mt-0.5">
                {isPublic
                  ? "Other traders can view your display name, bio, badges, and socials on your public profile page."
                  : "Your profile is hidden. Buyers can still see your seller name on listings, but they cannot view your bio, socials, or trader stats."}
              </div>
            </div>
            <button onClick={() => setIsPublic(!isPublic)} data-testid="profile-public-toggle"
              className={`relative w-11 h-6 rounded-full transition-colors p-0 ${isPublic ? "bg-[#2ECC71]" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isPublic ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Steam Trade URL</h3>
          </div>
          <p className="text-xs text-[#8A8A8A] mb-3">
            Where buyers should send their trade offers.{" "}
            <a href="https://steamcommunity.com/id/me/tradeoffers/privacy" target="_blank" rel="noreferrer"
              className="text-[#E4AE39] hover:underline">Find yours on Steam →</a>
          </p>
          <input
            value={tradeUrl}
            onChange={(e) => setTradeUrl(e.target.value)}
            data-testid="trade-url"
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
            className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none font-mono"
          />
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Bio</h3>
          </div>
          <textarea
            value={bio}
            maxLength={280}
            onChange={(e) => setBio(e.target.value)}
            data-testid="bio"
            placeholder="Tell buyers a bit about yourself…"
            className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none min-h-[80px] resize-y"
          />
          <div className="text-[9px] font-mono text-[#555] text-right mt-1">{bio.length}/280</div>
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Social links</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <SocialField k="twitter" Icon={Twitter} placeholder="@yourhandle" />
            <SocialField k="discord" Icon={MessageCircle} placeholder="username#0000 or discord id" />
            <SocialField k="instagram" Icon={Instagram} placeholder="@yourhandle" />
            <SocialField k="youtube" Icon={Youtube} placeholder="Channel name / URL" />
            <SocialField k="twitch" Icon={Twitch} placeholder="twitch.tv/yourhandle" />
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} data-testid="save-profile"
            className="flex items-center gap-2 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-6 py-2.5 rounded-sm text-xs uppercase tracking-widest">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-[#0A0A0A] border border-white/5 rounded-sm p-3">
      <div className="text-[9px] uppercase tracking-widest text-[#555] mb-1">{label}</div>
      <div className="font-mono font-bold text-[#E4AE39]">{value}</div>
    </div>
  );
}

// =============== WALLET TAB ===============
function WalletTab() {
  const { format } = useCurrency();
  const [balance, setBalance] = useState(0);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null); // "deposit" | "withdraw"
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/me/wallet").then(({ data }) => {
      setBalance(data.balance_usd); setTxns(data.transactions || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setSubmitting(true);
    try {
      const path = action === "deposit" ? "/me/wallet/deposit" : "/me/wallet/withdraw";
      await api.post(path, { amount_usd: amt });
      toast.success(action === "deposit" ? "Wallet credited" : "Withdrawal recorded");
      setAction(null); setAmount(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#121212] border border-[#E4AE39]/30 rounded-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#E4AE39] font-mono mb-1">Wallet balance</div>
            <div className="font-mono text-4xl font-black text-[#E4AE39]" data-testid="wallet-balance">{format(balance)}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAction("deposit")} data-testid="btn-deposit"
              className="flex items-center gap-1 bg-[#2ECC71] hover:bg-[#40D57F] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
              <ArrowDownCircle className="w-3.5 h-3.5" /> Deposit
            </button>
            <button onClick={() => setAction("withdraw")} data-testid="btn-withdraw"
              className="flex items-center gap-1 bg-[#EB4B4B] hover:bg-[#F56060] text-white font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
              <ArrowUpCircle className="w-3.5 h-3.5" /> Withdraw
            </button>
          </div>
        </div>
        <div className="mt-3 text-[10px] font-mono text-[#EB4B4B]/80 bg-[#EB4B4B]/5 border border-[#EB4B4B]/20 rounded-sm px-3 py-2">
          MOCKED: real top-ups will go through Stripe once wallet payments are wired up. Any amount can be added instantly for demo purposes.
        </div>
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#E4AE39]" />
          <h3 className="font-display font-black tracking-tight">Ledger history</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-4">Kind</th>
              <th className="text-left py-3 px-4">Note</th>
              <th className="text-right py-3 px-4">Amount</th>
              <th className="text-right py-3 px-4">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
            ) : txns.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-10 text-[#8A8A8A]">No wallet activity yet.</td></tr>
            ) : txns.map((t) => (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 px-4 text-[10px] uppercase tracking-widest font-mono text-[#8A8A8A]">{t.kind}</td>
                <td className="py-3 px-4 text-[#E0E0E0]">{t.note || "—"}</td>
                <td className={`py-3 px-4 text-right font-mono font-bold ${t.amount_usd >= 0 ? "text-[#2ECC71]" : "text-[#EB4B4B]"}`}>
                  {t.amount_usd >= 0 ? "+" : ""}{format(t.amount_usd)}
                </td>
                <td className="py-3 px-4 text-right text-[10px] text-[#555] font-mono">{timeAgo(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setAmount(""); } }}>
        <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-sm rounded-sm">
          <DialogHeader>
            <DialogTitle className="capitalize">{action} USD</DialogTitle>
          </DialogHeader>
          <input
            type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            data-testid="wallet-amount"
            placeholder="0.00"
            className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2.5 text-lg font-mono font-bold outline-none"
          />
          <DialogFooter>
            <button onClick={submit} disabled={submitting} data-testid="wallet-submit"
              className={`w-full flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold px-4 py-2.5 rounded-sm disabled:opacity-50 ${action === "deposit" ? "bg-[#2ECC71] text-[#0A0A0A]" : "bg-[#EB4B4B] text-white"}`}>
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</> : `Confirm ${action}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============== TRANSACTIONS TAB ===============
function TransactionsTab() {
  const { format } = useCurrency();
  const [orders, setOrders] = useState({ bought: [], sold: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/me/orders").then(({ data }) => setOrders(data))
      .finally(() => setLoading(false));
  }, []);

  const Section = ({ title, list, side }) => (
    <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">{title}</div>
        <span className="text-xs font-mono text-[#8A8A8A]">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="text-xs text-[#8A8A8A] px-5 py-8 text-center">No trades yet.</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 px-4">
                  <div className="text-[#E0E0E0]">{o.listing_snapshot?.skin_name || "—"}</div>
                  <div className="text-[10px] text-[#8A8A8A] font-mono">
                    {side === "bought" ? "from " + (o.seller_name || "—") : "to " + (o.buyer_name || "—")}
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-[#E4AE39]">{format(o.amount_usd || 0)}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${o.status === "paid" ? "text-[#2ECC71] border-[#2ECC71]/30" : "text-[#E4AE39] border-[#E4AE39]/30"}`}>{o.status}</span>
                </td>
                <td className="py-3 px-4 text-right text-[10px] text-[#555] font-mono">{timeAgo(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  if (loading) return <div className="text-[#8A8A8A] text-sm py-10">Loading…</div>;
  return (
    <div className="grid gap-6">
      <Section title="Purchases" list={orders.bought} side="bought" />
      <Section title="Sales" list={orders.sold} side="sold" />
    </div>
  );
}

// =============== BUY ORDERS TAB ===============
function BuyOrdersTab({ balance }) {
  const { format } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [skinName, setSkinName] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [wear, setWear] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/buy-orders").then(({ data }) => setItems(data.items || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const price = parseFloat(maxPrice);
    if (!skinName || !price || price <= 0) { toast.error("Skin name + max price required"); return; }
    setSaving(true);
    try {
      await api.post("/buy-orders", { skin_name: skinName, max_price_usd: price, wear: wear || null, note });
      toast.success("Buy order created");
      setShowForm(false); setSkinName(""); setMaxPrice(""); setWear(""); setNote("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this buy order?")) return;
    try { await api.delete(`/buy-orders/${id}`); toast.success("Cancelled"); load(); }
    catch { toast.error("Failed to cancel"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[#8A8A8A]">
          Post a buy order and we'll notify you the moment a matching listing appears.
          Requires wallet balance (currently <span className="text-[#E4AE39] font-mono">{format(balance)}</span>) to cover the max price.
        </div>
        <button onClick={() => setShowForm(true)} data-testid="new-buy-order"
          className="flex items-center gap-1 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-3 py-2 rounded-sm text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-[#8A8A8A] text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-[#8A8A8A] text-sm">No active buy orders.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4">Skin</th>
                <th className="text-left py-3 px-4">Wear</th>
                <th className="text-right py-3 px-4">Max price</th>
                <th className="text-right py-3 px-4">Matches</th>
                <th className="text-right py-3 px-4">When</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`buyorder-${b.id}`}>
                  <td className="py-3 px-4 flex items-center gap-2">
                    {b.image && <img src={b.image} alt="" className="w-8 h-8 object-contain" />}
                    <span>{b.skin_name}</span>
                  </td>
                  <td className="py-3 px-4 text-[#8A8A8A] text-xs">{b.wear || "Any"}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#E4AE39]">{format(b.max_price_usd)}</td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/skin/${b.master_id}`}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border ${b.matching_listings > 0 ? "text-[#2ECC71] border-[#2ECC71]/30 bg-[#2ECC71]/10" : "text-[#8A8A8A] border-white/10"}`}>
                      {b.matching_listings} live
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-right text-[10px] text-[#555] font-mono">{timeAgo(b.created_at)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => cancel(b.id)}
                      className="text-[10px] uppercase tracking-widest bg-white/5 hover:bg-[#EB4B4B]/20 hover:text-[#EB4B4B] px-2 py-1 rounded-sm">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-md rounded-sm">
          <DialogHeader><DialogTitle>New buy order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FieldInput label="Skin name" value={skinName} onChange={setSkinName}
              placeholder="AK-47 | Redline" testid="bo-name" />
            <FieldInput label="Max price (USD)" type="number" value={maxPrice} onChange={setMaxPrice}
              placeholder="50.00" testid="bo-price" />
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">Wear (optional)</label>
              <select value={wear} onChange={(e) => setWear(e.target.value)}
                className="w-full bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm">
                <option value="">Any</option>
                <option>Factory New</option><option>Minimal Wear</option>
                <option>Field-Tested</option><option>Well-Worn</option><option>Battle-Scarred</option>
              </select>
            </div>
            <FieldInput label="Note (optional)" value={note} onChange={setNote}
              placeholder="Prefer low float, no stickers" testid="bo-note" />
          </div>
          <DialogFooter>
            <button onClick={submit} disabled={saving} data-testid="bo-submit"
              className="w-full bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50">
              {saving ? "Creating…" : "Create buy order"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = "text", testid }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} data-testid={testid}
        className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none" />
    </div>
  );
}

// =============== OFFERS TAB ===============
function OffersTab() {
  const { format } = useCurrency();
  const [direction, setDirection] = useState("received");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/offers", { params: { direction } }).then(({ data }) => setItems(data.items || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [direction]);

  const act = async (offerId, action) => {
    try {
      await api.post(`/offers/${offerId}/${action}`);
      toast.success(`Offer ${action}ed`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || `Failed to ${action}`); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["received", "sent"].map((d) => (
          <button key={d} onClick={() => setDirection(d)}
            className={`text-xs uppercase tracking-widest font-mono px-4 py-2 rounded-sm ${direction === d ? "bg-[#E4AE39] text-[#0A0A0A] font-bold" : "bg-[#121212] border border-white/10 text-[#8A8A8A]"}`}>
            {d}
          </button>
        ))}
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-[#8A8A8A] text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-[#8A8A8A] text-sm">No {direction} offers.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4">Item</th>
                <th className="text-left py-3 px-4">{direction === "received" ? "Buyer" : "Seller"}</th>
                <th className="text-right py-3 px-4">Listed at</th>
                <th className="text-right py-3 px-4">Offer</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-right py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 flex items-center gap-2">
                    {o.listing_snapshot?.image && <img src={o.listing_snapshot.image} alt="" className="w-8 h-8 object-contain" />}
                    <div>
                      <div>{o.listing_snapshot?.skin_name}</div>
                      <div className="text-[10px] text-[#8A8A8A]">{o.listing_snapshot?.wear || "—"}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4">{direction === "received" ? o.buyer_name : o.seller_name}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#8A8A8A]">{format(o.listing_snapshot?.list_price_usd || 0)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#E4AE39]">{format(o.price_usd)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${
                      o.status === "pending" ? "text-[#E4AE39] border-[#E4AE39]/30" :
                      o.status === "accepted" ? "text-[#2ECC71] border-[#2ECC71]/30" :
                      "text-[#EB4B4B] border-[#EB4B4B]/30"
                    }`}>{o.status}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {direction === "received" && o.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => act(o.id, "accept")} data-testid={`accept-${o.id}`}
                          className="text-[9px] uppercase tracking-widest bg-[#2ECC71]/15 hover:bg-[#2ECC71]/30 text-[#2ECC71] px-2 py-1 rounded-sm">Accept</button>
                        <button onClick={() => act(o.id, "reject")} data-testid={`reject-${o.id}`}
                          className="text-[9px] uppercase tracking-widest bg-[#EB4B4B]/15 hover:bg-[#EB4B4B]/30 text-[#EB4B4B] px-2 py-1 rounded-sm">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// =============== NOTIFICATIONS TAB ===============
function NotifPrefsTab({ profile, onSaved }) {
  const [prefs, setPrefs] = useState(profile.notification_prefs || {});
  const [saving, setSaving] = useState(false);

  const toggle = (k) => setPrefs({ ...prefs, [k]: !prefs[k] });

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/me/notifications", prefs);
      toast.success("Preferences saved");
      onSaved?.({ ...profile, notification_prefs: data.notification_prefs });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const rows = [
    ["on_listing_sold", "Listing sold", "A favourited listing was purchased by someone else", false],
    ["on_new_listing_for_fav_skin", "New listing for a favourite skin", "A new listing appears for a skin you saved", false],
    ["on_offer_received", "Offer received", "Someone sends an offer on one of your listings", false],
    ["on_item_purchased", "Item purchased", "Your purchase completed successfully", false],
    ["on_trade_verified", "Trade verified", "Trade escrow was released", false],
    ["email_notifications", "Email notifications", "Also receive alerts by email", false],
    ["on_price_drop", "Price drop alert", "A favourite skin's price drops below your threshold", true],
    ["on_new_listing_in_category", "New listing in category", "New listing appears in a category you follow", true],
  ];

  const isPremium = profile.is_premium;

  return (
    <div className="space-y-4 max-w-2xl">
      {rows.map(([k, label, desc, premium]) => {
        const disabled = premium && !isPremium;
        const on = !!prefs[k];
        return (
          <div key={k} className={`flex items-center justify-between bg-[#121212] border border-white/10 rounded-sm p-4 ${disabled ? "opacity-50" : ""}`}>
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">{label}</div>
                {premium && (
                  <span className="text-[9px] font-mono bg-[#A855F7]/15 text-[#C084FC] border border-[#A855F7]/30 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">Premium</span>
                )}
              </div>
              <div className="text-[11px] text-[#8A8A8A] mt-0.5">{desc}</div>
            </div>
            <button onClick={() => !disabled && toggle(k)} disabled={disabled}
              data-testid={`toggle-${k}`}
              className={`relative w-11 h-6 rounded-full transition-colors p-0 ${on ? "bg-[#E4AE39]" : "bg-white/10"} ${disabled ? "cursor-not-allowed" : ""}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        );
      })}
      {!isPremium && (
        <div className="text-[10px] font-mono text-[#8A8A8A] bg-[#A855F7]/5 border border-[#A855F7]/20 rounded-sm p-3">
          🔒 Premium features require an active subscription. Ask an admin to grant premium access, or wait for the Premium tier to launch.
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} data-testid="save-prefs"
          className="flex items-center gap-2 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-6 py-2.5 rounded-sm text-xs uppercase tracking-widest">
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

// =============== PAGE SHELL ===============
export default function MemberPanel() {
  const { user: authUser, loading: authLoading, loginWithSteam } = useAuth();
  const [tab, setTab] = useState("profile");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/me/profile").then(({ data }) => setData(data))
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (authUser) load(); else setLoading(false); }, [authUser]);

  if (authLoading || loading) return <div className="max-w-7xl mx-auto px-6 py-16 text-[#8A8A8A]">Loading…</div>;

  if (!authUser) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <User className="w-10 h-10 text-[#E4AE39]/60 mx-auto mb-4" />
        <h1 className="font-display font-black text-2xl tracking-tight mb-2">Sign in to access your member panel</h1>
        <button onClick={loginWithSteam} className="mt-4 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-3 rounded-sm text-xs uppercase tracking-widest">
          Sign in with Steam
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10" data-testid="member-panel">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Member Panel</div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
          Hey, {data.profile.display_name}
        </h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#121212] border border-white/10 rounded-sm p-1 mb-6 flex-wrap">
          {[
            ["profile", "Profile", User],
            ["wallet", "Wallet", Wallet],
            ["trades", "Trades", Receipt],
            ["buyorders", "Buy Orders", Handshake],
            ["offers", "Offers", Repeat2],
            ["notifs", "Notifications", BellRing],
          ].map(([k, label, Icon]) => (
            <TabsTrigger key={k} value={k} data-testid={`mp-tab-${k}`}
              className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
              <Icon className="w-3.5 h-3.5 mr-1.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile"><ProfileTab profile={data.profile} stats={data.stats} badges={data.badges} onSaved={() => load()} /></TabsContent>
        <TabsContent value="wallet"><WalletTab /></TabsContent>
        <TabsContent value="trades"><TransactionsTab /></TabsContent>
        <TabsContent value="buyorders"><BuyOrdersTab balance={data.profile.wallet_balance_usd} /></TabsContent>
        <TabsContent value="offers"><OffersTab /></TabsContent>
        <TabsContent value="notifs"><NotifPrefsTab profile={data.profile} onSaved={(p) => setData({ ...data, profile: p })} /></TabsContent>
      </Tabs>
    </div>
  );
}
