'use client';

import { useEffect } from 'react';

export default function AdminDomCleanup() {
  useEffect(() => {
    const clean = () => {
      document.querySelectorAll<HTMLInputElement>('input[name="sku"]').forEach((input) => {
        // Keep the SKU field in React's DOM tree so form submission/unmounting stays stable.
        // The backend generates/locks SKU; admins do not need to edit it.
        input.required = false;
        input.type = 'hidden';
        const label = input.closest('label');
        if (label) {
          label.style.display = 'none';
        }
      });
    };

    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
