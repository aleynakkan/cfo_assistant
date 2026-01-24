import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./CashForecastCard.module.css";

export default function CashForecastCard({ estimatedCash, onChartDataUpdate }) {
  const [period, setPeriod] = useState(30);
  const [chartData, setChartData] = useState([]);
  const [projectedAmount, setProjectedAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fallback mock veri
  const generateMockData = (days) => {
    const weeks = Math.ceil((days + 6) / 7);
    const data = [];
    const startValue = -75000;
    
    for (let i = 0; i <= weeks; i++) {
      data.push({
        name: i === 0 ? "BUGÜN" : `${i}. HAFTA`,
        value: startValue + Math.sin(i / 2) * 30000 + Math.random() * 5000,
      });
    }
    return data;
  };

  // API'dan veri yükle veya mock kullan
  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const token = localStorage.getItem("auth_token") || "";
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
        
        const response = await fetch(
          `${API_BASE}/dashboard/forecast/${period}`,
          { headers }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        setChartData(data);
        onChartDataUpdate?.(data);
        
        if (data.length > 0) {
          setProjectedAmount(data[data.length - 1].value);
        }
      } catch (error) {
        console.error("Forecast fetch error:", error);
        
        // Fallback: mock veri
        const mockData = generateMockData(period);
        setChartData(mockData);
        onChartDataUpdate?.(mockData);
        if (mockData.length > 0) {
          setProjectedAmount(mockData[mockData.length - 1].value);
        }
      }
    };

    fetchForecast();
  }, [period, estimatedCash]);

  console.log("Rendering with chartData:", chartData, "amount:", projectedAmount);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Nakit Tahmini</h3>
        <div>
          <select
            value={period}
            onChange={(e) => {
              const newPeriod = Number(e.target.value);
              setPeriod(newPeriod);
            }}
            className={styles.filterSelect}
            disabled={loading}
          >
            <option value={30}>30 Gün</option>
            <option value={60}>60 Gün</option>
            <option value={90}>90 Gün</option>
          </select>
        </div>
      </div>

      <div className={styles.amount}>
        <span className={styles.amountValue}>
          {projectedAmount.toLocaleString("tr-TR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </span>
        <span className={styles.currency}>TL</span>
      </div>

      <div className={styles.chartContainer}>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc0005" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#dc0005" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value) =>
                  `${(value / 1000).toFixed(0)}k`
                }
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
                }}
                formatter={(value) =>
                  `${value.toLocaleString("tr-TR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })} TL`
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#dc0005"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorValue)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: "center", color: "#999", padding: "40px 20px" }}>
            Grafik yükleniyor...
          </div>
        )}
      </div>
    </div>
  );
}
