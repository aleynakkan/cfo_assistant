import { useState } from "react";
import styles from "./MatchingPanel.module.css";

export default function MatchingPanel({ data, token, onMatchDeleted }) {
  const [selectedModal, setSelectedModal] = useState(null);
  const [matchingDetails, setMatchingDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  // Match modal state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [activePlanned, setActivePlanned] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [matchAmount, setMatchAmount] = useState("");
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");

  if (!data) return null;

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const items = [
    { id: "auto", label: "Otomatik Eşleşen", value: data.auto_matched, color: "#10b981", canDelete: true },
    { id: "manual", label: "Manuel Eşleşen", value: data.manual_matched, color: "#3b82f6", canDelete: true },
    { id: "overdue", label: "Vadesi Geçmiş", value: data.unmatched_overdue, color: "#f59e0b", canDelete: false },
    { id: "upcoming", label: "Yaklaşan 14 Gün", value: data.unmatched_upcoming_14d, color: "#ec4899", canDelete: false },
    { id: "partial", label: "Kısmi Eşleşen", value: data.partial_planned, color: "#a855f7", canDelete: true },
  ];

  async function openModal(item) {
    setSelectedModal(item);
    setLoading(true);
    setDeleteMessage("");
    setMatchingDetails([]);

    try {
      // Tüm matches'i getir
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
          // Kısmi eşleşenleri getir (PARTIAL status'lu planned items)
          const pRes = await fetch(`${API_BASE}/planned`, {
            headers: { "Authorization": `Bearer ${token}` },
          });
          if (pRes.ok) {
            const planned = await pRes.json();
            filtered = planned.filter(p => p.status === "PARTIAL");
          }
        } else if (item.id === "overdue" || item.id === "upcoming") {
          // Overdue ve upcoming için planned items'ı göster
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
      
      if (onMatchDeleted) onMatchDeleted();
    } catch (err) {
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

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
      
      if (onMatchDeleted) onMatchDeleted();
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
      if (onMatchDeleted) onMatchDeleted();
    } catch (err) {
      setDeleteMessage(`Hata: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className={styles.panel}>
        <h3 className={styles.title}>Eşleştirme Sağlığı</h3>
        <div className={styles.grid}>
          {items.map((item) => (
            <button
              key={item.id}
              className={styles.item}
              onClick={() => openModal(item)}
              style={{ cursor: "pointer", border: "none", background: "none", padding: 0 }}
            >
              <div
                className={styles.indicator}
                style={{ backgroundColor: item.color }}
              />
              <div>
                <div className={styles.label}>{item.label}</div>
                <div className={styles.value}>{item.value}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
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
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
                {selectedModal.label} ({matchingDetails.length})
              </h2>
              <button
                onClick={() => setSelectedModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
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
                      {["auto", "manual", "partial"].includes(selectedModal.id) && (
                        <>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "70px", whiteSpace: "nowrap" }}>Planlı ID</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "80px", whiteSpace: "nowrap" }}>Referans No</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "70px", whiteSpace: "nowrap" }}>İşlem ID</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "110px", whiteSpace: "nowrap" }}>Tutar</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, minWidth: "60px", whiteSpace: "nowrap" }}>İşlem</th>
                        </>
                      )}
                      {["overdue", "upcoming"].includes(selectedModal.id) && (
                        <>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600 }}>ID</th>
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
                        {["auto", "manual", "partial"].includes(selectedModal.id) && (
                          <>
                            <td style={{ padding: "8px" }}>{detail.planned_item_id}</td>
                            <td style={{ padding: "8px", maxWidth: "100px" }}>
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {detail.planned_reference || "—"}
                              </div>
                            </td>
                            <td style={{ padding: "8px" }}>{detail.transaction_id}</td>
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
                        {["overdue", "upcoming"].includes(selectedModal.id) && (
                          <>
                            <td style={{ padding: "8px" }}>{detail.id}</td>
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
                              <button
                                onClick={() => openMatchForPlanned(detail)}
                                style={{
                                  padding: "4px 8px",
                                  background: "#dc0005",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                Eşle
                              </button>
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

      {/* Match Modal */}
      {matchModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "16px",
        }}>
          <div style={{
            background: "white",
            borderRadius: "10px",
            padding: "12px",
            width: "98vw",
            height: "95vh",
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Eşle — Planned #{activePlanned?.id}</h3>
              <button
                onClick={() => setMatchModalOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "24px",
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: "13px", color: "#374151", marginBottom: "12px" }}>
              <div><strong>Vade:</strong> {activePlanned?.due_date} • <strong>Yön:</strong> {activePlanned?.direction} • <strong>Kalan:</strong> {Number(activePlanned?.remaining_amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</div>
            </div>

            {suggestionsLoading && <p>Öneriler yükleniyor...</p>}

            {!suggestionsLoading && suggestions.length === 0 && (
              <p style={{ color: "#6b7280" }}>Eşleşme önerisi bulunamadı</p>
            )}

            {!suggestionsLoading && suggestions.length > 0 && (
              <div style={{ marginTop: "12px", marginBottom: "16px", maxHeight: "300px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Seç</th>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Tarih</th>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Tutar</th>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Açıklama</th>
                      <th style={{ padding: "8px", textAlign: "left", fontWeight: 600 }}>Puan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s) => (
                      <tr key={s.transaction_id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "8px" }}>
                          <input
                            type="radio"
                            name="suggestion"
                            checked={selectedTx?.transaction_id === s.transaction_id}
                            onChange={() => {
                              setSelectedTx(s);
                              setMatchAmount(String(s.suggested_match_amount ?? s.amount ?? ""));
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px" }}>{s.date}</td>
                        <td style={{ padding: "8px" }}>{Number(s.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</td>
                        <td style={{ padding: "8px", maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.description}</td>
                        <td style={{ padding: "8px" }}>{s.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "12px" }}>
              <label style={{ fontSize: "12px", color: "#374151", display: "block", marginBottom: "4px" }}>Eşleşme Tutarı</label>
              <input
                type="number"
                step="0.01"
                value={matchAmount}
                onChange={(e) => setMatchAmount(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                }}
              />
            </div>

            <button
              onClick={confirmMatch}
              disabled={matchSubmitting}
              style={{
                marginTop: "16px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "none",
                background: matchSubmitting ? "#9ca3af" : "#16a34a",
                color: "white",
                cursor: matchSubmitting ? "default" : "pointer",
              }}
            >
              {matchSubmitting ? "Eşleniyor..." : "Onayla"}
            </button>

            {matchMessage && (
              <p style={{ marginTop: "10px", fontSize: "13px", color: matchMessage.includes("Hata") ? "#dc2626" : "#059669" }}>
                {matchMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
