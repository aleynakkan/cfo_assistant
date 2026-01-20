/**
 * AiChatPanel.test.jsx - Unit Tests
 * 
 * Test coverage:
 * - Component rendering
 * - Message display
 * - User interactions
 * - Accessibility features
 * - API integration
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import AiChatPanel from '../AiChatPanel';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock telemetry
vi.mock('../utils/telemetry', () => ({
  trackChatOpened: vi.fn(),
  trackChatClosed: vi.fn(),
  trackQuerySubmitted: vi.fn(),
  trackResponseReceived: vi.fn(),
  trackError: vi.fn(),
  trackMessageCopied: vi.fn(),
  trackTemplateUsed: vi.fn(),
}));

describe('AiChatPanel', () => {
  const mockToken = 'test-token-123';
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders the panel with title', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      expect(screen.getByText(/Seyfo AI/i)).toBeInTheDocument();
    });

    it('renders initial welcome message', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      expect(screen.getByText(/Merhaba! Ben Seyfo AI/i)).toBeInTheDocument();
    });

    it('renders template questions initially', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      expect(screen.getByText(/Bu ay nakit akışım nasıl?/i)).toBeInTheDocument();
      expect(screen.getByText(/Sabit giderlerim neler?/i)).toBeInTheDocument();
    });

    it('has proper ARIA attributes', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'ai-chat-title');
    });
  });

  describe('User Interactions', () => {
    it('updates input when typing', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      
      fireEvent.change(textarea, { target: { value: 'Test soru' } });
      expect(textarea.value).toBe('Test soru');
    });

    it('sends message when submit button clicked', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: 'Test cevap' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      const submitBtn = screen.getByRole('button', { name: /Gönder/i });

      fireEvent.change(textarea, { target: { value: 'Test soru' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/ai/query'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: `Bearer ${mockToken}`,
            }),
            body: JSON.stringify({ question: 'Test soru' }),
          })
        );
      });
    });

    it('sends message when Enter key pressed', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: 'Test cevap' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);

      fireEvent.change(textarea, { target: { value: 'Test soru' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
    });

    it('adds new line when Shift+Enter pressed', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);

      fireEvent.change(textarea, { target: { value: 'Line 1' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      // Should NOT submit (fetch should not be called)
      expect(fetch).not.toHaveBeenCalled();
    });

    it('calls onClose when close button clicked', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const closeBtn = screen.getByRole('button', { name: /Sohbeti kapat/i });
      
      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape key pressed', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('sends template question when clicked', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: 'Nakit akışı cevabı' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const templateBtn = screen.getByText(/Bu ay nakit akışım nasıl?/i);

      fireEvent.click(templateBtn);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/ai/query'),
          expect.objectContaining({
            body: JSON.stringify({ question: 'Bu ay nakit akışım nasıl?' }),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on API failure', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      const submitBtn = screen.getByRole('button', { name: /Gönder/i });

      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Bir hata oluştu/i)).toBeInTheDocument();
      });
    });

    it('shows retry button after error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      
      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.submit(textarea.closest('form'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Tekrar Dene/i })).toBeInTheDocument();
      });
    });

    it('retries query when retry button clicked', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ detail: 'Error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ answer: 'Success' }),
        });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      
      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.submit(textarea.closest('form'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Tekrar Dene/i })).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Tekrar Dene/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper focus management', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);
      
      // Textarea should be focused on mount
      expect(document.activeElement).toBe(textarea);
    });

    it('has screen reader announcements', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const srStatus = screen.getByRole('status');
      
      expect(srStatus).toHaveAttribute('aria-live', 'polite');
      expect(srStatus).toHaveAttribute('aria-atomic', 'true');
    });

    it('has keyboard shortcuts hints', () => {
      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      
      expect(screen.getByText(/Shift/i)).toBeInTheDocument();
      expect(screen.getByText(/Enter/i)).toBeInTheDocument();
      expect(screen.getByText(/Esc/i)).toBeInTheDocument();
    });
  });

  describe('Persistence', () => {
    it('saves messages to localStorage', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ answer: 'Test answer' }),
      });

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      const textarea = screen.getByPlaceholderText(/Soru sorun/i);

      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.submit(textarea.closest('form'));

      await waitFor(() => {
        const saved = localStorage.getItem('ai_chat_messages');
        expect(saved).toBeTruthy();
        const messages = JSON.parse(saved);
        expect(messages.some(m => m.content === 'Test')).toBe(true);
      });
    });

    it('loads messages from localStorage on mount', () => {
      const savedMessages = [
        { role: 'assistant', content: 'Welcome', timestamp: new Date().toISOString() },
        { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ];

      localStorage.setItem('ai_chat_messages', JSON.stringify(savedMessages));

      render(<AiChatPanel token={mockToken} onClose={mockOnClose} />);
      
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });
});
