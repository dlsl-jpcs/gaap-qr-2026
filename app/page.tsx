"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SuccessCard from '@/components/SuccessCard';
import { canCaptureNfcKeyboardInput, NfcKeyboardScanBuffer } from '@/lib/nfc-keyboard-scan';

type RegistrationMode = 'nfc' | 'studentNumber' | 'manualName';

export default function Home() {
  const [studentNumber, setStudentNumber] = useState('');
  const [name, setName] = useState('');
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignedGroup, setAssignedGroup] = useState<number | null>(null);
  const submissionInProgress = useRef(false);
  const nfcInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef<NfcKeyboardScanBuffer | null>(null);
  const previousModeRef = useRef<RegistrationMode | null>(null);

  const submitRegistration = useCallback(async (payload: { studentNumber: string } | { name: string }) => {
    if (submissionInProgress.current) return;

    submissionInProgress.current = true;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setAssignedGroup(data.student.groupId);
      } else {
        setError(data.message.toUpperCase());
      }
    } catch {
      setError('AN ERROR OCCURRED. PLEASE TRY AGAIN.');
    } finally {
      submissionInProgress.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let firstLoad = true;

    const loadRegistrationMode = async () => {
      try {
        const res = await fetch('/api/groups', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error('Unable to load registration settings.');
        }
        if (active) {
          const mode = data.registrationMode;
          setRegistrationMode(mode === 'nfc' || mode === 'manualName' ? mode : 'studentNumber');
        }
      } catch {
        if (active && firstLoad) {
          setError('REGISTRATION SETTINGS COULD NOT BE LOADED. PLEASE REFRESH.');
        }
      } finally {
        if (active && firstLoad) setModeLoading(false);
        firstLoad = false;
      }
    };

    void loadRegistrationMode();
    const interval = setInterval(loadRegistrationMode, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (previousModeRef.current !== null && previousModeRef.current !== registrationMode) {
      setAssignedGroup(null);
      setStudentNumber('');
      setName('');
      setError('');
    }
    previousModeRef.current = registrationMode;
  }, [registrationMode]);

  useEffect(() => {
    if (registrationMode !== 'nfc' || modeLoading) {
      scanBufferRef.current?.clear();
      scanBufferRef.current = null;
      return;
    }

    const scanner = new NfcKeyboardScanBuffer({
      onBufferChange: value => {
        setStudentNumber(value);
        if (value) setError('');
      },
      onInvalid: reason => {
        setError(reason === 'incomplete'
          ? 'CARD INPUT WAS INCOMPLETE. TAP AGAIN.'
          : 'INVALID CARD INPUT. THE READER MUST TYPE THE UID AS HEX.');
      },
      onScan: cardUid => {
        if (submissionInProgress.current) return;
        setAssignedGroup(null);
        void submitRegistration({ studentNumber: cardUid });
      }
    });

    scanBufferRef.current = scanner;
    nfcInputRef.current?.focus({ preventScroll: true });

    const clearWhenPageLosesFocus = () => {
      scanner.discardPartial();
      setStudentNumber('');
    };
    const clearWhenPageIsHidden = () => {
      if (document.visibilityState !== 'visible') clearWhenPageLosesFocus();
    };

    window.addEventListener('blur', clearWhenPageLosesFocus);
    document.addEventListener('visibilitychange', clearWhenPageIsHidden);

    return () => {
      window.removeEventListener('blur', clearWhenPageLosesFocus);
      document.removeEventListener('visibilitychange', clearWhenPageIsHidden);
      scanner.clear();
      if (scanBufferRef.current === scanner) scanBufferRef.current = null;
    };
  }, [modeLoading, registrationMode, submitRegistration]);

  useEffect(() => {
    if (
      registrationMode === 'nfc' &&
      !modeLoading
    ) {
      nfcInputRef.current?.focus({ preventScroll: true });
    }
  }, [assignedGroup, loading, modeLoading, registrationMode]);

  const handleNfcKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!canCaptureNfcKeyboardInput({
      registrationMode,
      modeLoading,
      pageFocused: document.hasFocus(),
      pageVisible: document.visibilityState === 'visible',
      scanFieldFocused: document.activeElement === event.currentTarget,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      repeat: event.repeat,
      composing: event.nativeEvent.isComposing,
    })) return;

    const scanner = scanBufferRef.current;
    if (!scanner) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      scanner.discardPartial();
      setStudentNumber('');
      return;
    }

    if (event.key === 'Enter') {
      if (scanner.finish() !== 'ignored') event.preventDefault();
      return;
    }

    if (event.key.length === 1 && /^[\x20-\x7e]$/.test(event.key)) {
      event.preventDefault();
      scanner.acceptKey(event.key);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registrationMode === 'nfc') return;

    const isManualNameMode = registrationMode === 'manualName';
    const value = (isManualNameMode ? name : studentNumber).trim();

    if (!value) {
       setError(isManualNameMode ? "PLEASE ENTER YOUR NAME." : "PLEASE ENTER YOUR STUDENT NUMBER.");
       return;
    }
    await submitRegistration(isManualNameMode ? { name: value } : { studentNumber: value });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative z-0">
      <div className="absolute top-10 text-center w-full max-w-lg px-4 hidden md:block">
         <p className="font-comic text-lg text-neutral-600 mb-1 font-bold">JUNIOR PHILIPPINE COMPUTER SOCIETY</p>
         <p className="font-comic text-sm text-[#d92323] uppercase tracking-widest font-bold">De La Salle Lipa Chapter</p>
      </div>

      <AnimatePresence mode="wait">
        {!assignedGroup ? (
          <motion.div 
            key="form"
            initial={{ opacity: 0, y: 30, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -30, rotate: 2 }}
            className="w-full max-w-md grunge-card p-10 z-10"
          >
            <div className="text-center mb-10 border-b-[6px] border-[#111] pb-6">
              <h3 className="font-oswald text-4xl tracking-tighter uppercase leading-none mb-1">JPCS</h3>
              <h1 className="font-oswald text-5xl md:text-[3.5rem] font-bold tracking-tighter leading-[0.9] uppercase mt-2">
                General <br/> Assembly <br/> 
                <span className="text-3xl">& Acquaintance</span> <br/>
                Party <span className="text-[#d92323]">2026</span>
              </h1>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block font-oswald text-xl uppercase tracking-widest text-[#111] mb-1">
                  {registrationMode === 'manualName'
                    ? 'Full Name'
                    : registrationMode === 'nfc'
                      ? 'NFC Student Card'
                      : 'Student Number'}
                </label>
                <input 
                  type="text"
                  inputMode={registrationMode === 'studentNumber' ? 'numeric' : 'text'}
                  pattern={registrationMode === 'manualName' ? undefined : registrationMode === 'nfc' ? '[A-Fa-f0-9]*' : '[0-9]*'}
                  autoComplete="off"
                  className="grunge-input"
                  placeholder={registrationMode === 'manualName'
                    ? 'Juan Dela Cruz'
                    : registrationMode === 'nfc'
                      ? 'Waiting for card input'
                      : '202610101'}
                  value={registrationMode === 'manualName' ? name : studentNumber}
                  readOnly={registrationMode === 'nfc'}
                  ref={registrationMode === 'nfc' ? nfcInputRef : undefined}
                  onKeyDown={registrationMode === 'nfc' ? handleNfcKeyDown : undefined}
                  onBlur={registrationMode === 'nfc' ? () => {
                    scanBufferRef.current?.discardPartial();
                    setStudentNumber('');
                  } : undefined}
                  onChange={e => registrationMode === 'manualName'
                    ? setName(e.target.value)
                    : setStudentNumber(e.target.value)}
                  disabled={modeLoading || registrationMode === null || (loading && registrationMode !== 'nfc')}
                />
              </div>
              
              {error && (
                <div className="text-[#d92323] font-oswald text-xl tracking-wider uppercase text-center mt-4">
                  {error}
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={loading || modeLoading || registrationMode === null || registrationMode === 'nfc'}
                className="grunge-btn"
              >
                {modeLoading
                  ? 'LOADING...'
                : loading
                    ? 'PROCESSING...'
                    : registrationMode === 'nfc'
                      ? 'WAITING FOR CARD INPUT'
                      : 'JOIN EVENT'}
              </button>
            </form>
          </motion.div>
        ) : (
          <>
            <SuccessCard key="success" groupNumber={assignedGroup} />
            {registrationMode === 'nfc' && (
              <div className="w-full max-w-md grunge-card p-5 text-center z-10">
                <label htmlFor="nfc-next-card" className="block font-oswald text-lg uppercase tracking-widest text-[#111] mb-2">
                  Next student card
                </label>
                <input
                  id="nfc-next-card"
                  ref={nfcInputRef}
                  type="text"
                  value={studentNumber}
                  readOnly
                  placeholder="Waiting for card input"
                  className="grunge-input"
                  onKeyDown={handleNfcKeyDown}
                  onBlur={() => {
                    scanBufferRef.current?.discardPartial();
                    setStudentNumber('');
                  }}
                />
                <p className="mt-2 font-oswald text-sm uppercase tracking-wider text-neutral-600">
                  Waiting for card input — keep this page focused.
                </p>
                {error && (
                  <p className="mt-3 text-[#d92323] font-oswald text-sm tracking-wider uppercase">
                    {error}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
