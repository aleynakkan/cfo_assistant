/**
 * useFocusTrap.js
 * 
 * Simple focus trap hook for modals.
 * Keeps focus within the modal and returns focus on unmount.
 */

import { useEffect, useRef } from 'react';

function useFocusTrap(isOpen) {
  const containerRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element
    previousFocus.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Get all focusable elements
    const getFocusableElements = () => {
      return container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    };

    // Focus first element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle Tab key
    const handleTab = (e) => {
      const focusable = Array.from(getFocusableElements());
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleTab);

    // Restore focus on unmount
    return () => {
      container.removeEventListener('keydown', handleTab);
      previousFocus.current?.focus();
    };
  }, [isOpen]);

  return containerRef;
}

export default useFocusTrap;
