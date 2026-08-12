"use client";
import { useRef, useEffect, useState, useCallback } from 'react';
import { gsap } from 'gsap';

import './AccordionGallery.css';

const DEFAULT_ITEMS = [];

const AccordionGallery = ({
  items = DEFAULT_ITEMS,
  defaultIndex = null, // Allow null to start retracted
  accentColor = '#d92323',
  overlayColor = '#060010',
  textColor = '#ffffff',
  height = 500,
  gap = 6,
  radius = 0,
  expandRatio = 0.45,
  orientation = 'horizontal',
  duration = 0.5,
  ease = 'power3.out',
  parallax = 0.5,
  tilt = 0,
  stagger = 0.06,
  trigger = 'hover',
  showLabels = true,
  grayscale = true,
  className = ''
}) => {
  const rootRef = useRef(null);
  const panelRefs = useRef([]);
  const mediaRefs = useRef([]);
  const barRefs = useRef([]);
  const textRefs = useRef([]);
  const tlRef = useRef(null);
  const firstRunRef = useRef(true);
  const mediaSizeRef = useRef(320);

  const vertical = orientation === 'vertical';
  const count = items.length;
  const [active, setActive] = useState(
    defaultIndex !== null ? Math.min(Math.max(defaultIndex, 0), count - 1) : null
  );

  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const applyLayout = useCallback(
    animate => {
      const panels = panelRefs.current;
      if (!panels.length) return;

      const r = Math.min(Math.max(expandRatio, 0.1), 0.9);
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      const mediaSize = mediaSizeRef.current;

      tlRef.current?.kill();
      const dur = animate && !prefersReduced ? duration : 0;
      const tl = gsap.timeline();

      panels.forEach((panel, i) => {
        if (!panel) return;
        const isActive = active !== null ? i === active : false;
        const media = mediaRefs.current[i];
        const bar = barRefs.current[i];
        const text = textRefs.current[i];

        const rot = isActive ? 0 : active !== null ? (i < active ? tilt : -tilt) : 0;
        const rotProp = vertical ? { rotateX: -rot } : { rotateY: rot };

        tl.to(panel, { flexGrow: isActive ? grow : 1, ...rotProp, duration: dur, ease }, 0);

        if (media) {
          const drift = active !== null ? Math.max(-1.5, Math.min(1.5, active - i)) : 0;
          const shift = drift * parallax * mediaSize * 0.06;
          const gray = grayscale ? (isActive ? 0 : 1) : 0;
          tl.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: vertical ? 0 : isActive ? 0 : shift,
              y: vertical ? (isActive ? 0 : shift) : 0,
              '--ag-gray': gray,
              '--ag-dim': isActive ? 0 : 0.45,
              duration: dur,
              ease
            },
            0
          );
        }

        if (showLabels && bar && text) {
          if (isActive) {
            tl.to([bar, text], { opacity: 1, x: 0, duration: dur, ease, stagger: prefersReduced ? 0 : stagger }, 0);
          } else {
            tl.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease }, 0);
          }
        }
      });

      tlRef.current = tl;
    },
    [
      active,
      count,
      expandRatio,
      duration,
      ease,
      vertical,
      tilt,
      parallax,
      grayscale,
      showLabels,
      stagger,
      prefersReduced
    ]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const total = vertical ? rect.height : rect.width;
      const usable = Math.max(total - gap * (count - 1), 120);
      const size = Math.max(140, usable * Math.min(Math.max(expandRatio, 0.1), 0.9) * 1.22);
      mediaSizeRef.current = size;
      el.style.setProperty('--ag-media-size', `${size}px`);
      applyLayout(!firstRunRef.current);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyLayout, gap, count, expandRatio, vertical]);

  useEffect(() => {
    applyLayout(!firstRunRef.current);
    firstRunRef.current = false;
  }, [applyLayout]);

  useEffect(
    () => () => {
      tlRef.current?.kill();
    },
    []
  );

  const handleEnter = i => {
    if (trigger === 'hover') setActive(i);
  };

  const handleLeave = () => {
    if (trigger === 'hover') setActive(null);
  };

  const handleClick = (i, e) => {
    if (i !== active) {
      e.preventDefault();
      setActive(i);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i + 1) % count);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i - 1 + count) % count);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`accordion-gallery${vertical ? ' accordion-gallery--vertical' : ''}${className ? ` ${className}` : ''}`}
      style={{
        '--ag-accent': accentColor,
        '--ag-overlay': overlayColor,
        '--ag-text': textColor,
        '--ag-gap': `${gap}px`,
        '--ag-radius': `${radius}px`,
        height: vertical ? `${Math.round(height * 1.6)}px` : `${height}px`
      }}
      role="list"
      aria-label="Image accordion gallery"
      onMouseLeave={handleLeave}
    >
      {items.map((item, i) => {
        const isActive = active !== null ? i === active : false;
        const Tag = item.link ? 'a' : 'div';
        return (
          <Tag
            key={i}
            ref={el => (panelRefs.current[i] = el)}
            className={`ag-panel${isActive ? ' ag-panel--active border-4 border-[#111]' : ' border-4 border-transparent'} shadow-[8px_8px_0px_rgba(17,17,17,1)]`}
            style={{ borderRadius: `${radius}px` }}
            href={item.link || undefined}
            onClick={e => handleClick(i, e)}
            onMouseEnter={() => handleEnter(i)}
            onFocus={() => setActive(i)}
            onKeyDown={e => handleKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.label}
          >
            <span className="ag-panel__frame">
              <span className="ag-panel__media" ref={el => (mediaRefs.current[i] = el)}>
                {item.image && <img src={item.image} alt={item.alt || item.label || ''} draggable="false" />}
              </span>
              <span className="ag-panel__overlay" aria-hidden="true" />
            </span>
            
            {/* COLLAPSED BADGE */}
            {item.countText && (
               <div 
                  className="absolute top-8 left-0 right-0 flex justify-center z-10 pointer-events-none"
                  style={{
                     opacity: isActive ? 0 : 1,
                     transition: 'opacity 0.4s ease',
                  }}
               >
                  <span className={`font-oswald text-xl lg:text-2xl font-bold tracking-wider drop-shadow-[0_4px_4px_rgba(0,0,0,0.9)] opacity-90 ${item.isFull ? 'text-[#d92323]' : 'text-white'}`}>
                     {item.countText}
                  </span>
               </div>
            )}

            {/* COLLAPSED VERTICAL TEXT */}
            <div 
               className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
               style={{
                  opacity: isActive ? 0 : 1,
                  transition: 'opacity 0.4s ease',
                  zIndex: 3
               }}
            >
               <span 
                 className="font-oswald text-white font-bold text-5xl lg:text-[5rem] uppercase tracking-[0.15em] whitespace-nowrap drop-shadow-[0_6px_6px_rgba(0,0,0,0.9)] opacity-90"
                 style={{
                   writingMode: 'vertical-rl',
                   transform: 'rotate(180deg)'
                 }}
               >
                 {item.shortLabel || item.label}
               </span>
            </div>

            {showLabels && (
              <span className="ag-panel__label font-oswald" aria-hidden="true">
                <span className="ag-panel__bar" ref={el => (barRefs.current[i] = el)} />
                <span className="ag-panel__text" ref={el => (textRefs.current[i] = el)}>
                  {item.label}
                </span>
              </span>
            )}
            
            {item.content && (
              <div 
                className={`absolute inset-0 z-10 pt-16 px-4 pb-20 flex flex-col justify-start overflow-hidden pointer-events-none`}
                style={{ 
                  opacity: isActive ? 1 : 0, 
                  transition: 'opacity 0.4s ease', 
                  transitionDelay: isActive ? '0.2s' : '0s'
                }}
              >
                <div className="pointer-events-auto h-full overflow-y-auto custom-scrollbar">
                  {item.content}
                </div>
              </div>
            )}
            
          </Tag>
        );
      })}
    </div>
  );
};

export default AccordionGallery;
