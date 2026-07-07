import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const CurrencyCtx = createContext(null);

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "RUB", symbol: "₽", label: "Russian Ruble" },
  { code: "KRW", symbol: "₩", label: "Korean Won" },
  { code: "MXN", symbol: "Mex$", label: "Mexican Peso" },
  { code: "TRY", symbol: "₺", label: "Turkish Lira" },
  { code: "ZAR", symbol: "R", label: "South African Rand" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
];

export function CurrencyProvider({ children }) {
  const [rates, setRates] = useState({ USD: 1 });
  const [currency, setCurrency] = useState(localStorage.getItem("cs2_currency") || "USD");

  useEffect(() => {
    api.get("/fx/rates")
      .then(({ data }) => setRates(data.rates || { USD: 1 }))
      .catch(() => setRates({ USD: 1 }));
  }, []);

  const changeCurrency = (code) => {
    localStorage.setItem("cs2_currency", code);
    setCurrency(code);
  };

  const convert = (usd) => {
    const r = rates[currency] || 1;
    return usd * r;
  };

  const format = (usd) => {
    const value = convert(usd);
    const c = CURRENCIES.find((x) => x.code === currency) || CURRENCIES[0];
    const rounded = currency === "JPY" || currency === "KRW"
      ? Math.round(value).toLocaleString()
      : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${c.symbol}${rounded}`;
  };

  return (
    <CurrencyCtx.Provider value={{ currency, changeCurrency, rates, convert, format, currencies: CURRENCIES }}>
      {children}
    </CurrencyCtx.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyCtx);
