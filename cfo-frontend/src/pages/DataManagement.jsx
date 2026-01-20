import { useState, useEffect } from "react";
import styles from "./DataManagement.module.css";

export default function DataManagement() {
  const [transactions, setTransactions] = useState([]);
  const [plannedItems, setPlannedItems] = useState([]);
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [selectedPlanned, setSelectedPlanned] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("transactions");

  const token = localStorage.getItem("auth_token");
  const headers = token ? { "Authorization": `Bearer ${token}` } : {};

  // Fetch transactions
  useEffect(() => {
    fetchTransactions();
  }, []);

  // Fetch planned items
  useEffect(() => {
    fetchPlannedItems();
  }, []);

  const fetchTransactions = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_BASE}/transactions`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        setTransactions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Fetch transactions error:", error);
    }
  };

  const fetchPlannedItems = async () => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_BASE}/planned`,
        { headers }
      );
      if (response.ok) {
        const data = await response.json();
        setPlannedItems(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Fetch planned items error:", error);
    }
  };

  const handleSelectTransaction = (id) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };

  const handleSelectPlanned = (id) => {
    const newSelected = new Set(selectedPlanned);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPlanned(newSelected);
  };

  const deleteSelectedTransactions = async () => {
    if (selectedTransactions.size === 0) return;
    if (!window.confirm(`${selectedTransactions.size} işlemi silmek istediğinizden emin misiniz?`)) return;

    setLoading(true);
    try {
      for (const id of selectedTransactions) {
        await fetch(`http://localhost:8000/transactions/${id}`, {
          method: "DELETE",
          headers,
        });
      }
      setSelectedTransactions(new Set());
      fetchTransactions();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme işleminde hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const deleteSelectedPlanned = async () => {
    if (selectedPlanned.size === 0) return;
    if (!window.confirm(`${selectedPlanned.size} planı silmek istediğinizden emin misiniz?`)) return;

    setLoading(true);
    try {
      for (const id of selectedPlanned) {
        await fetch(`http://localhost:8000/planned/${id}`, {
          method: "DELETE",
          headers,
        });
      }
      setSelectedPlanned(new Set());
      fetchPlannedItems();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Silme işleminde hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Veri Yönetimi</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "transactions" ? styles.active : ""}`}
          onClick={() => setActiveTab("transactions")}
        >
          İşlemler ({transactions.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "planned" ? styles.active : ""}`}
          onClick={() => setActiveTab("planned")}
        >
          Planlar ({plannedItems.length})
        </button>
      </div>

      {activeTab === "transactions" && (
        <div className={styles.section}>
          <div className={styles.toolbar}>
            <span>
              {selectedTransactions.size} seçildi
            </span>
            {selectedTransactions.size > 0 && (
              <button
                className={styles.deleteBtn}
                onClick={deleteSelectedTransactions}
                disabled={loading}
              >
                {loading ? "Siliniyor..." : "Sil"}
              </button>
            )}
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTransactions(new Set(transactions.map(t => t.id)));
                        } else {
                          setSelectedTransactions(new Set());
                        }
                      }}
                    />
                  </th>
                  <th>Tarih</th>
                  <th>Açıklama</th>
                  <th>Kategori</th>
                  <th>Tutar</th>
                  <th>Yön</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(tx.id)}
                        onChange={() => handleSelectTransaction(tx.id)}
                      />
                    </td>
                    <td>{tx.date}</td>
                    <td>{tx.description}</td>
                    <td>{tx.category}</td>
                    <td>{parseFloat(tx.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</td>
                    <td>
                      <span className={tx.direction === "in" ? styles.income : styles.expense}>
                        {tx.direction === "in" ? "Gelir" : "Gider"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "planned" && (
        <div className={styles.section}>
          <div className={styles.toolbar}>
            <span>
              {selectedPlanned.size} seçildi
            </span>
            {selectedPlanned.size > 0 && (
              <button
                className={styles.deleteBtn}
                onClick={deleteSelectedPlanned}
                disabled={loading}
              >
                {loading ? "Siliniyor..." : "Sil"}
              </button>
            )}
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={selectedPlanned.size === plannedItems.length && plannedItems.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPlanned(new Set(plannedItems.map(p => p.id)));
                        } else {
                          setSelectedPlanned(new Set());
                        }
                      }}
                    />
                  </th>
                  <th>Vade</th>
                  <th>Tür</th>
                  <th>Yön</th>
                  <th>Karşı Taraf</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {plannedItems.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={selectedPlanned.has(item.id)}
                        onChange={() => handleSelectPlanned(item.id)}
                      />
                    </td>
                    <td>{item.due_date}</td>
                    <td>{item.type}</td>
                    <td>
                      <span className={item.direction === "in" ? styles.income : styles.expense}>
                        {item.direction === "in" ? "Gelir" : "Gider"}
                      </span>
                    </td>
                    <td>{item.counterparty || "-"}</td>
                    <td>{parseFloat(item.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
