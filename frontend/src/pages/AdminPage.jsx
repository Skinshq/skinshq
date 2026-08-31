import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ShieldAlert, Users, Receipt, Database, LayoutDashboard,
  Search, Ban, ShieldCheck, DollarSign, Package2, TrendingUp,
  Download, Upload, RefreshCw, MessageSquare, ArrowLeft, Send, XCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { timeAgo } from "../lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { STATUS_STYLES as TICKET_STATUS_STYLES, STATUS_LABEL as TICKET_STATUS_LABEL, CATEGORY_LABEL as TICKET_CATEGORY_LABEL } from "./SupportPage";

const STATUS_COLORS = {
  pending: "text-[#E4AE39] bg-[#E4AE39]/10 border-[#E4AE39]/30",
  paid: "text-[#2ECC71] bg-[#2ECC71]/10 border-[#2ECC71]/30",
  completed: "text-[#2ECC71] bg-[#2ECC71]/10 border-[#2ECC71]/30",
  failed: "text-[#EB4B4B] bg-[#EB4B4B]/10 border-[#EB4B4B]/30",
};

function Stat({ icon: Icon, label, value, sub, color = "#E4AE39" }) {
  return (
    <div className="bg-[#121212] border border-white/10 rounded-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">{label}</div>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="font-mono text-2xl font-black" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-[#8A8A8A] font-mono mt-1">{sub}</div>}
    </div>
  );
}

// ========================= DASHBOARD =========================
function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { format } = useCurrency();

  const load = () => {
    setLoading(true);
    api.get("/admin/stats").then(({ data }) => setStats(data))
      .catch(() => toast.error("Failed to load stats"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading || !stats) return <div className="text-[#8A8A8A] text-sm py-10">Loading dashboard…</div>;

  const u = stats.users, o = stats.orders, l = stats.listings;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono uppercase tracking-widest text-[#555]">Overview</h2>
        <button onClick={load} className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#E4AE39] hover:text-[#F5C75A]">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Users} label="Total users" value={u.total.toLocaleString()} sub={`${u.new_7d} new this week`} />
        <Stat icon={ShieldCheck} label="Active 24h" value={u.active_24h.toLocaleString()} sub={`${u.verified} verified`} color="#2ECC71" />
        <Stat icon={Ban} label="Banned" value={u.banned.toLocaleString()} color="#EB4B4B" />
        <Stat icon={DollarSign} label="Revenue" value={format(stats.revenue_usd)} sub={`${o.paid} paid orders`} />
        <Stat icon={Receipt} label="Orders total" value={o.total.toLocaleString()} sub={`${o.pending} pending · ${o.completed} completed`} />
        <Stat icon={Package2} label="Active listings" value={l.active.toLocaleString()} sub={`${l.sold} sold total`} />
        <Stat icon={TrendingUp} label="Live trades" value={o.paid.toLocaleString()} sub="Paid, trade in flight" color="#2ECC71" />
        <Stat icon={ShieldAlert} label="Attention" value={o.pending.toLocaleString()} sub="Pending payment" color="#E4AE39" />
      </div>
    </div>
  );
}

// ========================= TRANSACTIONS =========================
function TransactionsTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const { format } = useCurrency();

  const load = () => {
    setLoading(true);
    const params = { limit, skip };
    if (status) params.status = status;
    if (q) params.q = q;
    api.get("/admin/transactions", { params }).then(({ data }) => {
      setItems(data.items || []); setTotal(data.total || 0);
    }).catch(() => toast.error("Failed to load transactions"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status, skip]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSkip(0); load(); } }}
            placeholder="Search order id, skin, buyer, seller…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
        </div>
        <select value={status} onChange={(e) => { setSkip(0); setStatus(e.target.value); }}
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="text-xs text-[#8A8A8A] mb-3">
        <span className="text-[#E4AE39] font-mono">{total.toLocaleString()}</span> orders
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-3">Order ID</th>
              <th className="text-left py-3 px-3">Skin</th>
              <th className="text-left py-3 px-3">Buyer</th>
              <th className="text-left py-3 px-3">Seller</th>
              <th className="text-right py-3 px-3">Amount</th>
              <th className="text-left py-3 px-3">Status</th>
              <th className="text-left py-3 px-3">Trade</th>
              <th className="text-right py-3 px-3">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-[#8A8A8A]">No orders match.</td></tr>
            ) : items.map((o) => {
              const skin = o.listing_snapshot?.skin_name || "—";
              return (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`txn-${o.id}`}>
                  <td className="py-3 px-3 font-mono text-[10px] text-[#8A8A8A]">{o.id.slice(0, 8)}…</td>
                  <td className="py-3 px-3">{skin}</td>
                  <td className="py-3 px-3 text-[#E0E0E0]">{o.buyer_name || "—"}</td>
                  <td className="py-3 px-3 text-[#E0E0E0]">{o.seller_name || "—"}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-[#E4AE39]">{format(o.amount_usd || 0)}</td>
                  <td className="py-3 px-3">
                    <span className={`text-[9px] px-2 py-0.5 rounded-sm border font-mono uppercase tracking-widest ${STATUS_COLORS[o.status] || "text-[#8A8A8A] border-white/10"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[10px] text-[#8A8A8A] font-mono uppercase">{o.trade_status || "—"}</td>
                  <td className="py-3 px-3 text-right text-[10px] text-[#8A8A8A] font-mono">{timeAgo(o.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setSkip(Math.max(0, skip - limit))} disabled={skip === 0}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Prev</button>
        <div className="text-xs text-[#8A8A8A] font-mono">{skip + 1}–{Math.min(skip + limit, total)} of {total}</div>
        <button onClick={() => setSkip(skip + limit)} disabled={skip + limit >= total}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Next</button>
      </div>
    </div>
  );
}

// ========================= USERS =========================
function UsersTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showBanned, setShowBanned] = useState("all");
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [banReason, setBanReason] = useState("");
  const limit = 100;

  const load = () => {
    setLoading(true);
    const params = { limit, skip };
    if (q) params.q = q;
    if (showBanned === "banned") params.banned = true;
    if (showBanned === "active") params.banned = false;
    api.get("/admin/users", { params }).then(({ data }) => {
      setItems(data.items || []); setTotal(data.total || 0);
    }).catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [showBanned, skip]);

  const openDetail = async (user) => {
    setSelected(user); setDetail(null);
    try {
      const { data } = await api.get(`/admin/users/${user.id}`);
      setDetail(data);
    } catch { toast.error("Failed to load user"); }
  };

  const doBan = async () => {
    if (!selected) return;
    try {
      await api.post(`/admin/users/${selected.id}/ban`, { reason: banReason });
      toast.success("User banned");
      setBanReason("");
      load();
      openDetail(selected);
    } catch (e) { toast.error(e?.response?.data?.detail || "Ban failed"); }
  };

  const doUnban = async () => {
    if (!selected) return;
    try {
      await api.post(`/admin/users/${selected.id}/unban`);
      toast.success("User unbanned");
      load();
      openDetail(selected);
    } catch (e) { toast.error(e?.response?.data?.detail || "Unban failed"); }
  };

  const toggleModerator = async () => {
    if (!selected) return;
    const next = !selected.is_moderator;
    try {
      await api.post(`/admin/users/${selected.id}/moderator`, { is_moderator: next });
      toast.success(next ? "Promoted to moderator" : "Moderator role removed");
      load();
      openDetail(selected);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSkip(0); load(); } }}
            data-testid="user-search"
            placeholder="Search name, steamID, email, IP…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
        </div>
        <select value={showBanned} onChange={(e) => { setSkip(0); setShowBanned(e.target.value); }}
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="all">All users</option>
          <option value="active">Active only</option>
          <option value="banned">Banned only</option>
        </select>
      </div>

      <div className="text-xs text-[#8A8A8A] mb-3">
        <span className="text-[#E4AE39] font-mono">{total.toLocaleString()}</span> users
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-3">User</th>
              <th className="text-left py-3 px-3">SteamID</th>
              <th className="text-left py-3 px-3">Email</th>
              <th className="text-left py-3 px-3">Last IP</th>
              <th className="text-right py-3 px-3">Bought</th>
              <th className="text-right py-3 px-3">Sold</th>
              <th className="text-left py-3 px-3">Status</th>
              <th className="text-right py-3 px-3">Last seen</th>
              <th className="text-right py-3 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-[#8A8A8A]">No users match.</td></tr>
            ) : items.map((u) => (
              <tr key={u.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${u.is_banned ? "opacity-60" : ""}`} data-testid={`user-${u.id}`}>
                <td className="py-3 px-3 flex items-center gap-2">
                  {u.avatar ? <img src={u.avatar} alt="" className="w-6 h-6 rounded-sm" /> : <div className="w-6 h-6 bg-white/5 rounded-sm" />}
                  <span className="text-[#E0E0E0]">{u.display_name}</span>
                  {u.is_admin && <span className="text-[9px] font-mono bg-[#E4AE39]/15 text-[#E4AE39] px-1.5 py-0.5 rounded-sm">ADMIN</span>}
                </td>
                <td className="py-3 px-3 font-mono text-[10px] text-[#8A8A8A]">{u.steam_id}</td>
                <td className="py-3 px-3 text-[#8A8A8A]">{u.email || "—"}</td>
                <td className="py-3 px-3 font-mono text-[10px] text-[#8A8A8A]">{u.last_ip || "—"}</td>
                <td className="py-3 px-3 text-right font-mono text-[#E0E0E0]">{u.orders_count?.bought ?? 0}</td>
                <td className="py-3 px-3 text-right font-mono text-[#E0E0E0]">{u.orders_count?.sold ?? 0}</td>
                <td className="py-3 px-3">
                  {u.is_banned ? (
                    <span className="text-[9px] font-mono bg-[#EB4B4B]/15 text-[#EB4B4B] border border-[#EB4B4B]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Banned</span>
                  ) : u.is_verified ? (
                    <span className="text-[9px] font-mono bg-[#2ECC71]/15 text-[#2ECC71] border border-[#2ECC71]/30 px-2 py-0.5 rounded-sm uppercase tracking-widest">Verified</span>
                  ) : (
                    <span className="text-[9px] font-mono text-[#8A8A8A] border border-white/10 px-2 py-0.5 rounded-sm uppercase tracking-widest">Guest</span>
                  )}
                </td>
                <td className="py-3 px-3 text-right text-[10px] text-[#8A8A8A] font-mono">{timeAgo(u.last_seen_at) || "—"}</td>
                <td className="py-3 px-3 text-right">
                  <button onClick={() => openDetail(u)} data-testid={`user-open-${u.id}`}
                    className="text-[10px] uppercase tracking-widest bg-white/5 hover:bg-white/10 px-2 py-1.5 rounded-sm">Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setSkip(Math.max(0, skip - limit))} disabled={skip === 0}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Prev</button>
        <div className="text-xs text-[#8A8A8A] font-mono">{skip + 1}–{Math.min(skip + limit, total)} of {total}</div>
        <button onClick={() => setSkip(skip + limit)} disabled={skip + limit >= total}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Next</button>
      </div>

      {/* User detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDetail(null); setBanReason(""); } }}>
        <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-3xl rounded-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight flex items-center gap-2">
              {selected?.avatar && <img src={selected.avatar} alt="" className="w-6 h-6 rounded-sm" />}
              {selected?.display_name}
              {selected?.is_banned && <span className="text-[9px] font-mono bg-[#EB4B4B]/15 text-[#EB4B4B] px-2 py-0.5 rounded-sm">BANNED</span>}
            </DialogTitle>
          </DialogHeader>

          {!detail ? (
            <div className="text-center py-8 text-[#8A8A8A]">Loading user…</div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="SteamID64" mono value={detail.user.steam_id} />
                <Field label="Auth method" value={detail.user.auth_method} />
                <Field label="Email" value={detail.user.email || "—"} />
                <Field label="Verified" value={detail.user.is_verified ? "Yes" : "No"} />
                <Field label="Created" value={timeAgo(detail.user.created_at)} />
                <Field label="Last seen" value={timeAgo(detail.user.last_seen_at) || "—"} />
                <Field label="Last IP" mono value={detail.user.last_ip || "—"} />
                <Field label="IP history" mono value={(detail.user.ip_history || []).join(", ") || "—"} />
                <Field label="Profile URL" value={detail.user.profile_url ? <a href={detail.user.profile_url} target="_blank" rel="noreferrer" className="text-[#E4AE39] underline break-all">{detail.user.profile_url}</a> : "—"} />
                <Field label="Favourites" value={String(detail.favorites_count || 0)} />
              </div>

              {detail.user.is_banned && (
                <div className="bg-[#EB4B4B]/10 border border-[#EB4B4B]/30 rounded-sm p-3 text-xs">
                  <div className="font-mono uppercase tracking-widest text-[#EB4B4B] text-[10px] mb-1">Ban reason</div>
                  <div className="text-[#E0E0E0]">{detail.user.ban_reason || "—"}</div>
                  <div className="text-[10px] font-mono text-[#8A8A8A] mt-1">Banned {timeAgo(detail.user.banned_at)}</div>
                </div>
              )}

              <div>
                <div className="font-mono uppercase tracking-widest text-[#555] text-[10px] mb-2">Purchases ({detail.orders_bought.length})</div>
                <MiniOrderList orders={detail.orders_bought} sideLabel="bought" />
              </div>
              <div>
                <div className="font-mono uppercase tracking-widest text-[#555] text-[10px] mb-2">Sales ({detail.orders_sold.length})</div>
                <MiniOrderList orders={detail.orders_sold} sideLabel="sold" />
              </div>
              <div>
                <div className="font-mono uppercase tracking-widest text-[#555] text-[10px] mb-2">Active listings ({detail.listings.length})</div>
                <MiniListingList listings={detail.listings} />
              </div>
            </div>
          )}

          <DialogFooter>
            <button onClick={toggleModerator} data-testid="user-toggle-moderator"
              className={`flex items-center gap-1 px-4 py-2 rounded-sm text-xs uppercase tracking-widest font-bold ${
                detail?.user.is_moderator
                  ? "bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] border border-[#3B82F6]/30"
                  : "bg-white/5 hover:bg-white/10 text-[#E0E0E0] border border-white/10"
              }`}>
              <ShieldCheck className="w-3 h-3" /> {detail?.user.is_moderator ? "Remove moderator" : "Make moderator"}
            </button>
            {detail?.user.is_banned ? (
              <button onClick={doUnban} data-testid="user-unban"
                className="flex items-center gap-1 bg-[#2ECC71] hover:bg-[#40D57F] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
                <ShieldCheck className="w-3 h-3" /> Unban
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Ban reason (optional)"
                  className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm flex-1 outline-none focus:border-[#EB4B4B]" />
                <button onClick={doBan} data-testid="user-ban"
                  className="flex items-center gap-1 bg-[#EB4B4B] hover:bg-[#F56060] text-white font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
                  <Ban className="w-3 h-3" /> Ban user
                </button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="bg-[#121212] border border-white/5 rounded-sm p-2.5">
      <div className="text-[9px] uppercase tracking-widest text-[#555] mb-1">{label}</div>
      <div className={`text-[#E0E0E0] ${mono ? "font-mono text-[11px]" : "text-xs"} break-all`}>{value}</div>
    </div>
  );
}

function MiniOrderList({ orders, sideLabel }) {
  if (!orders.length) return <div className="text-xs text-[#8A8A8A] px-2 py-3 border border-dashed border-white/10 rounded-sm">No orders.</div>;
  return (
    <div className="border border-white/5 rounded-sm divide-y divide-white/5">
      {orders.map((o) => (
        <div key={o.id} className="flex items-center justify-between text-xs px-3 py-2">
          <div className="truncate">{o.listing_snapshot?.skin_name || "—"}</div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[#E4AE39]">${o.amount_usd?.toFixed?.(2) ?? o.amount_usd}</span>
            <span className={`text-[9px] uppercase tracking-widest font-mono ${o.status === "paid" ? "text-[#2ECC71]" : o.status === "pending" ? "text-[#E4AE39]" : "text-[#8A8A8A]"}`}>{o.status}</span>
            <span className="text-[9px] text-[#555] font-mono">{timeAgo(o.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniListingList({ listings }) {
  if (!listings.length) return <div className="text-xs text-[#8A8A8A] px-2 py-3 border border-dashed border-white/10 rounded-sm">No listings.</div>;
  return (
    <div className="border border-white/5 rounded-sm divide-y divide-white/5">
      {listings.map((l) => (
        <div key={l.id} className="flex items-center justify-between text-xs px-3 py-2">
          <div className="truncate">{l.skin_name} {l.wear && <span className="text-[#8A8A8A]">· {l.wear}</span>}</div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[#E4AE39]">${l.price_usd?.toFixed?.(2) ?? l.price_usd}</span>
            <span className="text-[9px] uppercase tracking-widest font-mono text-[#8A8A8A]">{l.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ========================= BACKUP / RESTORE =========================
function BackupTab() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("merge");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const downloadBackup = async () => {
    setRunning(true);
    try {
      const token = sessionStorage.getItem("cs2_token") || localStorage.getItem("cs2_token");
      const resp = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/backup`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skinmrkt-backup-${new Date().toISOString().slice(0, 19)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (e) { toast.error(`Backup failed: ${e.message}`); }
    finally { setRunning(false); }
  };

  const doRestore = async () => {
    if (!file) { toast.error("Pick a backup file first"); return; }
    if (!window.confirm(`Restore in "${mode}" mode? ${mode === "replace" ? "This DELETES all existing data first." : "This upserts docs on top of existing data."}`)) return;
    setRunning(true); setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const { data } = await api.post("/admin/restore", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      toast.success("Restore completed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Restore failed"); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-4 h-4 text-[#E4AE39]" />
          <h3 className="font-display font-black text-lg tracking-tight">Backup</h3>
        </div>
        <p className="text-xs text-[#8A8A8A] leading-relaxed mb-4">
          Download a single JSON snapshot of all business collections
          (users, listings, orders, favorites, notifications, payment
          transactions, market prices). Store it somewhere safe.
        </p>
        <button onClick={downloadBackup} disabled={running} data-testid="backup-download"
          className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50">
          {running ? "…" : "Download backup"}
        </button>
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm p-5">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-[#E4AE39]" />
          <h3 className="font-display font-black text-lg tracking-tight">Restore</h3>
        </div>
        <p className="text-xs text-[#8A8A8A] leading-relaxed mb-4">
          Upload a previously-downloaded backup file. Choose <strong>Merge</strong> to upsert
          (preserve rows not in the backup) or <strong>Replace</strong> to fully overwrite
          each collection. <span className="text-[#EB4B4B]">Replace is destructive.</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept="application/json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            data-testid="backup-file"
            className="text-xs file:mr-3 file:px-3 file:py-2 file:rounded-sm file:border file:border-white/10 file:bg-[#0A0A0A] file:text-[#E0E0E0] file:text-[10px] file:uppercase file:tracking-widest file:cursor-pointer" />
          <select value={mode} onChange={(e) => setMode(e.target.value)}
            className="bg-[#0A0A0A] border border-white/10 rounded-sm px-3 py-2 text-sm">
            <option value="merge">Merge (upsert)</option>
            <option value="replace">Replace (destructive)</option>
          </select>
          <button onClick={doRestore} disabled={running || !file} data-testid="backup-restore"
            className={`px-4 py-2 rounded-sm text-xs uppercase tracking-widest font-bold disabled:opacity-50 ${mode === "replace" ? "bg-[#EB4B4B] hover:bg-[#F56060] text-white" : "bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A]"}`}>
            {running ? "Restoring…" : "Restore"}
          </button>
        </div>
        {result && (
          <div className="mt-4 bg-[#0A0A0A] border border-white/10 rounded-sm p-3 text-[11px] font-mono text-[#8A8A8A]">
            <div className="text-[#2ECC71] mb-2">Restore complete · mode: {result.mode}</div>
            {Object.entries(result.stats).map(([coll, s]) => (
              <div key={coll}>{coll}: {JSON.stringify(s)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================= TICKETS =========================
function TicketsTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const limit = 50;

  const load = () => {
    setLoading(true);
    const params = { limit, skip };
    if (status) params.status = status;
    if (q) params.q = q;
    api.get("/admin/tickets", { params })
      .then(({ data }) => { setItems(data.items || []); setTotal(data.total || 0); })
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status, skip]);

  const openTicket = async (t) => {
    setSelected(t); setDetail(null); setReply("");
    try {
      const { data } = await api.get(`/admin/tickets/${t.id}`);
      setDetail(data);
    } catch { toast.error("Failed to load ticket"); }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || !detail) return;
    setSending(true);
    try {
      await api.post(`/admin/tickets/${detail.id}/reply`, { body });
      toast.success("Reply sent");
      setReply("");
      const { data } = await api.get(`/admin/tickets/${detail.id}`);
      setDetail(data);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send"); }
    finally { setSending(false); }
  };

  const closeTicket = async () => {
    if (!detail) return;
    if (!window.confirm("Close this ticket? The user will be notified and can no longer reply.")) return;
    setClosing(true);
    try {
      await api.post(`/admin/tickets/${detail.id}/close`);
      toast.success("Ticket closed");
      const { data } = await api.get(`/admin/tickets/${detail.id}`);
      setDetail(data);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setClosing(false); }
  };

  if (selected && detail) {
    const closed = detail.status === "closed";
    return (
      <div className="max-w-4xl">
        <button onClick={() => { setSelected(null); setDetail(null); }}
          className="flex items-center gap-1 text-xs uppercase tracking-widest text-[#8A8A8A] hover:text-[#E0E0E0] mb-4">
          <ArrowLeft className="w-3 h-3" /> Back to tickets
        </button>

        <div className="bg-[#121212] border border-white/10 rounded-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#555]">
                {TICKET_CATEGORY_LABEL[detail.category] || detail.category}
              </div>
              <h2 className="font-display font-black text-xl tracking-tight mt-1">{detail.subject}</h2>
              <div className="text-[10px] font-mono text-[#8A8A8A] mt-1">
                #{detail.id.slice(0, 8)} · by{" "}
                <span className="text-[#E0E0E0]">{detail.user_name}</span> ({detail.user_steam_id}) ·
                opened {timeAgo(detail.created_at)}
              </div>
            </div>
            <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${TICKET_STATUS_STYLES[detail.status] || ""}`}>
              {TICKET_STATUS_LABEL[detail.status] || detail.status}
            </span>
          </div>
          {detail.order_snapshot && (
            <div className="mt-3 bg-[#0A0A0A] border border-white/10 rounded-sm p-3 text-xs">
              <div className="font-mono text-[10px] text-[#555] uppercase tracking-widest">Linked order</div>
              <div className="text-[#E0E0E0]">
                {detail.order_snapshot.listing_snapshot?.skin_name || "—"} ·
                ${detail.order_snapshot.amount_usd?.toFixed?.(2) ?? detail.order_snapshot.amount_usd} ·
                {detail.order_snapshot.status}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {(detail.messages || []).map((m) => {
            const admin = m.author_role === "admin";
            return (
              <div key={m.id} className={`flex ${admin ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-sm border ${admin ? "bg-[#E4AE39]/5 border-[#E4AE39]/30" : "bg-[#121212] border-white/10"} p-3`}>
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#8A8A8A] mb-1">
                    {admin ? <span className="text-[#E4AE39]">SUPPORT — {m.author_name || "Admin"}</span>
                            : <span>{m.author_name || "User"}</span>}
                    · {timeAgo(m.created_at)}
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-[#E0E0E0]">{m.body}</div>
                </div>
              </div>
            );
          })}
        </div>

        {closed ? (
          <div className="mt-6 text-center text-xs text-[#8A8A8A] bg-white/5 border border-white/10 rounded-sm p-4">
            🔒 This ticket is closed. The user has been notified.
          </div>
        ) : (
          <div className="mt-6 bg-[#121212] border border-white/10 rounded-sm p-4 space-y-3">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)}
              placeholder="Reply as SUPPORT…" rows={4}
              data-testid="admin-reply-body"
              className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none resize-y" />
            <div className="flex justify-between items-center gap-2">
              <button onClick={closeTicket} disabled={closing}
                data-testid="admin-close-ticket"
                className="flex items-center gap-1 bg-white/5 hover:bg-[#EB4B4B]/20 hover:text-[#EB4B4B] text-[#8A8A8A] px-3 py-2 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50">
                {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Close ticket
              </button>
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                data-testid="admin-send-reply"
                className="flex items-center gap-1 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50">
                {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : <><Send className="w-3 h-3" /> Send reply</>}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSkip(0); load(); } }}
            data-testid="tickets-search"
            placeholder="Search ticket id, subject, user…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
        </div>
        <select value={status} onChange={(e) => { setSkip(0); setStatus(e.target.value); }}
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">All statuses</option>
          <option value="open">Awaiting reply</option>
          <option value="pending_reply">Reply received</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="text-xs text-[#8A8A8A] mb-3">
        <span className="text-[#E4AE39] font-mono">{total.toLocaleString()}</span> tickets
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-3">Subject</th>
              <th className="text-left py-3 px-3">User</th>
              <th className="text-left py-3 px-3">Category</th>
              <th className="text-left py-3 px-3">Status</th>
              <th className="text-right py-3 px-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-[#8A8A8A]">No tickets.</td></tr>
            ) : items.map((t) => (
              <tr key={t.id} onClick={() => openTicket(t)}
                className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                data-testid={`admin-ticket-${t.id}`}>
                <td className="py-3 px-3">{t.subject}</td>
                <td className="py-3 px-3">
                  <div className="text-[#E0E0E0]">{t.user_name}</div>
                  <div className="text-[10px] font-mono text-[#555]">{t.user_steam_id}</div>
                </td>
                <td className="py-3 px-3 text-[#8A8A8A] text-xs">
                  {TICKET_CATEGORY_LABEL[t.category] || t.category}
                </td>
                <td className="py-3 px-3">
                  <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${TICKET_STATUS_STYLES[t.status] || ""}`}>
                    {TICKET_STATUS_LABEL[t.status] || t.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-[10px] text-[#555] font-mono">{timeAgo(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setSkip(Math.max(0, skip - limit))} disabled={skip === 0}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Prev</button>
        <div className="text-xs text-[#8A8A8A] font-mono">{Math.min(skip + 1, total)}–{Math.min(skip + limit, total)} of {total}</div>
        <button onClick={() => setSkip(skip + limit)} disabled={skip + limit >= total}
          className="px-3 py-1.5 bg-[#121212] border border-white/10 disabled:opacity-30 text-xs uppercase tracking-widest rounded-sm">Next</button>
      </div>
    </div>
  );
}


// ========================= PAGE SHELL =========================
export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("dashboard");

  if (loading) return <div className="max-w-7xl mx-auto px-6 py-16 text-[#8A8A8A]">Loading…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.is_admin) return <Navigate to="/admin/login" replace />;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10" data-testid="admin-page">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Control Panel</div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight flex items-center gap-3">
          <ShieldAlert className="w-7 h-7 text-[#E4AE39]" /> Admin
        </h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#121212] border border-white/10 rounded-sm p-1 mb-6">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard" className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions" className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> Transactions
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users" className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets" className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Tickets
          </TabsTrigger>
          <TabsTrigger value="backup" data-testid="tab-backup" className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <Database className="w-3.5 h-3.5 mr-1.5" /> Backup
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="tickets"><TicketsTab /></TabsContent>
        <TabsContent value="backup"><BackupTab /></TabsContent>
      </Tabs>
    </div>
  );
}
