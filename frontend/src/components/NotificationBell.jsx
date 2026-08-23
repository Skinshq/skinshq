import React, { useEffect, useState } from "react";
import { Bell, CheckCheck, Package2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useFavorites } from "../context/FavoritesContext";
import { timeAgo } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "./ui/dropdown-menu";

export default function NotificationBell() {
  const { unread, refreshUnread } = useFavorites();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications", { params: { limit: 30 } });
      setItems(data.items || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const markAll = async () => {
    try {
      await api.post("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      refreshUnread();
    } catch { /* silent */ }
  };

  const markOne = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      refreshUnread();
    } catch { /* silent */ }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        data-testid="notif-bell"
        className="relative flex items-center justify-center w-9 h-9 bg-[#121212] border border-white/10 hover:border-[#E4AE39]/50 rounded-sm transition-colors"
      >
        <Bell className="w-4 h-4 text-[#E0E0E0]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[#EB4B4B] text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[#121212] border-white/10 min-w-[380px] max-w-[420px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="text-sm font-medium">Notifications</div>
          {items.some((n) => !n.read) && (
            <button onClick={markAll} data-testid="notif-read-all"
              className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#E4AE39] hover:text-[#F5C75A]">
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-[#8A8A8A] text-xs">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[#8A8A8A] text-xs">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
              You have no notifications yet.
            </div>
          ) : (
            items.map((n) => {
              const href = n.target_type === "skin"
                ? `/skin/${encodeURIComponent(n.target_id)}`
                : "/favorites";
              return (
                <Link
                  key={n.id}
                  to={href}
                  onClick={() => { if (!n.read) markOne(n.id); setOpen(false); }}
                  className={`flex gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors ${!n.read ? "bg-[#E4AE39]/[0.04]" : ""}`}
                  data-testid={`notif-${n.id}`}
                >
                  {n.snapshot?.image ? (
                    <img src={n.snapshot.image} alt="" className="w-12 h-12 object-contain shrink-0" />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-white/5 shrink-0">
                      <Package2 className="w-5 h-5 text-[#555]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#E4AE39] shrink-0" />}
                      <div className="text-xs font-medium truncate text-[#E0E0E0]">{n.title}</div>
                    </div>
                    <div className="text-[11px] text-[#8A8A8A] mt-0.5 leading-snug">{n.body}</div>
                    <div className="text-[9px] text-[#555] font-mono mt-1">{timeAgo(n.created_at)}</div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/10">
          <Link to="/favorites" onClick={() => setOpen(false)}
            className="text-[10px] uppercase tracking-widest text-[#E4AE39] hover:text-[#F5C75A]">
            View my favourites →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
