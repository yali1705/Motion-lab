import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p });

export const IconUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);
export const IconRedo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </svg>
);
export const IconSkipStart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="2.5" height="14" rx="1" />
    <path d="M19 5v14L8.5 12z" />
  </svg>
);
export const IconSkipEnd = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
    <path d="M5 5v14l10.5-7z" />
  </svg>
);
export const IconChevron = ({ open, ...p }: SVGProps<SVGSVGElement> & { open?: boolean }) => (
  <svg {...base(p)} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);
export const IconExport = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v12M7 8l5-5 5 5M5 15v4h14v-4" />
  </svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconDiamond = ({ filled, animated, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean; animated?: boolean }) => (
  <svg {...base(p)} viewBox="0 0 24 24">
    <path d="M12 3l9 9-9 9-9-9z" fill={filled ? 'currentColor' : 'none'} />
    {!filled && animated ? <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /> : null}
  </svg>
);
export const IconUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);
export const IconDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
export const IconEye = ({ off, ...p }: SVGProps<SVGSVGElement> & { off?: boolean }) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off ? <path d="M3 3l18 18" /> : null}
  </svg>
);
