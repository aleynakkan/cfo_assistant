import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client";
import styles from "./CounterpartyView.module.css";

// ─── Inline SVG Icons (matching Figma) ───

const IconShuffle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
  </svg>
);

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" /><path d="M12 5v14" />
  </svg>
);

const IconPencil = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  </svg>
);

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
  </svg>
);

// ─── Helpers ───

function formatCurrency(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function riskLabelText(score) {
  if (score == null) return "—";
  if (score <= 30) return "Düşük";
  if (score <= 60) return "Orta";
  return "Yüksek";
}

function riskBarClass(score) {
  if (score == null || score <= 30) return styles.riskBarLow;
  if (score <= 60) return styles.riskBarMedium;
  return styles.riskBarHigh;
}

function riskMetricClass(score) {
  if (score == null || score <= 30) return styles.metricRiskLow;
  if (score <= 60) return styles.metricRiskMedium;
  return styles.metricRiskHigh;
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

  // ── Open edit modal (from list) ──
  const openEditFromList = (cp) => {
    setFormName(cp.name || "");
    setFormType(cp.type || "OTHER");
    setFormVkn(cp.vkn || "");
    setFormNotes(cp.notes || "");
    setSelectedCp(cp);
    setEditMode(true);
    setShowModal(true);
  };

  // ── Open edit modal (from detail) ──
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

  // ── Merge metrics with list ──
  const metricsMap = {};
  metrics.forEach((m) => {
    metricsMap[m.counterparty_id] = m;
  });

  // ════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              {activeTab === "detail" && selectedCp
                ? "Cari Detay"
                : "Cari Hesaplar"}
            </h1>
            {activeTab === "list" && (
              <p className={styles.subtitle}>Tüm cari hesaplarınızı yönetin</p>
            )}
          </div>
          <div className={styles.headerActions}>
            {activeTab === "list" && (
              <>
                <button
                  className={styles.btnOutline}
                  onClick={handleBackfill}
                  title="Mevcut planlanan kalemlerden cari oluştur"
                >
                  <IconShuffle /> Otomatik Oluştur
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={() => {
                    setEditMode(false);
                    setFormName("");
                    setFormType("OTHER");
                    setFormVkn("");
                    setFormNotes("");
                    setShowModal(true);
                  }}
                >
                  <IconPlus /> Yeni Cari
                </button>
              </>
            )}
            {activeTab === "detail" && (
              <>
                <button
                  className={styles.btnOutline}
                  onClick={openEditModal}
                >
                  <IconPencil /> Düzenle
                </button>
                <button
                  className={styles.btnOutline}
                  onClick={() => {
                    setActiveTab("list");
                    setSelectedCp(null);
                  }}
                >
                  <IconArrowLeft /> Listeye Dön
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
                      <th className={styles.alignRight}>Toplam Tutar</th>
                      <th className={styles.alignRight}>Ödenen</th>
                      <th className={styles.alignRight}>Kalan</th>
                      <th className={styles.alignCenter}>Ort. Gecikme</th>
                      <th className={styles.alignCenter}>Risk</th>
                      <th className={styles.alignRight}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counterparties.map((cp) => {
                      const m = metricsMap[cp.id] || {};
                      const riskScore = m.risk_score ?? 0;
                      const delayDays = m.avg_payment_delay_days;
                      const delayClass =
                        delayDays == null
                          ? styles.delayNeutral
                          : delayDays < 0
                          ? styles.delayNegative
                          : styles.delayPositive;

                      return (
                        <tr key={cp.id}>
                          <td className={styles.nameCell}>{cp.name}</td>
                          <td>
                            <span
                              className={`${styles.badge} ${typeBadge(cp.type)}`}
                            >
                              {typeLabel(cp.type)}
                            </span>
                          </td>
                          <td className={styles.alignRight}>
                            {formatCurrency(m.total_planned)}
                          </td>
                          <td className={styles.alignRight}>
                            {formatCurrency(m.total_paid)}
                          </td>
                          <td className={styles.alignRight}>
                            {formatCurrency(m.outstanding)}
                          </td>
                          <td className={`${styles.alignCenter} ${delayClass}`}>
                            {delayDays != null
                              ? `${delayDays} gün`
                              : "—"}
                          </td>
                          <td>
                            <div className={styles.riskCell}>
                              <div className={styles.riskHeader}>
                                <span className={styles.riskLabel}>
                                  {riskLabelText(m.risk_score)}
                                </span>
                                <span className={styles.riskPercent}>
                                  {m.risk_score != null
                                    ? `${m.risk_score}%`
                                    : "0%"}
                                </span>
                              </div>
                              <div className={styles.riskTrack}>
                                <div
                                  className={`${styles.riskBar} ${riskBarClass(
                                    m.risk_score
                                  )}`}
                                  style={{ width: `${riskScore}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className={styles.actionsCell}>
                            <div className={styles.actionsGroup}>
                              <button
                                className={styles.btnIcon}
                                title="Düzenle"
                                onClick={() => openEditFromList(cp)}
                              >
                                <IconPencil />
                              </button>
                              <button
                                className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                                title="Sil"
                                onClick={() => handleDelete(cp.id)}
                              >
                                <IconTrash />
                              </button>
                            </div>
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
                <span className={styles.detailVkn}>
                  VKN: {selectedCp.vkn}
                </span>
              )}
              {selectedCp.notes && (
                <p className={styles.detailNotes}>{selectedCp.notes}</p>
              )}
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
                  className={`${styles.metricValue} ${riskMetricClass(
                    singleMetrics.risk_score
                  )}`}
                >
                  {singleMetrics.risk_score != null
                    ? `${singleMetrics.risk_score} (${riskLabelText(singleMetrics.risk_score)})`
                    : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Aliases */}
          <div className={styles.aliasSection}>
            <h3 className={styles.aliasTitle}>
              Banka Açıklama Eşleştirmeleri (Alias)
            </h3>
            <p className={styles.aliasDescription}>
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
                <span className={styles.vknHint}>
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
    </div>
  );
}
