import { CheckCircle2, LoaderCircle, ScanLine, TriangleAlert } from 'lucide-react';
import styles from './nfc-registration.module.css';

type Props = {
  modeLoading: boolean;
  loading: boolean;
  error: string;
  groupNumber: number | null;
};

/** A fixed-size result area keeps the reader field in place between cards. */
export default function NfcRegistrationStatus({ modeLoading, loading, error, groupNumber }: Props) {
  const state = modeLoading ? 'waiting' : loading ? 'processing' : error ? 'error' : groupNumber !== null ? 'success' : 'waiting';

  return (
    <section id="nfc-registration-status" className={styles.panel} data-state={state} role="status" aria-live="polite" aria-atomic="true">
      {state === 'success' ? <>
        <p className={styles.label}><CheckCircle2 aria-hidden="true" /> Card read</p>
        <p className={styles.group}>Group <span>{groupNumber}</span></p>
        <p className={styles.note}>Ready for the next card</p>
      </> : state === 'error' ? <>
        <p className={styles.label}><TriangleAlert aria-hidden="true" /> Please tap again</p>
        <p className={styles.error}>{error}</p>
      </> : state === 'processing' ? <>
        <LoaderCircle className={styles.spinner} aria-hidden="true" />
        <p className={styles.label}>Card read</p>
        <p className={styles.note}>Checking registration…</p>
      </> : <>
        <ScanLine aria-hidden="true" className={styles.scanIcon} />
        <p className={styles.label}>{modeLoading ? 'Loading…' : 'Waiting for card input'}</p>
      </>}
    </section>
  );
}
