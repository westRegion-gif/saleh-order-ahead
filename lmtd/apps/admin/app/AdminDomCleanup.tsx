'use client';

import { useEffect } from 'react';

export default function AdminDomCleanup() {
  useEffect(() => {
    const clean = () => {
      document.querySelectorAll<HTMLInputElement>('input[name="sku"]').forEach((input) => {
        const label = input.closest('label');
        if (label) label.remove();
        else input.remove();
      });
    };

    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
