import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function InitialBalanceModal({ isOpen, onClose, token, onSuccess, onError }) {
  const [initialBalance, setInitialBalance] = useState("");
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    
    if (!initialBalance || !balanceDate) {
      setError("Lütfen tüm alanları doldurun");
      if (onError) onError("Lütfen tüm alanları doldurun");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/company/initial-balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          initial_balance: parseFloat(initialBalance),
          initial_balance_date: balanceDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.detail || "Kayıt başarısız";
        setError(errMsg);
        if (onError) onError(errMsg);
      } else {
        console.log("✅ Initial balance saved successfully");
        if (onError) onError("Başlangıç bakiyesi kaydedildi");
        onSuccess();
        onClose();
      }
    } catch (err) {
      const errMsg = err.message || "Beklenmeyen hata";
      setError(errMsg);
      if (onError) onError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "400px",
          width: "min(400px, calc(100% - 32px))",
          boxShadow: "0 20px 25px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ marginBottom: "8px", fontSize: "var(--font-size-h2)", fontWeight: 700 }}>
          💰 Başlangıç Bakiyesi
        </h2>
        <p style={{ color: "#6b7280", fontSize: "var(--font-size-body)", marginBottom: "20px" }}>
          Sisteme girdiğiniz başlangıç bakiyesine göre tahmini nakit pozisyonunuz hesaplanacaktır.
        </p>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "var(--font-size-body)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            Başlangıç Bakiyesi (TL)
          </label>
          <input
            type="number"
            step="0.01"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            placeholder="Örn: 50000"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "var(--font-size-body)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "var(--font-size-body)", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            Tarih
          </label>
          <input
            type="date"
            value={balanceDate}
            onChange={(e) => setBalanceDate(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "var(--font-size-body)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px",
              border: "1px solid #d1d5db",
              background: "white",
              borderRadius: "6px",
              fontSize: "var(--font-size-body)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              background: saving ? "#9ca3af" : "#2563eb",
              color: "white",
              borderRadius: "6px",
              fontSize: "var(--font-size-body)",
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
