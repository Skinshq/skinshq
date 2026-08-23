import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ShieldCheck, Receipt, MessageSquare, Search, ArrowLeft, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { timeAgo } from "../lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { STATUS_STYLES, STATUS_LABEL, CATEGORY_LABEL } from "./SupportPage";

const ORDER_STATUS_COLOR = {
  pending: "text-[#E4AE39] bg-[#E4AE39]/10 border-[#E4AE39]/30",
  paid: "text-[#2ECC71] bg-[#2ECC71]/10 border-[#2ECC71]/30",
  failed: "text-[#EB4B4B] bg-[#EB4B4B]/10 border-[#EB4B4B]/30",
};

function ModTransactionsTab() {
  const { format } = useCurrency();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const load = () => {
    setLoading(true);
    const params = { limit, skip };
    if (status) params.status = status;
    if (q) params.q = q;
    api.get("/mod/transactions", { params })
      .then(({ data }) => { setItems(data.items || []); setTotal(data.total || 0); })
      .catch(() => toast.error("Failed to load transactions"))
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
        <span className="text-[#E4AE39] font-mono">{total.toLocaleString()}</span> orders · <span className="text-[#8A8A8A]">read-only view</span>
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
            <tr>
              <th className="text-left py-3 px-3">Order</th>
              <th className="text-left py-3 px-3">Skin</th>
              <th className="text-left py-3 px-3">Buyer</th>
              <th className="text-left py-3 px-3">Seller</th>
              <th className="text-right py-3 px-3">Amount</th>
              <th className="text-left py-3 px-3">Status</th>
              <th className="text-right py-3 px-3">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-[#8A8A8A]">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-[#8A8A8A]">No orders match.</td></tr>
            ) : items.map((o) => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`mod-txn-${o.id}`}>
                <td className="py-3 px-3 font-mono text-[10px] text-[#8A8A8A]">{o.id.slice(0, 8)}…</td>
                <td className="py-3 px-3">{o.listing_snapshot?.skin_name || "—"}</td>
                <td className="py-3 px-3 text-[#E0E0E0]">{o.buyer_name || "—"}</td>
                <td className="py-3 px-3 text-[#E0E0E0]">{o.seller_name || "—"}</td>
                <td className="py-3 px-3 text-right font-mono font-bold text-[#E4AE39]">{format(o.amount_usd || 0)}</td>
                <td className="py-3 px-3">
                  <span className={`text-[9px] px-2 py-0.5 rounded-sm border font-mono uppercase tracking-widest ${ORDER_STATUS_COLOR[o.status] || "text-[#8A8A8A] border-white/10"}`}>
                    {o.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-[10px] text-[#8A8A8A] font-mono">{timeAgo(o.created_at)}</td>
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

function ModTicketsTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const limit = 50;

  const load = () => {
    setLoading(true);
    const params = { limit, skip };
    if (status) params.status = status;
    if (q) params.q = q;
    api.get("/mod/tickets", { params })
      .then(({ data }) => { setItems(data.items || []); setTotal(data.total || 0); })
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status, skip]);

  const openTicket = async (t) => {
    setSelected(t); setDetail(null);
    try {
      const { data } = await api.get(`/mod/tickets/${t.id}`);
      setDetail(data);
    } catch { toast.error("Failed to load ticket"); }
  };

  if (selected) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => { setSelected(null); setDetail(null); }}
          className="flex items-center gap-1 text-xs uppercase tracking-widest text-[#8A8A8A] hover:text-[#E0E0E0] mb-4">
          <ArrowLeft className="w-3 h-3" /> Back to tickets
        </button>
        {!detail ? (
          <div className="text-[#8A8A8A] text-sm py-10">Loading…</div>
        ) : (
          <>
            <div className="bg-[#121212] border border-white/10 rounded-sm p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#555]">{CATEGORY_LABEL[detail.category] || detail.category}</div>
                  <h2 className="font-display font-black text-xl tracking-tight mt-1">{detail.subject}</h2>
                  <div className="text-[10px] font-mono text-[#8A8A8A] mt-1">
                    #{detail.id.slice(0, 8)} · by <span className="text-[#E0E0E0]">{detail.user_name}</span> ({detail.user_steam_id}) · opened {timeAgo(detail.created_at)}
                  </div>
                </div>
                <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${STATUS_STYLES[detail.status] || ""}`}>
                  {STATUS_LABEL[detail.status] || detail.status}
                </span>
              </div>
              {detail.order_snapshot && (
                <div className="mt-3 flex items-center justify-between bg-[#0A0A0A] border border-white/10 rounded-sm p-3 text-xs">
                  <div>
                    <div className="font-mono text-[10px] text-[#555] uppercase tracking-widest">Linked order</div>
                    <div>{detail.order_snapshot.listing_snapshot?.skin_name || "—"} · ${detail.order_snapshot.amount_usd?.toFixed?.(2)} · {detail.order_snapshot.status}</div>
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
                        {admin ? <span className="text-[#E4AE39]">SUPPORT</span> : <span>{m.author_name || "USER"}</span>}
                        · {timeAgo(m.created_at)}
                      </div>
                      <div className="text-sm whitespace-pre-wrap text-[#E0E0E0]">{m.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-center text-[10px] font-mono text-[#8A8A8A] bg-white/5 border border-white/10 rounded-sm p-3">
              🔒 Moderators have read-only access. Only admins can reply or close.
            </div>
          </>
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
            placeholder="Search ticket id, subject, user…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
        </div>
        <select value={status} onChange={(e) => { setSkip(0); setStatus(e.target.value); }}
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="open">Awaiting reply</option>
          <option value="pending_reply">Reply received</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="text-xs text-[#8A8A8A] mb-3">
        <span className="text-[#E4AE39] font-mono">{total.toLocaleString()}</span> tickets · <span>read-only view</span>
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
                data-testid={`mod-ticket-${t.id}`}>
                <td className="py-3 px-3">{t.subject}</td>
                <td className="py-3 px-3">
                  <div className="text-[#E0E0E0]">{t.user_name}</div>
                  <div className="text-[10px] font-mono text-[#555]">{t.user_steam_id}</div>
                </td>
                <td className="py-3 px-3 text-[#8A8A8A] text-xs">{CATEGORY_LABEL[t.category] || t.category}</td>
                <td className="py-3 px-3">
                  <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${STATUS_STYLES[t.status] || ""}`}>
                    {STATUS_LABEL[t.status] || t.status}
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

export default function ModeratorPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("trades");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user && (user.is_admin || user.is_moderator)) {
      api.get("/mod/stats").then(({ data }) => setStats(data)).catch(() => {});
    }
  }, [user]);

  if (loading) return <div className="max-w-7xl mx-auto px-6 py-16 text-[#8A8A8A]">Loading…</div>;
  if (!user) return <Navigate to="/mod/login" replace />;
  if (!(user.is_admin || user.is_moderator)) return <Navigate to="/mod/login" replace />;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10" data-testid="mod-page">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Trust &amp; safety</div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-[#E4AE39]" /> Moderator
          </h1>
          <p className="text-sm text-[#8A8A8A] mt-2">Read-only oversight of trades and support tickets.</p>
        </div>
        {stats && (
          <div className="flex gap-3">
            <div className="bg-[#121212] border border-white/10 rounded-sm px-4 py-2 text-right">
              <div className="text-[9px] uppercase tracking-widest text-[#555] font-mono">Live trades</div>
              <div className="font-mono font-black text-[#E4AE39]">{stats.orders.paid}</div>
            </div>
            <div className="bg-[#121212] border border-white/10 rounded-sm px-4 py-2 text-right">
              <div className="text-[9px] uppercase tracking-widest text-[#555] font-mono">Open tickets</div>
              <div className="font-mono font-black text-[#E4AE39]">{stats.tickets.open}</div>
            </div>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#121212] border border-white/10 rounded-sm p-1 mb-6">
          <TabsTrigger value="trades" data-testid="mod-tab-trades"
            className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> Trades
          </TabsTrigger>
          <TabsTrigger value="tickets" data-testid="mod-tab-tickets"
            className="data-[state=active]:bg-[#E4AE39] data-[state=active]:text-[#0A0A0A] text-xs uppercase tracking-widest px-4 py-2">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Support tickets
          </TabsTrigger>
        </TabsList>
        <TabsContent value="trades"><ModTransactionsTab /></TabsContent>
        <TabsContent value="tickets"><ModTicketsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
