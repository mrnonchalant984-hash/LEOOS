'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './LeonardXCommercial.module.css';

const SCENE_COUNT = 6;
const SCENE_DURATION_MS = 6_000;

const sceneTitles = [
  'You have an idea.',
  'Say it in a sentence.',
  'Watch it build.',
  'One idea. Any product.',
  'Live in minutes.',
  'LeonardX',
];

function TypedCopy({ text, reducedMotion }: { text: string; reducedMotion: boolean }) {
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleCharacters(index);
      if (index >= text.length) window.clearInterval(timer);
    }, 42);
    return () => window.clearInterval(timer);
  }, [reducedMotion, text]);

  const visibleText = reducedMotion ? text : text.slice(0, visibleCharacters);
  return (
    <span aria-label={text}>
      {visibleText}
      {!reducedMotion && visibleText.length < text.length && <span className={styles.cursor} aria-hidden="true">▍</span>}
    </span>
  );
}

export function LeonardXCommercial() {
  const [activeScene, setActiveScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) setIsPlaying(false);
    };
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!isPlaying || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveScene(current => (current + 1) % SCENE_COUNT);
    }, SCENE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [activeScene, isPlaying, reducedMotion]);

  function showScene(scene: number) {
    setActiveScene((scene + SCENE_COUNT) % SCENE_COUNT);
  }

  return (
    <section className={styles.section} aria-label="LeonardX product commercial">
      <div className={styles.player} role="region" aria-label="LeonardX 36-second animated product commercial">
        <div className={styles.screen}>
          <div className={styles.scene} key={activeScene}>
            {activeScene === 0 && (
              <div className={styles.typeScene}>
                <h2>{sceneTitles[0]}</h2>
                <div className={styles.promptBox}>
                  <span className={styles.promptMark} aria-hidden="true">&gt;</span>
                  <code><TypedCopy text="a booking site for my bakery" reducedMotion={reducedMotion} /></code>
                </div>
              </div>
            )}

            {activeScene === 1 && (
              <div className={styles.typeScene}>
                <h2>{sceneTitles[1]}</h2>
                <div className={styles.promptBox}>
                  <span className={styles.promptMark} aria-hidden="true">&gt;</span>
                  <code><TypedCopy text="Build me a booking site for my bakery" reducedMotion={reducedMotion} /></code>
                </div>
              </div>
            )}

            {activeScene === 2 && (
              <div className={styles.buildScene}>
                <h2>{sceneTitles[2]}</h2>
                <div className={styles.wireframe} aria-hidden="true">
                  <div className={styles.wireNav}><i /><i /><i /><b /></div>
                  <div className={styles.wireHero}><i /><i /><b /></div>
                  <div className={styles.wireCards}>
                    <i /><i /><i />
                  </div>
                </div>
              </div>
            )}

            {activeScene === 3 && (
              <div className={styles.productsScene}>
                <h2>{sceneTitles[3]}</h2>
                <div className={styles.pills}>
                  <span className={styles.productPill}>Website</span>
                  <span className={styles.productPill}>Web app</span>
                  <span className={styles.productPill}>SaaS</span>
                </div>
              </div>
            )}

            {activeScene === 4 && (
              <div className={styles.liveScene}>
                <h2>{sceneTitles[4]}</h2>
                <div className={styles.liveAddress}>
                  <span className={styles.addressDot} aria-hidden="true" />
                  <code>your-project.leonardx.app</code>
                  <span className={styles.liveBadge}><i /> Live</span>
                </div>
              </div>
            )}

            {activeScene === 5 && (
              <div className={styles.endScene}>
                <p className={styles.wordmark}>LeonardX</p>
                <p className={styles.tagline}>Describe it. Build it. Launch it.</p>
                <Link className={styles.cta} href="/auth?mode=signup">Start your first project</Link>
              </div>
            )}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.scenePicker} role="group" aria-label="Commercial scenes">
            {sceneTitles.map((title, index) => (
              <button
                className={`${styles.sceneButton} ${activeScene === index ? styles.sceneButtonActive : ''}`}
                key={title}
                type="button"
                aria-label={`Go to scene ${index + 1}: ${title}`}
                aria-pressed={activeScene === index}
                onClick={() => showScene(index)}
              >
                <span />
              </button>
            ))}
          </div>
          <span className={styles.sceneCount} aria-hidden="true">{String(activeScene + 1).padStart(2, '0')} / 06</span>
          <div className={styles.transport}>
            <button type="button" aria-label="Previous scene" title="Previous scene" onClick={() => showScene(activeScene - 1)}>←</button>
            <button
              type="button"
              aria-label={reducedMotion ? 'Autoplay disabled by reduced motion preference' : isPlaying ? 'Pause commercial' : 'Play commercial'}
              title={reducedMotion ? 'Motion reduced' : isPlaying ? 'Pause' : 'Play'}
              disabled={reducedMotion}
              onClick={() => setIsPlaying(playing => !playing)}
            >
              {reducedMotion ? '·' : isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <button type="button" aria-label="Next scene" title="Next scene" onClick={() => showScene(activeScene + 1)}>→</button>
          </div>
        </div>
      </div>
    </section>
  );
}
