"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SuccessCard from '@/components/SuccessCard';

export default function Home() {
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assignedGroup, setAssignedGroup] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !studentNumber) {
       setError("PLEASE FILL OUT ALL FIELDS.");
       return;
    }
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, studentNumber })
      });
      const data = await res.json();
      
      if (data.success) {
        setAssignedGroup(data.student.groupId);
      } else {
        setError(data.message.toUpperCase());
      }
    } catch (e) {
      setError("AN ERROR OCCURRED. PLEASE TRY AGAIN.");
    }
    setLoading(false);
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
                <label className="block font-oswald text-xl uppercase tracking-widest text-[#111] mb-1">Full Name</label>
                <input 
                  type="text" 
                  className="grunge-input"
                  placeholder="JOHN DOE"
                  value={name}
                  onChange={e => setName(e.target.value.toUpperCase())}
                  disabled={loading}
                />
              </div>
              
              <div>
                <label className="block font-oswald text-xl uppercase tracking-widest text-[#111] mb-1">Student Number</label>
                <input 
                  type="number" 
                  className="grunge-input"
                  placeholder="202610101"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  disabled={loading}
                />
              </div>
              
              {error && (
                <div className="text-[#d92323] font-oswald text-xl tracking-wider uppercase text-center mt-4">
                  {error}
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={loading}
                className="grunge-btn"
              >
                {loading ? 'PROCESSING...' : 'JOIN EVENT'}
              </button>
            </form>
          </motion.div>
        ) : (
          <SuccessCard key="success" groupNumber={assignedGroup} />
        )}
      </AnimatePresence>
    </main>
  );
}
