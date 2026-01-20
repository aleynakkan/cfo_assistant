# CFO Assistant Refactoring Plan

## Current State
- **App.jsx**: ~3552 lines
- **Main components**: DashboardView, DataManagementView (both embedded in App.jsx)
- **State management**: 50+ useState calls in App.jsx
- **API calls**: Mixed throughout components
- **Modals**: 10+ modals with open/close state scattered

## Proposed Folder Structure

```
src/
├── App.jsx                          # Entry point - routing only
├── pages/
│   ├── Dashboard.jsx                # Dashboard page wrapper
│   └── DataManagement.jsx            # Data Management page wrapper
├── features/
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── DashboardLayout.jsx
│   │   │   ├── InsightsPanel.jsx
│   │   │   ├── KPICards.jsx
│   │   │   ├── CashForecastCard.jsx
│   │   │   ├── FixedCostCard.jsx
│   │   │   └── ExceptionsModal.jsx
│   │   ├── hooks/
│   │   │   └── useDashboard.js      # Dashboard data loading
│   │   └── api/
│   │       └── dashboardApi.js      # Dashboard API calls
│   │
│   └── data/
│       ├── components/
│       │   ├── DataLayout.jsx
│       │   ├── TransactionTable.jsx
│       │   ├── PlannedTable.jsx
│       │   ├── modals/
│       │   │   ├── UploadModal.jsx
│       │   │   ├── ManualEntryModal.jsx
│       │   │   ├── EditTransactionModal.jsx
│       │   │   ├── MatchModal.jsx
│       │   │   ├── PlannedMatchesModal.jsx
│       │   │   ├── BankUploadModal.jsx
│       │   │   └── CategorizeModal.jsx
│       │   └── tables/
│       │       ├── TransactionTableRows.jsx
│       │       └── PlannedTableRows.jsx
│       ├── hooks/
│       │   ├── useDataManagement.js  # Data loading & filtering
│       │   └── useModalState.js      # Modal state management
│       ├── stores/
│       │   └── modalStore.js         # Zustand: modal open/close
│       └── api/
│           ├── transactionApi.js
│           ├── plannedApi.js
│           └── bankApi.js
│
├── hooks/
│   ├── useAuth.js                   # Auth logic
│   └── useDashboardData.js           # React Query setup for dashboard
│
├── api/
│   ├── client.js                    # Fetch wrapper (apiFetch)
│   └── config.js                    # API_BASE, endpoints
│
├── components/
│   ├── Navbar.jsx                   # (already exists)
│   ├── Sidebar.jsx                  # (already exists)
│   ├── InitialBalanceModal.jsx       # (already extracted)
│   └── AiChatPanel.jsx              # (already extracted)
│
└── index.css
```

## Components to Extract

### From App.jsx Root Level:
1. **AuthContext + useAuth()**
   - Manages token state and login/logout
   - Currently: token, setToken, handleLogout

### From DashboardView:
1. **DashboardLayout.jsx** - Main wrapper
2. **KPICards.jsx** - Summary cards
3. **CashForecastCard.jsx** - Forecast visualization
4. **FixedCostCard.jsx** - Fixed costs visualization
5. **ExceptionsModal.jsx** - Exceptions/overdue items
6. **InsightsPanel.jsx** - Dashboard insights

### From DataManagementView:
1. **DataLayout.jsx** - Main wrapper
2. **TransactionTable.jsx** - Transactions list
3. **PlannedTable.jsx** - Planned items list

**Modals (10 files):**
1. **UploadModal.jsx** - CSV upload
2. **BankUploadModal.jsx** - Bank files (Akbank, Enpara, Yapıkredi)
3. **ManualEntryModal.jsx** - Manual transaction/planned entry
4. **EditTransactionModal.jsx** - Edit transaction inline
5. **CategorizeModal.jsx** - Change category
6. **MatchModal.jsx** - Match transaction to planned
7. **PlannedMatchesModal.jsx** - View/manage planned matches

## State Management Strategy

### Zustand Modal Store
**Location**: `src/features/data/stores/modalStore.js`

```javascript
// Centralized UI state for all modals
import { create } from 'zustand';

export const useModalStore = create((set) => ({
  // Modal visibility states
  uploadModalOpen: false,
  bankUploadModalOpen: false,
  manualEntryModalOpen: false,
  matchModalOpen: false,
  plannedMatchesModalOpen: false,
  exceptionModalOpen: false,
  categorizeModalOpen: false,
  
  // Selected row/item states
  selectedTransaction: null,
  selectedPlanned: null,
  selectedBank: 'akbank',
  manualEntryType: 'transaction',
  
  // Modal actions
  openUploadModal: () => set({ uploadModalOpen: true }),
  closeUploadModal: () => set({ uploadModalOpen: false }),
  
  openBankUploadModal: (bank) => set({ 
    bankUploadModalOpen: true, 
    selectedBank: bank 
  }),
  closeBankUploadModal: () => set({ bankUploadModalOpen: false }),
  
  openMatchModal: (planned) => set({ 
    matchModalOpen: true, 
    selectedPlanned: planned 
  }),
  closeMatchModal: () => set({ 
    matchModalOpen: false, 
    selectedPlanned: null 
  }),
  
  // Add more as needed...
}));
```

### React Query Hooks
**Location**: `src/features/dashboard/hooks/useDashboard.js`

```javascript
import { useQuery } from '@tanstack/react-query';
import * as dashboardApi from '../api/dashboardApi';

export function useDashboard(token, globalFilter) {
  return useQuery({
    queryKey: ['dashboard', globalFilter],
    queryFn: () => dashboardApi.loadDashboard(token, globalFilter),
    enabled: !!token,
  });
}

export function useCategorySummary(token, categoryFilter) {
  return useQuery({
    queryKey: ['categorySummary', categoryFilter],
    queryFn: () => dashboardApi.loadCategorySummary(token, categoryFilter),
    enabled: !!token,
  });
}
```

## API Organization

### Extract all API calls to dedicated files

**Location**: `src/api/client.js`
```javascript
const API_BASE = "http://localhost:8000";

export async function apiFetch(path, options = {}, token) {
  const headers = options.headers ? { ...options.headers } : {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "API Error");
  }
  
  return response.json();
}
```

**Location**: `src/features/data/api/transactionApi.js`
```javascript
import { apiFetch } from '../../../api/client';

export async function uploadTransactions(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/transactions/upload-csv', {
    method: 'POST',
    body: formData,
  }, token);
}

export async function getTransactions(token) {
  return apiFetch('/transactions', {}, token);
}

export async function deleteTransaction(txId, token) {
  return apiFetch(`/transactions/${txId}`, { method: 'DELETE' }, token);
}

export async function updateTransactionCategory(txId, category, token) {
  return apiFetch(`/transactions/${txId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  }, token);
}
```

**Location**: `src/features/data/api/plannedApi.js`
```javascript
import { apiFetch } from '../../../api/client';

export async function getPlannedItems(token) {
  return apiFetch('/planned', {}, token);
}

export async function createPlannedItem(data, token) {
  return apiFetch('/planned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, token);
}

export async function deletePlannedItem(plannedId, token) {
  return apiFetch(`/planned/${plannedId}`, { method: 'DELETE' }, token);
}

export async function matchPlanned(plannedId, transactionId, amount, token) {
  return apiFetch(`/planned/${plannedId}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_id: transactionId, amount }),
  }, token);
}
```

## Example Code

### 1. App.jsx (Simplified - Routing Only)

```javascript
import { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DataManagement from './pages/DataManagement';
import InitialBalanceModal from './components/InitialBalanceModal';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { token, setToken, logout } = useAuth();
  const [view, setView] = useState('dashboard');
  const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false);

  const handleLogin = (newToken) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    logout();
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa' }}>
      <Sidebar view={view} onViewChange={setView} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar 
          onLogout={handleLogout}
          onInitialBalance={() => setShowInitialBalanceModal(true)}
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {view === 'dashboard' && (
            <Dashboard token={token} />
          )}
          {view === 'data' && (
            <DataManagement token={token} />
          )}
        </main>
      </div>
      
      <InitialBalanceModal
        isOpen={showInitialBalanceModal}
        onClose={() => setShowInitialBalanceModal(false)}
        token={token}
        onSuccess={() => {}}
      />
    </div>
  );
}
```

### 2. DataManagement.jsx (Page Wrapper)

```javascript
import { useState } from 'react';
import DataLayout from '../features/data/components/DataLayout';
import { useModalStore } from '../features/data/stores/modalStore';

export default function DataManagement({ token }) {
  // All modal state is now in Zustand
  const modalState = useModalStore();

  return (
    <DataLayout token={token} />
  );
}
```

### 3. Modal Store (Zustand)

**Location**: `src/features/data/stores/modalStore.js`

```javascript
import { create } from 'zustand';

export const useModalStore = create((set) => ({
  // Modal visibility
  uploadModalOpen: false,
  bankUploadModalOpen: false,
  manualEntryModalOpen: false,
  matchModalOpen: false,
  plannedMatchesModalOpen: false,
  exceptionModalOpen: false,
  
  // Selected entities
  selectedTransaction: null,
  selectedPlanned: null,
  selectedBank: 'akbank',
  manualEntryType: 'transaction',
  
  // Actions
  openUploadModal: () => set({ uploadModalOpen: true }),
  closeUploadModal: () => set({ uploadModalOpen: false }),
  
  openBankUploadModal: (bank) => set({ bankUploadModalOpen: true, selectedBank: bank }),
  closeBankUploadModal: () => set({ bankUploadModalOpen: false }),
  
  openManualEntryModal: (type) => set({ manualEntryModalOpen: true, manualEntryType: type }),
  closeManualEntryModal: () => set({ manualEntryModalOpen: false }),
  
  openMatchModal: (planned) => set({ matchModalOpen: true, selectedPlanned: planned }),
  closeMatchModal: () => set({ matchModalOpen: false, selectedPlanned: null }),
  
  openPlannedMatchesModal: (planned) => set({ plannedMatchesModalOpen: true, selectedPlanned: planned }),
  closePlannedMatchesModal: () => set({ plannedMatchesModalOpen: false }),
  
  openExceptionModal: () => set({ exceptionModalOpen: true }),
  closeExceptionModal: () => set({ exceptionModalOpen: false }),
}));
```

### 4. EditTransactionModal.jsx (Example Modal)

**Location**: `src/features/data/components/modals/EditTransactionModal.jsx`

```javascript
import { useState } from 'react';
import { updateTransactionCategory } from '../../api/transactionApi';

export default function EditTransactionModal({ 
  transaction, 
  isOpen, 
  onClose, 
  token, 
  categories,
  onSuccess 
}) {
  const [category, setCategory] = useState(transaction?.category || '');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !transaction) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await updateTransactionCategory(transaction.id, category, token);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Hata: Kategori güncellenemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '400px',
        boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
      }}>
        <h2 style={{ marginBottom: '16px' }}>İşlemi Düzenle</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            Kategori
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">Seç</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              border: '1px solid #d1d5db',
              background: 'white',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: saving ? '#9ca3af' : '#2563eb',
              color: 'white',
              borderRadius: '6px',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 5. DataLayout.jsx (Feature Container)

**Location**: `src/features/data/components/DataLayout.jsx`

```javascript
import { useMemo } from 'react';
import TransactionTable from './TransactionTable';
import PlannedTable from './PlannedTable';
import UploadModal from './modals/UploadModal';
import ManualEntryModal from './modals/ManualEntryModal';
import MatchModal from './modals/MatchModal';
import { useModalStore } from '../stores/modalStore';
import * as transactionApi from '../api/transactionApi';
import * as plannedApi from '../api/plannedApi';

export default function DataLayout({ token }) {
  const modalState = useModalStore();
  
  // Data loading hooks would go here
  // const { transactions } = useTransactions(token);
  // const { plannedItems } = usePlannedItems(token);

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
        <button onClick={() => modalState.openUploadModal()}>
          📤 CSV Yükle
        </button>
        <button onClick={() => modalState.openManualEntryModal('transaction')}>
          ✏️ Manuel Ekle
        </button>
        <button onClick={() => modalState.openBankUploadModal('akbank')}>
          🏦 Banka Dosyası
        </button>
      </div>

      {/* Transactions Table */}
      <TransactionTable token={token} />

      {/* Planned Items Table */}
      <PlannedTable token={token} />

      {/* Modals */}
      <UploadModal />
      <ManualEntryModal />
      <MatchModal />
      {/* ... other modals */}
    </div>
  );
}
```

## Migration Steps

1. **Setup infrastructure**
   - Create folder structure
   - Install Zustand: `npm install zustand`
   - Create API client wrapper

2. **Extract APIs** (non-breaking)
   - Move all API calls to `src/features/*/api/` files
   - Keep original function signatures

3. **Create modal store**
   - Move all modal open/close state to Zustand
   - Update components to use store

4. **Extract page wrappers**
   - Create `Dashboard.jsx` and `DataManagement.jsx`
   - Move their respective components

5. **Extract modals**
   - One modal at a time
   - Test each extraction

6. **Extract reusable components**
   - Tables, cards, etc.

7. **Simplify App.jsx**
   - Remove DashboardView and DataManagementView
   - Import page wrappers instead

## Key Principles

✅ **Keep existing behavior**: No logic changes, only reorganization
✅ **Gradual migration**: Extract one piece at a time, test
✅ **Isolated concerns**: Each feature folder is self-contained
✅ **Zustand for UI state**: Modal open/close, selected rows
✅ **API layer**: All server calls in dedicated files
✅ **React Query ready**: Hook structure supports later query adoption
✅ **No props drilling**: Use context/store for modals

## Testing Strategy

1. Test each extracted modal independently
2. Verify data flows correctly with new store
3. Ensure no regressions in existing features
4. Performance: check no unnecessary re-renders

## Performance Considerations

- **Zustand** is lightweight (~2KB), no re-render overhead
- **React Query** can be added later for caching
- Modal state changes won't re-render entire app
- Each feature folder is independently optimizable
