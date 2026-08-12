"use client";
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import AccordionGallery from '@/components/AccordionGallery';

export default function ViewScreen() {
  const [groups, setGroups] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
        setTotal(data.total);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchGroups();
    const interval = setInterval(fetchGroups, 2000);
    return () => clearInterval(interval);
  }, []);

  const accordionItems = groups.map(group => ({
    label: `GROUP ${group.groupId} (${group.members.length}/${group.maxCapacity})`,
    shortLabel: `GROUP ${group.groupId}`,
    countText: `${group.members.length}/${group.maxCapacity}`,
    isFull: group.members.length >= group.maxCapacity,
    image: `https://picsum.photos/seed/gaap${group.groupId}theme/900/1200`,
    content: (
      <ul className="space-y-2 h-full flex-grow pb-8 pr-2">
        {group.members.map((m: any, i: number) => (
          <li 
            key={m.id} 
            className="font-comic text-lg font-bold bg-[#faf9f6] border-2 border-[#111] shadow-[4px_4px_0px_rgba(17,17,17,1)] px-3 py-2 flex items-center gap-2"
          >
            <span className="text-sm font-bold text-[#d92323] w-5">{i + 1}.</span>
            <span className="font-bold text-[#111] truncate">{m.name}</span>
          </li>
        ))}
        {group.members.length === 0 && (
          <div className="text-center font-comic font-bold text-white text-lg mt-10 italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Empty</div>
        )}
      </ul>
    )
  }));

  return (
    <main className="min-h-screen p-8 relative z-0 flex flex-col">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-5xl md:text-6xl font-oswald font-bold tracking-tighter uppercase text-[#111] leading-none mb-2">Live Assignments</h1>
          <p className="font-comic font-bold text-xl text-neutral-700 italic">Find your name on the board</p>
        </div>
        <div className="grunge-card px-8 py-4 flex items-center gap-4">
          <Users className="text-[#d92323] w-8 h-8" />
          <span className="font-oswald text-3xl font-bold uppercase tracking-widest text-[#111]">{total} / 280 Joined</span>
        </div>
      </div>
      
      <div className="w-full flex-grow relative">
        {groups.length > 0 ? (
          <AccordionGallery 
            items={accordionItems} 
            defaultIndex={null} // Null makes it start completely retracted
            height={650} 
            expandRatio={0.35} 
            gap={10}
            trigger="hover"
          />
        ) : (
          <div className="text-center font-comic font-bold text-2xl mt-20">Loading Groups...</div>
        )}
      </div>
    </main>
  );
}
