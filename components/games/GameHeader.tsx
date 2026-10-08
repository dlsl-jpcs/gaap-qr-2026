import Image from 'next/image';
import Link from 'next/link';
import styles from './game.module.css';
export default function GameHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return <header className={styles.header}>
    <Link href="/" className={styles.brand} aria-label="JPCS registration home">
      <Image src="/jpcs-logo.png" alt="" width={80} height={80} className={styles.logo} priority />
      <h1>{title}</h1>
    </Link>
    {children && <nav className={styles.nav} aria-label="Game pages">{children}</nav>}
  </header>;
}
