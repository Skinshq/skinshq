import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { LifeBuoy, Plus, Loader2, MessageSquare, ArrowLeft, Send, Package2 } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { timeAgo } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";

const STATUS_STYLES = {
  open: "text-[#E4AE39] bg-[#E4AE39]/10 border-[#E4AE39]/30",
  pending_reply: "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30",
  resolved: "text-[#2ECC71] bg-[#2ECC71]/10 border-[#2ECC71]/30",
  closed: "text-[#8A8A8A] bg-white/5 border-white/10",
};
const STATUS_LABEL = {
  open: "Awaiting reply",
  pending_reply: "Reply received",
  resolved: "Resolved",
  closed: "Closed",
};
const CATEGORY_LABEL = {
  trade_issue: "Trade issue", payment: "Payment", account: "Account",
  listing: "Listing", other: "Other",
};

function NewTicketDialog({ open, onOpenChange, onCreated }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 3) { toast.error("Subject too short"); return; }
    if (body.trim().length < 10) { toast.error("Please describe the issue (min 10 chars)"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/support/tickets", {
        subject, body, category,
      });
      toast.success("Ticket created");
      setSubject(""); setBody(""); setCategory("other");
      onOpenChange(false);
      onCreated?.(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0A0A0A] border border-white/10 max-w-lg rounded-sm">
        <DialogHeader><DialogTitle>New support ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              data-testid="ticket-category"
              className="w-full bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm">
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              data-testid="ticket-subject"
              placeholder="Trade didn't complete after payment"
              maxLength={200}
              className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">Describe the issue</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              data-testid="ticket-body"
              maxLength={4000} rows={7}
              placeholder="Include the order id, timestamps, and what you expected vs saw."
              className="w-full bg-[#121212] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none resize-y" />
            <div className="text-[9px] font-mono text-[#555] text-right mt-1">{body.length}/4000</div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={submit} disabled={saving} data-testid="ticket-submit"
            className="w-full flex items-center justify-center gap-2 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-4 py-2.5 rounded-sm text-xs uppercase tracking-widest">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : "Submit ticket"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({ ticket, onBack, onReply, refreshTrigger }) {
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = () => {
    api.get(`/support/tickets/${ticket.id}`).then(({ data }) => setDetail(data))
      .catch(() => toast.error("Failed to load ticket"));
  };
  useEffect(() => { load(); }, [ticket.id, refreshTrigger]);

  const send = async () => {
    const b = msg.trim();
    if (!b) return;
    setSending(true);
    try {
      await api.post(`/support/tickets/${ticket.id}/messages`, { body: b });
      setMsg(""); load(); onReply?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSending(false); }
  };

  if (!detail) return <div className="text-[#8A8A8A] text-sm py-10">Loading ticket…</div>;

  const closed = detail.status === "closed";
  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1 text-xs uppercase tracking-widest text-[#8A8A8A] hover:text-[#E0E0E0] mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to tickets
      </button>

      <div className="bg-[#121212] border border-white/10 rounded-sm p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#555]">{CATEGORY_LABEL[detail.category] || detail.category}</div>
            <h2 className="font-display font-black text-xl tracking-tight mt-1">{detail.subject}</h2>
            <div className="text-[10px] font-mono text-[#8A8A8A] mt-1">#{detail.id.slice(0, 8)} · opened {timeAgo(detail.created_at)}</div>
          </div>
          <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${STATUS_STYLES[detail.status] || ""}`}>
            {STATUS_LABEL[detail.status] || detail.status}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {(detail.messages || []).map((m) => {
          const isAdmin = m.author_role === "admin";
          return (
            <div key={m.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] rounded-sm border ${isAdmin ? "bg-[#E4AE39]/5 border-[#E4AE39]/30" : "bg-[#121212] border-white/10"} p-3`}>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#8A8A8A] mb-1">
                  {isAdmin ? <span className="text-[#E4AE39]">SUPPORT</span> : <span>You</span>}
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
          This ticket is closed. If you need more help, open a new ticket.
        </div>
      ) : (
        <div className="mt-6 bg-[#121212] border border-white/10 rounded-sm p-4">
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)}
            placeholder="Reply…" rows={3}
            data-testid="ticket-reply"
            className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-2 text-sm outline-none resize-y" />
          <div className="flex justify-end mt-3">
            <button onClick={send} disabled={sending || !msg.trim()}
              data-testid="ticket-send"
              className="flex items-center gap-1 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
              {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : <><Send className="w-3 h-3" /> Send reply</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const { user, loading, loginWithSteam } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const load = () => {
    setBusy(true);
    api.get("/support/tickets").then(({ data }) => setItems(data.items || []))
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setBusy(false));
  };
  useEffect(() => { if (user) load(); }, [user]);

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-16 text-[#8A8A8A]">Loading…</div>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <LifeBuoy className="w-10 h-10 text-[#E4AE39]/60 mx-auto mb-4" />
        <h1 className="font-display font-black text-2xl tracking-tight mb-2">Sign in to open a support ticket</h1>
        <button onClick={loginWithSteam} className="mt-4 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-3 rounded-sm text-xs uppercase tracking-widest">
          Sign in with Steam
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-10" data-testid="support-page">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Help centre</div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight flex items-center gap-3">
            <LifeBuoy className="w-7 h-7 text-[#E4AE39]" /> Support
          </h1>
          <p className="text-sm text-[#8A8A8A] mt-2">Every reply is timestamped and moderators can audit the full thread.</p>
        </div>
        {!selected && (
          <button onClick={() => setShowNew(true)} data-testid="new-ticket"
            className="flex items-center gap-1 bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-4 py-2 rounded-sm text-xs uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5" /> New ticket
          </button>
        )}
      </div>

      {selected ? (
        <TicketThread ticket={selected} onBack={() => setSelected(null)}
          onReply={() => { load(); setRefreshTrigger(x => x + 1); }} refreshTrigger={refreshTrigger} />
      ) : (
        <div className="bg-[#121212] border border-white/10 rounded-sm overflow-hidden">
          {busy ? (
            <div className="text-center py-16 text-[#8A8A8A] text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-[#8A8A8A]">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <div className="text-sm">You haven't opened any tickets yet.</div>
              <button onClick={() => setShowNew(true)} className="mt-4 text-[10px] uppercase tracking-widest text-[#E4AE39]">
                Open your first ticket →
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
                <tr>
                  <th className="text-left py-3 px-4">Subject</th>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} onClick={() => setSelected(t)}
                    className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    data-testid={`ticket-row-${t.id}`}>
                    <td className="py-3 px-4 text-[#E0E0E0]">{t.subject}</td>
                    <td className="py-3 px-4 text-[#8A8A8A] text-xs">{CATEGORY_LABEL[t.category] || t.category}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-sm border ${STATUS_STYLES[t.status] || ""}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-[10px] text-[#555] font-mono">{timeAgo(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <NewTicketDialog open={showNew} onOpenChange={setShowNew} onCreated={(t) => { load(); setSelected(t); }} />
    </div>
  );
}

export { STATUS_STYLES, STATUS_LABEL, CATEGORY_LABEL };
