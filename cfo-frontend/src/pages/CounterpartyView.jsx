import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client";
import styles from "./CounterpartyView.module.css";

// ─── Helper ───
function formatCurrency(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function riskClass(score) {
  if (score == null) return "";
  if (score <= 30) return styles.riskLow;
  if (score <= 60) return styles.riskMedium;
  return styles.riskHigh;
}

function riskLabel(score) {
  if (score == null) return "—";
  if (score <= 30) return `${score} (Düşük)`;
  if (score <= 60) return `${score} (Orta)`;
  return `${score} (Yüksek)`;
}

function typeLabel(t) {
  if (t === "CUSTOMER") return "Müşteri";
  if (t === "SUPPLIER") return "Tedarikçi";
  return "Diğer";
}

function typeBadge(t) {
  if (t === "CUSTOMER") return styles.badgeCustomer;
  if (t === "SUPPLIER") return styles.badgeSupplier;
  return styles.badgeOther;
}

// ════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════

export default function CounterpartyView({ token }) {
  const [counterparties, setCounterparties] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [activeTab, setActiveTab] = useState("list"); // list | detail
  const [selectedCp, setSelectedCp] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [singleMetrics, setSingleMetrics] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false); // false = create, true = edit
  const [newAlias, setNewAlias] = useState("");

  // Form state for create / edit
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("OTHER");
  const [formVkn, setFormVkn] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // ── Fetch list ──
  const loadList = useCallback(async () => {
    try {
      const data = await apiFetch("/counterparties", {}, token);
      setCounterparties(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Load counterparties error:", e);
    }
  }, [token]);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await apiFetch("/counterparties/metrics/all", {}, token);
      setMetrics(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Load metrics error:", e);
    }
  }, [token]);

  useEffect(() => {
    loadList();
    loadMetrics();
  }, [loadList, loadMetrics]);

  // ── Fetch detail ──
  const loadDetail = useCallback(
    async (cpId) => {
      try {
        const data = await apiFetch(`/counterparties/${cpId}`, {}, token);
        setSelectedCp(data);
        setAliases(data.aliases || []);
      } catch (e) {
        console.error("Load detail error:", e);
      }
      try {
        const m = await apiFetch(`/counterparties/${cpId}/metrics`, {}, token);
        setSingleMetrics(m);
      } catch (e) {
        setSingleMetrics(null);
      }
    },
    [token]
  );

  // ── Create ──
  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      await apiFetch("/counterparties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          vkn: formVkn.trim() || null,
          notes: formNotes.trim() || null,
        }),
      }, token);
      setShowModal(false);
      setFormName("");
      setFormType("OTHER");
      setFormVkn("");
      setFormNotes("");
      loadList();
      loadMetrics();
    } catch (e) {
      alert(e.message || "Cari oluşturulamadı");
    }
  };

  // ── Open edit modal ──
  const openEditModal = () => {
    if (!selectedCp) return;
    setFormName(selectedCp.name || "");
    setFormType(selectedCp.type || "OTHER");
    setFormVkn(selectedCp.vkn || "");
    setFormNotes(selectedCp.notes || "");
    setEditMode(true);
    setShowModal(true);
  };

  // ── Update ──
  const handleUpdate = async () => {
    if (!formName.trim() || !selectedCp) return;
    try {
      await apiFetch(`/counterparties/${selectedCp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          vkn: formVkn.trim() || null,
          notes: formNotes.trim() || null,
        }),
      }, token);
      setShowModal(false);
      setEditMode(false);
      setFormName("");
      setFormType("OTHER");
      setFormVkn("");
      setFormNotes("");
      loadDetail(selectedCp.id);
      loadList();
      loadMetrics();
    } catch (e) {
      alert(e.message || "Cari güncellenemedi");
    }
  };

  // ── Delete (soft) ──
  const handleDelete = async (cpId) => {
    if (!window.confirm("Bu cariyi pasife almak istediğinize emin misiniz?"))
      return;
    try {
      await apiFetch(`/counterparties/${cpId}`, { method: "DELETE" }, token);
      loadList();
      loadMetrics();
      if (selectedCp?.id === cpId) {
        setActiveTab("list");
        setSelectedCp(null);
      }
    } catch (e) {
      alert(e.message || "Hata");
    }
  };

  // ── Add alias ──
  const handleAddAlias = async () => {
    if (!newAlias.trim() || !selectedCp) return;
    try {
      await apiFetch(`/counterparties/${selectedCp.id}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: newAlias.trim() }),
      }, token);
      setNewAlias("");
      loadDetail(selectedCp.id);
    } catch (e) {
      alert(e.message || "Alias eklenemedi");
    }
  };

  // ── Remove alias ──
  const handleRemoveAlias = async (aliasId) => {
    if (!selectedCp) return;
    try {
      await apiFetch(
        `/counterparties/${selectedCp.id}/aliases/${aliasId}`,
        { method: "DELETE" },
        token
      );
      loadDetail(selectedCp.id);
    } catch (e) {
      alert(e.message || "Alias silinemedi");
    }
  };

  // ── Backfill ──
  const handleBackfill = async () => {
    try {
      const data = await apiFetch("/counterparties/backfill", {
        method: "POST",
      }, token);
      alert(
        `Backfill tamamlandı: ${data.created} oluşturuldu, ${data.linked} bağlandı, ${data.skipped} atlandı`
      );
      loadList();
      loadMetrics();
    } catch (e) {
      alert(e.message || "Backfill hatası");
    }
  };

  // ── Open detail ──
  const openDetail = (cp) => {
    setActiveTab("detail");
    loadDetail(cp.id);
  };

  // ── Merge metrics with list ──
  const metricsMap = {};
  metrics.forEach((m) => {
    metricsMap[m.counterparty_id] = m;
  });

  // ════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>
          {activeTab === "detail" && selectedCp
            ? "Cari Detay"
            : "Cari Hesaplar"}
        </h1>
        <div style={{ display: "flex", gap: 10 }}>
          {activeTab === "list" && (
            <>
              <button
                className={styles.backButton}
                onClick={handleBackfill}
                title="Mevcut planlanan kalemlerden cari oluştur"
              >
                🔄 Otomatik Oluştur
              </button>
              <button
                className={styles.addButton}
                onClick={() => setShowModal(true)}
              >
                + Yeni Cari
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── LIST VIEW ─── */}
      {activeTab === "list" && (
        <>
          {counterparties.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>Henüz cari tanımlanmamış</h3>
              <p>
                Yeni cari ekleyin veya "Otomatik Oluştur" ile mevcut
                planlamalardan oluşturun.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cari Adı</th>
                    <th>Tür</th>
                    <th>Toplam Plan</th>
                    <th>Ödenen</th>
                    <th>Kalan</th>
                    <th>Ort. Gecikme</th>
                    <th>Risk</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {counterparties.map((cp) => {
                    const m = metricsMap[cp.id] || {};
                    return (
                      <tr key={cp.id} onClick={() => openDetail(cp)}>
                        <td style={{ fontWeight: 600 }}>{cp.name}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${typeBadge(cp.type)}`}
                          >
                            {typeLabel(cp.type)}
                          </span>
                        </td>
                        <td>{formatCurrency(m.total_planned)}</td>
                        <td>{formatCurrency(m.total_paid)}</td>
                        <td>{formatCurrency(m.outstanding)}</td>
                        <td>
                          {m.avg_payment_delay_days != null
                            ? `${m.avg_payment_delay_days} gün`
                            : "—"}
                        </td>
                        <td>
                          <span className={riskClass(m.risk_score)}>
                            {riskLabel(m.risk_score)}
                          </span>
                        </td>
                        <td>
                          <button
                            className={styles.backButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(cp.id);
                            }}
                            style={{ fontSize: 12, padding: "4px 10px" }}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── DETAIL VIEW ─── */}
      {activeTab === "detail" && selectedCp && (
        <div className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <div>
              <h2 className={styles.detailName}>{selectedCp.name}</h2>
              <span
                className={`${styles.badge} ${typeBadge(selectedCp.type)}`}
              >
                {typeLabel(selectedCp.type)}
              </span>
              {selectedCp.vkn && (
                <span style={{ display: 'inline-block', marginLeft: 10, padding: '2px 10px', background: '#f3f4f6', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, color: '#374151' }}>
                  VKN: {selectedCp.vkn}
                </span>
              )}
              {selectedCp.notes && (
                <p style={{ color: "#6b7280", marginTop: 8, fontSize: 14 }}>
                  {selectedCp.notes}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={styles.addButton}
                onClick={openEditModal}
                style={{ fontSize: 13, padding: '6px 16px' }}
              >
                ✏️ Düzenle
              </button>
              <button
                className={styles.backButton}
                onClick={() => {
                  setActiveTab("list");
                  setSelectedCp(null);
                }}
              >
                ← Listeye Dön
              </button>
            </div>
          </div>

          {/* Metrics */}
          {singleMetrics && (
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Toplam Planlanan</div>
                <div className={styles.metricValue}>
                  {formatCurrency(singleMetrics.total_planned)}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Toplam Ödenen</div>
                <div className={styles.metricValue}>
                  {formatCurrency(singleMetrics.total_paid)}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Kalan</div>
                <div className={styles.metricValue}>
                  {formatCurrency(singleMetrics.outstanding)}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Eşleşme Sayısı</div>
                <div className={styles.metricValue}>
                  {singleMetrics.match_count}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Ort. Gecikme</div>
                <div className={styles.metricValue}>
                  {singleMetrics.avg_payment_delay_days != null
                    ? `${singleMetrics.avg_payment_delay_days} gün`
                    : "—"}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Zamanında Ödeme</div>
                <div className={styles.metricValue}>
                  {singleMetrics.on_time_rate != null
                    ? `%${(singleMetrics.on_time_rate * 100).toFixed(0)}`
                    : "—"}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Gecikme Oranı</div>
                <div className={styles.metricValue}>
                  {singleMetrics.late_rate != null
                    ? `%${(singleMetrics.late_rate * 100).toFixed(0)}`
                    : "—"}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Risk Skoru</div>
                <div
                  className={`${styles.metricValue} ${riskClass(
                    singleMetrics.risk_score
                  )}`}
                >
                  {riskLabel(singleMetrics.risk_score)}
                </div>
              </div>
            </div>
          )}

          {/* Aliases */}
          <div className={styles.aliasSection}>
            <h3 className={styles.aliasTitle}>
              Banka Açıklama Eşleştirmeleri (Alias)
            </h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Banka hareketi açıklamasında geçebilecek ifadeleri ekleyin.
              Otomatik eşleşmede kullanılır.
            </p>
            <div className={styles.aliasList}>
              {aliases.length === 0 && (
                <span style={{ color: "#9ca3af", fontSize: 13 }}>
                  Henüz alias eklenmemiş
                </span>
              )}
              {aliases.map((a) => (
                <span key={a.id} className={styles.aliasChip}>
                  {a.alias}
                  <span
                    className={styles.aliasRemove}
                    onClick={() => handleRemoveAlias(a.id)}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
            <div className={styles.aliasForm}>
              <input
                className={styles.aliasInput}
                placeholder="Örn: ACME LTD STI, ACME CORP..."
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddAlias()}
              />
              <button
                className={styles.aliasAddBtn}
                onClick={handleAddAlias}
                disabled={!newAlias.trim()}
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE / EDIT MODAL ─── */}
      {showModal && (
        <div className={styles.modal} onClick={() => { setShowModal(false); setEditMode(false); }}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>
              {editMode ? "Cari Düzenle" : "Yeni Cari Ekle"}
            </h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Cari Adı *</label>
              <input
                className={styles.formInput}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Şirket / Kişi adı"
                autoFocus
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tür</label>
              <select
                className={styles.formSelect}
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="CUSTOMER">Müşteri</option>
                <option value="SUPPLIER">Tedarikçi</option>
                <option value="OTHER">Diğer</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>VKN (Vergi Kimlik No)</label>
              <input
                className={styles.formInput}
                value={formVkn}
                onChange={(e) => setFormVkn(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10 haneli Vergi Kimlik Numarası"
                maxLength={10}
                inputMode="numeric"
              />
              {formVkn && formVkn.length !== 10 && formVkn.length > 0 && (
                <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                  VKN 10 haneli olmalıdır ({formVkn.length}/10)
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notlar</label>
              <input
                className={styles.formInput}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="İsteğe bağlı"
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => { setShowModal(false); setEditMode(false); }}
              >
                İptal
              </button>
              <button
                className={styles.saveButton}
                onClick={editMode ? handleUpdate : handleCreate}
                disabled={!formName.trim()}
              >
                {editMode ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
