import { create } from 'zustand';

/**
 * Zustand store for managing modal UI state across the data management feature.
 * Centralizes all modal open/close states and selected entity tracking.
 * 
 * Benefits:
 * - No prop drilling for modal state
 * - Easy to add/remove modals
 * - Persistent modal state across component re-renders
 * - Single source of truth for UI state
 */
export const useModalStore = create((set) => ({
  // ==================== Modal Visibility ====================
  uploadModalOpen: false,
  bankUploadModalOpen: false,
  manualEntryModalOpen: false,
  matchModalOpen: false,
  plannedMatchesModalOpen: false,
  exceptionModalOpen: false,
  editTransactionModalOpen: false,
  deleteConfirmModalOpen: false,

  // ==================== Selected Entities ====================
  selectedTransaction: null,
  selectedPlanned: null,
  selectedBank: 'akbank',
  manualEntryType: 'transaction', // 'transaction' | 'planned'

  // ==================== Modal-specific state ====================
  matchAmount: '',
  matchType: '',
  selectedMatches: [],

  // ==================== Actions: Upload Modal ====================
  openUploadModal: () => set({ uploadModalOpen: true }),
  closeUploadModal: () => set({ uploadModalOpen: false }),

  // ==================== Actions: Bank Upload Modal ====================
  openBankUploadModal: (bank = 'akbank') => set({
    bankUploadModalOpen: true,
    selectedBank: bank,
  }),
  closeBankUploadModal: () => set({ bankUploadModalOpen: false }),

  // ==================== Actions: Manual Entry Modal ====================
  openManualEntryModal: (type = 'transaction') => set({
    manualEntryModalOpen: true,
    manualEntryType: type,
  }),
  closeManualEntryModal: () => set({ manualEntryModalOpen: false }),

  // ==================== Actions: Match Modal ====================
  openMatchModal: (planned) => set({
    matchModalOpen: true,
    selectedPlanned: planned,
    matchAmount: '',
    matchType: '',
  }),
  closeMatchModal: () => set({
    matchModalOpen: false,
    selectedPlanned: null,
    matchAmount: '',
    matchType: '',
  }),
  setMatchAmount: (amount) => set({ matchAmount: amount }),
  setMatchType: (type) => set({ matchType: type }),

  // ==================== Actions: Planned Matches Modal ====================
  openPlannedMatchesModal: (planned) => set({
    plannedMatchesModalOpen: true,
    selectedPlanned: planned,
  }),
  closePlannedMatchesModal: () => set({
    plannedMatchesModalOpen: false,
    selectedPlanned: null,
  }),
  setSelectedMatches: (matches) => set({ selectedMatches: matches }),

  // ==================== Actions: Exception Modal ====================
  openExceptionModal: () => set({ exceptionModalOpen: true }),
  closeExceptionModal: () => set({ exceptionModalOpen: false }),

  // ==================== Actions: Edit Transaction Modal ====================
  openEditTransactionModal: (transaction) => set({
    editTransactionModalOpen: true,
    selectedTransaction: transaction,
  }),
  closeEditTransactionModal: () => set({
    editTransactionModalOpen: false,
    selectedTransaction: null,
  }),

  // ==================== Actions: Delete Confirm Modal ====================
  openDeleteConfirmModal: () => set({ deleteConfirmModalOpen: true }),
  closeDeleteConfirmModal: () => set({ deleteConfirmModalOpen: false }),

  // ==================== Batch Actions ====================
  resetModalState: () => set({
    uploadModalOpen: false,
    bankUploadModalOpen: false,
    manualEntryModalOpen: false,
    matchModalOpen: false,
    plannedMatchesModalOpen: false,
    exceptionModalOpen: false,
    editTransactionModalOpen: false,
    deleteConfirmModalOpen: false,
    selectedTransaction: null,
    selectedPlanned: null,
    matchAmount: '',
    matchType: '',
    selectedMatches: [],
  }),
}));

/**
 * Usage examples:
 * 
 * // In components:
 * const { uploadModalOpen, openUploadModal, closeUploadModal } = useModalStore();
 * 
 * // For multiple state updates:
 * const { openMatchModal, setMatchAmount, setMatchType } = useModalStore();
 * 
 * // Subscribe to specific state changes:
 * const uploadModalOpen = useModalStore((state) => state.uploadModalOpen);
 * 
 * // Reset all modals when navigating away:
 * const resetModalState = useModalStore((state) => state.resetModalState);
 * resetModalState();
 */
