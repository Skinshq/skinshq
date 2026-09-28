import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  User, Wallet, Receipt, Repeat2, Handshake, BellRing, Award, Crown, Star, Shield,
  CheckCircle2, Clock, Flame, Gem, Store, Twitter, Instagram, Youtube, Twitch,
  MessageCircle, ExternalLink, Loader2, Plus, Trash2, ArrowDownCircle, ArrowUpCircle,
  Bell, Package, Landmark, CreditCard, Bitcoin, Filter, Lock, ShieldAlert, ShieldCheck,
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
const _TRADE_URL_RE = /^https?:\/\/(www\.)?steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=([A-Za-z0-9_-]+)$/;
const STEAMID64_BASE = 76561197960265728n;

function TradeUrlValidityHint({ tradeUrl, steamId }) {
  const trimmed = (tradeUrl || "").trim();
  if (!trimmed) {
    return (
      <div className="mt-2 text-[10px] font-mono text-[#8A8A8A]">
        Not set — you won't be able to buy or sell until this is filled in.
      </div>
    );
  }
  const m = trimmed.match(_TRADE_URL_RE);
  if (!m) {
    return (
      <div className="mt-2 text-[10px] font-mono text-[#EB4B4B]">
        ✕ Format looks off. Expected: <span className="text-[#B0B0B0]">https://steamcommunity.com/tradeoffer/new/?partner=…&token=…</span>
      </div>
    );
  }
  try {
    const partner = BigInt(m[2]);
    const expected = BigInt(steamId) - STEAMID64_BASE;
    if (partner !== expected) {
      return (
        <div className="mt-2 text-[10px] font-mono text-[#EB4B4B]">
          ✕ This trade URL belongs to a different Steam account (partner {String(partner)}, your account = {String(expected)}). We won't save it.
        </div>
      );
    }
  } catch { /* ignore parse errors */ }
  return (
    <div className="mt-2 text-[10px] font-mono text-[#2ECC71]">
      ✓ Matches your Steam account — you're good to trade.
    </div>
  );
}

function ProfileTab({ profile, stats, badges, onSaved }) {
  const [tradeUrl, setTradeUrl] = useState(profile.trade_url || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [socials, setSocials] = useState(profile.socials || {});
  const [visibility, setVisibility] = useState(profile.profile_visibility || (profile.profile_public !== false ? "public" : "anonymous"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/me/profile", {
        trade_url: tradeUrl, bio, socials, profile_visibility: visibility,
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
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {profile.is_verified && (
              <span className="text-[9px] font-mono bg-[#2ECC71]/15 text-[#2ECC71] border border-[#2ECC71]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Verified</span>
            )}
            {profile.premium_label && (
              <span className="text-[9px] font-mono bg-[#A855F7]/15 text-[#C084FC] border border-[#A855F7]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">
                Premium: {profile.premium_label}
              </span>
            )}
            {profile.is_admin && (
              <span className="text-[9px] font-mono bg-[#E4AE39]/15 text-[#E4AE39] border border-[#E4AE39]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Admin</span>
            )}
            {profile.account_status === "restricted" && (
              <span className="text-[9px] font-mono bg-[#F0AD4E]/15 text-[#F0AD4E] border border-[#F0AD4E]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Restricted</span>
            )}
            {profile.account_status === "banned" && (
              <span className="text-[9px] font-mono bg-[#EB4B4B]/15 text-[#EB4B4B] border border-[#EB4B4B]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Banned</span>
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

        {/* How to get Verified */}
        <div className="bg-[#121212] border border-white/10 rounded-sm p-5" data-testid="verified-card">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">How to get verified</div>
            <div className="text-[10px] font-mono text-[#E4AE39]">
              {profile.verified_progress || 0} / {profile.verified_total || 5}
            </div>
          </div>
          {profile.is_verified && (
            <div className="text-[11px] text-[#2ECC71] font-mono mb-3">
              ✓ Your account is verified. Keep it clean to keep the badge.
            </div>
          )}
          <ul className="space-y-2 text-[12px]">
            {[
              ["steam_linked", "Linked via Steam OpenID"],
              ["email_verified", "Email attached & verified"],
              ["trade_url_set", "Steam Trade URL saved"],
              ["min_completed_trades", "Completed at least 5 trades"],
              ["not_banned", "Account is in good standing"],
            ].map(([k, label]) => {
              const done = !!profile.verified_criteria?.[k];
              return (
                <li key={k} className="flex items-center gap-2">
                  {done
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-[#2ECC71]" />
                    : <Clock className="w-3.5 h-3.5 text-[#8A8A8A]" />}
                  <span className={done ? "text-[#E0E0E0]" : "text-[#8A8A8A]"}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* RIGHT: form */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Profile visibility</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { k: "public", label: "Public", hint: "Show my name, avatar, badges & socials on listings and the seller page." },
              { k: "anonymous", label: "Anonymous", hint: "Hide my name and avatar. Listings show 'Anonymous Seller' with a lock icon." },
              { k: "hidden", label: "Fully hidden", hint: "Same as anonymous, plus my seller page shows no identity — only my listings." },
            ].map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setVisibility(opt.k)}
                data-testid={`profile-visibility-${opt.k}`}
                className={`text-left p-3 rounded-lg border transition-all ${
                  visibility === opt.k
                    ? "bg-[#E4AE39]/10 border-[#E4AE39]/60"
                    : "bg-[#0A0A0A] border-white/10 hover:border-white/20"
                }`}
              >
                <div className={`text-sm font-medium ${visibility === opt.k ? "text-[#E4AE39]" : "text-[#E0E0E0]"}`}>{opt.label}</div>
                <div className="text-[10px] text-[#8A8A8A] mt-1 leading-snug">{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="w-4 h-4 text-[#E4AE39]" />
            <h3 className="font-display font-black text-lg tracking-tight">Steam Trade URL</h3>
          </div>
          <p className="text-xs text-[#8A8A8A] mb-3 leading-relaxed">
            Where buyers send their trade offers. We check this belongs to <b className="text-[#E0E0E0]">your</b> Steam
            account (<span className="font-mono">{profile.steam_id}</span>) — no one else can save a URL that isn't theirs.{" "}
            <a href="https://steamcommunity.com/id/me/tradeoffers/privacy" target="_blank" rel="noreferrer"
              className="text-[#E4AE39] hover:underline">Get yours on Steam →</a>
          </p>
          <input
            value={tradeUrl}
            onChange={(e) => setTradeUrl(e.target.value)}
            data-testid="trade-url"
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
            className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none font-mono"
          />
          <TradeUrlValidityHint tradeUrl={tradeUrl} steamId={profile.steam_id} />
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
  const [wallet, setWallet] = useState({ balance_usd: 0, available_usd: 0, on_hold_usd: 0, payout_usd: 0, total_fees_paid_usd: 0, platform_fee_rate: 0.01, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null); // "deposit" | "withdraw"
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("all"); // all | deposit | withdraw | charges

  const load = () => {
    setLoading(true);
    api.get("/me/wallet").then(({ data }) => setWallet(data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a positive amount"); return; }
    setSubmitting(true);
    try {
      const path = action === "deposit" ? "/me/wallet/deposit" : "/me/wallet/withdraw";
      await api.post(path, { amount_usd: amt, payment_method: method });
      toast.success(action === "deposit" ? "Wallet credited" : "Withdrawal recorded");
      setAction(null); setAmount(""); setMethod("bank"); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSubmitting(false); }
  };

  const filtered = wallet.transactions.filter((t) => {
    if (filter === "all") return true;
    if (filter === "charges") return ["fee", "purchase"].includes(t.kind);
    return t.kind === filter;
  });

  const METHOD_ICON = { bank: Landmark, credit_card: CreditCard, crypto: Bitcoin, wallet: Wallet };
  const METHOD_LABEL = { bank: "Bank", credit_card: "Credit Card", crypto: "Crypto", wallet: "Wallet" };

  const StatCard = ({ label, value, hint, color, icon: Icon, testid }) => (
    <div className={`p-4 rounded-xl border ${color}`} data-testid={testid}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono opacity-70 mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="font-mono text-2xl font-black">{format(value)}</div>
      {hint && <div className="text-[10px] text-current opacity-60 mt-1">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="wallet-tab">
      {/* Breakdown cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Available"
          value={wallet.available_usd}
          hint="Ready to spend / withdraw"
          color="bg-[#E4AE39]/10 border-[#E4AE39]/40 text-[#E4AE39]"
          icon={Wallet}
          testid="wallet-card-available"
        />
        <StatCard
          label="On hold"
          value={wallet.on_hold_usd}
          hint="Frozen in active buy orders"
          color="bg-[#EB4B4B]/10 border-[#EB4B4B]/40 text-[#EB4B4B]"
          icon={Lock}
          testid="wallet-card-onhold"
        />
        <StatCard
          label="Payout balance"
          value={wallet.payout_usd}
          hint="7-day CS2 trade-lock window"
          color="bg-[#4B69FF]/10 border-[#4B69FF]/40 text-[#8BA0FF]"
          icon={Clock}
          testid="wallet-card-payout"
        />
        <StatCard
          label="Marketplace fees"
          value={wallet.total_fees_paid_usd}
          hint={`${(wallet.platform_fee_rate * 100).toFixed(1)}% per sale`}
          color="bg-white/5 border-white/10 text-[#8A8A8A]"
          icon={Filter}
          testid="wallet-card-fees"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { setAction("deposit"); setMethod("bank"); }} data-testid="btn-deposit"
          className="flex items-center gap-1.5 bg-[#2ECC71] hover:bg-[#40D57F] text-[#0A0A0A] font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-widest">
          <ArrowDownCircle className="w-3.5 h-3.5" /> Deposit
        </button>
        <button onClick={() => { setAction("withdraw"); setMethod("bank"); }} data-testid="btn-withdraw"
          className="flex items-center gap-1.5 bg-[#EB4B4B] hover:bg-[#F56060] text-white font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-widest">
          <ArrowUpCircle className="w-3.5 h-3.5" /> Withdraw
        </button>
        <div className="ml-auto text-[10px] font-mono text-[#8A8A8A]">
          MOCKED — real deposits will run through Stripe once wallet payments ship.
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap bg-[#121212] border border-white/10 rounded-lg p-1 w-fit">
        {[
          ["all", "All"],
          ["deposit", "Deposits"],
          ["withdraw", "Withdrawals"],
          ["charges", "Charges & fees"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            data-testid={`wallet-filter-${k}`}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-mono transition-colors ${
              filter === k ? "bg-[#E4AE39] text-black" : "text-[#8A8A8A] hover:text-white"
            }`}
          >{label}</button>
        ))}
      </div>

      {/* Ledger with rich columns */}
      <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#E4AE39]" />
          <h3 className="font-display font-black tracking-tight">Ledger history</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
              <tr>
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left py-3 px-4">Time</th>
                <th className="text-left py-3 px-4">Kind</th>
                <th className="text-left py-3 px-4">Method</th>
                <th className="text-left py-3 px-4">Note</th>
                <th className="text-right py-3 px-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-[#8A8A8A]">No activity for this filter.</td></tr>
              ) : filtered.map((t) => {
                const d = new Date(t.created_at);
                const Icon = METHOD_ICON[t.payment_method] || Wallet;
                return (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 px-4 text-[10px] font-mono text-[#8A8A8A]">{d.toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-[10px] font-mono text-[#8A8A8A]">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-3 px-4 text-[10px] uppercase tracking-widest font-mono text-[#E0E0E0]">{t.kind}</td>
                    <td className="py-3 px-4 text-[10px] font-mono text-[#8A8A8A]">
                      <span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {METHOD_LABEL[t.payment_method] || "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-[#E0E0E0] truncate max-w-xs">{t.note || "—"}</td>
                    <td className={`py-3 px-4 text-right font-mono font-bold ${t.amount_usd >= 0 ? "text-[#2ECC71]" : "text-[#EB4B4B]"}`}>
                      {t.amount_usd >= 0 ? "+" : ""}{format(t.amount_usd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) { setAction(null); setAmount(""); } }}>
        <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="capitalize">{action} USD</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              data-testid="wallet-amount"
              placeholder="0.00"
              className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-lg px-3 py-2.5 text-lg font-mono font-bold outline-none"
            />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5">Payment method</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "bank", label: "Bank transfer", Icon: Landmark },
                  { k: "credit_card", label: "Credit card", Icon: CreditCard },
                  { k: "crypto", label: "Crypto", Icon: Bitcoin },
                  { k: "wallet", label: "External wallet", Icon: Wallet },
                ].map(({ k, label, Icon }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMethod(k)}
                    data-testid={`wallet-method-${k}`}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      method === k ? "bg-[#E4AE39]/15 border-[#E4AE39]/50 text-[#E4AE39]" : "bg-[#121212] border-white/10 text-[#8A8A8A] hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={submit} disabled={submitting} data-testid="wallet-submit"
              className={`w-full flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold px-4 py-2.5 rounded-lg disabled:opacity-50 ${action === "deposit" ? "bg-[#2ECC71] text-[#0A0A0A]" : "bg-[#EB4B4B] text-white"}`}>
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</> : `Confirm ${action}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============== TRANSACTIONS (TRADES) TAB ===============
const ORDER_STATE_TONE = {
  COMPLETED: "text-[#2ECC71] border-[#2ECC71]/30 bg-[#2ECC71]/5",
  AWAITING_SELLER_TRADE: "text-[#E4AE39] border-[#E4AE39]/30 bg-[#E4AE39]/5",
  TRADE_OFFER_REPORTED: "text-[#E4AE39] border-[#E4AE39]/30 bg-[#E4AE39]/5",
  AWAITING_BUYER_ACCEPTANCE: "text-[#E4AE39] border-[#E4AE39]/30 bg-[#E4AE39]/5",
  TRADE_VERIFICATION: "text-[#4B69FF] border-[#4B69FF]/30 bg-[#4B69FF]/5",
  VERIFICATION_PENDING: "text-[#4B69FF] border-[#4B69FF]/30 bg-[#4B69FF]/5",
  MANUAL_REVIEW: "text-[#F0AD4E] border-[#F0AD4E]/30 bg-[#F0AD4E]/5",
  CANCELLED: "text-[#8A8A8A] border-white/10 bg-white/5",
  SELLER_TIMEOUT: "text-[#EB4B4B] border-[#EB4B4B]/30 bg-[#EB4B4B]/5",
  DISPUTED: "text-[#EB4B4B] border-[#EB4B4B]/30 bg-[#EB4B4B]/5",
  REFUND_PENDING: "text-[#F0AD4E] border-[#F0AD4E]/30 bg-[#F0AD4E]/5",
};

function TransactionsTab() {
  const { format } = useCurrency();
  const [orders, setOrders] = useState({ bought: [], sold: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/me/orders").then(({ data }) => setOrders(data))
      .finally(() => setLoading(false));
  }, []);

  const Row = ({ o, side }) => {
    const snap = o.listing_snapshot || {};
    const rarity = snap.rarity || "consumer";
    const state = o.state || o.status || "—";
    const tone = ORDER_STATE_TONE[state] || "text-[#8A8A8A] border-white/10 bg-white/5";
    const counterparty = side === "bought" ? (o.seller_name || "—") : (o.buyer_name || "—");
    return (
      <Link
        to={`/order/${o.id}`}
        className={`flex items-center gap-3 p-3 rounded-lg bg-[#0A0A0A] border border-white/5 hover:border-[#E4AE39]/40 transition-colors rarity-border-${rarity}`}
        data-testid={`trade-row-${o.id}`}
      >
        <div className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 rarity-bg-${rarity} border border-white/5`}>
          {snap.image ? (
            <img src={snap.image} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#333] text-[10px]">NO IMG</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate rarity-text-${rarity}`}>{snap.skin_name || "—"}</div>
          <div className="text-[10px] text-[#8A8A8A] font-mono uppercase tracking-widest truncate">
            {side === "bought" ? "From" : "To"} {counterparty} · {snap.wear || "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-[#E4AE39]">{format(o.amount_usd || 0)}</div>
          <div className={`inline-block text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-md border mt-1 ${tone}`}>
            {state.replace(/_/g, " ")}
          </div>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-[#8A8A8A] flex-shrink-0" />
      </Link>
    );
  };

  const Section = ({ title, list, side, emptyLabel }) => (
    <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono">{title}</div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#8A8A8A]">{list.length}</span>
          <Link to="/orders" className="text-[10px] uppercase tracking-widest text-[#E4AE39] hover:underline font-mono">
            View all →
          </Link>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {list.length === 0 ? (
          <div className="text-xs text-[#8A8A8A] py-6 text-center">{emptyLabel}</div>
        ) : list.slice(0, 15).map((o) => <Row key={o.id} o={o} side={side} />)}
      </div>
    </div>
  );

  if (loading) return <div className="text-[#8A8A8A] text-sm py-10">Loading…</div>;
  return (
    <div className="grid gap-6" data-testid="trades-tab">
      <Section title="Purchases" list={orders.bought} side="bought" emptyLabel="You haven't bought anything yet." />
      <Section title="Sales" list={orders.sold} side="sold" emptyLabel="No sales yet — list a skin from your inventory to get started." />
    </div>
  );
}

// =============== INVENTORY TAB (Steam-pulled + listed filter) ===============
function InventoryTab({ profile, onSaved }) {
  const [inv, setInv] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | listed | unlisted
  const [invPublic, setInvPublic] = useState(profile.inventory_public !== false);
  const [savingPriv, setSavingPriv] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/inventory/cs2").catch(() => ({ data: { items: [] } })),
      api.get("/my/listings").catch(() => ({ data: { items: [] } })),
    ]).then(([a, b]) => {
      setInv(a.data.items || []);
      setMyListings(b.data.items || []);
    }).finally(() => setLoading(false));
  }, []);

  const togglePrivacy = async () => {
    setSavingPriv(true);
    try {
      const { data } = await api.patch("/me/profile", { inventory_public: !invPublic });
      setInvPublic(!invPublic);
      onSaved?.(data.user);
      toast.success(`Inventory is now ${!invPublic ? "public" : "private"}`);
    } catch (e) { toast.error("Failed to update"); }
    finally { setSavingPriv(false); }
  };

  const listedAssetIds = new Set(myListings.map((l) => String(l.asset_id)));
  const filtered = inv.filter((it) => {
    if (filter === "all") return true;
    if (filter === "listed") return listedAssetIds.has(String(it.asset_id));
    return !listedAssetIds.has(String(it.asset_id));
  });

  return (
    <div className="space-y-6" data-testid="inventory-tab">
      {/* Privacy card */}
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {invPublic ? (
            <ShieldCheck className="w-5 h-5 text-[#2ECC71]" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-[#EB4B4B]" />
          )}
          <div>
            <div className="text-sm font-medium">
              Steam inventory is {invPublic ? "public" : "private"}
            </div>
            <div className="text-[11px] text-[#8A8A8A] mt-0.5">
              {invPublic
                ? "Other traders can peek at your Steam inventory from your seller page."
                : "Your Steam inventory is hidden from your public seller page. Active listings remain visible (they're intentionally for sale)."}
            </div>
          </div>
        </div>
        <button
          onClick={togglePrivacy}
          disabled={savingPriv}
          data-testid="inventory-privacy-toggle"
          className={`relative w-11 h-6 rounded-full transition-colors p-0 ${invPublic ? "bg-[#2ECC71]" : "bg-white/10"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${invPublic ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-[#121212] border border-white/10 rounded-lg p-1 w-fit">
        {[
          ["all", `All (${inv.length})`],
          ["listed", `Listed (${listedAssetIds.size})`],
          ["unlisted", `Available (${inv.length - listedAssetIds.size})`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            data-testid={`inv-filter-${k}`}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-mono transition-colors ${
              filter === k ? "bg-[#E4AE39] text-black" : "text-[#8A8A8A] hover:text-white"
            }`}
          >{label}</button>
        ))}
        <Link to="/inventory" className="ml-2 px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-mono text-[#E4AE39] hover:underline">
          Open full inventory →
        </Link>
      </div>

      {loading ? (
        <div className="text-[#8A8A8A] text-sm py-10">Loading Steam inventory…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl text-[#8A8A8A] text-sm">
          {filter === "listed"
            ? "You don't have any listings live."
            : filter === "unlisted"
            ? "Every tradable item in your inventory is currently listed."
            : "Your CS2 inventory is empty or private. Enable Steam inventory sharing to pull items."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {filtered.slice(0, 30).map((it) => {
            const listed = listedAssetIds.has(String(it.asset_id));
            const rarity = it.rarity || "consumer";
            return (
              <div key={it.asset_id} className={`p-2 rounded-xl bg-[#121212] border rarity-border-${rarity} ${listed ? "border-[#E4AE39]/40" : "border-white/5"}`}
                data-testid={`inv-item-${it.asset_id}`}>
                <div className={`relative aspect-[4/3] rounded-lg overflow-hidden rarity-bg-${rarity}`}>
                  {it.image && <img src={it.image} alt="" className="absolute inset-0 w-full h-full object-contain p-2" />}
                  {listed && (
                    <div className="absolute top-1.5 right-1.5 text-[8px] uppercase tracking-widest font-bold bg-[#E4AE39] text-black px-1.5 py-0.5 rounded">
                      Listed
                    </div>
                  )}
                </div>
                <div className={`mt-1.5 text-[11px] font-medium leading-tight line-clamp-2 rarity-text-${rarity}`}>
                  {it.name || it.market_name || "—"}
                </div>
                <div className="text-[9px] font-mono text-[#8A8A8A] uppercase tracking-widest mt-0.5">{it.wear || "—"}</div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > 30 && (
        <div className="text-center text-[10px] text-[#555] font-mono">
          Showing 30 of {filtered.length}. <Link to="/inventory" className="text-[#E4AE39] hover:underline">Open full inventory →</Link>
        </div>
      )}
    </div>
  );
}

// =============== PRICE ALERTS TAB ===============
function PriceAlertsTab() {
  const { format } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [skinName, setSkinName] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [wear, setWear] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/me/price-alerts")
      .then(({ data }) => setItems(data.items || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const price = parseFloat(maxPrice);
    if (!skinName.trim() || !price || price <= 0) { toast.error("Enter a skin name and a positive max price"); return; }
    setCreating(true);
    try {
      await api.post("/me/price-alerts", { skin_name: skinName.trim(), max_price_usd: price, wear: wear || null });
      toast.success("Price alert saved — we'll ping you when a matching listing appears");
      setShowForm(false); setSkinName(""); setMaxPrice(""); setWear(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save alert"); }
    finally { setCreating(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this price alert?")) return;
    try { await api.delete(`/me/price-alerts/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="space-y-6" data-testid="price-alerts-tab">
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Price alerts</div>
          <div className="text-[11px] text-[#8A8A8A] mt-0.5">
            Notify-only — we ping you (in-app + email) when a matching listing hits the marketplace. No wallet balance required, unlike Buy Orders.
          </div>
        </div>
        <button onClick={() => setShowForm(true)} data-testid="new-price-alert"
          className="flex items-center gap-1.5 bg-[#E4AE39] hover:bg-[#F5C75A] text-black font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5" /> New alert
        </button>
      </div>

      {loading ? (
        <div className="text-[#8A8A8A] text-sm py-10 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl text-[#8A8A8A] text-sm">
          <Bell className="w-8 h-8 mx-auto mb-3 opacity-40" />
          No active price alerts. Create one above.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => {
            const rarity = a.rarity || "consumer";
            return (
              <div key={a.id} className={`flex items-center gap-3 p-3 bg-[#121212] border border-white/5 rarity-border-${rarity} rounded-xl`}>
                <div className={`w-12 h-12 rounded-lg overflow-hidden rarity-bg-${rarity} flex-shrink-0`}>
                  {a.image && <img src={a.image} alt="" className="w-full h-full object-contain p-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium rarity-text-${rarity}`}>{a.skin_name}</div>
                  <div className="text-[10px] text-[#8A8A8A] font-mono uppercase tracking-widest">
                    {a.wear || "Any wear"} · {a.matching_listings} matching now
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-[#E4AE39]">≤ {format(a.max_price_usd)}</div>
                  <button onClick={() => remove(a.id)} data-testid={`delete-alert-${a.id}`}
                    className="text-[10px] uppercase tracking-widest text-[#EB4B4B] hover:text-[#F56060] font-mono">
                    <Trash2 className="w-3 h-3 inline" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-sm rounded-xl">
          <DialogHeader><DialogTitle>New price alert</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1">Skin name</div>
              <input
                value={skinName}
                onChange={(e) => setSkinName(e.target.value)}
                placeholder="e.g. AK-47 | Redline"
                data-testid="alert-skin"
                className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1">Max price (USD)</div>
              <input
                type="number" step="0.01" min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="0.00"
                data-testid="alert-price"
                className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-lg px-3 py-2 text-sm font-mono outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1">Wear (optional)</div>
              <select value={wear} onChange={(e) => setWear(e.target.value)} data-testid="alert-wear"
                className="w-full bg-[#121212] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">Any wear</option>
                <option>Factory New</option>
                <option>Minimal Wear</option>
                <option>Field-Tested</option>
                <option>Well-Worn</option>
                <option>Battle-Scarred</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={create} disabled={creating} data-testid="alert-submit"
              className="w-full flex items-center justify-center gap-2 bg-[#E4AE39] hover:bg-[#F5C75A] text-black font-bold px-4 py-2.5 rounded-lg text-xs uppercase tracking-widest disabled:opacity-50">
              {creating ? "Saving…" : "Create alert"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            ["inventory", "Inventory", Package],
            ["buyorders", "Buy Orders", Handshake],
            ["alerts", "Price Alerts", Bell],
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
        <TabsContent value="inventory"><InventoryTab profile={data.profile} onSaved={(p) => setData({ ...data, profile: p })} /></TabsContent>
        <TabsContent value="buyorders"><BuyOrdersTab balance={data.profile.wallet_balance_usd} /></TabsContent>
        <TabsContent value="alerts"><PriceAlertsTab /></TabsContent>
        <TabsContent value="offers"><OffersTab /></TabsContent>
        <TabsContent value="notifs"><NotifPrefsTab profile={data.profile} onSaved={(p) => setData({ ...data, profile: p })} /></TabsContent>
      </Tabs>
    </div>
  );
}
