"use client";
import { useEffect, useState } from 'react';
import { Users, Trash2, Plus, GripVertical, AlertTriangle } from 'lucide-react';

export default function AdminDashboard() {
  const [groups, setGroups] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCapacity, setTotalCapacity] = useState(0);
  
  // Custom dialog state
  const [confirmDialog, setConfirmDialog] = useState<{ 
    isOpen: boolean; 
    type: 'student' | 'group'; 
    id: string | number | null; 
    message: string; 
  }>({ 
    isOpen: false, 
    type: 'student', 
    id: null, 
    message: '' 
  });

  const [errorDialog, setErrorDialog] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
        setTotal(data.total);
        setTotalCapacity(data.groups.reduce((acc: number, g: any) => acc + g.maxCapacity, 0));
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchGroups();
    const interval = setInterval(fetchGroups, 2000);
    return () => clearInterval(interval);
  }, []);

  const promptDeleteStudent = (id: string) => {
    setConfirmDialog({ 
      isOpen: true, 
      type: 'student', 
      id, 
      message: "Are you sure you want to remove this participant?" 
    });
  };

  const promptDeleteGroup = (groupId: number) => {
    setConfirmDialog({ 
      isOpen: true, 
      type: 'group', 
      id: groupId, 
      message: "Are you sure you want to delete this group? All students in it will be removed permanently!" 
    });
  };

  const confirmAction = async () => {
    if (confirmDialog.type === 'student' && confirmDialog.id) {
      try {
        await fetch('/api/dev/delete', {
          method: 'POST',
          body: JSON.stringify({ id: confirmDialog.id })
        });
        fetchGroups(); 
      } catch (e) {}
    } else if (confirmDialog.type === 'group' && confirmDialog.id) {
      try {
        await fetch('/api/admin/groups', {
          method: 'POST',
          body: JSON.stringify({ action: 'delete', groupId: confirmDialog.id })
        });
        fetchGroups();
      } catch (e) {}
    }
    setConfirmDialog({ isOpen: false, type: 'student', id: null, message: '' });
  };

  const handleCreateGroup = async () => {
    try {
      await fetch('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ action: 'create' })
      });
      fetchGroups();
    } catch (e) {}
  };

  const handleCapacityChange = async (groupId: number, newCapacity: number) => {
    if (newCapacity < 1) newCapacity = 1;
    try {
      await fetch('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ action: 'capacity', groupId, maxCapacity: newCapacity })
      });
      fetchGroups();
    } catch (e) {}
  };

  const handleDragStart = (e: React.DragEvent, studentId: string) => {
    e.dataTransfer.setData('studentId', studentId);
  };

  const handleDrop = async (e: React.DragEvent, newGroupId: number) => {
    e.preventDefault();
    const studentId = e.dataTransfer.getData('studentId');
    if (!studentId) return;

    try {
      const res = await fetch('/api/admin/move', {
        method: 'POST',
        body: JSON.stringify({ studentId, newGroupId })
      });
      const data = await res.json();
      if (!data.success) {
         setErrorDialog({ isOpen: true, message: data.message });
      }
      fetchGroups();
    } catch (e) {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); 
  };

  return (
    <main className="min-h-screen p-8 relative z-0 flex flex-col">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-4">
        <div>
          <h1 className="text-5xl md:text-6xl font-oswald font-bold tracking-tighter uppercase text-[#111] leading-none mb-2">Admin Dashboard</h1>
          <p className="font-comic font-bold text-xl text-neutral-700 italic">Manage Groups & Participants</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleCreateGroup}
            className="grunge-btn px-6 py-4 flex items-center gap-2 bg-[#111] text-white hover:bg-[#d92323] transition-colors"
          >
            <Plus className="w-6 h-6" />
            <span className="font-oswald text-2xl font-bold uppercase tracking-widest">New Group</span>
          </button>
          <div className="grunge-card px-8 py-4 flex items-center gap-4">
            <Users className="text-[#d92323] w-8 h-8" />
            <span className="font-oswald text-3xl font-bold uppercase tracking-widest text-[#111]">{total} / {totalCapacity || 280} Joined</span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 flex-grow">
        {groups.map((group) => (
          <div 
            key={group.groupId}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, group.groupId)}
            className="bg-[#faf9f6] border-[4px] border-[#111] shadow-[6px_6px_0px_#111] p-4 relative overflow-hidden flex flex-col group-container transition-colors hover:border-[#d92323]"
          >
            <div className="flex justify-between items-center mb-4 border-b-4 border-[#111] pb-2">
              <div className="flex items-center gap-2">
                <h2 className="font-oswald text-2xl font-bold text-[#111]">GROUP {group.groupId}</h2>
                <button 
                  onClick={() => promptDeleteGroup(group.groupId)}
                  className="text-neutral-400 hover:text-[#d92323] transition-colors"
                  title="Delete Group"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-1 font-oswald font-bold text-lg px-2 py-1 border-2 border-[#111] bg-white text-[#111]">
                <span>{group.members.length} / </span>
                <input 
                  type="number" 
                  min="1"
                  defaultValue={group.maxCapacity}
                  key={`cap-${group.groupId}-${group.maxCapacity}`}
                  onBlur={(e) => handleCapacityChange(group.groupId, Number(e.target.value))}
                  className="w-12 bg-transparent text-center outline-none border-b-2 border-transparent focus:border-[#d92323]"
                  title="Max Capacity"
                />
              </div>
            </div>
            
            <ul className="space-y-2 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {group.members.map((m: any, i: number) => (
                <li 
                  key={m.id} 
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  className="bg-white border-2 border-[#111] px-2 py-2 flex items-center justify-between gap-2 group hover:bg-[#111] hover:text-white transition-colors cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <GripVertical className="w-4 h-4 text-neutral-400 group-hover:text-white" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-comic text-lg font-bold truncate group-hover:text-white">{m.name}</span>
                      <span className="text-sm text-neutral-500 font-comic font-bold group-hover:text-neutral-300 truncate">{m.studentNumber}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => promptDeleteStudent(m.id)}
                    className="text-neutral-600 hover:text-[#d92323] p-1.5 bg-white border-2 border-[#111] shadow-[2px_2px_0px_#111] active:shadow-[0px_0px_0px_#111] active:translate-y-[2px] active:translate-x-[2px] transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {group.members.length === 0 && (
                <div className="text-center font-comic font-bold text-neutral-400 text-base mt-10 italic">Drop participants here</div>
              )}
            </ul>
          </div>
        ))}
      </div>

      {/* CUSTOM CONFIRMATION DIALOG MODAL */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060010]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf9f6] border-4 border-[#111] shadow-[12px_12px_0px_#111] max-w-lg w-full p-8 flex flex-col relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 pb-4 border-b-4 border-[#111]">
              <div className="bg-[#d92323] p-3 border-2 border-[#111] shadow-[4px_4px_0px_#111]">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-oswald text-4xl font-bold uppercase tracking-widest text-[#111] leading-none mt-2">
                Warning
              </h2>
            </div>
            
            <p className="font-comic font-bold text-xl text-neutral-800 mb-10 leading-relaxed">
              {confirmDialog.message}
            </p>
            
            <div className="flex items-center gap-4 justify-end">
              <button 
                onClick={() => setConfirmDialog({ isOpen: false, type: 'student', id: null, message: '' })}
                className="font-oswald font-bold text-xl uppercase tracking-widest px-6 py-3 bg-white border-2 border-[#111] text-[#111] hover:bg-neutral-200 transition-colors shadow-[4px_4px_0px_#111] active:translate-y-[2px] active:translate-x-[2px] active:shadow-[0px_0px_0px_#111]"
              >
                Cancel
              </button>
              <button 
                onClick={confirmAction}
                className="font-oswald font-bold text-xl uppercase tracking-widest px-6 py-3 bg-[#d92323] border-2 border-[#111] text-white hover:bg-red-700 transition-colors shadow-[4px_4px_0px_#111] active:translate-y-[2px] active:translate-x-[2px] active:shadow-[0px_0px_0px_#111]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ERROR DIALOG MODAL */}
      {errorDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060010]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf9f6] border-4 border-[#111] shadow-[12px_12px_0px_#111] max-w-lg w-full p-8 flex flex-col relative animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 pb-4 border-b-4 border-[#111]">
              <div className="bg-[#111] p-3 border-2 border-[#111] shadow-[4px_4px_0px_#111]">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-oswald text-4xl font-bold uppercase tracking-widest text-[#111] leading-none mt-2">
                Action Denied
              </h2>
            </div>
            
            <p className="font-comic font-bold text-xl text-neutral-800 mb-10 leading-relaxed">
              {errorDialog.message}
            </p>
            
            <div className="flex justify-end">
              <button 
                onClick={() => setErrorDialog({ isOpen: false, message: '' })}
                className="font-oswald font-bold text-xl uppercase tracking-widest px-6 py-3 bg-[#111] border-2 border-[#111] text-white hover:bg-neutral-800 transition-colors shadow-[4px_4px_0px_#111] active:translate-y-[2px] active:translate-x-[2px] active:shadow-[0px_0px_0px_#111]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
