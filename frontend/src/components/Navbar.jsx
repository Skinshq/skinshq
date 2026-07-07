import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FaSteam } from "react-icons/fa";
import { LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export default function Navbar() {
  const { user, logout, loginWithSteam } = useAuth();
  const { currency, changeCurrency, currencies } = useCurrency();
  const loc = useLocation();

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
          {user && <NavLink to="/inventory" testid="nav-inventory">Inventory</NavLink>}
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
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[#121212] border-white/10">
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/inventory" data-testid="menu-inventory">My Inventory</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/10">
                  <Link to="/orders" data-testid="menu-orders">My Orders</Link>
                </DropdownMenuItem>
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
          ) : (
            <button
              onClick={loginWithSteam}
              data-testid="steam-login-button"
              className="flex items-center gap-2 bg-[#171A21] text-[#E0E0E0] border border-[#2A475E] hover:bg-[#2A475E] transition-colors rounded-sm px-4 py-2 text-sm font-medium"
            >
              <FaSteam className="w-4 h-4" /> Sign in with Steam
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
