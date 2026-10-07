export type NfcScanError = 'incomplete' | 'invalid-character' | 'too-long';
export type NfcScanResult = 'ignored' | 'buffered' | 'invalid' | 'duplicate' | 'submitted';

export interface NfcKeyboardScanCallbacks {
  onBufferChange: (value: string) => void;
  onInvalid: (reason: NfcScanError) => void;
  onScan: (cardUid: string) => void;
}

export interface NfcKeyboardCaptureContext {
  registrationMode: string | null;
  modeLoading: boolean;
  pageFocused: boolean;
  pageVisible: boolean;
  scanFieldFocused: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  composing: boolean;
}

export const NFC_SCAN_PAUSE_MS = 220;
export const NFC_SCAN_DUPLICATE_WINDOW_MS = 1000;
const MAX_UID_LENGTH = 64;

export function canCaptureNfcKeyboardInput(context: NfcKeyboardCaptureContext): boolean {
  return context.registrationMode === 'nfc' &&
    !context.modeLoading &&
    context.pageFocused &&
    context.pageVisible &&
    context.scanFieldFocused &&
    !context.ctrlKey &&
    !context.metaKey &&
    !context.altKey &&
    !context.repeat &&
    !context.composing;
}

/**
 * Normalize the keyboard-wedge output to the hexadecimal UID format used by
 * the previous PC/SC reader path and sent in the DLSL `card_tag` lookup.
 */
export function normalizeCardUid(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(?:[0-9a-fA-F]{2}){4,32}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** Buffers keyboard-emulated NFC input and completes it on Enter or a pause. */
export class NfcKeyboardScanBuffer {
  private value = '';
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private lastScan: { value: string; at: number } | null = null;

  constructor(
    private readonly callbacks: NfcKeyboardScanCallbacks,
    private readonly pauseMs = NFC_SCAN_PAUSE_MS,
    private readonly duplicateWindowMs = NFC_SCAN_DUPLICATE_WINDOW_MS,
  ) {}

  acceptKey(key: string): NfcScanResult {
    if (key.length !== 1 || !/^[\x20-\x7e]$/.test(key)) return 'ignored';

    if (!/^[0-9a-fA-F]$/.test(key)) {
      this.cancelPending();
      this.value = '';
      this.callbacks.onBufferChange('');
      this.callbacks.onInvalid('invalid-character');
      return 'invalid';
    }

    if (this.value.length >= MAX_UID_LENGTH) {
      this.cancelPending();
      this.value = '';
      this.callbacks.onBufferChange('');
      this.callbacks.onInvalid('too-long');
      return 'invalid';
    }

    this.value += key;
    this.callbacks.onBufferChange(this.value);
    this.cancelTimeout();
    this.timeout = setTimeout(() => {
      this.finish(Date.now());
    }, this.pauseMs);

    return 'buffered';
  }

  finish(now = Date.now()): NfcScanResult {
    this.cancelTimeout();
    if (!this.value) return 'ignored';

    const value = this.value;
    this.value = '';
    this.callbacks.onBufferChange('');

    const cardUid = normalizeCardUid(value);
    if (!cardUid) {
      this.callbacks.onInvalid('incomplete');
      return 'invalid';
    }

    if (
      this.lastScan?.value === cardUid &&
      now - this.lastScan.at <= this.duplicateWindowMs
    ) {
      return 'duplicate';
    }

    this.lastScan = { value: cardUid, at: now };
    this.callbacks.onScan(cardUid);
    return 'submitted';
  }

  clear(): void {
    this.discardPartial();
    this.lastScan = null;
  }

  discardPartial(): void {
    this.cancelPending();
    this.callbacks.onBufferChange('');
  }

  private cancelPending(): void {
    this.cancelTimeout();
    this.value = '';
  }

  private cancelTimeout(): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }
}
