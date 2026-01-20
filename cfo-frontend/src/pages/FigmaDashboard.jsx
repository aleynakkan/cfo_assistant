import { useState, useEffect } from 'react';
import styles from './FigmaDashboard.module.css';
import matchModalStyles from '../components/MatchModal.module.css';
import FixedCostCard from '../components/dashboard/FixedCostCard';
import CashForecastCard from '../components/dashboard/CashForecastCard';
import InsightCard from '../components/InsightCard';
import useFocusTrap from '../hooks/useFocusTrap';

export default function FigmaDashboard({ summary, cashPosition, matchHealth, fixedCosts, insights, userName, token, onRefreshDashboard }) {
  const [selectedModal, setSelectedModal] = useState(null);
  const [matchingDetails, setMatchingDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [chartData, setChartData] = useState([]);

  // Date filter state
  const [dateFilter, setDateFilter] = useState("Tüm zamanlar");
  const [filteredKpis, setFilteredKpis] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netCash: 0,
    loading: false,
  });

  // Match modal state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [activePlanned, setActivePlanned] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [matchAmount, setMatchAmount] = useState("");
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const fmt = (n, min = 2, max = 2) =>
    Number(n || 0).toLocaleString("tr-TR", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });

  console.log("FigmaDashboard received props - fixedCosts:", fixedCosts);

  const estimatedCash = cashPosition?.estimated_cash || 0;
  const totalIncome = summary?.total_income || 0;
  const totalExpense = summary?.total_expense || 0;
  const netCash = summary?.net_cashflow || 0;

  const hour = new Date().getHours();
  let greeting = "Günaydın";
  if (hour >= 12 && hour < 18) greeting = "İyi öğlenler";
  if (hour >= 18) greeting = "İyi akşamlar";

  const items = [
    { id: "auto", label: "Otomatik Eşleşen", value: matchHealth?.auto_matched || 0, color: "#10b981", canDelete: true },
    { id: "manual", label: "Manuel Eşleşen", value: matchHealth?.manual_matched || 0, color: "#3b82f6", canDelete: true },
    { id: "overdue", label: "Vadesi Geçmiş", value: matchHealth?.unmatched_overdue || 0, color: "#f59e0b", canDelete: false },
    { id: "upcoming", label: "Yaklaşan 14 Gün", value: matchHealth?.unmatched_upcoming_14d || 0, color: "#ec4899", canDelete: false },
    { id: "partial", label: "Kısmi Eşleşen", value: matchHealth?.partial_planned || 0, color: "#a855f7", canDelete: true },
  ];

  async function openModal(item) {
    setSelectedModal(item);
    setLoading(true);
    setDeleteMessage("");
    setMatchingDetails([]);

    try {
      const res = await fetch(`${API_BASE}/matches`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const allMatches = await res.json();
        let filtered = [];

        if (item.id === "auto") {
          filtered = allMatches.filter(m => m.match_type === "AUTO");
        } else if (item.id === "manual") {
          // Manuel eşleşen: PARTIAL STATUS'LU planned itemler HARIC
          filtered = allMatches.filter(m => 
            m.match_type !== "AUTO" && m.planned_status !== "PARTIAL"
          );
        } else if (item.id === "partial") {
          // PARTIAL = status === "PARTIAL" olan planned kalemler
          const pRes = await fetch(`${API_BASE}/planned`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (pRes.ok) {
            const planned = await pRes.json();
            filtered = planned.filter(p => p.status === "PARTIAL");
          }
        } else if (item.id === "overdue" || item.id === "upcoming") {
          const pRes = await fetch(`${API_BASE}/planned`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (pRes.ok) {
            const planned = await pRes.json();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (item.id === "overdue") {
              filtered = planned.filter(p => new Date(p.due_date) < today && p.status !== "SETTLED");
            } else {
              const future14 = new Date();
              future14.setDate(future14.getDate() + 14);
              future14.setHours(23, 59, 59, 999);
              filtered = planned.filter(p => {
                const d = new Date(p.due_date);
                return d >= today && d <= future14 && p.status !== "SETTLED";
              });
            }
          }
        }

        setMatchingDetails(filtered);
      } else {
        throw new Error("Veriler yüklenemedi");
      }
    } catch (err) {
      console.error(err);
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMatch(matchId) {
    if (!window.confirm("Eşleşmeyi silmek istediğinize emin misiniz?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/matches/${matchId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Silme başarısız");

      setDeleteMessage("Eşleşme silindi ✓");
      setMatchingDetails(prev => prev.filter(m => m.id !== matchId && m.match_id !== matchId));
      
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function fetchFilteredKpis(filter) {
    setFilteredKpis(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API_BASE}/transactions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Transactions yüklenemedi");
      
      const transactions = await res.json();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let filtered = transactions;
      
      if (filter === "Son 30 gün") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        filtered = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
      } else if (filter === "Bu ay") {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        filtered = transactions.filter(t => new Date(t.date) >= firstDay);
      }
      
      const income = filtered
        .filter(t => t.direction === "in")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      
      const expense = filtered
        .filter(t => t.direction === "out")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      
      setFilteredKpis({
        totalIncome: income,
        totalExpense: expense,
        netCash: income - expense,
        loading: false,
      });
    } catch (err) {
      console.error("KPI fetch hatası:", err);
      setFilteredKpis(prev => ({ ...prev, loading: false }));
    }
  }

  function handleDateFilterChange(e) {
    const newFilter = e.target.value;
    setDateFilter(newFilter);
    fetchFilteredKpis(newFilter);
  }

  // Sayfa yüklenince veri çek
  useEffect(() => {
    fetchFilteredKpis("Tüm zamanlar");
  }, [token]);

  async function openMatchForPlanned(item) {
    setActivePlanned(item);
    setSelectedTx(null);
    setMatchAmount("");
    setMatchMessage("");
    setSuggestions([]);
    setMatchModalOpen(true);

    try {
      setSuggestionsLoading(true);
      const res = await fetch(`${API_BASE}/planned/${item.id}/match-suggestions`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Öneriler alınamadı");
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setMatchMessage(`Hata: ${e.message}`);
    } finally {
      setSuggestionsLoading(false);
    }
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
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          planned_item_id: activePlanned.id,
          transaction_id: selectedTx.transaction_id,
          matched_amount: Number(matchAmount),
          match_type: "MANUAL",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Eşleştirme başarısız");

      setMatchMessage(`Eşleştirildi. Status: ${data.planned_status}`);
      setMatchModalOpen(false);
      
      // Tabloyu yenile
      if (selectedModal) {
        setTimeout(() => openModal(selectedModal), 500);
      }
      
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (e) {
      setMatchMessage(`Hata: ${e.message}`);
    } finally {
      setMatchSubmitting(false);
    }
  }

  async function deletePlannedItem(plannedId) {
    if (!window.confirm("Planlanmış kalemi silmek istediğinize emin misiniz?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/planned/${plannedId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Silme başarısız");
      setDeleteMessage("Planlanmış kalem silindi ✓");
      setMatchingDetails(prev => prev.filter(p => p.id !== plannedId));
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  async function deletePlannedItem(plannedId) {
    if (!window.confirm("Bu planlı kalemi silmek istediğinize emin misiniz?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/planned/${plannedId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Silme başarısız");

      setDeleteMessage("Planlı kalem silindi ✓");
      setMatchingDetails(prev => prev.filter(m => m.id !== plannedId));
      
      if (onRefreshDashboard) onRefreshDashboard();
    } catch (err) {
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Header: Greeting */}
        <div className={styles.header}>
          <h1 className={styles.greeting}>{greeting}, {userName}! 👋</h1>
        </div>

        {/* Red Hero Card: Tahmini Nakit */}
        <div className={styles.heroCard}>
          <div className={styles.heroLabel}>Tahmini Nakit Pozisyonu</div>
          <div className={styles.heroValue}>
            {fmt(estimatedCash, 0, 2)}
            <span className={styles.heroCurrency}>TRY</span>
          </div>
          {cashPosition?.change_30_days_percent !== undefined && (
            <div className={styles.heroChangeIndicator}>
              <span className={cashPosition.change_30_days_percent >= 0 ? styles.positive : styles.negative}>
                {cashPosition.change_30_days_percent >= 0 ? '+' : '-'}{Math.abs(cashPosition.change_30_days_percent).toFixed(1)}%
              </span>
              <span className={styles.changeLabel}>son 1 ay</span>
            </div>
          )}
        </div>

        {/* Date Filter */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <select 
            className={styles.filterSelect}
            value={dateFilter}
            onChange={handleDateFilterChange}
          >
            <option>Tüm zamanlar</option>
            <option>Son 30 gün</option>
            <option>Bu ay</option>
          </select>
        </div>

        {/* KPI Cards Row: Gelir, Gider, Net */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiTitle}>Toplam Gelir</span>
            </div>
            <div className={styles.kpiValue}>
              {filteredKpis.loading ? "..." : fmt(filteredKpis.totalIncome, 0, 0)}
              <span className={styles.kpiCurrency}>TRY</span>
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiTitle}>Toplam Gider</span>
            </div>
            <div className={styles.kpiValue}>
              {filteredKpis.loading ? "..." : fmt(filteredKpis.totalExpense, 0, 0)}
              <span className={styles.kpiCurrency}>TRY</span>
            </div>
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiTitle}>Net Nakit Akışı</span>
            </div>
            <div className={styles.kpiValue}>
              {filteredKpis.loading ? "..." : fmt(filteredKpis.netCash, 0, 2)}
              <span className={styles.kpiCurrency}>TRY</span>
            </div>
          </div>
        </div>

        {/* Bottom Row: 3 Columns */}
        {/* Kontrol Paneli - Matching Health (Eski Görünüm, Yeni Fonksiyonalite) */}
        {matchHealth && (
          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ margin: "0 0 27px 0", fontSize: "var(--font-size-h2)", fontWeight: 500, color: "#0d1b1e" }}>
              Kontrol Paneli
            </h2>
            
            <div style={{ display: "flex", gap: "13px", width: "100%" }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openModal(item)}
                  style={{
                    flex: "1 1 0",
                    background: "white",
                    borderRadius: "24px",
                    padding: "12px 12px 12px 18px",
                    height: "108px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    boxShadow: "0px 8px 16px rgba(75, 52, 37, 0.05)",
                    minWidth: 0,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    border: "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "0px 12px 24px rgba(75, 52, 37, 0.15)";
                    e.currentTarget.style.border = "2px solid #dc0005";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0px 8px 16px rgba(75, 52, 37, 0.05)";
                    e.currentTarget.style.border = "2px solid transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "100%" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "var(--font-size-h3)", fontWeight: 500, color: "rgba(0,0,0,0.85)", marginBottom: "14px" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "22.75px", fontWeight: 700, color: "rgba(0,0,0,0.85)" }}>
                        {item.value}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal */}
        {selectedModal && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px",
          }}>
            <div style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "fit-content",
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "var(--font-size-h2)", fontWeight: 600 }}>
                  {selectedModal.label} ({matchingDetails.length})
                </h2>
                <button
                  onClick={() => setSelectedModal(null)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "var(--font-size-h3)",
                    cursor: "pointer",
                    color: "#9ca3af",
                  }}
                >
                  ×
                </button>
              </div>

              {deleteMessage && (
                <div style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: deleteMessage.includes("Hata") ? "#fef2f2" : "#f0fdf4",
                  color: deleteMessage.includes("Hata") ? "#dc0005" : "#059669",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}>
                  {deleteMessage}
                </div>
              )}

              {loading && <p>Yükleniyor...</p>}

              {!loading && matchingDetails.length === 0 && (
                <p style={{ color: "#6b7280" }}>Kayıt bulunamadı</p>
              )}

              {!loading && matchingDetails.length > 0 && (
                <div style={{ overflowX: "auto", overflowY: "visible", flex: 1, maxWidth: "fit-content" }}>
                  <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                  }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                        {["auto", "manual"].includes(selectedModal.id) && (
                          <>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "100px", whiteSpace: "nowrap" }}>Planlı Kalem</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "80px", whiteSpace: "nowrap" }}>Referans No</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "180px", whiteSpace: "nowrap" }}>İşlem Açıklaması</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "110px", whiteSpace: "nowrap" }}>Eşleşen Tutar</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "60px", whiteSpace: "nowrap" }}>İşlem</th>
                          </>
                        )}
                        {["partial", "overdue", "upcoming"].includes(selectedModal.id) && (
                          <>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>Referans / Karşı Taraf</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>Vade</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>Tutar</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>Kalan</th>
                            <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>İşlem</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {matchingDetails.map((detail) => (
                        <tr key={detail.id || detail.match_id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          {["auto", "manual"].includes(selectedModal.id) && (
                            <>
                              <td style={{ padding: "8px", maxWidth: "120px" }}>
                                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {detail.planned_reference || detail.planned_counterparty || `#${detail.planned_item_id}`}
                                </div>
                              </td>
                              <td style={{ padding: "8px", maxWidth: "100px" }}>
                                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {detail.planned_reference || "—"}
                                </div>
                              </td>
                              <td style={{ padding: "8px", maxWidth: "250px" }}>
                                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {detail.transaction_description || "—"}
                                </div>
                              </td>
                              <td style={{ padding: "8px" }}>
                                {Number(detail.matched_amount || 0).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} TL
                              </td>
                              <td style={{ padding: "8px" }}>
                                <button
                                  onClick={() => deleteMatch(detail.id)}
                                  disabled={deleting}
                                  style={{
                                    padding: "4px 8px",
                                    background: "#dc0005",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    cursor: deleting ? "not-allowed" : "pointer",
                                    opacity: deleting ? 0.6 : 1,
                                  }}
                                >
                                  Sil
                                </button>
                              </td>
                            </>
                          )}
                          {["partial", "overdue", "upcoming"].includes(selectedModal.id) && (
                            <>
                              <td style={{ padding: "8px", maxWidth: "150px" }}>
                                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {detail.reference_no || detail.counterparty || `#${detail.id}`}
                                </div>
                              </td>
                              <td style={{ padding: "8px" }}>{detail.due_date}</td>
                              <td style={{ padding: "8px" }}>
                                {Number(detail.amount || 0).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} TL
                              </td>
                              <td style={{ padding: "8px" }}>
                                {Number(detail.remaining_amount || 0).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} TL
                              </td>
                              <td style={{ padding: "8px" }}>
                                {selectedModal.id === "partial" && (
                                  <button
                                    onClick={() => deletePlannedItem(detail.id)}
                                    disabled={deleting}
                                    style={{
                                      padding: "4px 8px",
                                      background: "#dc0005",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "var(--font-size-helptext)",
                                      cursor: deleting ? "not-allowed" : "pointer",
                                      opacity: deleting ? 0.6 : 1,
                                    }}
                                  >
                                    Sil
                                  </button>
                                )}
                                {(selectedModal.id === "overdue" || selectedModal.id === "upcoming") && (
                                  <button
                                    onClick={() => openMatchForPlanned(detail)}
                                    style={{
                                      padding: "4px 8px",
                                      background: "#dc0005",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "var(--font-size-helptext)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Eşle
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.bottomGrid}>
          {/* Sabit Gider Analizi */}
          <div className={styles.card}>
            <FixedCostCard data={fixedCosts} token={token} />
          </div>

          {/* Nakit Tahmini - 30/60/90 Gün */}
          <div className={`${styles.card} ${styles.cardLarge}`}>
            <CashForecastCard estimatedCash={estimatedCash} onChartDataUpdate={setChartData} />
          </div>

          {/* Önemli Bulgular */}
          {insights && insights.length > 0 && (
            <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
              <h2 className={styles.cardTitle} style={{ marginBottom: '20px' }}>⚡ Önemli Bulgular</h2>
              <div 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  width: '100%'
                }}
                role="list"
                aria-label="Dashboard insights"
              >
                {insights.map((insight) => (
                  <div key={insight.id} role="listitem">
                    <InsightCard
                      insight={insight}
                      token={token}
                      onRefresh={onRefreshDashboard}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Match Modal */}
        {matchModalOpen && (
          <MatchModalNested
            activePlanned={activePlanned}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            selectedTx={selectedTx}
            setSelectedTx={setSelectedTx}
            matchAmount={matchAmount}
            setMatchAmount={setMatchAmount}
            matchSubmitting={matchSubmitting}
            matchMessage={matchMessage}
            onClose={() => setMatchModalOpen(false)}
            onConfirm={confirmMatch}
          />
        )}
    </div>
  );
}

/**
 * MatchModalNested Component
 * 
 * Nested modal for matching planned items with transactions.
 * Implements:
 * - CSS token-based styling
 * - Proper z-index (overlay 1200, container 1201)
 * - Accessibility (role, aria-*, focus trap, Escape key)
 * - Responsive design
 */
function MatchModalNested({
  activePlanned,
  suggestions,
  suggestionsLoading,
  selectedTx,
  setSelectedTx,
  matchAmount,
  setMatchAmount,
  matchSubmitting,
  matchMessage,
  onClose,
  onConfirm,
}) {
  const modalRef = useFocusTrap(true);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={matchModalStyles.nestedModalOverlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-modal-title"
    >
      <div
        ref={modalRef}
        className={matchModalStyles.nestedModal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={matchModalStyles.modalHeader}>
          <h3 id="match-modal-title" className={matchModalStyles.modalTitle}>
            Eşle — Planned #{activePlanned?.id}
          </h3>
          <button
            type="button"
            className={matchModalStyles.closeButton}
            onClick={onClose}
            aria-label="Modalı kapat"
          >
            ✕
          </button>
        </div>

        <div className={matchModalStyles.modalInfo}>
          <div>
            <strong>Vade:</strong> {activePlanned?.due_date} •{' '}
            <strong>Yön:</strong> {activePlanned?.direction} •{' '}
            <strong>Kalan:</strong>{' '}
            {Number(activePlanned?.remaining_amount ?? 0).toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            TL
          </div>
        </div>

        {suggestionsLoading && (
          <p className={matchModalStyles.loadingState}>Öneriler yükleniyor...</p>
        )}

        {!suggestionsLoading && suggestions.length === 0 && (
          <p className={matchModalStyles.emptyState}>
            Eşleşme önerisi bulunamadı
          </p>
        )}

        {!suggestionsLoading && suggestions.length > 0 && (
          <div className={matchModalStyles.suggestionsContainer}>
            <table className={matchModalStyles.suggestionsTable}>
              <thead>
                <tr>
                  <th>Seç</th>
                  <th>Tarih</th>
                  <th>Tutar</th>
                  <th>Açıklama</th>
                  <th>Puan</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.transaction_id}>
                    <td>
                      <input
                        type="radio"
                        name="suggestion"
                        checked={selectedTx?.transaction_id === s.transaction_id}
                        onChange={() => {
                          setSelectedTx(s);
                          setMatchAmount(
                            String(s.suggested_match_amount ?? s.amount ?? '')
                          );
                        }}
                      />
                    </td>
                    <td>{s.date}</td>
                    <td>
                      {Number(s.amount).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      TL
                    </td>
                    <td
                      style={{
                        maxWidth: '200px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.description}
                    </td>
                    <td>{s.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={matchModalStyles.inputGroup}>
          <label htmlFor="match-amount" className={matchModalStyles.inputLabel}>
            Eşleşme Tutarı
          </label>
          <input
            id="match-amount"
            type="number"
            step="0.01"
            value={matchAmount}
            onChange={(e) => setMatchAmount(e.target.value)}
            className={matchModalStyles.inputField}
          />
        </div>

        <button
          type="button"
          onClick={onConfirm}
          disabled={matchSubmitting}
          className={matchModalStyles.btnPrimary}
        >
          {matchSubmitting ? 'Eşleniyor...' : 'Onayla'}
        </button>

        {matchMessage && (
          <div
            className={`${matchModalStyles.message} ${
              matchMessage.includes('Hata')
                ? matchModalStyles.messageError
                : matchModalStyles.messageSuccess
            }`}
          >
            {matchMessage}
          </div>
        )}
      </div>
    </div>
  );
}
