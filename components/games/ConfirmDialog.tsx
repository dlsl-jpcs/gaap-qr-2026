'use client';
import { useEffect, useRef } from 'react';
import styles from './game.module.css';
export default function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onClose }: { open: boolean; title: string; children: React.ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="game-confirm-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <h2 id="game-confirm-title">{title}</h2>
    <div className={styles.dialogBody}>{children}</div>
    <div className={styles.actions}>
      <button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</button>
    </div>
  </dialog>;
}
