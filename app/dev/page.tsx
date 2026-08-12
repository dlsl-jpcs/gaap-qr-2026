"use client";
import { useState } from 'react';
import { UserPlus, Trash2, ShieldAlert } from 'lucide-react';

export default function DevTools() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleMassAdd = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/mass-add', {
        method: 'POST',
        body: JSON.stringify({ count: 50 })
      });
      const data = await res.json();
      setMessage(data.message);
    } catch (e) {
      setMessage('Error mass adding.');
    }
    setLoading(false);
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/reset', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message);
    } catch (e) {
      setMessage('Error resetting.');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 pt-20 relative z-0">
      <div className="flex items-center gap-4 mb-8 border-b-4 border-[#111] pb-4">
        <ShieldAlert className="w-10 h-10 text-[#d92323]" />
        <h1 className="font-oswald text-5xl font-bold tracking-tighter uppercase text-[#111]">Developer Tools</h1>
      </div>
      
      <div className="grunge-card p-10 space-y-10">
        <div className="space-y-4">
          <h2 className="font-oswald text-3xl font-bold text-[#111] flex items-center gap-3">
            <UserPlus className="w-6 h-6 text-[#111]" /> Mass Add Students
          </h2>
          <p className="font-comic font-bold text-neutral-600 text-lg italic">Instantly injects 50 random students into the mock database.</p>
          <button 
            onClick={handleMassAdd}
            disabled={loading}
            className="grunge-btn mt-2 !py-4 !text-2xl"
          >
            {loading ? 'PROCESSING...' : 'ADD 50 STUDENTS'}
          </button>
        </div>

        <div className="h-[6px] w-full bg-[#111]" />

        <div className="space-y-4">
          <h2 className="font-oswald text-3xl font-bold text-[#111] flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-[#d92323]" /> Reset Database
          </h2>
          <p className="font-comic font-bold text-neutral-600 text-lg italic">Wipes all student data from the storage.</p>
          <button 
            onClick={handleReset}
            disabled={loading}
            className="w-full mt-2 py-4 bg-white text-[#d92323] font-oswald text-2xl tracking-widest uppercase border-[6px] border-[#d92323] hover:bg-[#d92323] hover:text-white transition-all shadow-[6px_6px_0px_rgba(217,35,35,1)] hover:shadow-[8px_8px_0px_rgba(17,17,17,1)] disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'PROCESSING...' : 'RESET DATA'}
          </button>
        </div>
        
        {message && (
          <div className="p-4 bg-white border-[4px] border-[#111] shadow-[4px_4px_0px_#111] font-oswald text-xl uppercase tracking-wider text-[#111]">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
