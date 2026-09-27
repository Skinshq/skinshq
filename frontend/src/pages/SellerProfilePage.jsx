import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Lock, User, Loader2, ShieldCheck, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import SkinCard from "../components/SkinCard";

export default function SellerProfilePage() {
  const { steamId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/users/${steamId}/listings`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Failed to load seller profile"))
      .finally(() => setLoading(false));
  }, [steamId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E4AE39]" />
      </div>
    );
  }
  if (!data) return null;

  const { user, active_listings, active_count, sold_count } = data;
  const isPublic = user.profile_visibility === "public";

  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-12 py-10" data-testid="seller-profile-page">
      <Link to="/live" className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#8A8A8A] hover:text-[#E4AE39] font-mono mb-6">
        <ArrowLeft className="w-3 h-3" /> Back to live listings
      </Link>

      {/* Seller header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 bg-[#121212] border border-white/10 rounded-2xl mb-8">
        {isPublic && user.avatar ? (
          <img src={user.avatar} alt={user.display_name} className="w-20 h-20 rounded-full border-2 border-[#E4AE39]/40" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            {isPublic ? <User className="w-8 h-8 text-white/40" /> : <Lock className="w-8 h-8 text-[#8A8A8A]" />}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-black text-2xl tracking-tight">{user.display_name}</h1>
            {isPublic && user.is_verified && (
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[#2ECC71] font-mono">
                <ShieldCheck className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-mono text-[#8A8A8A] mt-1">
            {isPublic ? `Steam: ${user.steam_id}` : "Private seller — identity hidden"}
          </div>
          {isPublic && user.bio && (
            <div className="text-sm text-[#B0B0B0] mt-2 max-w-xl">{user.bio}</div>
          )}
          {isPublic && user.profile_url && (
            <a
              href={user.profile_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#E4AE39] hover:underline font-mono mt-3"
            >
              <ExternalLink className="w-3 h-3" /> Steam profile
            </a>
          )}
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <div className="font-display font-black text-2xl text-[#E4AE39]">{active_count}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">Listing{active_count === 1 ? "" : "s"}</div>
          </div>
          <div>
            <div className="font-display font-black text-2xl text-[#2ECC71]">{sold_count}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">Sold</div>
          </div>
        </div>
      </div>

      {/* Active listings grid */}
      <div className="text-[11px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-4">
        Active listings
      </div>
      {active_listings.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-xl text-[#555] text-sm">
          No active listings from this seller right now.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {active_listings.map((item, i) => (
            <div key={item.id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <SkinCard item={item} testid={`seller-listing-${item.id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
