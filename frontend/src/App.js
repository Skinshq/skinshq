import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import Navbar from "@/components/Navbar";
import LandingPage from "@/pages/LandingPage";
import MarketplacePage from "@/pages/MarketplacePage";
import LiveListingsPage from "@/pages/LiveListingsPage";
import SkinDetailPage from "@/pages/SkinDetailPage";
import InventoryPage from "@/pages/InventoryPage";
import OrdersPage from "@/pages/OrdersPage";
import FavoritesPage from "@/pages/FavoritesPage";
import AdminPage from "@/pages/AdminPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancel from "@/pages/CheckoutCancel";
import SteamCallback from "@/pages/SteamCallback";

function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <FavoritesProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-[#0A0A0A] grain relative">
            <Navbar />
            <main className="relative z-10">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/market" element={<MarketplacePage />} />
                <Route path="/live" element={<LiveListingsPage />} />
                <Route path="/skin/:masterId" element={<SkinDetailPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route path="/auth/callback" element={<SteamCallback />} />
                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                <Route path="/checkout/cancel" element={<CheckoutCancel />} />
              </Routes>
            </main>
            <Toaster
              theme="dark"
              position="top-right"
              toastOptions={{
                style: {
                  background: "#121212",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#E0E0E0",
                  borderRadius: "2px",
                },
              }}
            />
          </div>
        </BrowserRouter>
        </FavoritesProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}

export default App;
