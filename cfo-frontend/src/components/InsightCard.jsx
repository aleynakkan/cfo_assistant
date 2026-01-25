import { useState, useRef, useEffect } from "react";
import useFocusTrap from "../hooks/useFocusTrap";
import styles from "./InsightCard.module.css";
import warningIcon from "../assets/warning.svg";

// Telemetry stub (replace with actual implementation)
function sendTelemetry(eventName, payload) {
  console.log("[Telemetry]", eventName, payload);
}

// Format helper
const fmt = (n, min = 2, max = 2) =>
  Number(n || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

// Render metric based on insight type
function renderMetric(insight) {
  if (!insight?.metric) return null;
  const m = insight.metric;
  
  switch (insight.id) {
    case "planned_upcoming_7d":
      return (
        <div className={styles.metricRow}>
          <span className={styles.metricBadgeGreen}>Tahsilat: {fmt(m.planned_in_7)} TL</span>
          <span className={styles.metricBadgeRed}>Ödeme: {fmt(m.planned_out_7)} TL</span>
        </div>
      );
    case "net_drop_mom":
      const pct = typeof m.change_pct === "number" ? m.change_pct * 100 : null;
      return (
        <div className={styles.metricText}>
          <span>Son 30g: {fmt(m.net_last30)} TL</span>
          <span>Önceki 30g: {fmt(m.net_prev30)} TL</span>
          {pct !== null && <span>Değişim: {fmt(pct, 0, 0)}%</span>}
        </div>
      );
    case "category_spike":
      const list = Array.isArray(m.top_spikes) ? m.top_spikes.slice(0, 3) : [];
      return (
        <ul className={styles.metricList}>
          {list.map((it, idx) => (
            <li key={idx}>
              {it.category}: {fmt(it.last30_out)} TL (baz: {fmt(it.baseline_month)} TL, x{fmt(it.ratio, 2, 2)})
            </li>
          ))}
        </ul>
      );
    case "large_transactions":
      const items = Array.isArray(m.items) ? m.items.slice(0, 3) : [];
      return (
        <>
          <div className={styles.metricText}>Eşik: {fmt(m.threshold)} TL</div>
          {items.length > 0 && (
            <ul className={styles.metricList}>
              {items.map((t, idx) => (
                <li key={idx}>
                  {t.date} • {fmt(t.amount)} TL • {t.category}
                  {t.description ? ` — ${String(t.description).slice(0, 60)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      );
    case "top_expense_drivers":
      const drivers = Array.isArray(m.items) ? m.items : [];
      return (
        <ul className={styles.metricList}>
          {drivers.map((it, idx) => (
            <li key={idx}>
              {it.category}: {fmt(it.out)} TL (pay: {fmt((it.share || 0) * 100, 0, 0)}%)
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

// Severity icon mapping
const severityConfig = {
  critical: { icon: "🔴", label: "Kritik", labelEn: "Critical" },
  medium: { icon: <img src={warningIcon} alt="Warning" style={{ width: "20px", height: "20px" }} />, label: "Uyarı", labelEn: "Warning" },
  info: { icon: "ℹ️", label: "Bilgi", labelEn: "Info" },
  low: { icon: "📊", label: "Bilgi", labelEn: "Info" },
};

// i18n strings (Turkish primary, English fallback)
const i18n = {
  readMore: { tr: "Devamını oku", en: "Read more" },
  close: { tr: "Kapat", en: "Close" },
  loading: { tr: "Yükleniyor...", en: "Loading..." },
  error: { tr: "Hata:", en: "Error:" },
  details: { tr: "Detaylar", en: "Details" },
  suggestedActions: { tr: "Önerilen İşlemler", en: "Suggested Actions" },
  processing: { tr: "İşleniyor...", en: "Processing..." },
  success: { tr: "İşlem başarılı ✓", en: "Success ✓" },
};

const lang = "tr"; // Set based on user preference

export default function InsightCard({ insight, token, onRefresh, variant = "compact" }) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const modalRef = useRef(null);
  useFocusTrap(modalRef, modalOpen);

  const severity = insight.severity || "info";
  const config = severityConfig[severity] || severityConfig.info;
  const messagePreview = insight.message?.slice(0, 120) || "";
  const hasMore = (insight.message?.length || 0) > 120;

  // Open drilldown modal
  const handleOpenDetail = async () => {
    sendTelemetry("insight_card_clicked", { insightId: insight.id, severity });
    setModalOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/dashboard/insights/${insight.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to fetch insight details (${res.status})`);
      const data = await res.json();
      setDetailData(data);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Apply suggestion action
  const handleApplySuggestion = async () => {
    sendTelemetry("insight_action_apply", { insightId: insight.id });
    setActionLoading(true);
    setActionMessage("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/dashboard/insights/${insight.id}/apply-suggestion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ insight_id: insight.id }),
      });
      if (!res.ok) throw new Error(`Action failed (${res.status})`);
      const result = await res.json();
      setActionMessage(result.message || "İşlem başarılı ✓");
      
      // Close modal after 1.5s and refresh
      setTimeout(() => {
        setModalOpen(false);
        if (onRefresh) onRefresh();
      }, 1500);
    } catch (err) {
      setActionMessage(`Hata: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenDetail();
    }
  };

  const handleModalKeyDown = (e) => {
    if (e.key === "Escape") {
      setModalOpen(false);
    }
  };

  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [modalOpen]);

  return (
    <>
      {/* Card */}
      <div
        className={`${styles.card} ${styles[`severity-${severity}`]} ${variant === "expanded" ? styles.cardExpanded : ""}`}
        role="button"
        tabIndex={0}
        onClick={handleOpenDetail}
        onKeyDown={handleKeyDown}
        aria-label={`${config.label}: ${insight.title}`}
        aria-describedby={`insight-${insight.id}-desc`}
      >
        <div className={styles.icon} aria-hidden="true">
          {config.icon}
        </div>
        <div className={styles.content}>
          <div className={styles.title}>{insight.title}</div>
          <div id={`insight-${insight.id}-desc`} className={styles.message}>
            {expanded || !hasMore ? insight.message : `${messagePreview}...`}
            {hasMore && !expanded && (
              <button
                className={styles.readMore}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                aria-label={i18n.readMore[lang]}
              >
                {i18n.readMore[lang]}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drilldown Modal */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)} onKeyDown={handleModalKeyDown}>
          <div
            ref={modalRef}
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className={styles.modalHeader}>
              <h3 id="modal-title" className={styles.modalTitle}>
                {config.icon} {insight.title}
              </h3>
              <button
                className={styles.closeBtn}
                onClick={() => setModalOpen(false)}
                aria-label={i18n.close[lang]}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {detailLoading && <div className={styles.loading}>{i18n.loading[lang]}</div>}
              {detailError && <div className={styles.error}>{i18n.error[lang]} {detailError}</div>}
              {detailData && (
                <>
                  <p className={styles.detailMessage}>{detailData.message || insight.message}</p>
                  {detailData.metric && (
                    <div className={styles.detailMetric}>
                      <h4>{i18n.details[lang]}</h4>
                      {renderMetric({ ...insight, metric: detailData.metric })}
                    </div>
                  )}
                  {detailData.actions && detailData.actions.length > 0 && (
                    <div className={styles.actionArea}>
                      <h4>{i18n.suggestedActions[lang]}</h4>
                      <div className={styles.actionButtons}>
                        {detailData.actions.map((action, idx) => (
                          <button
                            key={idx}
                            className={styles.actionBtn}
                            onClick={handleApplySuggestion}
                            disabled={actionLoading}
                            aria-label={action.label}
                          >
                            {actionLoading ? i18n.processing[lang] : action.label}
                          </button>
                        ))}
                      </div>
                      {actionMessage && (
                        <div className={styles.actionFeedback} role="status" aria-live="polite">
                          {actionMessage}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
