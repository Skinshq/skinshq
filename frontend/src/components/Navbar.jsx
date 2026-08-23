import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaSteam } from "react-icons/fa";
import { LogOut, ChevronDown, Heart, ShieldAlert, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import api from "../lib/api";
import NotificationBell from "./NotificationBell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export default function Navbar() {
  const { user, logout, loginWithSteam, login } = useAuth();
  const { currency, changeCurrency, currencies } = useCurrency();
  const loc = useLocation();
  const navigate = useNavigate();
  const [showFallback, setShowFallback] = useState(false);
  const [sid, setSid] = useState("");
  const [signing, setSigning] = useState(false);

  const signInWithSteamId = async () => {
    setSigning(true);
    try {
      const { data } = await api.post("/auth/steamid", { steam_id: sid.trim() });
      await login(data.token);
      toast.success("Signed in as " + data.user.display_name);
      setShowFallback(false);
      navigate("/inventory");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid SteamID64");
    } finally {
      setSigning(false);
    }
  };

  const NavLink = ({ to, children, testid }) => (
    <Link
      to={to}
      data-testid={testid}
      className={`px-3 py-2 text-sm tracking-wide uppercase font-medium transition-colors ${
        loc.pathname === to
          ? "text-[#E4AE39]"
          : "text-[#8A8A8A] hover:text-[#E0E0E0]"
      }`}
    >
      {children}
    </Link>
  );

  return (
    <header
      className="sticky top-0 z-50 bg-black/70 backdrop-blur-xl border-b border-white/10"
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 group"
          data-testid="logo-link"
        >
          <div className="w-8 h-8 bg-[#E4AE39] rounded-sm flex items-center justify-center font-mono text-[#0A0A0A] text-lg font-black">
            $
          </div>
          <span className="font-display font-black text-xl tracking-tight">
            SKIN<span className="text-[#E4AE39]">.MRKT</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/market" testid="nav-market">Market</NavLink>
          <NavLink to="/live" testid="nav-live">Live Listings</NavLink>
          <NavLink to="/inventory" testid="nav-inventory">Your Inventory</NavLink>
          {user && <NavLink to="/orders" testid="nav-orders">Orders</NavLink>}
        </nav>

        <div className="flex items-center gap-3">
          {/* Currency selector */}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="currency-selector"
              className="flex items-center gap-1 px-3 py-2 text-sm font-mono tracking-wide bg-[#121212] border border-white/10 hover:border-[#E4AE39]/50 rounded-sm transition-colors"
            >
              {currency}
              <ChevronDown className="w-3 h-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-80 overflow-y-auto bg-[#121212] border-white/10 min-w-[220px]">
              {currencies.map((c) => (
                <DropdownMenuItem
                  key={c.code}
                  onSelect={() => changeCurrency(c.code)}
                  data-testid={`currency-${c.code}`}
                  className="font-mono text-sm cursor-pointer focus:bg-white/10"
                >
                  <span className="w-10 text-[#E4AE39]">{c.code}</span>
                  <span className="text-[#8A8A8A] text-xs ml-2">{c.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {user ? (
            <>
              <NotificationBell />
              <Link
                to="/favorites"
                data-testid="nav-favorites"
                className={`flex items-center justify-center w-9 h-9 rounded-sm border transition-colors ${
                  loc.pathname === "/favorites"
                    ? "bg-[#EB4B4B]/10 border-[#EB4B4B]/50 text-[#EB4B4B]"
                    : "bg-[#121212] border-white/10 hover:border-[#EB4B4B]/40 hover:text-[#EB4B4B] text-[#E0E0E0]"
                }`}
                title="Favourites"
              >
                <Heart className={`w-4 h-4 ${loc.pathname === "/favorites" ? "fill-current" : ""}`} />
              </Link>
              <DropdownMenu>
              <DropdownMenuTrigger
                data-testid="user-menu-trigger"
                className="flex items-center gap-2 px-3 py-1.5 bg-[#121212] border border-white/10 hover:border-[#E4AE39]/50 rounded-sm transition-colors"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="w-6 h-6 rounded-sm" />
                ) : (
                  <div className="w-6 h-6 bg-[#1c1c1c] rounded-sm" />
                )}
                <span className="text-sm max-w-[120px] truncate">{user.display_name}</span>
                {user.is_admin && (
                  <span className="text-[9px] font-mono bg-[#E4AE39]/15 text-[#E4AE39] px-1.5 py-0.5 rounded-sm uppercase tracking-widest">Admin</span>
                )}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#121212] border-white/10">
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/me" data-testid="menu-member-panel">
                    <UserIcon className="w-4 h-4 mr-2" /> Member panel
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/inventory" data-testid="menu-inventory">My Inventory</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/orders" data-testid="menu-orders">My Orders</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/favorites" data-testid="menu-favorites">
                    <Heart className="w-4 h-4 mr-2 text-[#EB4B4B]" /> Favourites
                  </Link>
                </DropdownMenuItem>
                {user.is_admin && (
                  <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                    <Link to="/admin" data-testid="menu-admin">
                      <ShieldAlert className="w-4 h-4 mr-2 text-[#E4AE39]" /> Admin panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onSelect={logout}
                  data-testid="menu-logout"
                  className="cursor-pointer text-[#EB4B4B] focus:bg-[#EB4B4B]/10"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                data-testid="steam-login-button"
                className="flex items-center gap-2 bg-[#171A21] text-[#E0E0E0] border border-[#2A475E] hover:bg-[#2A475E] transition-colors rounded-sm px-4 py-2 text-sm font-medium"
              >
                <FaSteam className="w-4 h-4" /> Sign in with Steam
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#121212] border-white/10 min-w-[240px]">
                <DropdownMenuItem onSelect={loginWithSteam} data-testid="signin-openid"
                  className="cursor-pointer focus:bg-white/10 flex flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-medium">Steam OpenID (recommended)</span>
                  <span className="text-[10px] text-[#8A8A8A]">Login via steamcommunity.com</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowFallback(true); }} data-testid="signin-steamid"
                  className="cursor-pointer focus:bg-white/10 flex flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-medium">Sign in with SteamID64</span>
                  <span className="text-[10px] text-[#8A8A8A]">Fallback if Steam site is unreachable</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* SteamID64 fallback modal */}
          <Dialog open={showFallback} onOpenChange={setShowFallback}>
            <DialogContent className="bg-[#121212] border border-white/10 max-w-md rounded-sm" data-testid="steamid-modal">
              <DialogHeader>
                <DialogTitle className="font-display tracking-tight">Sign in with SteamID64</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-[#8A8A8A] leading-relaxed">
                  Paste your <strong className="text-[#E0E0E0]">SteamID64</strong> (17-digit number starting with 7656…). You can find yours at{" "}
                  <a href="https://steamid.io" target="_blank" rel="noreferrer" className="text-[#E4AE39] underline">steamid.io</a>
                  {" "}or on your Steam profile URL. Your CS2 inventory must be set to Public.
                </p>
                <input
                  value={sid}
                  onChange={(e) => setSid(e.target.value)}
                  data-testid="steamid-input"
                  placeholder="76561198000000000"
                  className="w-full bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] rounded-sm px-3 py-3 font-mono text-sm outline-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowFallback(false)}
                    className="px-4 py-2 text-sm text-[#8A8A8A] hover:text-white">Cancel</button>
                  <button onClick={signInWithSteamId} disabled={signing || !sid.trim()}
                    data-testid="steamid-submit"
                    className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-2 rounded-sm disabled:opacity-50">
                    {signing ? "Signing in…" : "Sign in"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
