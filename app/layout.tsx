import type { Metadata } from 'next';
import { Inter, Oswald, Comic_Neue } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald' });
const comic = Comic_Neue({ weight: ['300', '400', '700'], subsets: ['latin'], variable: '--font-comic' });

export const metadata: Metadata = {
  title: 'JPCS General Assembly 2026',
  description: 'Join the JPCS General Assembly & Acquaintance Party 2026.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${oswald.variable} ${comic.variable} font-comic min-h-screen relative overflow-x-hidden`}>
        {/* Noise overlay for paper texture */}
        <div className="fixed inset-0 pointer-events-none -z-10 mix-blend-multiply opacity-[0.25]" 
             style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }} />
        
        {children}
      </body>
    </html>
  );
}
