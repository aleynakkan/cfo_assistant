# Refactoring Implementation Guide

## ✅ What We've Created

### 1. API Client Layer (`src/api/client.js`)
```
✓ Centralized fetch wrapper
✓ API endpoints constants
✓ Token management in headers
✓ Error handling
```

### 2. Feature API Files
```
✓ src/features/data/api/transactionApi.js
  - uploadTransactions()
  - getTransactions()
  - deleteTransaction()
  - updateTransactionCategory()

✓ src/features/data/api/plannedApi.js
  - getPlannedItems()
  - uploadPlannedItems()
  - createPlannedItem()
  - deletePlannedItem()
  - matchPlanned()
  - getPlannedMatches()
  - getSuggestions()

✓ src/features/data/api/bankApi.js
  - uploadAkbankFile()
  - uploadEnparaFile()
  - uploadYapikrediFile()
```

### 3. Zustand Modal Store (`src/features/data/stores/modalStore.js`)
```
✓ Centralized modal state (12+ modals)
✓ Selected entity tracking
✓ Modal-specific state (matchAmount, matchType, etc.)
✓ Batch reset functionality
✓ Well-documented with usage examples
```

### 4. Example Modal Components
```
✓ src/features/data/components/modals/EditTransactionModal.jsx
  - Shows how to use Zustand store
  - Demonstrates error handling
  - Has loading states
  
✓ src/features/data/components/modals/UploadModal.jsx
  - Drag & drop support
  - File validation
  - Success/error messaging
```

## 📋 Next Steps to Complete Refactoring

### Phase 1: Extract Remaining Modals (Easy - Copy/Paste Pattern)

1. **ManualEntryModal** - Create new transaction/planned item
   ```javascript
   // Location: src/features/data/components/modals/ManualEntryModal.jsx
   // Uses: useModalStore for state
   // API: transactionApi.createPlannedItem() or manual POST
   ```

2. **MatchModal** - Match transaction to planned item
   ```javascript
   // Location: src/features/data/components/modals/MatchModal.jsx
   // Uses: useModalStore.matchModalOpen, selectedPlanned
   // API: plannedApi.matchPlanned()
   ```

3. **PlannedMatchesModal** - View/manage planned matches
   ```javascript
   // Location: src/features/data/components/modals/PlannedMatchesModal.jsx
   // Uses: plannedApi.getPlannedMatches()
   ```

4. **BankUploadModal** - Upload bank transaction files
   ```javascript
   // Location: src/features/data/components/modals/BankUploadModal.jsx
   // Uses: bankApi.uploadAkbankFile(), uploadEnparaFile(), uploadYapikrediFile()
   ```

5. **CategorizeModal** - Quick category change
   ```javascript
   // Location: src/features/data/components/modals/CategorizeModal.jsx
   // Uses: transactionApi.updateTransactionCategory()
   ```

6. **ExceptionModal** - Show overdue/pending items
   ```javascript
   // Location: src/features/data/components/modals/ExceptionModal.jsx
   // Shows modal with exception data
   ```

7. **DeleteConfirmModal** - Confirmation before delete
   ```javascript
   // Location: src/features/data/components/modals/DeleteConfirmModal.jsx
   // Generic confirmation component
   ```

### Phase 2: Extract Container Components

**DataLayout.jsx** - Main data management layout
```javascript
// Location: src/features/data/components/DataLayout.jsx
// What it contains:
// - Tab switcher (Transactions | Planned Items)
// - Action buttons (Upload, Add Manual, etc.)
// - Data tables (both)
// - All modals as children
// - Uses hooks to manage data loading

import { useState } from 'react';
import TransactionTable from './TransactionTable';
import PlannedTable from './PlannedTable';
import { useModalStore } from '../stores/modalStore';
// Import all modals here

export default function DataLayout({ token }) {
  const [activeTab, setActiveTab] = useState('transactions');
  // Load data here
  
  return (
    <div>
      {/* Tabs */}
      {/* Tables */}
      {/* All modals as children */}
    </div>
  );
}
```

**TransactionTable.jsx** - Transaction list
```javascript
// Location: src/features/data/components/TransactionTable.jsx
// Responsibilities:
// - Display transactions in table
// - Sorting/filtering
// - Row actions (edit, delete)
// - Open modals via useModalStore
```

**PlannedTable.jsx** - Planned items list
```javascript
// Location: src/features/data/components/PlannedTable.jsx
// Responsibilities:
// - Display planned items
// - Sorting/filtering
// - Match button
// - Open modals via useModalStore
```

### Phase 3: Extract Dashboard Components

Follow same pattern as data management:

**DashboardLayout.jsx** - Main dashboard wrapper
```javascript
// Location: src/features/dashboard/components/DashboardLayout.jsx
// What it contains:
// - Summary cards
// - Forecast chart
// - Category breakdown
// - Insights
```

**Components inside:**
- `KPICards.jsx` - Summary numbers
- `CashForecastCard.jsx` - Forecast visualization
- `FixedCostCard.jsx` - Fixed costs breakdown
- `ExceptionsPanel.jsx` - Overdue/pending items
- `InsightsPanel.jsx` - AI insights

### Phase 4: Update App.jsx

Current code to replace:
```javascript
// OLD (1000+ lines)
function DashboardView({ ... }) { ... }
function DataManagementView({ ... }) { ... }

// NEW (10 lines)
const [view, setView] = useState('dashboard');
const [showInitialBalanceModal, setShowInitialBalanceModal] = useState(false);

return (
  <div>
    {view === 'dashboard' && <Dashboard token={token} />}
    {view === 'data' && <DataManagement token={token} />}
  </div>
);
```

---

## 🎯 Implementation Order (Recommended)

```
1. ✅ API client (done)
2. ✅ Modal store (done)
3. ✅ Example modals (done)
4. ⬜ Extract remaining 5 modals
5. ⬜ Create DataLayout.jsx
6. ⬜ Create TransactionTable.jsx & PlannedTable.jsx
7. ⬜ Test DataManagement refactor
8. ⬜ Create DashboardLayout.jsx
9. ⬜ Extract dashboard components
10. ⬜ Test Dashboard refactor
11. ⬜ Simplify App.jsx to routing only
12. ⬜ Final integration test
```

---

## 💡 Code Patterns

### Using the Modal Store

**Opening a modal with data:**
```javascript
const { openMatchModal } = useModalStore();

function handleMatchClick(plannedItem) {
  openMatchModal(plannedItem); // Store tracks selected data
}
```

**Reading modal state in component:**
```javascript
const { matchModalOpen, selectedPlanned } = useModalStore();

// Will re-render only when these specific states change
```

**Closing modal after action:**
```javascript
const { closeMatchModal } = useModalStore();

async function handleConfirm() {
  await api.match(...);
  closeMatchModal(); // Modal closes, data cleared
}
```

### Creating New Modal

Template to copy/paste:
```javascript
import { useState } from 'react';
import { useModalStore } from '../../stores/modalStore';
import * as api from '../../api/transactionApi'; // or planned/bankApi

export default function MyModal({ token, onSuccess }) {
  const { myModalOpen, closeMyModal } = useModalStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!myModalOpen) return null;

  async function handleSubmit() {
    setLoading(true);
    try {
      await api.someFunction(..., token);
      onSuccess?.();
      closeMyModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ /* modal backdrop */ }}>
      <div style={{ /* modal box */ }}>
        {/* Content */}
      </div>
    </div>
  );
}
```

---

## ⚠️ Important Notes

### Breaking Changes: NONE
- All API signatures stay the same
- Components accept same props
- Behavior unchanged
- Only organization changed

### Testing Strategy
- Extract one piece at a time
- Test after each extraction
- Use same test cases as before
- No new tests needed (behavior unchanged)

### Performance Impact
- **Positive**: Zustand is 2KB, minimal overhead
- **Positive**: Better code splitting possible later
- **Neutral**: Modal state is lightweight
- **No regressions**: Same rendering as before

---

## 📚 File Reference

| File | Purpose | Status |
|------|---------|--------|
| src/api/client.js | API fetch wrapper | ✅ Done |
| src/features/data/api/transactionApi.js | Transaction calls | ✅ Done |
| src/features/data/api/plannedApi.js | Planned item calls | ✅ Done |
| src/features/data/api/bankApi.js | Bank upload calls | ✅ Done |
| src/features/data/stores/modalStore.js | Modal state | ✅ Done |
| src/features/data/components/modals/EditTransactionModal.jsx | Edit modal | ✅ Done |
| src/features/data/components/modals/UploadModal.jsx | Upload modal | ✅ Done |
| REFACTORING_PLAN.md | Complete refactoring guide | ✅ Done |

---

## 🚀 Getting Started Right Now

1. Install Zustand:
   ```bash
   npm install zustand
   ```

2. Test the modal store:
   ```javascript
   import { useModalStore } from './features/data/stores/modalStore';
   
   const store = useModalStore();
   console.log(store.uploadModalOpen); // false
   store.openUploadModal();
   console.log(store.uploadModalOpen); // true
   ```

3. Start extracting modals one by one

---

## 💬 Questions to Consider

**Q: Can I use React Query later?**
- A: Yes! API functions are already isolated. Just wrap them in useQuery hooks.

**Q: Should I migrate everything at once?**
- A: No! Do it incrementally. Extract one modal, test it, move to next.

**Q: Do I need TypeScript?**
- A: No, but it would be great for type safety later.

**Q: Can existing code still work?**
- A: Yes! App.jsx can still work exactly as-is. Extract pieces when you're comfortable.

