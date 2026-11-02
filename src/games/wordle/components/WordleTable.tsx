import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_GUESSES, WORD_LENGTH, WordleMode, WordlePhase } from '../types';
import type { Mark, WordleGameState, WordleLang, WordleStats } from '../types';
import { normaliseLetter } from '../engine/words';
import { toDisplay } from '../../wordwonders/engine/hebrew';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations';
import './WordleTable.css';

/**
 * Keyboard rows per language.
 *
 * Hebrew drops the five final forms — the grid never holds one, and offering
 * them would let a player type a letter the answer can never contain. That
 * leaves exactly the 22 letters of the alphabet.
 */
const KEYS: Readonly<Record<WordleLang, readonly string[]>> = {
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  he: ['קראטופ', 'שדגכעיחל', 'זסבהנמצת'],
};

function isLetterOf(lang: WordleLang, key: string): boolean {
  return lang === 'he' ? /^[א-ת]$/.test(key) : /^[a-zA-Z]$/.test(key);
}

export interface WordleTableProps {
  gameState: WordleGameState;
  stats: WordleStats;
  loading: boolean;
  onType: (letter: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  onClearMessage: () => void;
  onNewEndless: () => void;
  onSetMode: (mode: WordleMode) => void;
  onSetLanguage: (lang: WordleLang) => void;
  onBack: () => void;
}

export function WordleTable({
  gameState, stats, loading, onType, onBackspace, onSubmit, onClearMessage,
  onNewEndless, onSetMode, onSetLanguage, onBack,
}: WordleTableProps) {
  const { t } = useTranslation();
  const { lang, mode, guesses, current, keyboard, phase, answer, message, nudge } = gameState;
  const over = phase !== WordlePhase.PLAYING;

  // Which finished board the player has put the result card away for. Holding
  // the board's identity rather than a bare boolean means a new word brings the
  // card back on its own, with no effect resetting state (react-x forbids that).
  const finished = `${mode}:${lang}:${answer}:${guesses.length}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const showResult = over && dismissed !== finished;
  const closeResult = useCallback(() => setDismissed(finished), [finished]);
  const openResult = useCallback(() => setDismissed(null), []);

  // Let a note sit long enough to read, then drop it.
  useEffect(() => {
    if (message === '') return;
    const timer = window.setTimeout(onClearMessage, 1500);
    return () => window.clearTimeout(timer);
  }, [message, nudge, onClearMessage]);

  const press = useCallback((key: string) => {
    if (key === 'ENTER') onSubmit();
    else if (key === 'BACK') onBackspace();
    else onType(key);
  }, [onBackspace, onSubmit, onType]);

  // A real keyboard should work too, not just the drawn one.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { if (over) setDismissed(finished); return; }
      if (e.key === 'Enter') { e.preventDefault(); onSubmit(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); onBackspace(); return; }
      if (isLetterOf(lang, e.key)) {
        e.preventDefault();
        onType(normaliseLetter(lang, e.key));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finished, lang, onBackspace, onSubmit, onType, over]);

  /** Six rows: the ones guessed, the one being typed, then empty ones. */
  const rows = useMemo(() => {
    const out: Array<{ letters: string[]; marks: Mark[] | null; live: boolean }> = [];
    for (const guess of guesses) {
      out.push({ letters: [...guess.word], marks: guess.marks, live: false });
    }
    if (out.length < MAX_GUESSES) {
      const letters = [...current];
      while (letters.length < WORD_LENGTH) letters.push('');
      out.push({ letters, marks: null, live: true });
    }
    while (out.length < MAX_GUESSES) {
      out.push({ letters: new Array<string>(WORD_LENGTH).fill(''), marks: null, live: false });
    }
    return out;
  }, [guesses, current]);

  const shown = lang === 'he' ? toDisplay(answer) : answer;
  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <div className="wd-table" dir="ltr">
      <div className="wd-top-bar">
        <button className="wd-icon-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="wd-modes">
          <button
            className={`wd-mode${mode === WordleMode.DAILY ? ' wd-mode-on' : ''}`}
            onClick={() => onSetMode(WordleMode.DAILY)}
          >
            {t('wordle.daily')}
          </button>
          <button
            className={`wd-mode${mode === WordleMode.ENDLESS ? ' wd-mode-on' : ''}`}
            onClick={() => onSetMode(WordleMode.ENDLESS)}
          >
            {t('wordle.endless')}
          </button>
        </div>

        <div className="wd-top-right">
          {over && !showResult && (
            <button
              className="wd-icon-btn"
              onClick={openResult}
              aria-label={t('wordle.showResult')}
              title={t('wordle.showResult')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
            </button>
          )}
          <button
            className="wd-icon-btn wd-lang"
            onClick={() => onSetLanguage(lang === 'en' ? 'he' : 'en')}
            aria-label={t('wordle.switchLanguage')}
          >
            {lang === 'en' ? 'EN' : 'עב'}
          </button>
        </div>
      </div>

      <div className="wd-board-area">
        {/* Hebrew reads right to left, so the first letter sits on the right. */}
        <div className="wd-grid" dir={lang === 'he' ? 'rtl' : 'ltr'}>
          {rows.map((row, r) => (
            <div
              className={`wd-row${row.live && message !== '' ? ' wd-row-nudge' : ''}`}
              key={`${r}-${row.live ? nudge : 'done'}`}
            >
              {row.letters.map((letter, c) => {
                const mark = row.marks ? row.marks[c] : null;
                const classes = ['wd-tile'];
                if (mark) classes.push(`wd-tile-${mark}`);
                else if (letter) classes.push('wd-tile-typed');
                return (
                  <div
                    key={c}
                    className={classes.join(' ')}
                    style={mark ? { animationDelay: `${c * 90}ms` } : undefined}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="wd-message">{message ? t(message as TranslationKey) : ''}</div>

      <div className="wd-keyboard" dir={lang === 'he' ? 'rtl' : 'ltr'}>
        {KEYS[lang].map((row, i) => (
          <div className="wd-keyrow" key={row}>
            {i === KEYS[lang].length - 1 && (
              <button className="wd-key wd-key-wide" onClick={() => press('ENTER')}>
                {t('wordle.enter')}
              </button>
            )}
            {[...row].map((letter) => (
              <button
                key={letter}
                className={`wd-key${keyboard[letter] ? ` wd-key-${keyboard[letter]}` : ''}`}
                onClick={() => press(letter)}
              >
                {letter}
              </button>
            ))}
            {i === KEYS[lang].length - 1 && (
              <button
                className="wd-key wd-key-wide"
                onClick={() => press('BACK')}
                aria-label={t('wordle.backspace')}
              >
                {'⌫'}
              </button>
            )}
          </div>
        ))}
      </div>

      {loading && <span className="wd-loading-note">{t('wordle.loadingWords')}</span>}

      {showResult && (
        <div className="wd-overlay" onClick={closeResult} role="presentation">
          <div className="wd-modal" onClick={(e) => e.stopPropagation()} role="presentation">
            <button className="wd-modal-close" onClick={closeResult} aria-label={t('wordle.close')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <h2 className={phase === WordlePhase.WON ? '' : 'wd-modal-lost'}>
              {t(phase === WordlePhase.WON ? 'wordle.won' : 'wordle.lost')}
            </h2>
            <p className="wd-answer">{t('wordle.answerWas', { word: shown })}</p>

            {mode === WordleMode.DAILY ? (
              <>
                <div className="wd-stats">
                  <div className="wd-stat">
                    <span className="wd-stat-value">{stats.played}</span>
                    <span className="wd-stat-label">{t('wordle.statPlayed')}</span>
                  </div>
                  <div className="wd-stat">
                    <span className="wd-stat-value">{winRate}%</span>
                    <span className="wd-stat-label">{t('wordle.statWon')}</span>
                  </div>
                  <div className="wd-stat">
                    <span className="wd-stat-value wd-stat-gold">{stats.streak}</span>
                    <span className="wd-stat-label">{t('wordle.statStreak')}</span>
                  </div>
                  <div className="wd-stat">
                    <span className="wd-stat-value">{stats.best}</span>
                    <span className="wd-stat-label">{t('wordle.statBest')}</span>
                  </div>
                </div>
                <p className="wd-tomorrow">{t('wordle.comeBack')}</p>
                <div className="wd-modal-actions">
                  <button className="wd-btn wd-btn-primary" onClick={() => onSetMode(WordleMode.ENDLESS)}>
                    {t('wordle.playEndless')}
                  </button>
                  <button className="wd-btn" onClick={closeResult}>
                    {t('wordle.seeBoard')}
                  </button>
                </div>
              </>
            ) : (
              <div className="wd-modal-actions">
                <button className="wd-btn wd-btn-primary" onClick={onNewEndless}>
                  {t('wordle.newWord')}
                </button>
                <button className="wd-btn" onClick={closeResult}>
                  {t('wordle.seeBoard')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
