import { useState, useMemo, useEffect } from 'react';
import styles from "./FixedCostCard.module.css";

// Category -> Color mapping
const categoryColors = {
  KIRA: '#dc0005',
  MAAS: '#ef3b2c',
  ELEKTRIK: '#e7000b',
  SU: '#ff6b5b',
  INTERNET: '#ff9999',
  SIGORTA: '#cc0004',
  VERGI: '#a00003',
  AKARYAKIT: '#ff4444',
  KARGO: '#dd0000',
  OFIS_MALZEME: '#aa0002',
  DIGER_GIDER: '#880001',
};

// Month names in Turkish
const monthNames = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function getMonthName(date) {
  return monthNames[date.getMonth()];
}

// Simple Donut Chart Component
function DonutChart({ data, onHoverChange, hoveredCategory }) {
  if (!data || data.length === 0) {
    return (
      <svg width="300" height="300" viewBox="-30 -30 260 260" className={styles.svg}>
        <text x="100" y="100" textAnchor="middle" dy="0.3em" fill="#999" fontSize="12">
          Veri yok
        </text>
      </svg>
    );
  }

  const total = data.reduce((sum, item) => sum + (item.amount || item.value || 0), 0);
  if (total === 0) {
    return (
      <svg width="300" height="300" viewBox="-30 -30 260 260" className={styles.svg}>
        <text x="100" y="100" textAnchor="middle" dy="0.3em" fill="#999" fontSize="12">
          0 TL
        </text>
      </svg>
    );
  }

  let cumulativeAngle = 0;

  const segments = data.map((item, index) => {
    const value = item.amount || item.value || 0;
    const percentage = (value / total) * 100;
    const angle = (percentage / 100) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const innerRadius = 75;
    const outerRadius = 95;

    return (
      <DonutSegment
        key={index}
        item={item}
        index={index}
        startRad={startRad}
        endRad={endRad}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        onHoverChange={onHoverChange}
        hoveredCategory={hoveredCategory}
      />
    );
  });

  return (
    <svg width="300" height="300" viewBox="-30 -30 260 260" className={styles.svg}>
      {segments}
    </svg>
  );
}

// Donut Segment Component
function DonutSegment({ item, index, startRad, endRad, innerRadius, outerRadius, onHoverChange, hoveredCategory }) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHoverChange?.(item.category);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHoverChange?.(null);
  };

  // Segment'i highlight et: hover'da veya liste item'den geldiğinde
  const shouldHighlight = isHovered || hoveredCategory === item.category;
  const expandRadius = shouldHighlight ? 10 : 0;

  const x1 = 100 + (innerRadius - expandRadius) * Math.cos(startRad);
  const y1 = 100 + (innerRadius - expandRadius) * Math.sin(startRad);
  const x2 = 100 + (outerRadius + expandRadius) * Math.cos(startRad);
  const y2 = 100 + (outerRadius + expandRadius) * Math.sin(startRad);
  const x3 = 100 + (outerRadius + expandRadius) * Math.cos(endRad);
  const y3 = 100 + (outerRadius + expandRadius) * Math.sin(endRad);
  const x4 = 100 + (innerRadius - expandRadius) * Math.cos(endRad);
  const y4 = 100 + (innerRadius - expandRadius) * Math.sin(endRad);

  const largeArc = Math.abs(endRad - startRad) > Math.PI ? 1 : 0;

  const path = `
    M ${x2} ${y2}
    A ${outerRadius + expandRadius} ${outerRadius + expandRadius} 0 ${largeArc} 1 ${x3} ${y3}
    L ${x4} ${y4}
    A ${innerRadius - expandRadius} ${innerRadius - expandRadius} 0 ${largeArc} 0 ${x1} ${y1}
    Z
  `;

  // Tooltip position - dış tarafta göster
  const midAngleRad = (startRad + endRad) / 2;
  const tooltipRadius = outerRadius + 15; // Donut'ın dış tarafında
  const tooltipX = 100 + tooltipRadius * Math.cos(midAngleRad);
  const tooltipY = 100 + tooltipRadius * Math.sin(midAngleRad);

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: "pointer" }}
    >
      <path
        d={path}
        fill={item.color || '#dc0005'}
        stroke="white"
        strokeWidth={shouldHighlight ? "3" : "2"}
        opacity={shouldHighlight ? 1 : 0.9}
        filter={shouldHighlight ? "drop-shadow(0 2px 6px rgba(0,0,0,0.2))" : "none"}
        style={{ transition: "all 0.2s ease" }}
      />
      {shouldHighlight && (
        <text
          x={tooltipX}
          y={tooltipY}
          textAnchor="middle"
          dy="0.3em"
          fill="#1f2937"
          fontSize="11"
          fontWeight="600"
          pointerEvents="none"
          style={{ transition: "opacity 0.2s ease" }}
        >
          {item.name}
        </text>
      )}
    </g>
  );
}

export default function FixedCostCard({ data, token }) {
  const [dateFilter, setDateFilter] = useState('current_month');
  const [filteredData, setFilteredData] = useState(data || []);
  const [loading, setLoading] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState(null);

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Backend'den tarih filtresine göre veri çek
  useEffect(() => {
    const fetchFixedCosts = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/dashboard/fixed-costs-analysis?period=${dateFilter}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        if (!res.ok) {
          console.error("Fixed costs fetch failed:", res.status);
          setFilteredData(data || []);
          return;
        }

        const json = await res.json();
        console.log("Fetched fixed costs with period:", dateFilter, json);
        setFilteredData(json);
      } catch (e) {
        console.error("Error fetching fixed costs:", e);
        setFilteredData(data || []);
      } finally {
        setLoading(false);
      }
    };

    fetchFixedCosts();
  }, [dateFilter, token, API_BASE]);

  // Debug log
  console.log("FixedCostCard received data:", data);

  // Eğer data varsa kullan, yoksa empty array
  const chartData = (filteredData && Array.isArray(filteredData) && filteredData.length > 0)
    ? filteredData.map(item => ({
        name: item.category || 'Diğer',
        // Backend döndürüyor: current_month, avg_monthly, amount, value vs
        amount: item.current_month || item.amount || item.value || 0,
        color: categoryColors[item.category] || '#dc0005',
        category: item.category,
      }))
      .sort((a, b) => b.amount - a.amount) // Büyükten küçüğe sırala
    : [];

  console.log("Processed chartData:", chartData);

  const totalCost = chartData.reduce((sum, item) => sum + (item.amount || 0), 0);

  const fmt = (n) =>
    Number(n || 0).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  // Get month names based on filter - dinamik ve memoized
  const dateLabel = useMemo(() => {
    const today = new Date();
    if (dateFilter === 'current_month') {
      return `Bu Ay: ${getMonthName(today)}`;
    } else if (dateFilter === 'last_30_days') {
      return 'Son 30 Gün';
    } else if (dateFilter === 'prev_month') {
      const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return `Önceki Ay: ${getMonthName(prevDate)}`;
    }
    return 'Sabit Gider Analizi';
  }, [dateFilter]);

  return (
    <div className={styles.card}>
      {/* Header with Title and Date Filter */}
      <div className={styles.header}>
        <h3 className={styles.cardTitle}>Sabit Gider Analizi</h3>
        <div className={styles.dateFilter}>
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="current_month">Bu Ay</option>
            <option value="last_30_days">Son 30 Gün</option>
            <option value="prev_month">Önceki Ay</option>
          </select>
        </div>
      </div>

      {/* Date Label */}
      <div className={styles.dateLabel}>
        {loading ? "Yükleniyor..." : dateLabel}
      </div>

      {/* Chart and List Container */}
      <div className={styles.content} style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.2s" }}>
        {/* Donut Chart */}
        <div className={styles.chartContainer}>
          <div className={styles.chartWrapper}>
            <DonutChart data={chartData} onHoverChange={setHoveredCategory} hoveredCategory={hoveredCategory} />
            <div className={styles.chartCenter}>
              <div className={styles.chartLabel}>Toplam Gider</div>
              <div className={styles.chartValue}>{fmt(totalCost)} TL</div>
            </div>
          </div>
        </div>

        {/* List */}
        <div className={styles.list}>
          {chartData.length > 0 ? (
            chartData.map((item, index) => (
              <div 
                key={index} 
                className={styles.listItem}
                onMouseEnter={() => setHoveredCategory(item.category)}
                onMouseLeave={() => setHoveredCategory(null)}
                style={{
                  backgroundColor: hoveredCategory === item.category ? "#f0f9ff" : "transparent",
                  borderLeft: hoveredCategory === item.category ? "3px solid " + item.color : "3px solid transparent",
                  transition: "all 0.2s ease",
                  cursor: "pointer"
                }}
              >
                <div className={styles.itemLeft}>
                  <div 
                    className={styles.colorDot} 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={styles.itemName}>{item.name}</span>
                </div>
                <span className={styles.itemValue}>{fmt(item.amount)} TL</span>
              </div>
            ))
          ) : (
            <p style={{ color: '#999', textAlign: 'center', padding: '16px 0' }}>
              Sabit gider verisi yok
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
