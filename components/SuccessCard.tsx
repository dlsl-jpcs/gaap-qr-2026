"use client";
import { motion } from 'framer-motion';

export default function SuccessCard({ groupNumber }: { groupNumber: number }) {
  return (
    <motion.div 
      initial={{ scale: 0.8, opacity: 0, rotate: 5 }}
      animate={{ scale: 1, opacity: 1, rotate: -2 }}
      transition={{ type: "spring", bounce: 0.5 }}
      className="w-full max-w-sm grunge-card p-12 text-center relative z-10"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-[#d92323] rounded-full flex items-center justify-center border-[6px] border-[#111] shadow-[4px_4px_0px_#111]">
         <div className="w-12 h-12 border-2 border-white/50 rounded-full flex items-center justify-center">
            <span className="font-comic font-black text-[#111] text-xl">JPCS</span>
         </div>
      </div>
      
      <h2 className="font-comic text-2xl text-neutral-600 mb-4 mt-6 italic font-bold">You are assigned to</h2>
      
      <div className="font-oswald text-8xl font-black tracking-tighter uppercase text-[#111] mb-2 leading-[0.85]">
        GROUP <br/>
        <span className="text-[#d92323] text-9xl">{groupNumber}</span>
      </div>
      
      <p className="mt-8 font-oswald text-xl uppercase tracking-widest text-neutral-700 border-t-[6px] border-[#111] pt-6">
        Please find your group and await instructions.
      </p>
    </motion.div>
  );
}
