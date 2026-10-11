import { notFound } from 'next/navigation';

// Developer tools exist only in `next dev`; deployed builds answer with a 404.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return children;
}
