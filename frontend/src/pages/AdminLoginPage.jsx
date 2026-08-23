import React, { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { ShieldAlert, Lock, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function AdminLoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user?.is_admin) return <Navigate to="/admin" replace />;
  if (!loading && user?.is_moderator) return <Navigate to="/mod" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Email and password required"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/login", { email: email.trim(), password });
      await login(data.token);
      const isAdmin = !!data.user?.is_admin;
      toast.success(isAdmin ? "Welcome, admin" : "Welcome, moderator");
      navigate(isAdmin ? "/admin" : "/mod");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md" data-testid="admin-login-page">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#E4AE39]/10 border border-[#E4AE39]/30 rounded-sm mb-4">
            <ShieldAlert className="w-6 h-6 text-[#E4AE39]" />
          </div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">
            Restricted Area
          </div>
          <h1 className="font-display font-black text-3xl tracking-tight">
            Staff sign in
          </h1>
          <p className="text-xs text-[#8A8A8A] mt-2">
            Enter your admin or moderator credentials. You'll be routed to the right panel automatically.
          </p>
        </div>

        <form onSubmit={onSubmit} className="bg-[#121212] border border-white/10 rounded-sm p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">
              Email
            </label>
            <div className="flex items-center gap-2 bg-[#0A0A0A] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2.5 transition-colors">
              <Mail className="w-4 h-4 text-[#555]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="admin-email"
                placeholder="admin@yourdomain.com"
                autoComplete="username"
                autoFocus
                className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1.5 block">
              Password
            </label>
            <div className="flex items-center gap-2 bg-[#0A0A0A] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2.5 transition-colors">
              <Lock className="w-4 h-4 text-[#555]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="admin-password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555] font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            data-testid="admin-submit"
            className="w-full flex items-center justify-center gap-2 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-4 py-3 rounded-sm text-xs uppercase tracking-widest transition-colors"
          >
            {submitting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing in…</>
            ) : (
              <>Sign in to admin</>
            )}
          </button>

          <div className="text-[10px] text-[#555] text-center font-mono pt-2 border-t border-white/5">
            Not an admin? <Link to="/" className="text-[#E4AE39] hover:underline">Back to marketplace</Link>
          </div>
        </form>

        <div className="mt-4 text-center text-[10px] font-mono text-[#555]">
          Sessions are logged with IP address for security audit.
        </div>
      </div>
    </div>
  );
}
