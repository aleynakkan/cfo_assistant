import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import FigmaDashboard from "./pages/FigmaDashboard";
import LoginView from "./pages/LoginView";
import Navbar from "./components/Navbar";
import InitialBalanceModal from "./components/InitialBalanceModal";
import ProfileSettingsModal from "./components/ProfileSettingsModal";
import AiChatPanel from "./components/AiChatPanel";
import ErrorToast from "./components/ErrorToast";
import { DataMatchModal } from "./DataMatchModal.jsx";
import tableStyles from "./components/DataTable.module.css";

import InsightCard from "./components/InsightCard";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

let CATEGORY_OPTIONS = [
  "POS_GELIRI",
  "EFT_TAHSILAT",
  "ONLINE_SATIS",
  "KIRA",
  "MAAS",
  "AKARYAKIT",
  "KARGO",
  "ELEKTRIK",
  "SU",
  "INTERNET",
  "VERGI",
  "SIGORTA",
  "OFIS_MALZEME",
  "DIGER_GELIR",
  "DIGER_GIDER",
];

// 🔹 API helper: Authorization header'ı otomatik ekle
async function apiFetch(path, options = {}, token) {
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}

function App() {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("auth_token") || "";
  });
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'data'
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [forecast, setForecast] = useState(null); // advanced forecast
  const [categorySummary, setCategorySummary] = useState([]); // kategori bazlı gelir/gider
  const [categoryForecast, setCategoryForecast] = useState([]); // kategori bazli 30g forecast
  const [fixedCosts, setFixedCosts] = useState([]); // sabit gider analizi
  const [cashPosition, setCashPosition] = useState(null); // başlangıç bakiyesi + tahmini nakit
  const [insights, setInsights] = useState([]); // dashboard insights
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false); // onboarding modal
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("last30");
  const [globalFilter, setGlobalFilter] = useState("all"); // 🔹 all | last30 | this_month

  // Matching Health states
  const [matchHealth, setMatchHealth] = useState(null);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [exceptionsKind, setExceptionsKind] = useState("overdue");
  const [exceptions, setExceptions] = useState([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);

  // CFO Profile state
  const [cfoProfile, setCfoProfile] = useState(null);

  // User Profile state
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem("user_name") || "Kevin";
  });
  const [showProfileSettingsModal, setShowProfileSettingsModal] = useState(false);

  // AI Chat Panel state (global floating panel)
  const [aiChatPanelOpen, setAiChatPanelOpen] = useState(false);

  // Global error toast
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("error");

  const showError = (message) => {
    setToastMessage(message);
    setToastType("error");
  };

  const showSuccess = (message) => {
    setToastMessage(message);
    setToastType("success");
  };

  // Logout islevi
  function handleLogout() {
    setToken("");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("ai_chat_messages");
    setSummary(null);
    setTransactions([]);
    setForecast(null);
    setCategorySummary([]);
    setCategoryForecast([]);
    setFixedCosts([]);
    setCashPosition(null);
    setInsights([]);
    setMatchHealth(null);
    setExceptions([]);
    setExceptionsOpen(false);
    setCfoProfile(null);
    setUserName("Kevin");
    localStorage.removeItem("user_name");
    setError(null);
    setView("dashboard");
  }

  // Kategorileri backend'ten yükle
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await apiFetch("/dashboard/meta/categories", {}, token);
        if (res.ok) {
          const categories = await res.json();
          CATEGORY_OPTIONS = categories;
        }
      } catch (e) {
        console.warn("Kategoriler backend'ten yüklenemedi, default kullaniliyor:", e);
      }
    }
    if (token) {
      loadCategories();
    }
  }, [token]);

  // 🔹 Artık opsiyonel bir parametre alıyor
  async function loadData(filterOverride, tokenOverride) {
    try {
      setLoading(true);
      setError(null);

      // tokenOverride varsa onu, yoksa component state'teki token'ı kullan
      const usedToken = tokenOverride || token;

      // 🔹 GLOBAL TARİH FİLTRESİ → start_date / end_date hesaplama
      let startDateParam = null;
      let endDateParam = null;

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      if (globalFilter === "last30") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startDateParam = d.toISOString().split("T")[0];
        endDateParam = todayStr;
      } else if (globalFilter === "this_month") {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        startDateParam = first.toISOString().split("T")[0];
        endDateParam = todayStr;
      } else {
        // "all" → null bırakalım, parametre eklemeyeceğiz
        startDateParam = null;
        endDateParam = null;
      }

  // hangi filtreyi kullanacagimizi belirle
      const effectiveFilter =
        filterOverride === undefined ? categoryFilter : filterOverride; 

      // 1) Summary
      let summaryUrl = `/dashboard/summary`;
      const sParams = [];
      if (startDateParam && endDateParam) {
        sParams.push(`start_date=${startDateParam}`, `end_date=${endDateParam}`);
      }
      if (sParams.length > 0) {
        summaryUrl += `?${sParams.join("&")}`;
      }

      const summaryRes = await apiFetch(summaryUrl, {}, usedToken);
      if (!summaryRes.ok) throw new Error("Summary alinamadi");
      const summaryData = await summaryRes.json();

      // 2) Transactions
      let txUrl = `/transactions`;
      const tParams = [];
      if (startDateParam && endDateParam) {
        tParams.push(`start_date=${startDateParam}`, `end_date=${endDateParam}`);
      }
      if (tParams.length > 0) {
        txUrl += `?${tParams.join("&")}`;
      }

      const txRes = await apiFetch(txUrl, {}, usedToken);
      if (!txRes.ok) throw new Error("Transactions alinamadi");
      const txData = await txRes.json();

    // 3) Advanced forecast (rutin + planned)
    let forecastData = null;
    try {
      const fRes = await apiFetch(
        `/dashboard/forecast-advanced-30-60-90`,
        {},
        usedToken
      );
      if (fRes.ok) {
        forecastData = await fRes.json();
      }
    } catch (e) {
      console.warn("Forecast endpoint erisilemedi:", e);
    }

    // 4) Kategori bazlı özet (globalFilter ile, summary ile aynı tarih aralığı)
    let categoryData = [];
    try {
      const query = globalFilter ? `?period=${globalFilter}` : "";
      const cRes = await apiFetch(
        `/dashboard/category-summary${query}`,
        {},
        usedToken
      );
      if (cRes.ok) {
        categoryData = await cRes.json();
      }
    } catch (e) {
      console.warn("Kategori özeti alınamadı:", e);
    }

        // 5) Kategori bazlı 30 günlük forecast
    let catForecast = [];
    try {
      const cfRes = await apiFetch(
        `/dashboard/category-forecast-30`,
        {},
        usedToken
      );
      if (cfRes.ok) {
        catForecast = await cfRes.json();
      }
    } catch (e) {
      console.warn("Kategori forecast alinamadi:", e);
    }

    // 6) Sabit gider analizi
    let fixedCostsData = [];
    try {
      const fcRes = await apiFetch(
        `/dashboard/fixed-costs-analysis`,
        {},
        usedToken
      );
      if (fcRes.ok) {
        fixedCostsData = await fcRes.json();
        console.log("✓ Fixed costs loaded:", fixedCostsData);
      } else {
        console.warn("Fixed costs response not ok:", fcRes.status);
        // Test data
        fixedCostsData = [
          { category: "KIRA", current_month: 15000, avg_monthly: 15000, change_percentage: 0, status: "normal" },
          { category: "MAAS", current_month: 25000, avg_monthly: 25000, change_percentage: 0, status: "normal" },
          { category: "ELEKTRIK", current_month: 3000, avg_monthly: 2800, change_percentage: 7.1, status: "normal" },
          { category: "INTERNET", current_month: 500, avg_monthly: 500, change_percentage: 0, status: "normal" },
        ];
      }
    } catch (e) {
      console.warn("Sabit gider analizi alinamadi:", e);
      // Test data
      fixedCostsData = [
        { category: "KIRA", current_month: 15000, avg_monthly: 15000, change_percentage: 0, status: "normal" },
        { category: "MAAS", current_month: 25000, avg_monthly: 25000, change_percentage: 0, status: "normal" },
        { category: "ELEKTRIK", current_month: 3000, avg_monthly: 2800, change_percentage: 7.1, status: "normal" },
        { category: "INTERNET", current_month: 500, avg_monthly: 500, change_percentage: 0, status: "normal" },
      ];
    }

    // 7) Nakit pozisyonu (başlangıç bakiyesi + tahmini nakit)
    let cashPositionData = null;
    try {
      const cpRes = await apiFetch(
        `/company/cash-position`,
        {},
        usedToken
      );
      if (cpRes.ok) {
        cashPositionData = await cpRes.json();
        console.log("? Cash position loaded:", cashPositionData);
      } else if (cpRes.status === 404) {
        // Baslangi� bakiyesi tanimli degil ? Modal a�
        console.warn("Initial balance not set - opening modal");
        setShowInitialBalanceModal(true);
      } else {
        console.warn("Cash position error:", cpRes.status);
      }
    } catch (e) {
      console.warn("Nakit pozisyonu alınamadı:", e);
    }

    // 8) Dashboard insights (yaklasan �demeler, anomaliler, vb.)
    // Not: Global dönem filtresinden bağımsız, her zaman last30 için göster
    try {
      const insRes = await apiFetch(
        `/dashboard/insights?period=last30`,
        {},
        usedToken
      );
      if (insRes.ok) {
        const insJson = await insRes.json();
        const insightsData = insJson.insights || [];
        setInsights(insightsData);
        console.log("✓ Insights loaded:", insightsData);
      } else {
        // Başarısızsa mevcut insights'i koru (wipe etme)
        console.warn("Insights yanıtı başarısız:", insRes.status);
      }
    } catch (e) {
      console.warn("Insights alınamadı:", e);
      // Hata durumunda mevcut insights'i koru
    }

    // 6) Matching health
    let mh = null;
    try {
      const mhRes = await apiFetch(
        `/dashboard/matching-health`,
        {},
        usedToken
      );
      if (mhRes.ok) {
        mh = await mhRes.json();
        setMatchHealth(mh);
        console.log("✓ Matching health loaded:", mh);
      }
    } catch(e) { 
      console.warn("Matching health alınamadı:", e); 
    }

    // 7) CFO Profile
    try {
      const cfRes = await apiFetch(
        `/dashboard/cfo-profile`,
        {},
        usedToken
      );
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        setCfoProfile(cfData);
        console.log("✓ CFO Profile loaded:", cfData);
      }
    } catch(e) {
      console.warn("CFO Profile alınamadı:", e);
    }

    setSummary(summaryData);
    setTransactions(txData);
    setForecast(forecastData);
    setCategorySummary(categoryData);
    setCategoryForecast(catForecast);
    setFixedCosts(fixedCostsData);
    setCashPosition(cashPositionData);
    } catch (err) {
      console.error(err);
      setError(err.message || "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }

  async function loadExceptions(kind) {
    try {
      setExceptionsLoading(true);
      const token = localStorage.getItem("auth_token") || "";
      
      // Modal açıldığında matchHealth'i de refresh et (güncel sayıları görmek için)
      const mhRes = await apiFetch(`/dashboard/matching-health`, {}, token);
      if (mhRes.ok) {
        const mh = await mhRes.json();
        setMatchHealth(mh);
        console.log("✓ MatchHealth refreshed:", mh);
      }
      
      const res = await apiFetch(`/dashboard/matching-exceptions?kind=${kind}`, {}, token);
      if (!res.ok) throw new Error("Exceptions alınamadı");
      const data = await res.json();
      setExceptions(data.items || []);
      setExceptionsKind(kind);
      
      // Debug: Sayıları karşılaştır
      console.log(`[DEBUG] ${kind} - matchHealth count vs exceptions count:`, {
        matchHealthCount: kind === "overdue" ? matchHealth?.unmatched_overdue : 
                         kind === "upcoming14" ? matchHealth?.unmatched_upcoming_14d : 
                         matchHealth?.partial_planned,
        exceptionsCount: data.items?.length || 0
      });
    } catch(e) {
      console.error(e);
      setExceptions([]);
    } finally {
      setExceptionsLoading(false);
    }
  }


  useEffect(() => {
    if (token) {
      loadData(undefined, token);
    }
  }, [token, globalFilter]);

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f5f5f5",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      {/* Token yoksa login ekranini göster */}
      {!token ? (
        <LoginView
          onLoginSuccess={(t) => {
            setToken(t);
            localStorage.setItem("auth_token", t);
            setView("dashboard");
          }}
        />
      ) : (
        <>
          {/* �st Bar / Navigation */}
          <Navbar 
            view={view} 
            setView={setView} 
            onLogout={handleLogout}
            onInitialBalance={() => setShowInitialBalanceModal(true)}
            onProfileSettings={() => setShowProfileSettingsModal(true)}
            onAiChatToggle={() => setAiChatPanelOpen(!aiChatPanelOpen)}
            userName={userName}
          />

          {/* Loading overlay when data is being fetched */}
          {loading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: 18,
              background: "white",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                border: "3px solid #e6e6e6",
                borderTop: "3px solid #2563eb",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <div style={{ fontWeight: 600 }}>Yükleniyor...</div>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <main style={{ padding: "18px", width: "100%", paddingTop: "82px", boxSizing: "border-box" }}>
        {view === "dashboard" ? (
          <FigmaDashboard
            summary={summary}
            cashPosition={cashPosition}
            matchHealth={matchHealth}
            fixedCosts={fixedCosts}
            insights={insights}
            userName={userName}
            token={token}
            onRefreshDashboard={loadData}
          />
        ) : (
          <DataManagementView
            transactions={transactions}
            loading={loading}
            error={error}
            onDataChanged={loadData}
            token={token}
          />
        )}
      </main>

      {/* Profil Ayarlari Modal (Profil + Baslangi� Bakiyesi) */}
      <ProfileSettingsModal
        isOpen={showProfileSettingsModal}
        onClose={() => setShowProfileSettingsModal(false)}
        currentName={userName}
        onNameChange={(newName) => {
          setUserName(newName);
          localStorage.setItem("user_name", newName);
        }}
        token={token}
        onInitialBalanceSuccess={() => loadData(undefined, token)}
        onError={showError}
      />

      {/* Global Floating AI Chat Panel */}
      {aiChatPanelOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "min(380px, calc(100% - 32px))",
            maxHeight: "min(600px, 80vh)",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            zIndex: 900,
          }}
        >
          {/* AI Chat Panel */}
          <div style={{ flex: 1, overflow: "auto" }}>
            <AiChatPanel token={token} onClose={() => setAiChatPanelOpen(false)} />
          </div>
        </div>
      )}

      {/* Global Error Toast */}
      <ErrorToast
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastMessage("")}
      />
      </>
      )}
    </div>
  );
}

/* --------- Dashboard: Görüntüleme + Advanced Forecast + Kategori Özeti --------- */

function DashboardView({
  summary,
  transactions,
  forecast,
  categorySummary,
  categoryForecast,
  fixedCosts,
  cashPosition,
  insights,
  categoryFilter,
  setCategoryFilter,
  globalFilter,
  setGlobalFilter,
  reload,
  loading,
  error,
  token,
  matchHealth,
  exceptionsOpen,
  setExceptionsOpen,
  exceptions,
  exceptionsLoading,
  exceptionsKind,
  loadExceptions,
  cfoProfile,
}) {
  // Transaction pagination state
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(10);

  // forecast breakdown hesaplama
  let plannedTotal30 = 0;
  let plannedTotal60 = 0;
  let plannedTotal90 = 0;

  if (forecast) {
    plannedTotal30 = forecast.planned_0_30;
    plannedTotal60 = forecast.planned_0_30 + forecast.planned_30_60;
    plannedTotal90 =
      forecast.planned_0_30 + forecast.planned_30_60 + forecast.planned_60_90;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: "16px",
        alignItems: "flex-start",
      }}
    >
      {/* Sol: Mevcut Dashboard İçeriği */}
      <div>
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <h1 style={{ margin: 0 }}>Dashboard</h1>

          <div style={{ fontSize: "var(--font-size-body)", display: "flex", alignItems: "center", gap: "8px" }}>
            <select
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
                fontSize: "14px",
                backgroundColor: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value="all">Tüm zamanlar</option>
              <option value="last30">Son 30 gün</option>
              <option value="this_month">Bu ay</option>
            </select>
          </div>
      </div>

      {loading && <p>Veriler yükleniyor...</p>}
      {error && <p style={{ color: "red" }}>Hata: {error}</p>}

      {summary && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          <SummaryCard title="Toplam Gelir" value={summary.total_income} />
          <SummaryCard title="Toplam Gider" value={summary.total_expense} />
          <SummaryCard
            title="Net Nakit Akışı (Gerçekleşen)"
            value={summary.net_cashflow}
            highlight
          />
        </div>
      )}

      {/* 🎯 INSIGHTS PANEL */}
      {insights && insights.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "24px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            border: "1px solid #e5e7eb",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <h2 style={{ margin: "0 0 20px 0", fontSize: "var(--font-size-h2)", color: "#1f2937", fontWeight: 700 }}>
            ⚡ Önemli Bulgular
          </h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              width: "100%",
            }}
            role="list"
            aria-label="Dashboard insights"
          >
            {insights.map((insight) => (
              <div key={insight.id} role="listitem">
                <InsightCard 
                  insight={insight} 
                  token={token} 
                  onRefresh={reload}
                />
              </div>
            ))}
          </div>
          {/* Performance note: If insights.length > 20, consider virtualization (react-window) */}
        </div>
      )}

      {/* Tahmini Nakit Pozisyonu */}
      {cashPosition && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "8px",
              padding: "16px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              flex: "1 1 200px",
              minWidth: "160px",
            }}
          >
            <div style={{ fontSize: "var(--font-size-helptext)", color: "#6b7280", marginBottom: "8px" }}>
              💰 Tahmini Nakit Pozisyonu
            </div>
            <div
              style={{
                fontSize: "var(--font-size-h1)",
                fontWeight: 700,
                color: cashPosition.estimated_cash >= 0 ? "#059669" : "#dc2626",
                marginBottom: "6px",
              }}
            >
              {Number(cashPosition.estimated_cash).toLocaleString("tr-TR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              TL
            </div>
            <div style={{ fontSize: "var(--font-size-helptext)", color: "#6b7280" }}>
              Başl: {Number(cashPosition.initial_balance).toLocaleString("tr-TR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              TL
              <br />({cashPosition.initial_balance_date})
            </div>
            
            {/* 30 Gün Karşilaştırması */}
            <div style={{ 
              marginTop: "12px", 
              paddingTop: "12px", 
              borderTop: "1px solid #e5e7eb",
              fontSize: "var(--font-size-helptext)",
              color: "#6b7280"
            }}>
              <div style={{ marginBottom: "4px" }}>
                <strong>30 gün öncesi:</strong> {Number(cashPosition.estimated_cash_30_days_ago).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} TL
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Advanced 30-60-90 Forecast (rutin + planli) */}
      {forecast && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <SummaryCard
            title="30 Günlük Net Nakit Tahmini"
            value={forecast.forecast_30}
          />
          <SummaryCard
            title="60 Günlük Net Nakit Tahmini"
            value={forecast.forecast_60}
          />
          <SummaryCard
            title="90 Günlük Net Nakit Tahmini"
            value={forecast.forecast_90}
          />
        </div>
      )}

      {forecast && (
        <div
          style={{
            marginBottom: "24px",
            fontSize: "var(--font-size-body)",
            color: "#4b5563",
            background: "white",
            borderRadius: "8px",
            padding: "12px 16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ marginBottom: "4px", fontWeight: 600 }}>
            Tahmin Ayrintisi (Rutin + Planli Nakit Akisi)
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            <li>
              Ortalama günlük net nakit:{" "}
              <strong>
                {Number(forecast.avg_daily_net).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
            </li>
            <li>
              30 gün: rutin{" "}
              <strong>
                {Number(forecast.routine_30).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
              , planli{" "}
              <strong>
                {Number(plannedTotal30).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
            </li>
            <li>
              60 gün: rutin{" "}
              <strong>
                {Number(forecast.routine_60).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
              , planli{" "}
              <strong>
                {Number(plannedTotal60).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
            </li>
            <li>
              90 gün: rutin{" "}
              <strong>
                {Number(forecast.routine_90).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
              , planlı{" "}
              <strong>
                {Number(plannedTotal90).toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                TL
              </strong>
            </li>
          </ul>
        </div>
      )}

      {/* Matching Health / Tutarlilik Kontrol Paneli */}
      {matchHealth && (
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            marginBottom: "24px",
          }}
        >
          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "var(--font-size-body)", fontWeight: 600 }}>
              ✍️ Eşleştirme Sağlığı / Kontrol Paneli
            </h2>
            <button
              onClick={() => {
                setExceptionsOpen(true);
                loadExceptions("overdue");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "none",
                background: "#3b82f6",
                color: "white",
                fontSize: "var(--font-size-helptext)",
                cursor: "pointer",
              }}
            >
              Incele ?
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "3px solid #10b981" }}>
              <div style={{ fontSize: "var(--font-size-helptext)", color: "#666", marginBottom: "4px" }}>Otomatik Eslesen</div>
              <div style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, color: "#10b981" }}>
                {matchHealth.auto_matched}
              </div>
            </div>

            <div style={{ background: "#eff6ff", padding: "12px", borderRadius: "6px", borderLeft: "3px solid #3b82f6" }}>
              <div style={{ fontSize: "var(--font-size-helptext)", color: "#666", marginBottom: "4px" }}>Manuel Eslesen</div>
              <div style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, color: "#3b82f6" }}>
                {matchHealth.manual_matched}
              </div>
            </div>
            <div style={{ background: "#fef3c7", padding: "12px", borderRadius: "6px", borderLeft: "3px solid #f59e0b" }}>
              <div style={{ fontSize: "var(--font-size-helptext)", color: "#666", marginBottom: "4px" }}>⏰ Vadesi Geçmiş</div>
              <div style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, color: "#f59e0b" }}>
                {matchHealth.unmatched_overdue}
              </div>
            </div>
            <div style={{ background: "#fce7f3", padding: "12px", borderRadius: "6px", borderLeft: "3px solid #ec4899" }}>
              <div style={{ fontSize: "var(--font-size-helptext)", color: "#666", marginBottom: "4px" }}>Yaklaşan 14 Gün</div>
              <div style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, color: "#ec4899" }}>
                {matchHealth.unmatched_upcoming_14d}
              </div>
            </div>

            <div style={{ background: "#f3e8ff", padding: "12px", borderRadius: "6px", borderLeft: "3px solid #a855f7" }}>
              <div style={{ fontSize: "var(--font-size-helptext)", color: "#666", marginBottom: "4px" }}>Kısmi Eşleştirme</div>
              <div style={{ fontSize: "var(--font-size-h2)", fontWeight: 700, color: "#a855f7" }}>
                {matchHealth.partial_planned}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exceptions Modal */}
      {exceptionsOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setExceptionsOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "8px",
              padding: "20px",
              maxWidth: "800px",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-size-body)", fontWeight: 600 }}>
                İstisnaları İncele {!exceptionsLoading && exceptions.length > 0 && `(${exceptions.length} kayıt)`}
              </h3>
              <button
                onClick={() => setExceptionsOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
              <button
                onClick={() => loadExceptions("overdue")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: exceptionsKind === "overdue" ? "2px solid #f59e0b" : "1px solid #ddd",
                  background: exceptionsKind === "overdue" ? "#fef3c7" : "white",
                  cursor: "pointer",
                  fontSize: "var(--font-size-helptext)",
                  fontWeight: 500,
                }}
              >
                Vadesi Geçmiş
              </button>
              <button
                onClick={() => loadExceptions("upcoming14")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: exceptionsKind === "upcoming14" ? "2px solid #ec4899" : "1px solid #ddd",
                  background: exceptionsKind === "upcoming14" ? "#fce7f3" : "white",
                  cursor: "pointer",
                  fontSize: "var(--font-size-helptext)",
                  fontWeight: 500,
                }}
              >
                Yaklaşan 14 Gün
              </button>
              <button
                onClick={() => loadExceptions("partial")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: exceptionsKind === "partial" ? "2px solid #a855f7" : "1px solid #ddd",
                  background: exceptionsKind === "partial" ? "#f3e8ff" : "white",
                  cursor: "pointer",
                  fontSize: "var(--font-size-helptext)",
                  fontWeight: 500,
                }}
              >
                Kısmi Eşleştirme
              </button>
            </div>

            {exceptionsLoading && <div style={{ textAlign: "center", color: "#666" }}>Yükleniyor...</div>}

            {!exceptionsLoading && exceptions.length === 0 && (
              <div style={{ textAlign: "center", color: "#999", padding: "20px" }}>
                İstisna bulunamadı ✓
              </div>
            )}

            {!exceptionsLoading && exceptions.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-helptext)" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Tarih</th>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Tür</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Tutar</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Eşleşen</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>Kalan</th>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "8px" }}>
                        {item.due_date ? new Date(item.due_date).toLocaleDateString("tr-TR") : "-"}
                      </td>
                      <td style={{ padding: "8px" }}>{item.type}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 500 }}>
                        {Number(item.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        {Number(item.settled_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", color: item.remaining_amount > 0 ? "#dc2626" : "#059669" }}>
                        {Number(item.remaining_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "8px" }}>
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: "3px",
                          fontSize: "10px",
                          fontWeight: 600,
                          background: item.status === "PARTIAL" ? "#f3e8ff" : "#fef3c7",
                          color: item.status === "PARTIAL" ? "#a855f7" : "#d97706",
                        }}>
                          {item.status === "OPEN" ? "Açık" : item.status === "PARTIAL" ? "ısmi" : item.status === "SETTLED" ? "Kapatıldı" : item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CFO Profili Kartı - HIDDEN */}

      {/* Sabit Gider Analizi */}
      {fixedCosts && fixedCosts.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ marginBottom: "12px" }}>📊 Sabit Gider Analizi</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            {fixedCosts.map((fc) => (
              <div
                key={fc.category}
                style={{
                  padding: "12px",
                  border: `2px solid ${
                    fc.status === "alert" ? "#ef4444" :
                    fc.status === "warning" ? "#f59e0b" :
                    "#d1d5db"
                  }`,
                  borderRadius: "6px",
                  background: fc.status === "alert" ? "#fef2f2" : fc.status === "warning" ? "#fffbeb" : "#f9fafb",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "6px", fontSize: "var(--font-size-body)" }}>
                  {fc.category}
                </div>
                <div style={{ fontSize: "var(--font-size-helptext)", marginBottom: "4px" }}>
                  <strong>Bu ay:</strong>{" "}
                  {Number(fc.current_month).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  TL
                </div>
                <div style={{ fontSize: "var(--font-size-helptext)", marginBottom: "4px" }}>
                  <strong>Ort. (diğer aylar):</strong>{" "}
                  {Number(fc.avg_monthly).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  TL
                </div>

                {fc.alert_message && (
                  <div
                    style={{
                      fontSize: "var(--font-size-helptext)",
                      padding: "6px",
                      background: "rgba(255,255,255,0.6)",
                      borderRadius: "4px",
                      color: fc.status === "alert" ? "#991b1b" : "#92400e",
                      fontWeight: 500,
                    }}
                  >
                    ⚠️ {fc.alert_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* İşlem Listesi */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginBottom: "12px" }}>İşlem Listesi</h2>
        {transactions.length === 0 ? (
          <p>Henüz kayıt bulunmuyor.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <Th>Tarih</Th>
                  <Th>Açıklama</Th>
                  <Th>Tutar</Th>
                  <Th>Yön</Th>
                  <Th>Kategori</Th>
                  <Th>Kaynak</Th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, visibleTransactionCount).map((tx) => (
                  <tr key={tx.id}>
                    <Td>{tx.date}</Td>
                    <Td>{tx.description}</Td>
                    <Td>
                      {Number(tx.amount).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Td>
                    <Td
                      style={{
                        color: tx.direction === "in" ? "green" : "red",
                      }}
                    >
                      {tx.direction === "in" ? "Giriş" : "Çıkış"}
                    </Td>
                    <Td>{tx.category || "-"}</Td>
                    <Td>{tx.source}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {transactions && transactions.length > visibleTransactionCount && (
          <div style={{ marginTop: "12px", textAlign: "center" }}>
            <button
              onClick={() => setVisibleTransactionCount(prev => prev + 10)}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #2563eb",
                background: "white",
                color: "#2563eb",
                fontSize: "14px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Daha Fazla Yükle ({transactions.length - visibleTransactionCount} kalan)
            </button>
          </div>
        )}
      </div>

      {/* Kategori Bazli Nakit Akisi */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "16px",
          marginTop: "24px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Kategori Bazli Nakit Akisi</h2>

        {(!categorySummary || categorySummary.length === 0) ? (
          <p>Henüz kategorize edilmiş veri bulunmuyor.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                marginTop: "12px",
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              
              <thead>
                <tr>
                  <Th>Kategori</Th>
                  <Th>Toplam Gelir</Th>
                  <Th>Toplam Gider</Th>
                  <Th>Net</Th>
                </tr>
              </thead>
              <tbody>
                {categorySummary.map((row) => (
                  <tr key={row.category}>
                    <Td>{row.category}</Td>
                    <Td>
                      {Number(row.total_in).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td>
                      {Number(row.total_out).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td
                      style={{
                        color:
                          row.net > 0 ? "green" : row.net < 0 ? "red" : "#111827",
                        fontWeight: 600,
                      }}
                    >
                      {Number(row.net).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                  </tr>
                ))}
                {/* Toplam satiri */}
                {categorySummary.length > 0 && (
                  <tr style={{ borderTop: "2px solid #ddd", fontWeight: 600 }}>
                    <Td style={{ fontWeight: 600 }}>TOPLAM</Td>
                    <Td style={{ fontWeight: 600 }}>
                      {Number(
                        categorySummary.reduce((sum, row) => sum + (row.total_in || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td style={{ fontWeight: 600 }}>
                      {Number(
                        categorySummary.reduce((sum, row) => sum + (row.total_out || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td style={{ fontWeight: 600, color: "blue" }}>
                      {Number(
                        categorySummary.reduce((sum, row) => sum + (row.net || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
            {/* Kategori Bazlı 30 Günlük Tahmin */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "16px",
          marginTop: "24px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        }}
      >
        <h2 style={{ marginBottom: "12px" }}>
          Kategori Bazlı 30 Günlük Tahmin (Gerçekleşen Trendlere Göre)
        </h2>

        {(!categoryForecast || categoryForecast.length === 0) ? (
          <p>Forecast için yeterli veri bulunmuyor.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr>
                  <Th>Kategori</Th>
                  <Th>30g Tahmini Gelir</Th>
                  <Th>30g Tahmini Gider</Th>
                  <Th>30g Net</Th>
                </tr>
              </thead>
              <tbody>
                {categoryForecast.map((row) => (
                  <tr key={row.category}>
                    <Td>{row.category}</Td>
                    <Td>
                      {Number(row.forecast_30_in).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td>
                      {Number(row.forecast_30_out).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td
                      style={{
                        color:
                          row.net_30 > 0
                            ? "green"
                            : row.net_30 < 0
                            ? "red"
                            : "#111827",
                        fontWeight: 600,
                      }}
                    >
                      {Number(row.net_30).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                  </tr>
                ))}
                {/* Toplam satiri */}
                {categoryForecast.length > 0 && (
                  <tr style={{ borderTop: "2px solid #ddd", fontWeight: 600 }}>
                    <Td style={{ fontWeight: 600 }}>TOPLAM</Td>
                    <Td style={{ fontWeight: 600 }}>
                      {Number(
                        categoryForecast.reduce((sum, row) => sum + (row.forecast_30_in || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td style={{ fontWeight: 600 }}>
                      {Number(
                        categoryForecast.reduce((sum, row) => sum + (row.forecast_30_out || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                    <Td style={{ fontWeight: 600, color: "blue" }}>
                      {Number(
                        categoryForecast.reduce((sum, row) => sum + (row.net_30 || 0), 0)
                      ).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      TL
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* Sag: Chat Panel */}
      <div>
        <AiChatPanel token={token} />
      </div>
    </div>
  );
}

/* --------- Veri Yönetimi: CSV + Manuel Ekle + Sil + Kategori + Planlı Nakit --------- */

function DataManagementView({ onDataChanged, transactions, loading, error, token }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [plannedUploading, setPlannedUploading] = useState(false);
  const [plannedUploadMessage, setPlannedUploadMessage] = useState("");
  const [akbankUploading, setAkbankUploading] = useState(false);
  const [akbankUploadMessage, setAkbankUploadMessage] = useState("");
  const [enparaUploading, setEnparaUploading] = useState(false);
  const [enparaUploadMessage, setEnparaUploadMessage] = useState("");
  const [yapikrediUploading, setYapikrediUploading] = useState(false);
  const [yapikrediUploadMessage, setYapikrediUploadMessage] = useState("");

  // Matching Health states
  const [matchHealth, setMatchHealth] = useState(null);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [exceptionsKind, setExceptionsKind] = useState("overdue");
  const [exceptions, setExceptions] = useState([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);

  const [form, setForm] = useState({
    date: "",
    description: "",
    amount: "",
    direction: "in",
  });
  const [formMessage, setFormMessage] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Planned cashflow state
  const [plannedForm, setPlannedForm] = useState({
    type: "INVOICE",
    direction: "out",
    amount: "",
    due_date: "",
    counterparty: "",
    reference_no: "",
  });
  const [plannedSubmitting, setPlannedSubmitting] = useState(false);
  const [plannedMessage, setPlannedMessage] = useState("");
  const [plannedItems, setPlannedItems] = useState([]);
  const [plannedLoading, setPlannedLoading] = useState(false);
  const [plannedError, setPlannedError] = useState(null);

  // Matching UI state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [activePlanned, setActivePlanned] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  const [matchAmount, setMatchAmount] = useState("");
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");
  const [plannedMatchesOpen, setPlannedMatchesOpen] = useState(false);
  const [plannedMatches, setPlannedMatches] = useState([]);
  const [plannedMatchesLoading, setPlannedMatchesLoading] = useState(false);

  // Sorting state
  const [plannedSortBy, setPlannedSortBy] = useState("due_date");
  const [plannedSortOrder, setPlannedSortOrder] = useState("desc"); // 'asc' | 'desc'
  const [transactionSortBy, setTransactionSortBy] = useState("date");
  const [transactionSortOrder, setTransactionSortOrder] = useState("desc"); // 'asc' | 'desc'

  // New UI state
  const [activeTab, setActiveTab] = useState("islem"); // 'islem' | 'planli'
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [selectedPlanned, setSelectedPlanned] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [bankUploadModalOpen, setBankUploadModalOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState("akbank"); // 'akbank' | 'enpara' | 'yapikredi'
  const [bankUploadFile, setBankUploadFile] = useState(null);
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [manualEntryType, setManualEntryType] = useState("transaction"); // "transaction" or "planned"

  useEffect(() => {
    loadPlannedItems();
    loadMatchHealth();
  }, []);

  function loadMatchHealth() {
    async function fetchMatchHealth() {
      try {
        const token = localStorage.getItem("auth_token") || "";
        const res = await apiFetch(`/dashboard/matching-health`, {}, token);
        if (res.ok) {
          const mh = await res.json();
          setMatchHealth(mh);
        } else {
          console.warn("Matching health yüklenemedi");
        }
      } catch (e) {
        console.warn("Matching health hatası:", e);
      }
    }
    fetchMatchHealth();
  }

  function authHeaders() {
    const t = localStorage.getItem("auth_token") || "";
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async function loadPlannedItems() {
    try {
      setPlannedLoading(true);
      setPlannedError(null);
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/planned`, {}, token);
      if (!res.ok) {
        throw new Error("Planli nakit kayıtları alınamadı");
      }
      const data = await res.json();
      setPlannedItems(data);
    } catch (err) {
      console.error(err);
      setPlannedError(err.message || "Bilinmeyen hata");
    } finally {
      setPlannedLoading(false);
    }
  }

  // Toggle row selection helper for transactions
  const toggleTransactionSelection = (txId) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(txId)) {
      newSelected.delete(txId);
    } else {
      newSelected.add(txId);
    }
    setSelectedTransactions(newSelected);
  };

  // Toggle row selection helper for planned items
  const togglePlannedSelection = (itemId) => {
    const newSelected = new Set(selectedPlanned);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedPlanned(newSelected);
  };

  async function deleteSelectedTransactions() {
    if (selectedTransactions.size === 0) return;
    if (!window.confirm(`${selectedTransactions.size} islemi silmek istediginizden emin misiniz?`)) return;

    setDeleting(true);
    try {
      for (const id of selectedTransactions) {
        await fetch(`${API_BASE}/transactions/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      }
      setSelectedTransactions(new Set());
      onDataChanged?.();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme isleminde hata olustu");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelectedPlanned() {
    if (selectedPlanned.size === 0) return;
    if (!window.confirm(`${selectedPlanned.size} plani silmek istediginizden emin misiniz?`)) return;

    setDeleting(true);
    try {
      for (const id of selectedPlanned) {
        await fetch(`${API_BASE}/planned/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      }
      setSelectedPlanned(new Set());
      loadPlannedItems();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme isleminde hata olustu");
    } finally {
      setDeleting(false);
    }
  }

  async function openMatchModal(item) {
    setActivePlanned(item);
    setSelectedTx(null);
    setMatchAmount("");
    setMatchMessage("");
    setSuggestions([]);
    setSuggestionsError(null);
    setMatchModalOpen(true);

    try {
      setSuggestionsLoading(true);
      const res = await fetch(`${API_BASE}/planned/${item.id}/match-suggestions`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Öneriler alınamadı");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setSuggestionsError(e.message);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function closeMatchModal() {
    setMatchModalOpen(false);
    setSelectedPlanned(new Set());
  }

  async function confirmMatch() {
    if (!activePlanned || !selectedTx) {
      setMatchMessage("Lütfen bir işlem seçin.");
      return;
    }
    if (!matchAmount) {
      setMatchMessage("Lütfen eşleşme tutarını girin.");
      return;
    }

    try {
      setMatchSubmitting(true);
      setMatchMessage("");

      const res = await fetch(`${API_BASE}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          planned_item_id: activePlanned.id,
          transaction_id: selectedTx.transaction_id,
          matched_amount: Number(matchAmount),
          match_type: "MANUAL",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Eslestirme basarisiz");

      // Update activePlanned state with new values from response
      setActivePlanned(prev => ({
        ...prev,
        settled_amount: data.settled_amount,
        remaining_amount: data.remaining_amount,
        status: data.planned_status,
      }));

      setMatchMessage(
        `Eslestirildi. Status: ${data.planned_status}, Remaining: ${Number(
          data.remaining_amount
        ).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      );

      await loadPlannedItems();
      if (onDataChanged) onDataChanged();

      if (String(data.planned_status).toUpperCase() === "SETTLED") {
        closeMatchModal();
      }
    } catch (e) {
      setMatchMessage(`Hata: ${e.message}`);
    } finally {
      setMatchSubmitting(false);
    }
  }

  async function openPlannedMatches(item) {
    setActivePlanned(item);
    setPlannedMatches([]);
    setPlannedMatchesOpen(true);

    try {
      setPlannedMatchesLoading(true);
      const res = await fetch(`${API_BASE}/planned/${item.id}/matches`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Eslesmeler alinamadi");
      const data = await res.json();
      setPlannedMatches(data.matches || []);
    } catch (e) {
      setPlannedMatches([{ error: e.message }]);
    } finally {
      setPlannedMatchesLoading(false);
    }
  }

  // Sort fonksiyonları
  function togglePlannedSort(field) {
    if (plannedSortBy === field) {
      setPlannedSortOrder(plannedSortOrder === "asc" ? "desc" : "asc");
    } else {
      setPlannedSortBy(field);
      setPlannedSortOrder("asc");
    }
  }

  function toggleTransactionSort(field) {
    if (transactionSortBy === field) {
      setTransactionSortOrder(transactionSortOrder === "asc" ? "desc" : "asc");
    } else {
      setTransactionSortBy(field);
      setTransactionSortOrder("asc");
    }
  }

  // Sorted items
  const sortedPlannedItems = [...plannedItems].sort((a, b) => {
    let aVal = a[plannedSortBy];
    let bVal = b[plannedSortBy];
    
    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";
    
    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (aVal < bVal) return plannedSortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return plannedSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const sortedTransactions = [...transactions].sort((a, b) => {
    let aVal = a[transactionSortBy];
    let bVal = b[transactionSortBy];
    
    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";
    
    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (aVal < bVal) return transactionSortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return transactionSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  async function handleUpload(e) {
    e.preventDefault();
    setUploadMessage("");

    const fileInput = e.target.elements.file;
    if (!fileInput.files || fileInput.files.length === 0) {
      setUploadMessage("Lütfen bir CSV dosyası seçin.");
      return;
    }

    const file = fileInput.files[0];
    
    // Basit CSV içerik validasyonu (tarih kontrolü)
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      const lines = content.split('\n');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let hasDateError = false;
      
      // CSV satırlarını kontrol et (header hariç)
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const cols = lines[i].split(',');
        if (cols.length > 0) {
          const dateStr = cols[0].trim();
          try {
            const rowDate = new Date(dateStr);
            if (rowDate > today) {
              setUploadMessage(`Tarih hatası (Satır ${i}): Tarih bugünün tarihinden sonra olamaz.`);
              hasDateError = true;
              break;
            }
          } catch (e) {
            // Tarih parse hatası, backend'e bırak
          }
        }
      }
      
      if (hasDateError) return;
      
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("auth_token") || "";

      try {
        setUploading(true);
        const res = await apiFetch(`/transactions/upload-csv`, {
          method: "POST",
          body: formData,
        }, token);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Yükleme başarısız");
        }

        const data = await res.json();
        setUploadMessage(
          `Yükleme tamamlandı. Yeni eklenen: ${data.inserted}${
            data.duplicates ? `, mükerrer: ${data.duplicates}` : ""
          }${
            data.errors && data.errors.length > 0
              ? `, hatalı satır: ${data.errors.length}`
              : ""
          }`
        );
        e.target.reset();

        if (onDataChanged) {
          onDataChanged();
        }
      } catch (err) {
        console.error(err);
        setUploadMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
      } finally {
        setUploading(false);
      }
    };
    
    reader.readAsText(file);
  }

  async function handlePlannedUpload(e) {
    e.preventDefault();
    setPlannedUploadMessage("");

    const fileInput = e.target.elements.plannedFile;
    if (!fileInput.files || fileInput.files.length === 0) {
      setPlannedUploadMessage("Lütfen bir CSV dosyası seçin.");
      return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("auth_token") || "";

    try {
      setPlannedUploading(true);
      const res = await apiFetch(`/planned/upload-csv`, {
        method: "POST",
        body: formData,
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Yükleme başarısız");
      }

      const data = await res.json();
      setPlannedUploadMessage(
        `Yükleme tamamlandı. Yeni eklenen: ${data.inserted}${
          data.errors && data.errors.length > 0
            ? `, hatalı satır: ${data.errors.length}`
            : ""
        }`
      );
      e.target.reset();

      await loadPlannedItems();

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setPlannedUploadMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setPlannedUploading(false);
    }
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setFormMessage("");

    if (!form.date || !form.description || !form.amount) {
      setFormMessage("Lütfen tüm alanları doldurun.");
      return;
    }

    // Tarih validasyonu - tarih bugünden sonra olamaz
    const selectedDate = new Date(form.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate > today) {
      setFormMessage("Tarih bugünün tarihinden sonra olamaz.");
      return;
    }

    try {
      setFormSubmitting(true);
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          amount: Number(form.amount),
          direction: form.direction,
        }),
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Kayıt eklenemedi");
      }

      setFormMessage("Kayıt başarıyla eklendi.");
      setForm({
        date: "",
        description: "",
        amount: "",
        direction: "in",
      });

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setFormMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete(txId) {
    if (!window.confirm("Bu islemi silmek istediginizden emin misiniz?")) {
      return;
    }

    try {
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/transactions/${txId}`, {
        method: "DELETE",
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Silme islemi basarisiz");
      }

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      alert(`Silme hatası: ${err.message || "Bilinmeyen hata"}`);
    }
  }

  async function handleDeletePlanned(plannedId) {
    if (!window.confirm("Bu planli nakit kaydini silmek istediginizden emin misiniz?")) {
      return;
    }

    try {
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/planned/${plannedId}`, {
        method: "DELETE",
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Silme islemi basarisiz");
      }

      // Local state'i hemen g�ncelle (UI'de g�r�nmesi i�in)
      setPlannedItems(plannedItems.filter(item => item.id !== plannedId));

      // Ardindan backend'ten reload et
      await loadPlannedItems();

      // Dashboard'u da refresh et (summary vs etkilenebilir)
      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      alert(`Silme hatasi: ${err.message || "Bilinmeyen hata"}`);
      // Error durumunda local state reset et
      await loadPlannedItems();
    }
  }

  async function handleCategoryChange(txId, newCategory) {
    try {
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/transactions/${txId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Kategori güncellenemedi");
      }

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      alert(`Kategori güncellemme hatası: ${err.message || "Bilinmeyen hata"}`);
    }
  }

  async function handleAkbankUpload(e) {
    e.preventDefault();
    setAkbankUploadMessage("");

    const fileInput = e.target.elements.akbankFile;
    if (!fileInput.files || fileInput.files.length === 0) {
      setAkbankUploadMessage("Lütfen bir Excel dosyası seçin.");
      return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("auth_token") || "";

    try {
      setAkbankUploading(true);
      const data = await apiFetch(`/transactions/upload-akbank-excel`, {
        method: "POST",
        body: formData,
      }, token);

      console.log("Akbank Upload Response:", data);
      if (data.errors && data.errors.length > 0) {
        console.log("First 5 errors:", data.errors.slice(0, 5));
      }
      setAkbankUploadMessage(
        `Yükleme tamamlandı. Yeni eklenen: ${data.inserted}${
          data.duplicates ? `, mükerrer: ${data.duplicates}` : ""
        }${
          data.errors && data.errors.length > 0
            ? `, hatalı satır: ${data.errors.length}`
            : ""
        }`
      );
      e.target.reset();

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setAkbankUploadMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setAkbankUploading(false);
    }
  }

  async function handleEnparaUpload(e) {
    e.preventDefault();
    setEnparaUploadMessage("");

    const fileInput = e.target.elements.enparaFile;
    if (!fileInput.files || fileInput.files.length === 0) {
      setEnparaUploadMessage("Lütfen bir Excel dosyası seçin.");
      return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("auth_token") || "";

    try {
      setEnparaUploading(true);
      const data = await apiFetch(`/transactions/upload-enpara-excel`, {
        method: "POST",
        body: formData,
      }, token);

      let msg = `Yükleme tamamlandı. Yeni eklenen: ${data.inserted}${
        data.duplicates ? `, mükerrer: ${data.duplicates}` : ""
      }${
        data.errors && data.errors.length > 0
          ? `, hatalı satır: ${data.errors.length}`
          : ""
      }`;
      
      if (data.errors && data.errors.length > 0) {
        const errorStrings = data.errors.map(e => 
          typeof e === 'string' ? e : JSON.stringify(e)
        );
        msg += "\n\nHatalar:\n" + errorStrings.slice(0, 5).join("\n");
        if (data.errors.length > 5) {
          msg += `\n... ve ${data.errors.length - 5} hata daha`;
        }
      }
      
      setEnparaUploadMessage(msg);
      e.target.reset();

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setEnparaUploadMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setEnparaUploading(false);
    }
  }

  async function handleYapikrediUpload(e) {
    e.preventDefault();
    setYapikrediUploadMessage("");

    const fileInput = e.target.elements.yapikrediFile;
    if (!fileInput.files || fileInput.files.length === 0) {
      setYapikrediUploadMessage("Lütfen bir Excel dosyası seçin.");
      return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("auth_token") || "";

    try {
      setYapikrediUploading(true);
      const res = await apiFetch(`/transactions/upload-yapikredi-excel`, {
        method: "POST",
        body: formData,
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Yükleme başarısız");
      }

      const data = await res.json();
      let msg = `Yükleme tamamlandı. Yeni eklenen: ${data.inserted}${
        data.duplicates ? `, mükerrer: ${data.duplicates}` : ""
      }${
        data.errors && data.errors.length > 0
          ? `, hatali satir: ${data.errors.length}`
          : ""
      }`;
      
      if (data.errors && data.errors.length > 0) {
        const errorStrings = data.errors.map(e => 
          typeof e === 'string' ? e : JSON.stringify(e)
        );
        msg += "\n\nHatalar:\n" + errorStrings.slice(0, 5).join("\n");
        if (data.errors.length > 5) {
          msg += `\n... ve ${data.errors.length - 5} hata daha`;
        }
      }
      
      setYapikrediUploadMessage(msg);
      e.target.reset();

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setYapikrediUploadMessage(`Hata: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setYapikrediUploading(false);
    }
  }

  async function handlePlannedSubmit(e) {
    e.preventDefault();
    setPlannedMessage("");

    if (!plannedForm.due_date || !plannedForm.amount) {
      setPlannedMessage("Lütfen en az vade ve tutar alanlarını doldurun.");
      return;
    }

    try {
      setPlannedSubmitting(true);
      const token = localStorage.getItem("auth_token") || "";
      const res = await apiFetch(`/planned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: plannedForm.type,
          direction: plannedForm.direction,
          amount: Number(plannedForm.amount),
          due_date: plannedForm.due_date,
          counterparty: plannedForm.counterparty || null,
          reference_no: plannedForm.reference_no || null,
        }),
      }, token);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Planlı nakit kaydı eklenemedi");
      }

      setPlannedMessage("Planlı nakit kaydı eklendi.");
      setPlannedForm({
        type: "INVOICE",
        direction: "out",
        amount: "",
        due_date: "",
        counterparty: "",
        reference_no: "",
      });

      await loadPlannedItems();

      if (onDataChanged) {
        onDataChanged();
      }
    } catch (err) {
      console.error(err);
      setPlannedMessage(
        `Planlı nakit ekleme hatası: ${err.message || "Bilinmeyen hata"}`
      );
    } finally {
      setPlannedSubmitting(false);
    }
  }

  return (
    <div style={{ width: "100%", boxSizing: "border-box" }}>
      {/* Hero Card - Veri Yukle */}
      <div
        style={{
          background: "linear-gradient(135deg, #dc0005 0%, #a00003 100%)",
          borderRadius: "12px",
          padding: "32px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 4px 12px rgba(220, 0, 5, 0.15)",
          minHeight: "150px",
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={{ color: "white", margin: 0, fontSize: "var(--font-size-h1)", fontWeight: 600, marginBottom: "8px" }}>
            Veri Yukle
          </h1>
          <p style={{ color: "rgba(255, 255, 255, 0.85)", margin: 0, fontSize: "14px" }}>
            Excel veya manuel olarak verilerinizi sisteme ekleyin
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => {
              setBankUploadModalOpen(true);
            }}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "white",
              color: "#0d1b1e",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => e.target.style.opacity = "0.9"}
            onMouseLeave={(e) => e.target.style.opacity = "1"}
          >
            Excel Yükle
          </button>
          <button
            onClick={() => {
              setManualEntryModalOpen(true);
              setManualEntryType("transaction");
            }}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "2px solid white",
              background: "transparent",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => e.target.style.background = "rgba(255, 255, 255, 0.1)"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}
          >
            Manuel Ekle
          </button>
        </div>
      </div>

      {/* Search and Filter Bar - TEMPORARILY DISABLED */}
      {/* <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, display: "flex", gap: "12px" }}>
          <input
            type="text"
            placeholder="Ara..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              background: "white",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#0d1b1e",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Filter
          </button>
          <button
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#0d1b1e",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Export
          </button>
        </div>
      </div> */}

      {/* Tab Menu */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          borderBottom: "2px solid #f3f4f6",
          marginBottom: "24px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={() => {
            setActiveTab("islem");
            setCurrentPage(1);
          }}
          style={{
            padding: "12px 0",
            border: "none",
            background: "transparent",
            color: activeTab === "islem" ? "#0d1b1e" : "#6b7280",
            fontSize: "14px",
            fontWeight: activeTab === "islem" ? 600 : 500,
            cursor: "pointer",
            borderBottom: activeTab === "islem" ? "3px solid #dc0005" : "transparent",
            transition: "all 0.2s",
            marginBottom: "-2px",
          }}
        >
          Islem Listesi
        </button>
        <button
          onClick={() => {
            setActiveTab("planli");
            setCurrentPage(1);
          }}
          style={{
            padding: "12px 0",
            border: "none",
            background: "transparent",
            color: activeTab === "planli" ? "#0d1b1e" : "#6b7280",
            fontSize: "14px",
            fontWeight: activeTab === "planli" ? 600 : 500,
            cursor: "pointer",
            borderBottom: activeTab === "planli" ? "3px solid #dc0005" : "transparent",
            transition: "all 0.2s",
            marginBottom: "-2px",
          }}
        >
          Planli Nakit Akisi Listesi
        </button>
      </div>


      {/* Transaction List Tab */}
      {activeTab === "islem" && (
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            marginBottom: "24px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {loading && <p>Veriler yükleniyor...</p>}
          {error && <p style={{ color: "red" }}>Hata: {error}</p>}

          {!loading && !error && (
            <>
              {/* ARIA live region for selection announcements */}
              <div aria-live="polite" aria-atomic="true" className={tableStyles.srOnly}>
                {selectedTransactions.size > 0 && `${selectedTransactions.size} transaction${selectedTransactions.size > 1 ? 's' : ''} selected`}
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "14px", color: "#656e77" }}>
                  {selectedTransactions.size} seçildi
                </span>
                <button
                  onClick={deleteSelectedTransactions}
                  disabled={deleting || selectedTransactions.size === 0}
                  style={{
                    padding: "8px 16px",
                    background: selectedTransactions.size > 0 ? "#dc0005" : "#d1d5db",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: selectedTransactions.size > 0 && !deleting ? "pointer" : "not-allowed",
                    opacity: selectedTransactions.size > 0 && !deleting ? 1 : 0.6,
                  }}
                >
                  {deleting ? "Siliniyor..." : "Sil"}
                </button>
              </div>
              {(!transactions || transactions.length === 0) ? (
                <p>Henüz kayıt bulunmuyor.</p>
              ) : (
                <div style={{ overflowX: "auto", width: "100%", boxSizing: "border-box", minWidth: 0, scrollbarGutter: "stable" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "14px",
                      tableLayout: "fixed",
                      minWidth: 0,
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <Th style={{ width: "24px", padding: "0 2px", textAlign: "center", minWidth: "24px" }}>
                          <input
                            type="checkbox"
                            checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTransactions(new Set(transactions.map(t => t.id)));
                              } else {
                                setSelectedTransactions(new Set());
                              }
                            }}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </Th>
                        <Th onClick={() => toggleTransactionSort("date")} style={{ cursor: "pointer", userSelect: "none", width: "70px", minWidth: "70px" }}>
                          Tarih {transactionSortBy === "date" && (transactionSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => toggleTransactionSort("description")} style={{ cursor: "pointer", userSelect: "none", width: "200px", minWidth: "200px" }}>
                          Açıklama {transactionSortBy === "description" && (transactionSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => toggleTransactionSort("direction")} style={{ cursor: "pointer", userSelect: "none", width: "55px", minWidth: "55px" }}>
                          Yön {transactionSortBy === "direction" && (transactionSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => toggleTransactionSort("amount")} style={{ cursor: "pointer", userSelect: "none", width: "85px", minWidth: "85px" }}>
                          Tutar {transactionSortBy === "amount" && (transactionSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => toggleTransactionSort("source")} style={{ cursor: "pointer", userSelect: "none", width: "95px", minWidth: "95px" }}>
                          Kaynak {transactionSortBy === "source" && (transactionSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th style={{ width: "150px", minWidth: "150px" }}>Kategori</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((tx) => (
                        <tr 
                          key={tx.id} 
                          role="row"
                          aria-selected={selectedTransactions.has(tx.id)}
                          tabIndex={0}
                          onClick={() => toggleTransactionSelection(tx.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleTransactionSelection(tx.id);
                            }
                          }}
                          className={`${tableStyles.tableRow} ${selectedTransactions.has(tx.id) ? tableStyles.tableRowSelected : ''}`}
                          style={{ borderBottom: "1px solid #000000" }}
                        >
                          <Td style={{ padding: "0 2px", textAlign: "center" }} role="gridcell">
                            <input
                              type="checkbox"
                              checked={selectedTransactions.has(tx.id)}
                              onChange={() => {
                                toggleTransactionSelection(tx.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                              aria-label={`Select transaction ${tx.description}`}
                            />
                          </Td>
                          <Td role="gridcell">{tx.date}</Td>
                          <Td role="gridcell">{tx.description}</Td>
                          <Td role="gridcell">
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "var(--font-size-helptext)",
                                fontWeight: 500,
                                background: tx.direction === "in" ? "#dcfce7" : "#fee2e2",
                                color: tx.direction === "in" ? "#166534" : "#991b1b",
                              }}
                            >
                              {tx.direction === "in" ? "Gelir" : "Gider"}
                            </span>
                          </Td>
                          <Td role="gridcell">
                            {Number(tx.amount).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Td>
                          <Td role="gridcell">{tx.source}</Td>
                          <Td role="gridcell" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={tx.category || ""}
                              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "var(--font-size-helptext)",
                                border: "1px solid #d1d5db",
                                background: "#f9fafb",
                                color: "#0d1b1e",
                                cursor: "pointer",
                              }}
                            >
                              {tx.direction === "in" ? (
                                <>
                                  <option value="POS Geliri">POS Geliri</option>
                                  <option value="EFT Tahsilat">EFT Tahsilat</option>
                                  <option value="DIGER_GELIR">DIGER_GELIR</option>
                                </>
                              ) : (
                                <>
                                  <option value="KIRA">KIRA</option>
                                  <option value="MAAS">MAAS</option>
                                  <option value="AKARYAKIT">AKARYAKIT</option>
                                  <option value="KARGO">KARGO</option>
                                  <option value="ELEKTRIK">ELEKTRIK</option>
                                  <option value="SU">SU</option>
                                  <option value="INTERNET">INTERNET</option>
                                  <option value="VERGI">VERGI</option>
                                  <option value="SIGORTA">SIGORTA</option>
                                  <option value="OFIS_MALZEME">OFIS_MALZEME</option>
                                  <option value="Banka">Banka</option>
                                  <option value="DIGER_GIDER">DIGER_GIDER</option>
                                </>
                              )}
                            </select>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!loading && !error && transactions && transactions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontSize: "var(--font-size-body)", color: "#6b7280" }}>
                    {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, transactions.length)} of {transactions.length} Pages
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: currentPage === 1 ? "default" : "pointer",
                        opacity: currentPage === 1 ? 0.5 : 1,
                        fontSize: "var(--font-size-helptext)",
                      }}
                    >
                      Önceki
                    </button>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {Array.from({ length: Math.ceil(transactions.length / pageSize) }).map((_, i) => (
                        <button
                          key={i + 1}
                          onClick={() => setCurrentPage(i + 1)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "4px",
                            border: currentPage === i + 1 ? "1px solid #dc0005" : "1px solid #e5e7eb",
                            background: currentPage === i + 1 ? "#dc0005" : "white",
                            color: currentPage === i + 1 ? "white" : "#0d1b1e",
                            cursor: "pointer",
                            fontSize: "var(--font-size-helptext)",
                            fontWeight: currentPage === i + 1 ? 600 : 400,
                          }}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(Math.min(Math.ceil(transactions.length / pageSize), currentPage + 1))}
                      disabled={currentPage === Math.ceil(transactions.length / pageSize)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: currentPage === Math.ceil(transactions.length / pageSize) ? "default" : "pointer",
                        opacity: currentPage === Math.ceil(transactions.length / pageSize) ? 0.5 : 1,
                        fontSize: "var(--font-size-helptext)",
                      }}
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Planned Cashflow List Tab */}
      {activeTab === "planli" && (
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            marginBottom: "24px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {plannedLoading && <p>Planlı kayıtlar yükleniyor...</p>}
          {plannedError && <p style={{ color: "red" }}>Hata: {plannedError}</p>}

          {!plannedLoading && !plannedError && (
            <>
              {/* ARIA live region for selection announcements */}
              <div aria-live="polite" aria-atomic="true" className={tableStyles.srOnly}>
                {selectedPlanned.size > 0 && `${selectedPlanned.size} planned item${selectedPlanned.size > 1 ? 's' : ''} selected`}
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "14px", color: "#656e77" }}>
                  {selectedPlanned.size} seçildi
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      const itemId = Array.from(selectedPlanned)[0];
                      const item = plannedItems.find(p => p.id === itemId);
                      if (item) openMatchModal(item);
                    }}
                    disabled={selectedPlanned.size !== 1}
                    style={{
                      padding: "8px 16px",
                      background: "white",
                      color: selectedPlanned.size === 1 ? "#000" : "#9ca3af",
                      border: selectedPlanned.size === 1 ? "2px solid #dc0005" : "2px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: selectedPlanned.size === 1 ? "pointer" : "not-allowed",
                      opacity: selectedPlanned.size === 1 ? 1 : 0.6,
                    }}
                  >
                    Esle
                  </button>
                  <button
                    onClick={deleteSelectedPlanned}
                    disabled={deleting || selectedPlanned.size === 0}
                    style={{
                      padding: "8px 16px",
                      background: selectedPlanned.size > 0 ? "#dc0005" : "#d1d5db",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: selectedPlanned.size > 0 && !deleting ? "pointer" : "not-allowed",
                      opacity: selectedPlanned.size > 0 && !deleting ? 1 : 0.6,
                    }}
                  >
                    {deleting ? "Siliniyor..." : "Sil"}
                  </button>
                </div>
              </div>
              {(!plannedItems || plannedItems.length === 0) ? (
                <p>Henüz planlı nakit kaydı bulunmuyor.</p>
              ) : (
                <div style={{ overflowX: "auto", width: "100%", boxSizing: "border-box", minWidth: 0, scrollbarGutter: "stable" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "14px",
                      tableLayout: "fixed",
                      minWidth: 0,
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <Th style={{ width: "24px", padding: "0 2px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedPlanned.size === plannedItems.length && plannedItems.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPlanned(new Set(plannedItems.map(p => p.id)));
                              } else {
                                setSelectedPlanned(new Set());
                              }
                            }}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </Th>
                        <Th onClick={() => togglePlannedSort("due_date")} style={{ cursor: "pointer", userSelect: "none", width: "75px", minWidth: "75px" }}>
                          Vade {plannedSortBy === "due_date"}
                        </Th>
                        <Th onClick={() => togglePlannedSort("type")} style={{ cursor: "pointer", userSelect: "none", width: "55px", minWidth: "55px" }}>
                          Tip {plannedSortBy === "type" && (plannedSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => togglePlannedSort("direction")} style={{ cursor: "pointer", userSelect: "none", width: "60px", minWidth: "60px" }}>
                          Yön {plannedSortBy === "direction" && (plannedSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => togglePlannedSort("counterparty")} style={{ cursor: "pointer", userSelect: "none", width: "200px", minWidth: "200px" }}>
                          Cari {plannedSortBy === "counterparty" && (plannedSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => togglePlannedSort("reference_no")} style={{ cursor: "pointer", userSelect: "none", width: "70px", minWidth: "70px" }}>
                          Referans No {plannedSortBy === "reference_no" && (plannedSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th onClick={() => togglePlannedSort("amount")} style={{ cursor: "pointer", userSelect: "none", width: "70px", minWidth: "70px" }}>
                          Tutar {plannedSortBy === "amount" && (plannedSortOrder === "asc" ? "↑" : "↓")}
                        </Th>
                        <Th style={{ width: "70px", minWidth: "70px" }}>Ödenen</Th>
                        <Th style={{ width: "70px", minWidth: "70px" }}>Kalan</Th>
                        <Th style={{ width: "70px", minWidth: "70px" }}>Durum</Th>
                        
                        </tr>
                    </thead>
                    <tbody>
                      {sortedPlannedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item) => (
                        <tr 
                          key={item.id} 
                          role="row"
                          aria-selected={selectedPlanned.has(item.id)}
                          tabIndex={0}
                          onClick={() => togglePlannedSelection(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              togglePlannedSelection(item.id);
                            }
                          }}
                          className={`${tableStyles.tableRow} ${selectedPlanned.has(item.id) ? tableStyles.tableRowSelected : ''}`}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                        >
                          <Td style={{ padding: "0 2px", textAlign: "center" }} role="gridcell">
                            <input
                              type="checkbox"
                              checked={selectedPlanned.has(item.id)}
                              onChange={() => {
                                togglePlannedSelection(item.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                              aria-label={`Select planned item ${item.counterparty || item.type}`}
                            />
                          </Td>
                          <Td role="gridcell">{item.due_date}</Td>
                          <Td role="gridcell">{item.type}</Td>
                          <Td role="gridcell">
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "var(--font-size-helptext)",
                                fontWeight: 500,
                                background: item.direction === "in" ? "#dcfce7" : "#fee2e2",
                                color: item.direction === "in" ? "#166534" : "#991b1b",
                              }}
                            >
                              {item.direction === "in" ? "Gelir" : "Gider"}
                            </span>
                          </Td>
                          <Td role="gridcell">{item.counterparty || "-"}</Td>
                          <Td role="gridcell">{item.reference_no || "-"}</Td>
                          <Td role="gridcell">
                            {Number(item.amount).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Td>
                          <Td role="gridcell">
                            {Number(item.settled_amount || 0).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Td>
                          <Td role="gridcell">
                            {Number((item.remaining_amount || 0)).toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Td>
                          <Td role="gridcell">
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "var(--font-size-helptext)",
                                background: 
                                  item.status === "OPEN" ? "#ef4444" :
                                  item.status === "PARTIAL" ? "#eab308" :
                                  item.status === "SETTLED" ? "#22c55e" :
                                  "#f3f4f6",
                                color: 
                                  item.status === "OPEN" ? "white" :
                                  item.status === "PARTIAL" ? "#000" :
                                  item.status === "SETTLED" ? "white" :
                                  "#0d1b1e",
                              }}
                            >
                              {item.status === "OPEN" ? "Açık" : item.status === "PARTIAL" ? "Kısmi" : item.status === "SETTLED" ? "Kapatıldı" : item.status || "Aktif"}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!plannedLoading && !plannedError && plannedItems && plannedItems.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontSize: "var(--font-size-body)", color: "#6b7280" }}>
                    {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, plannedItems.length)} of {plannedItems.length} Pages
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: currentPage === 1 ? "default" : "pointer",
                        opacity: currentPage === 1 ? 0.5 : 1,
                        fontSize: "var(--font-size-helptext)",
                      }}
                    >
                      Önceki
                    </button>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {Array.from({ length: Math.ceil(plannedItems.length / pageSize) }).map((_, i) => (
                        <button
                          key={i + 1}
                          onClick={() => setCurrentPage(i + 1)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "4px",
                            border: currentPage === i + 1 ? "1px solid #dc0005" : "1px solid #e5e7eb",
                            background: currentPage === i + 1 ? "#dc0005" : "white",
                            color: currentPage === i + 1 ? "white" : "#0d1b1e",
                            cursor: "pointer",
                            fontSize: "var(--font-size-helptext)",
                            fontWeight: currentPage === i + 1 ? 600 : 400,
                          }}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(Math.min(Math.ceil(plannedItems.length / pageSize), currentPage + 1))}
                      disabled={currentPage === Math.ceil(plannedItems.length / pageSize)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "4px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: currentPage === Math.ceil(plannedItems.length / pageSize) ? "default" : "pointer",
                        opacity: currentPage === Math.ceil(plannedItems.length / pageSize) ? 0.5 : 1,
                        fontSize: "var(--font-size-helptext)",
                      }}
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bank Upload Modal */}
      {bankUploadModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 999,
          }}
        >
          <div style={{ background: "white", borderRadius: 10, padding: 24, width: "min(500px, 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Excel Yükle</h3>
              <button onClick={() => setBankUploadModalOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20 }}>
                &times;
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Banka Seçin</label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                }}
              >
                <option value="akbank">🏦 Akbank (Başlıklar 9. satırda)</option>
                <option value="enpara">🏦 Enpara (Başlıklar 11. satırda)</option>
                <option value="yapikredi">🏦 Yapı Kredi (Başlıklar 11. satırda)</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Dosya Seçin</label>
              <input
                type="file"
                accept=".xlsx,.xlsm,.xltx,.xltm,.xls"
                onChange={(e) => setBankUploadFile(e.target.files?.[0] || null)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                }}
              />
              {bankUploadFile && (
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Seçilen dosya: {bankUploadFile.name}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setBankUploadModalOpen(false);
                  setBankUploadFile(null);
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                İptal
              </button>
              <button
                onClick={async () => {
                  if (!bankUploadFile) {
                    alert("Lütfen dosya seçin");
                    return;
                  }

                  const formData = new FormData();
                  formData.append("file", bankUploadFile);

                  try {
                    let endpoint = "";
                    let successMessage = "";

                    if (selectedBank === "akbank") {
                      endpoint = "/transactions/upload-akbank-excel";
                      successMessage = "Akbank dosyası başarıyla yüklendi";
                    } else if (selectedBank === "enpara") {
                      endpoint = "/transactions/upload-enpara-excel";
                      successMessage = "Enpara dosyası başarıyla yüklendi";
                    } else if (selectedBank === "yapikredi") {
                      endpoint = "/transactions/upload-yapikredi-excel";
                      successMessage = "Yapı Kredi dosyası başarıyla yüklendi";
                    }

                    const res = await fetch(`${API_BASE}${endpoint}`, {
                      method: "POST",
                      headers: authHeaders(),
                      body: formData,
                    });

                    if (res.ok) {
                      alert(successMessage);
                      setBankUploadModalOpen(false);
                      setBankUploadFile(null);
                      onDataChanged?.();
                    } else {
                      const errData = await res.json().catch(() => ({}));
                      alert("Hata: " + (errData.detail || "Upload başarısız"));
                    }
                  } catch (err) {
                    console.error("Upload error:", err);
                    alert("Upload sırasında hata oluştu");
                  }
                }}
                disabled={!bankUploadFile}
                style={{
                  padding: "10px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: bankUploadFile ? "#dc0005" : "#9ca3af",
                  color: "white",
                  cursor: bankUploadFile ? "pointer" : "default",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Yükle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {manualEntryModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setManualEntryModalOpen(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "8px",
              padding: "24px",
              width: "min(600px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "24px" }}>Manuel Giriş Ekle</h2>

            {/* Entry Type Selector */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
              <button
                onClick={() => setManualEntryType("transaction")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "6px",
                  border: "2px solid",
                  borderColor: manualEntryType === "transaction" ? "#dc0005" : "#d1d5db",
                  background: manualEntryType === "transaction" ? "#fef2f2" : "white",
                  color: manualEntryType === "transaction" ? "#dc0005" : "#666",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                📝 Manuel İşlem Ekle
              </button>
              <button
                onClick={() => setManualEntryType("planned")}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "6px",
                  border: "2px solid",
                  borderColor: manualEntryType === "planned" ? "#7c3aed" : "#d1d5db",
                  background: manualEntryType === "planned" ? "#faf5ff" : "white",
                  color: manualEntryType === "planned" ? "#7c3aed" : "#666",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                📋 Planlı Nakit Akışı Ekle
              </button>
            </div>

            {/* Transaction Form */}
            {manualEntryType === "transaction" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleManualSubmit(e);
                  setManualEntryModalOpen(false);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Tarih
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Açıklama
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Tutar
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Yön
                  </label>
                  <select
                    value={form.direction}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, direction: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="in">Giriş</option>
                    <option value="out">Çıkış</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setManualEntryModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: formSubmitting ? "#9ca3af" : "#16a34a",
                      color: "white",
                      fontSize: "14px",
                      cursor: formSubmitting ? "default" : "pointer",
                    }}
                  >
                    {formSubmitting ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              </form>
            )}

            {/* Planned Cashflow Form */}
            {manualEntryType === "planned" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePlannedSubmit(e);
                  setManualEntryModalOpen(false);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Tip
                  </label>
                  <select
                    value={plannedForm.type}
                    onChange={(e) =>
                      setPlannedForm((f) => ({ ...f, type: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="INVOICE">Fatura</option>
                    <option value="CHEQUE">Çek</option>
                    <option value="NOTE">Senet</option>
                    <option value="OTHER">Diğer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Yön
                  </label>
                  <select
                    value={plannedForm.direction}
                    onChange={(e) =>
                      setPlannedForm((f) => ({ ...f, direction: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="in">Giriş (Tahsilat)</option>
                    <option value="out">Çıkış (Ödeme)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Vade
                  </label>
                  <input
                    type="date"
                    value={plannedForm.due_date}
                    onChange={(e) =>
                      setPlannedForm((f) => ({ ...f, due_date: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Tutar
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={plannedForm.amount}
                    onChange={(e) =>
                      setPlannedForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Cari / Karsi Taraf
                  </label>
                  <input
                    type="text"
                    value={plannedForm.counterparty}
                    onChange={(e) =>
                      setPlannedForm((f) => ({
                        ...f,
                        counterparty: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "var(--font-size-body)", display: "block", marginBottom: "4px" }}>
                    Referans No
                  </label>
                  <input
                    type="text"
                    value={plannedForm.reference_no}
                    onChange={(e) =>
                      setPlannedForm((f) => ({
                        ...f,
                        reference_no: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                    }}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setManualEntryModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={plannedSubmitting}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: plannedSubmitting ? "#9ca3af" : "#7c3aed",
                      color: "white",
                      fontSize: "14px",
                      cursor: plannedSubmitting ? "default" : "pointer",
                    }}
                  >
                    {plannedSubmitting ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bank Uploads and Manual Entry Sections */}
      <div
        style={{
          background: "white",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          marginBottom: "24px",
          display: "none",
        }}
      >
      </div>

      {/* Match Modal */}
      {matchModalOpen && (
        <DataMatchModal
          activePlanned={activePlanned}
          suggestions={suggestions}
          suggestionsLoading={suggestionsLoading}
          suggestionsError={suggestionsError}
          selectedTx={selectedTx}
          setSelectedTx={setSelectedTx}
          matchAmount={matchAmount}
          setMatchAmount={setMatchAmount}
          matchSubmitting={matchSubmitting}
          matchMessage={matchMessage}
          onClose={closeMatchModal}
          onConfirm={confirmMatch}
        />
      )}

      {/* Planned Matches Modal */}
      {plannedMatchesOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, zIndex:999 }}>
          <div style={{ background:"white", borderRadius:10, padding:16, width:"min(900px, calc(100% - 32px))" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h3 style={{ margin:0 }}>Eslesmeler  Planned #{activePlanned?.id}</h3>
              <button onClick={() => setPlannedMatchesOpen(false)} style={{ border:"none", background:"transparent", cursor:"pointer" }}></button>
            </div>

            <div style={{ maxHeight:260, overflow:"auto", border:"1px solid #eee", borderRadius:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Tarih</Th>
                    <Th>Tutar</Th>
                    <Th>Açıklama</Th>
                    <Th>Eşleşen</Th>
                    <Th>Tip</Th>
                  </tr>
                </thead>
                <tbody>
                  {plannedMatches.map((m) => (
                    <tr key={m.match_id}>
                      <Td>#{m.match_id}</Td>
                      <Td>{m.transaction?.date}</Td>
                      <Td>{Number(m.transaction?.amount ?? 0).toLocaleString("tr-TR", {minimumFractionDigits: 2, maximumFractionDigits: 2})} TL</Td>
                      <Td>{m.transaction?.description}</Td>
                      <Td>{Number(m.matched_amount ?? 0).toLocaleString("tr-TR", {minimumFractionDigits: 2, maximumFractionDigits: 2})} TL</Td>
                      <Td>{m.match_type}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, highlight = false }) {
  const color = value > 0 ? "green" : value < 0 ? "red" : "#333";

  return (
    <div
      style={{
        flex: "1 1 200px",
        background: "white",
        borderRadius: "8px",
        padding: "16px",
        boxShadow: highlight
          ? "0 0 0 2px rgba(37, 99, 235, 0.3)"
          : "0 2px 6px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div style={{ fontSize: "var(--font-size-body)", color: "#666", marginBottom: "8px" }}>
        {title}
      </div>
      <div
        style={{
          fontSize: "20px",
          fontWeight: 600,
          color,
        }}
      >
        {Number(value || 0).toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        TL
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th
      style={{
        textAlign: "left",
        borderBottom: "1px solid #ddd",
        padding: "8px",
        background: "#fafafa",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }) {
  return (
    <td
      style={{
        borderBottom: "1px solid #eee",
        padding: "8px",
      }}
    >
      {children}
    </td>
  );
}

export default App;
