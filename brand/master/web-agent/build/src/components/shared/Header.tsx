'use client'

import { useState } from 'react';
import styles from './Header.module.css';
import { useDeployModal } from '@/contexts/DeployModalContext';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { openModal } = useDeployModal();

  const handleDeployClick = () => {
    openModal();
    setMenuOpen(false);
  };

  return (
    <header className={styles.header}>
      <div className={styles.navContainer}>
        <img src="/proxe/assets/Proxe-Logo.png" alt="PROXe Logo" className={styles.logo} />
        <nav className={styles.nav}>
          <a href="#" className={styles.navLink}>Features</a>
          <a href="#" className={styles.navLink}>Pricing</a>
          <button className={styles.deployButton} onClick={handleDeployClick}>Deploy</button>
        </nav>
        <div className={styles.mobileNav}>
          <button 
            className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.plusIcon}>+</span>
          </button>
          <button className={styles.mobileDeployButton} onClick={handleDeployClick}>Deploy</button>
        </div>
      </div>
      {menuOpen && (
        <div className={styles.mobileMenu}>
          <a href="#" className={styles.mobileNavLink} onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#" className={styles.mobileNavLink} onClick={() => setMenuOpen(false)}>Pricing</a>
        </div>
      )}
    </header>
  );
}

