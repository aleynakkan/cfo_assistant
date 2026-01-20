# Visual Architecture Guide

## Current Structure (Monolithic)

```
App.jsx (3552 lines)
│
├─ Auth Logic (setToken, handleLogout)
├─ Dashboard Data Loading
│  ├─ loadData() function
│  ├─ loadExceptions() function
│  ├─ 20+ useState calls
│  └─ DashboardView component (1000 lines)
│     ├─ renderInsightMetric()
│     ├─ Manual state management
│     └─ Direct API calls in functions
│
└─ Data Management Logic
   ├─ loadPlannedItems()
   ├─ openMatchModal()
   ├─ confirmMatch()
   ├─ 30+ useState calls
   │
   └─ DataManagementView component (1500 lines)
      ├─ 10 modals (inline JSX)
      │  ├─ UploadModal code (150 lines)
      │  ├─ ManualEntryModal code (200 lines)
      │  ├─ MatchModal code (300 lines)
      │  ├─ PlannedMatchesModal code (250 lines)
      │  ├─ BankUploadModal code (200 lines)
      │  ├─ EditTransactionModal code (100 lines)
      │  ├─ CategorizeModal code (100 lines)
      │  ├─ DeleteConfirmModal code (80 lines)
      │  ├─ ExceptionModal code (150 lines)
      │  └─ PlannedMatchesViewModal code (100 lines)
      │
      ├─ TransactionTable (200 lines)
      ├─ PlannedTable (250 lines)
      │
      ├─ API calls scattered throughout
      │  ├─ fetch in handleUpload()
      │  ├─ fetch in handleManualSubmit()
      │  ├─ fetch in confirmMatch()
      │  ├─ fetch in handleDelete()
      │  └─ ... 15+ more fetch calls
      │
      └─ Form handlers
         ├─ handleUpload()
         ├─ handlePlannedUpload()
         ├─ handleManualSubmit()
         ├─ handleDelete()
         └─ ... 10+ more handlers
```

---

## Proposed Structure (Modular)

```
src/
│
├─ App.jsx (50 lines) ✨ SIMPLIFIED
│  ├─ Token management
│  ├─ View routing (dashboard | data)
│  ├─ Layout wrapper
│  └─ Imports page components
│
├─ api/
│  └─ client.js
│     ├─ apiFetch() wrapper
│     ├─ API_ENDPOINTS constants
│     └─ Error handling
│
├─ features/
│  │
│  ├─ dashboard/
│  │  ├─ api/
│  │  │  └─ dashboardApi.js
│  │  │     ├─ loadDashboard()
│  │  │     ├─ loadCategorySummary()
│  │  │     ├─ loadForecast()
│  │  │     ├─ loadInsights()
│  │  │     └─ loadExceptions()
│  │  │
│  │  ├─ components/
│  │  │  ├─ DashboardLayout.jsx ← Main container
│  │  │  ├─ KPICards.jsx
│  │  │  ├─ CashForecastCard.jsx
│  │  │  ├─ FixedCostCard.jsx
│  │  │  ├─ InsightsPanel.jsx
│  │  │  └─ ExceptionsModal.jsx
│  │  │
│  │  └─ hooks/
│  │     └─ useDashboard.js (React Query ready)
│  │
│  └─ data/
│     ├─ api/
│     │  ├─ transactionApi.js (transaction API calls)
│     │  ├─ plannedApi.js (planned item API calls)
│     │  └─ bankApi.js (bank upload API calls)
│     │
│     ├─ stores/
│     │  └─ modalStore.js ✨ Zustand
│     │     ├─ Modal visibility state
│     │     ├─ Selected entity tracking
│     │     ├─ Modal-specific data
│     │     └─ Batch actions
│     │
│     ├─ components/
│     │  ├─ DataLayout.jsx ← Main container
│     │  ├─ TransactionTable.jsx
│     │  ├─ PlannedTable.jsx
│     │  │
│     │  └─ modals/
│     │     ├─ UploadModal.jsx ✅ (DONE)
│     │     ├─ ManualEntryModal.jsx
│     │     ├─ EditTransactionModal.jsx ✅ (DONE)
│     │     ├─ MatchModal.jsx
│     │     ├─ PlannedMatchesModal.jsx
│     │     ├─ BankUploadModal.jsx
│     │     ├─ CategorizeModal.jsx
│     │     ├─ DeleteConfirmModal.jsx
│     │     ├─ ExceptionModal.jsx
│     │     └─ PlannedMatchesViewModal.jsx
│     │
│     └─ hooks/
│        └─ useDataManagement.js
│
└─ components/ (Shared)
   ├─ Navbar.jsx
   ├─ Sidebar.jsx
   ├─ InitialBalanceModal.jsx
   └─ AiChatPanel.jsx
```

---

## State Management Flow

### BEFORE (App.jsx - 50+ useState)

```
App.jsx
│
├─ token
├─ view
├─ summary
├─ transactions
├─ forecast
├─ categorySummary
├─ categoryForecast
├─ fixedCosts
├─ cashPosition
├─ insights
├─ showInitialBalanceModal
├─ loading
├─ error
│
└─ DataManagementView (30+ more useState)
   ├─ uploading
   ├─ uploadMessage
   ├─ plannedUploading
   ├─ plannedUploadMessage
   ├─ akbankUploading
   ├─ enparaUploading
   ├─ yapikrediUploading
   ├─ matchHealth
   ├─ exceptionsOpen
   ├─ exceptionsKind
   ├─ exceptions
   ├─ form
   ├─ formMessage
   ├─ formSubmitting
   ├─ plannedForm
   ├─ plannedSubmitting
   ├─ plannedMessage
   ├─ plannedItems
   ├─ plannedLoading
   ├─ plannedError
   ├─ matchModalOpen 🔴
   ├─ activePlanned 🔴
   ├─ suggestions 🔴
   ├─ suggestionsLoading 🔴
   ├─ suggestionsError 🔴
   ├─ selectedTx 🔴
   ├─ matchAmount 🔴
   ├─ matchSubmitting 🔴
   ├─ matchMessage 🔴
   ├─ plannedMatchesOpen 🔴
   ├─ plannedMatches 🔴
   ├─ plannedMatchesLoading 🔴
   ├─ bankUploadModalOpen 🔴
   ├─ selectedBank 🔴
   ├─ bankUploadFile 🔴
   ├─ manualEntryModalOpen 🔴
   └─ manualEntryType 🔴
   
   🔴 = UI State (belongs in Zustand)
```

### AFTER (Modular)

```
App.jsx
└─ token (only auth state here)

features/dashboard/
└─ useDashboard() ← React Query
   ├─ summary (server state)
   ├─ forecast (server state)
   ├─ categorySummary (server state)
   ├─ loading (server state)
   └─ error (server state)

features/data/
├─ stores/modalStore (Zustand) 🎯
│  ├─ uploadModalOpen ✓
│  ├─ bankUploadModalOpen ✓
│  ├─ manualEntryModalOpen ✓
│  ├─ matchModalOpen ✓
│  ├─ plannedMatchesModalOpen ✓
│  ├─ editTransactionModalOpen ✓
│  ├─ selectedTransaction ✓
│  ├─ selectedPlanned ✓
│  ├─ matchAmount ✓
│  └─ matchType ✓
│
└─ useDataManagement() ← React Query
   ├─ transactions (server state)
   ├─ plannedItems (server state)
   ├─ loading (server state)
   └─ error (server state)
```

---

## Data Flow Example

### Before (All in DataManagementView)

```
User clicks "Upload"
    ↓
setState(uploadModalOpen = true) ← In DataManagementView state
    ↓
Render UploadModal (300 lines of inline JSX) ← In DataManagementView
    ↓
User selects file and clicks "Yükle"
    ↓
handleUpload() function ← In DataManagementView
    ↓
fetch(API_BASE + "/transactions/upload-csv") ← Fetch call mixed in handler
    ↓
setTransactions(newData) ← Update parent state
    ↓
setState(uploadModalOpen = false) ← Close modal in parent
    ↓
Re-render entire DataManagementView
```

### After (Modular with Zustand)

```
User clicks "Upload"
    ↓
useModalStore().openUploadModal() ← Zustand action
    ↓
UploadModal component re-renders ← Isolated component
    ↓
User selects file and clicks "Yükle"
    ↓
handleUpload() in UploadModal component ← Localized handler
    ↓
transactionApi.uploadTransactions(file, token) ← Clean API call
    ↓
Query cache updated ← React Query (optional later)
    ↓
useModalStore().closeUploadModal() ← Zustand action
    ↓
UploadModal unmounts ← Only this component re-renders
    ↓
DataLayout refetches data (or manual callback)
```

---

## Component Extraction Sequence

### Round 1: Modals (Highest ROI)
```
App.jsx (3552 lines)
        ↓
Extract UploadModal (150 lines) → UploadModal.jsx ✅
App.jsx (3400 lines)
        ↓
Extract ManualEntryModal (200 lines) → ManualEntryModal.jsx
App.jsx (3200 lines)
        ↓
Extract MatchModal (300 lines) → MatchModal.jsx
App.jsx (2900 lines)
        ↓
... continue ...
        ↓
App.jsx (1000 lines)
```

### Round 2: Containers
```
App.jsx (1000 lines)
        ↓
Extract DashboardView → DashboardLayout.jsx
App.jsx (400 lines)
        ↓
Extract DataManagementView → DataLayout.jsx
App.jsx (100 lines)
        ↓
Extract Components
App.jsx (50 lines) ✨ DONE
```

---

## File Size Comparison

### Current State
```
src/
└─ App.jsx                          3,552 lines 📦

TOTAL: 3,552 lines
```

### After Complete Refactoring
```
src/
├─ App.jsx                             50 lines  ✨
├─ api/
│  └─ client.js                        50 lines
├─ features/
│  ├─ dashboard/
│  │  ├─ api/dashboardApi.js           80 lines
│  │  ├─ components/
│  │  │  ├─ DashboardLayout.jsx       200 lines
│  │  │  ├─ KPICards.jsx              100 lines
│  │  │  ├─ CashForecastCard.jsx      150 lines
│  │  │  ├─ FixedCostCard.jsx         100 lines
│  │  │  ├─ InsightsPanel.jsx         150 lines
│  │  │  └─ ExceptionsModal.jsx       200 lines
│  │  └─ hooks/useDashboard.js         60 lines
│  │
│  └─ data/
│     ├─ api/
│     │  ├─ transactionApi.js          60 lines
│     │  ├─ plannedApi.js             100 lines
│     │  └─ bankApi.js                 50 lines
│     ├─ stores/modalStore.js         200 lines
│     ├─ components/
│     │  ├─ DataLayout.jsx            300 lines
│     │  ├─ TransactionTable.jsx      250 lines
│     │  ├─ PlannedTable.jsx          300 lines
│     │  └─ modals/
│     │     ├─ UploadModal.jsx        100 lines ✅
│     │     ├─ EditTransactionModal.jsx 80 lines ✅
│     │     ├─ ManualEntryModal.jsx   150 lines
│     │     ├─ MatchModal.jsx         250 lines
│     │     ├─ PlannedMatchesModal.jsx 200 lines
│     │     ├─ BankUploadModal.jsx    180 lines
│     │     ├─ CategorizeModal.jsx    100 lines
│     │     ├─ DeleteConfirmModal.jsx   80 lines
│     │     └─ ExceptionModal.jsx     100 lines
│     └─ hooks/useDataManagement.js    80 lines
│
└─ components/
   ├─ Navbar.jsx
   ├─ Sidebar.jsx
   ├─ InitialBalanceModal.jsx
   └─ AiChatPanel.jsx

TOTAL: 3,552 lines (same amount of code)
BUT: Distributed across 30+ focused files
```

### Benefits of Distribution
- **30+ focused files** vs 1 monolithic file
- Each file **<300 lines** (easy to understand)
- Files have **single responsibility** (easy to modify)
- Files are **independently testable** (easy to test)
- Files are **independently reusable** (easy to share)

---

## Mental Model

### Think of it like a Restaurant

**BEFORE (Monolithic App.jsx)**
```
One chef in one giant kitchen
- Does everything: prep, cooking, plating, cleanup
- Hard to find ingredients
- Hard to teach another chef
- Everything breaks if one thing fails
- Impossible to work on multiple dishes at once
```

**AFTER (Modular Architecture)**
```
Multiple specialized stations
- Prep station (API layer)
- Cooking station (Components)
- Plating station (Modals)
- Each chef (developer) has own station
- Easy to find what you need
- Easy to teach new chefs
- One station failing doesn't break everything
- Multiple dishes can be prepared simultaneously
```

---

## Zustand Store Visualization

```
useModalStore (Zustand)
│
├─ UI State (Re-render only affected components)
│  ├─ uploadModalOpen: false → true → false
│  ├─ bankUploadModalOpen: false → true → false
│  ├─ manualEntryModalOpen: false → true → false
│  ├─ matchModalOpen: false → true → false
│  └─ ... more modal states
│
├─ Selected Data (Passed to modals)
│  ├─ selectedTransaction: null → {id: 1, ...} → null
│  ├─ selectedPlanned: null → {id: 5, ...} → null
│  └─ matchAmount: '' → '100' → ''
│
└─ Actions (Called by components)
   ├─ openUploadModal() ← Button click
   ├─ closeUploadModal() ← Save/Cancel
   ├─ openMatchModal(planned) ← Pass data
   ├─ closeMatchModal() ← Save/Cancel
   └─ resetModalState() ← Navigate away

Zero re-renders of entire app!
Only affected modals re-render.
```

---

## Migration Timeline

```
Day 1:  Read docs (1 hour)
Day 2:  Install Zustand, copy API layer (2 hours)
Day 3:  Extract UploadModal (1 hour) ✅
Day 4:  Extract EditTransactionModal (1 hour) ✅
Day 5:  Extract ManualEntryModal (1 hour)
Day 6:  Extract MatchModal (1.5 hours)
Day 7:  Extract PlannedMatchesModal (1 hour)
Day 8:  Extract BankUploadModal (1 hour)
Day 9:  Extract remaining modals (1.5 hours)
Day 10: Extract DataLayout, Tables (2 hours)
Day 11: Extract DashboardLayout, Cards (2 hours)
Day 12: Simplify App.jsx, test, cleanup (2 hours)

Total: ~21 hours spread over 2 weeks
OR: 3 days of focused work
```

---

## Decision Tree

```
Want to refactor?
    ↓
    ├─ "Yes, all at once"
    │  └─ Use REFACTORING_PLAN.md as blueprint
    │     Complete in 3-4 days
    │
    ├─ "Yes, gradually"
    │  └─ Use IMPLEMENTATION_GUIDE.md
    │     Complete in 2-3 weeks
    │     Extract one modal at a time
    │
    ├─ "Not sure yet"
    │  └─ Use example code in modalStore.js
    │     Try extracting ONE modal first
    │     See if you like the pattern
    │
    └─ "No, keep as-is"
       └─ No changes needed
          Code works fine as-is
          Refactoring is optional
```

---

## Q&A Reference

| Q | A |
|---|---|
| **Is this safe?** | 100% safe. Zero breaking changes. |
| **Can I do it gradually?** | Yes. Extract one modal at a time. |
| **Do I need Zustand?** | Only for modal state. Optional but recommended. |
| **Can I use Redux instead?** | Yes, but Zustand is simpler for this use case. |
| **Will this hurt performance?** | No. Zustand is 2KB and highly optimized. |
| **Can I add React Query later?** | Yes. API layer is already prepared. |
| **Do I need TypeScript?** | No. Works with plain JavaScript. |
| **How long will it take?** | 2-3 weeks gradual, or 3-4 days focused. |
| **What if I get stuck?** | Refer to examples: EditTransactionModal.jsx or UploadModal.jsx |
| **Can I go back?** | Yes. Git commit before starting. |

