import { useEffect, useRef, useState } from 'react';
import type { Student } from '@/lib/db';
import styles from './view.module.css';

export type BoardGroup = { groupId: number; maxCapacity: number; members: Student[] };

// Use the actual wrapped row heights to keep every name within the screen.
function paginate(members: Student[], heights: number[], availableHeight: number): Student[][] {
  const pages: Student[][] = [[]];
  let used = 0;
  members.forEach((member, index) => {
    const height = heights[index] ?? 0;
    if (used + height > availableHeight && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(member);
    used += height;
  });
  return pages;
}

export default function GroupRoster({ group, page, onPageCount }: {
  group: BoardGroup;
  page: number;
  onPageCount: (groupId: number, count: number) => void;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLOListElement>(null);
  const [pages, setPages] = useState<Student[][]>([group.members]);

  useEffect(() => {
    const viewport = windowRef.current;
    const measurement = measurementRef.current;
    if (!viewport || !measurement) return;
    let active = true;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active || viewport.clientHeight <= 0) return;
        const heights = Array.from(measurement.children).map(row => row.getBoundingClientRect().height);
        const next = paginate(group.members, heights, viewport.clientHeight - 2);
        setPages(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
        onPageCount(group.groupId, next.length);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(measurement);
    measure();
    void document.fonts.ready.then(() => { if (active) measure(); });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [group.groupId, group.members, onPageCount]);

  const visiblePage = Math.min(page, pages.length - 1);
  const members = pages[visiblePage];
  const offset = pages.slice(0, visiblePage).reduce((sum, roster) => sum + roster.length, 0);
  const full = group.members.length >= group.maxCapacity;

  return (
    <article className={styles.panel} aria-label={'Group ' + group.groupId}>
      <header className={styles.groupHeader}>
        <div className={styles.groupIdentity}>
          <span className={styles.groupLabel}>Group</span>
          <h2>{String(group.groupId).padStart(2, '0')}</h2>
        </div>
        <div className={styles.groupCount}>
          <strong>{group.members.length}<span> / {group.maxCapacity}</span></strong>
          <span>{full ? 'Group complete' : 'Members'}</span>
        </div>
      </header>

      <div className={styles.rosterWindow} ref={windowRef}>
        <ol className={styles.names + ' ' + styles.measurement} ref={measurementRef} aria-hidden="true">
          {group.members.map((member, index) => <li key={member.id}><span>{index + 1}</span><strong>{member.name}</strong></li>)}
        </ol>
        {group.members.length ? (
          <ol className={styles.names} start={offset + 1} aria-label={'Group ' + group.groupId + ' member names'}>
            {members.map((member, index) => <li key={member.id}><span aria-hidden="true">{offset + index + 1}</span><strong>{member.name}</strong></li>)}
          </ol>
        ) : (
          <div className={styles.emptyGroup}><span className={styles.emptyRule} /><p>Waiting for members</p><span className={styles.emptyRule} /></div>
        )}
      </div>

      <footer className={styles.groupFooter}>
        <span>{group.members.length ? 'Names ' + (offset + 1) + '–' + (offset + members.length) + ' of ' + group.members.length : 'Registration is open'}</span>
        {pages.length > 1 && <span className={styles.rosterPages}>{pages.map((_, index) => <i key={index} data-active={index === visiblePage} />)}</span>}
      </footer>
    </article>
  );
}
