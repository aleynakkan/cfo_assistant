import { useState, useEffect } from "react";

export default function ErrorToast({ message, type = "error", duration = 5000, onDismiss }) {
  const [isVisible, setIsVisible] = useState(!!message);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onDismiss) onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onDismiss]);

  if (!isVisible || !message) return null;

  const bgColor = type === "error" ? "#fef2f2" : type === "success" ? "#f0fdf4" : "#fffbeb";
  const borderColor = type === "error" ? "#fecaca" : type === "success" ? "#86efac" : "#fde047";
  const textColor = type === "error" ? "#dc0005" : type === "success" ? "#059669" : "#f59e0b";
  const icon = type === "error" ? "⚠" : type === "success" ? "✓" : "ℹ";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        background: bgColor,
        border: `1px solid ${borderColor}`,
        color: textColor,
        padding: "12px 16px",
        borderRadius: "8px",
        fontSize: "var(--font-size-body)",
        zIndex: 10000,
        maxWidth: "90%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span style={{ fontSize: "var(--font-size-h3)" }}>{icon}</span>
      <span>{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          if (onDismiss) onDismiss();
        }}
        style={{
          background: "none",
          border: "none",
          color: textColor,
          cursor: "pointer",
          fontSize: "var(--font-size-h3)",
          marginLeft: "8px",
          padding: "0",
        }}
      >
        ✕
      </button>
    </div>
  );
}
