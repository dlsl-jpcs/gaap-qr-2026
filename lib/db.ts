import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Student {
  id: string;
  name: string;
  studentNumber: string;
  groupId: number;
  timestamp: string;
}

export interface GroupConfig {
  id: number;
  maxCapacity: number;
}

export interface DbData {
  students: Student[];
  groups: GroupConfig[];
}

const DATA_FILE = path.join(process.cwd(), 'data.json');

const initDb = () => {
  if (!fs.existsSync(DATA_FILE)) {
    const initialGroups = Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      maxCapacity: 20
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify({ students: [], groups: initialGroups }, null, 2));
  } else {
    // Migration: add groups array if missing
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed.groups) {
        parsed.groups = Array.from({ length: 14 }, (_, i) => ({
          id: i + 1,
          maxCapacity: 20
        }));
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
      }
    } catch(e) {}
  }
};

export const getDbData = (): DbData => {
  initDb();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { students: [], groups: [] };
  }
};

export const saveDbData = (data: DbData) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

export const assignStudent = (name: string, studentNumber: string) => {
  const data = getDbData();
  
  // Check if student already exists
  const existing = data.students.find(s => s.studentNumber === studentNumber);
  if (existing) {
    return { success: true, student: existing, message: "You have already joined a group." };
  }

  // Count current members per group
  const groupCounts = data.groups.map(g => ({
    groupId: g.id,
    maxCapacity: g.maxCapacity,
    count: data.students.filter(s => s.groupId === g.id).length
  }));

  if (groupCounts.length === 0) {
    return { success: false, message: "No groups available!" };
  }

  // Filter out groups that are at or over capacity
  const availableGroups = groupCounts.filter(g => g.count < g.maxCapacity);

  if (availableGroups.length === 0) {
    return { success: false, message: "All groups are at maximum capacity!" };
  }

  // Sort by count ascending, then by groupId ascending
  availableGroups.sort((a, b) => {
    if (a.count === b.count) {
      return a.groupId - b.groupId; // Tie breaker: lowest group ID
    }
    return a.count - b.count;
  });

  const assignedGroupId = availableGroups[0].groupId;
  
  // Insert
  const newStudent: Student = {
    id: crypto.randomUUID(),
    name,
    studentNumber,
    groupId: assignedGroupId,
    timestamp: new Date().toISOString()
  };

  data.students.push(newStudent);
  saveDbData(data);

  return { success: true, student: newStudent, message: "Successfully assigned to a group!" };
};

export const createGroup = () => {
  const data = getDbData();
  const nextId = data.groups.length > 0 ? Math.max(...data.groups.map(g => g.id)) + 1 : 1;
  data.groups.push({ id: nextId, maxCapacity: 20 });
  saveDbData(data);
  return nextId;
};

export const deleteGroup = (id: number) => {
  const data = getDbData();
  data.groups = data.groups.filter(g => g.id !== id);
  data.students = data.students.filter(s => s.groupId !== id);
  saveDbData(data);
};

export const updateGroupCapacity = (id: number, maxCapacity: number) => {
  const data = getDbData();
  const group = data.groups.find(g => g.id === id);
  if (group) {
    group.maxCapacity = maxCapacity;
    saveDbData(data);
  }
};

export const moveStudent = (studentId: string, newGroupId: number) => {
  const data = getDbData();
  const student = data.students.find(s => s.id === studentId);
  const group = data.groups.find(g => g.id === newGroupId);
  
  if (!student || !group) return { success: false, message: "Student or group not found" };

  if (student.groupId === newGroupId) return { success: true };

  const currentMembersCount = data.students.filter(s => s.groupId === newGroupId).length;
  if (currentMembersCount >= group.maxCapacity) {
    return { success: false, message: "Target group is already at full capacity." };
  }

  student.groupId = newGroupId;
  saveDbData(data);
  return { success: true };
};

export const resetDb = () => {
  const data = getDbData();
  saveDbData({ students: [], groups: data.groups });
};
