# Dashboard Insights Implementation

## Endpoint
```
GET /dashboard/insights?period=last30
```

**Query Parameters:**
- `period`: "last30" (default), "last90", "this_month", "all"

---

## Response Structure
```json
{
  "period": "last30",
  "generated_at": "2025-12-23",
  "insights": [ ... ],
  "debug": {
    "window_start": "2025-11-23",
    "window_end": "2025-12-23"
  }
}
```

---

## 5 Insight Types Implemented

### 1️⃣ YAKLAŞAN PLANLÎ NAKIT (Upcoming Planned Items)
**ID:** `planned_upcoming_7d`

**Hesap Mantığı:**
```
in7 = SUM(planned_cashflow_items.amount WHERE direction='in' AND 0..7 gün)
out7 = SUM(planned_cashflow_items.amount WHERE direction='out' AND 0..7 gün)
```

**Filter Koşulu:**
- `status IN ('OPEN', 'PARTIAL')`
- `due_date BETWEEN today AND today+7`

**Output Örneği:**
```json
{
  "id": "planned_upcoming_7d",
  "severity": "medium",
  "title": "Yaklaşan Planlı Nakit (7 gün)",
  "message": "7 gün içinde 48.200 TL ödeme ve 12.000 TL tahsilat görünüyor.",
  "metric": {"planned_in_7": 12000.00, "planned_out_7": 48200.00}
}
```

---

### 2️⃣ NET NAKİT AKIŞI TRENDİ (Net Cashflow Trend)
**ID:** `net_drop_mom`

**Hesap Mantığı:**
```
net_last30 = SUM(in) - SUM(out) [son 30 gün]
net_prev30 = SUM(in) - SUM(out) [önceki 30 gün]
change_pct = (net_last30 - net_prev30) / |net_prev30|
```

**Tetikleyici (Warning Threshold):**
```
IF change_pct <= -0.20 (yani %20+ düşüş) → Insight
```

**Output Örneği:**
```json
{
  "id": "net_drop_mom",
  "severity": "medium",
  "title": "Net nakit akışı düşüşte",
  "message": "Son 30 gün net nakit akışı önceki 30 güne göre %32 azaldı.",
  "metric": {
    "net_last30": -15000.50,
    "net_prev30": -10000.00,
    "change_pct": -0.5000
  }
}
```

---

### 3️⃣ KATEGORİ ANOMALİSİ (Expense Spike Detection)
**ID:** `category_spike`

**Hesap Mantığı:**
```
last30_out[category] = SUM(direction='out') [son 30 gün]
last90_out[category] = SUM(direction='out') [son 90 gün]
baseline_month = last90_out / 3 [aylık ortalama]
ratio = last30_out / baseline_month
```

**Tetikleyici:**
```
IF last30_out >= 3000 AND ratio >= 1.35 → Anomali
```

**Output Örneği:**
```json
{
  "id": "category_spike",
  "severity": "medium",
  "title": "Kategori bazlı gider artışı",
  "message": "Artış tespit edildi: İklimlendirme x1.85, Malzeme x1.42",
  "metric": {
    "top_spikes": [
      {
        "category": "İklimlendirme",
        "last30_out": 8500.00,
        "baseline_month": 4600.00,
        "ratio": 1.85
      }
    ]
  }
}
```

---

### 4️⃣ BÜYÜK İŞLEMLER (Large Transactions)
**ID:** `large_transactions`

**Hesap Mantığı:**
```
threshold = MAX(10000, p95_of_last_90_days_out_amounts)
big_txns = [txn WHERE amount >= threshold AND last30 days]
```

**P95 Hesabı:**
- Son 90 gün çıkışların amount'larını sırala
- 95. percentile'ı al
- 10.000 TL ile karşılaştırarak max'ını threshold olarak kullan

**Output Örneği:**
```json
{
  "id": "large_transactions",
  "severity": "low",
  "title": "Büyük işlemler (son 30 gün)",
  "message": "12500.00 TL üzeri 3 işlem tespit edildi.",
  "metric": {
    "threshold": 12500.00,
    "items": [
      {
        "date": "2025-12-15",
        "amount": 25000.00,
        "direction": "out",
        "category": "Kira",
        "description": "Aralık ayı kira ödemesi"
      }
    ]
  }
}
```

---

### 5️⃣ EN BÜYÜK GİDER SÜRÜKLEYICILERI (Top Expense Drivers)
**ID:** `top_expense_drivers`

**Hesap Mantığı:**
```
top3_categories = ORDER BY SUM(direction='out') DESC LIMIT 3
FOR each category:
  out = SUM(direction='out')
  share = out / total_out
```

**Output Örneği:**
```json
{
  "id": "top_expense_drivers",
  "severity": "low",
  "title": "En büyük gider sürükleyicileri",
  "message": "Son 30 günde en çok gider çıkan kategoriler listelendi.",
  "metric": {
    "total_out": 125000.00,
    "items": [
      {"category": "Kira", "out": 45000.00, "share": 0.3600},
      {"category": "Maaşlar", "out": 35000.00, "share": 0.2800},
      {"category": "İklimlendirme", "out": 8500.00, "share": 0.0680}
    ]
  }
}
```

---

## Frontend Integration

**Simple fetch:**
```javascript
const response = await fetch('http://localhost:8000/dashboard/insights?period=last30');
const data = await response.json();

// data.insights array'ını iterate et
data.insights.forEach(insight => {
  console.log(insight.title, insight.message);
});
```

**Example Usage in React:**
```jsx
const [insights, setInsights] = useState([]);

useEffect(() => {
  fetch('/dashboard/insights?period=last30')
    .then(r => r.json())
    .then(data => setInsights(data.insights));
}, []);

return (
  <div className="insights-panel">
    {insights.map(insight => (
      <div key={insight.id} className={`insight severity-${insight.severity}`}>
        <h4>{insight.title}</h4>
        <p>{insight.message}</p>
      </div>
    ))}
  </div>
);
```

---

## Implementation Notes

✅ **Company Scoping:** Tüm sorgular `company_id` ile filtrelenir
✅ **Date Windows:** Dynamic period support (last30, last90, this_month, all)
✅ **Robustness:** NULL handling, empty result handling
✅ **Performance:** Efficient aggregation queries, p95 calculation Python-side
✅ **Rounding:** Tüm monetary values 2 decimal place ile

---

## Test Curl

```bash
# Test endpoint
curl http://localhost:8000/dashboard/insights?period=last30

# With period parameter
curl http://localhost:8000/dashboard/insights?period=last90
```
