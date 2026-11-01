import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BONUS_PER_HINT, StrandsPhase } from '../types';
import type { StrandsGameState, StrandsLang } from '../types';
import { COLS, ROWS } from '../engine/grid';
import { hintsAvailable, tapOutcome } from '../engine/game-reducer';
import { useTranslation } from '../../../i18n/LanguageContext';
import './StrandsTable.css';

/** A press that moves less than this is a tap, not a drag. */
const TAP_SLOP = 8;
const STEP_MIN = 34;
const STEP_MAX = 68;
/**
 * Circle diameter as a share of the cell pitch.
 *
 * Kept well under 1 on purpose. Two discs of the same word that happen to be
 * neighbours WITHOUT being consecutive in it are not joined by a bar, and if
 * the discs nearly touch the sliver of background between them reads as a
 * stray arrowhead sitting on the word.
 */
const DISC = 0.78;

export interface StrandsTableProps {
  gameState: StrandsGameState;
  loading: boolean;
  onTraceStart: (cell: number) => void;
  onTraceEnter: (cell: number) => void;
  onTraceClear: () => void;
  onTraceEnd: () => void;
  onClearResult: () => void;
  onHint: () => void;
  onNextLevel: () => void;
  onSetLanguage: (lang: StrandsLang) => void;
  onBack: () => void;
}

export function StrandsTable({
  gameState, loading, onTraceStart, onTraceEnter, onTraceClear, onTraceEnd,
  onClearResult, onHint, onNextLevel, onSetLanguage, onBack,
}: StrandsTableProps) {
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(48);
  const [tracing, setTracing] = useState(false);
  const pressRef = useRef<{ x: number; y: number; submitOnUp: boolean; moved: boolean } | null>(null);

  const { level, foundIds, trace, bonusWords, lastResult, phase } = gameState;
  const done = phase === StrandsPhase.COMPLETE;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const pad = getComputedStyle(el);
      const insetX = parseFloat(pad.paddingLeft) + parseFloat(pad.paddingRight);
      const insetY = parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom);
      setStep(Math.max(STEP_MIN, Math.min(
        STEP_MAX,
        Math.floor(Math.min((width - insetX) / COLS, (height - insetY) / ROWS)),
      )));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Let a readout sit long enough to read, then drop it.
  useEffect(() => {
    if (lastResult.kind === 'none') return;
    const timer = window.setTimeout(onClearResult, 1600);
    return () => window.clearTimeout(timer);
  }, [lastResult, onClearResult]);

  const found = useMemo(() => {
    const kinds = new Map<number, 'theme' | 'spangram'>();
    if (!level) return kinds;
    for (const id of foundIds) {
      const word = level.words[id];
      if (!word) continue;
      for (const cell of word.path) kinds.set(cell, word.spangram ? 'spangram' : 'theme');
    }
    return kinds;
  }, [level, foundIds]);

  const hintCells = useMemo(() => {
    const cells = new Set<number>();
    if (!level || gameState.hintWordId === null) return cells;
    if (foundIds.includes(gameState.hintWordId)) return cells;
    for (const cell of level.words[gameState.hintWordId].path) cells.add(cell);
    return cells;
  }, [level, gameState.hintWordId, foundIds]);

  const traceSet = useMemo(() => new Set(trace), [trace]);

  const cellAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = gridRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const col = Math.floor((clientX - box.left) / step);
    const row = Math.floor((clientY - box.top) / step);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    // Only count the disc, not the whole square, or a diagonal drag clips the
    // corners of cells it was never over.
    const cx = box.left + col * step + step / 2;
    const cy = box.top + row * step + step / 2;
    if (Math.hypot(clientX - cx, clientY - cy) > (step * DISC) / 2) return null;
    return row * COLS + col;
  }, [step]);

  const handleDown = useCallback((e: React.PointerEvent) => {
    if (done) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const outcome = tapOutcome(trace, cell);
    if (outcome === 'start') onTraceStart(cell);
    else if (outcome === 'extend') onTraceEnter(cell);
    else if (outcome === 'clear') onTraceClear();
    // 'submit' waits for the release, so a drag that happens to begin on the
    // last letter is still a drag.

    pressRef.current = {
      x: e.clientX, y: e.clientY, submitOnUp: outcome === 'submit', moved: false,
    };
    setTracing(true);
  }, [cellAt, done, onTraceClear, onTraceEnter, onTraceStart, trace]);

  const handleMove = useCallback((e: React.PointerEvent) => {
    const press = pressRef.current;
    if (!tracing || !press) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) {
      press.moved = true;
    }
    const cell = cellAt(e.clientX, e.clientY);
    if (cell !== null) onTraceEnter(cell);
  }, [cellAt, onTraceEnter, tracing]);

  const handleUp = useCallback((e: React.PointerEvent) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!tracing) return;
    setTracing(false);
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    // A drag ends by sending the word. A tap only sends it when it landed back
    // on the last letter; otherwise the word stays up, waiting for the next tap.
    if (press?.moved || press?.submitOnUp) onTraceEnd();
  }, [onTraceEnd, tracing]);

  const centre = useCallback((cell: number) => ({
    x: (cell % COLS) * step + step / 2,
    y: Math.floor(cell / COLS) * step + step / 2,
  }), [step]);

  /**
   * One capsule per step rather than a single polyline.
   *
   * A polyline that doubles back on itself leaves a thin uncovered notch on the
   * inside of the turn — it reads as a little arrowhead sitting on the word.
   * Separate round-capped segments overlap at every joint instead.
   */
  const segments = useCallback((path: readonly number[]) => {
    const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 1; i < path.length; i++) {
      const from = centre(path[i - 1]);
      const to = centre(path[i]);
      out.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
    return out;
  }, [centre]);

  if (!level) {
    return (
      <div className="sw-table">
        <p className="sw-loading">{t('common.loadingGame')}</p>
      </div>
    );
  }

  const total = level.words.length;
  const available = hintsAvailable(gameState);
  const towardNext = bonusWords.length % BONUS_PER_HINT;
  const minutes = Math.floor(gameState.elapsedSeconds / 60);
  const clock = `${minutes}:${String(gameState.elapsedSeconds % 60).padStart(2, '0')}`;

  const readout = (() => {
    switch (lastResult.kind) {
      case 'bonus': return t('strands.bonusFound', { word: lastResult.word });
      case 'repeat': return t('strands.alreadyFound');
      case 'invalid': return t('strands.notAWord');
      case 'spangram': return t('strands.spangramFound');
      case 'theme': return t('strands.themeFound');
      default: return '';
    }
  })();

  return (
    <div className="sw-table">
      <div className="sw-top-bar">
        <button className="sw-icon-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="sw-level">{t('strands.level', { n: level.index + 1 })}</span>
        <div className="sw-top-right">
          <span className="sw-clock">{clock}</span>
          <button
            className="sw-lang-btn"
            onClick={() => onSetLanguage(level.lang === 'en' ? 'he' : 'en')}
            aria-label={t('strands.switchLanguage')}
          >
            {level.lang === 'en' ? 'EN' : 'עב'}
          </button>
        </div>
      </div>

      <div className="sw-clue">
        <span className="sw-clue-label">{t('strands.themeLabel')}</span>
        <strong className="sw-clue-text">{level.clue}</strong>
      </div>

      <p className="sw-progress">
        {t('strands.progress', { found: foundIds.length, total })}
      </p>

      <div className="sw-board-area" ref={areaRef}>
        <div
          className="sw-grid"
          ref={gridRef}
          style={{ width: COLS * step, height: ROWS * step }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        >
          <svg
            className="sw-links"
            width={COLS * step}
            height={ROWS * step}
            aria-hidden="true"
          >
            {foundIds.map((id) => {
              const word = level.words[id];
              if (!word) return null;
              const klass = word.spangram ? 'sw-link sw-link-span' : 'sw-link sw-link-theme';
              return segments(word.path).map((seg, i) => (
                <line
                  key={`link-${id}-${i}`}
                  className={klass}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  strokeWidth={step * DISC * 0.78}
                />
              ));
            })}
            {segments(trace).map((seg, i) => (
              <line
                key={`trace-${i}`}
                className="sw-link sw-link-trace"
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                strokeWidth={step * DISC * 0.78}
              />
            ))}
          </svg>

          {level.letters.map((letter, cell) => {
            const kind = found.get(cell);
            const classes = ['sw-cell'];
            if (kind === 'spangram') classes.push('sw-cell-span');
            else if (kind) classes.push('sw-cell-theme');
            if (traceSet.has(cell)) classes.push('sw-cell-trace');
            if (hintCells.has(cell)) classes.push('sw-cell-hint');

            return (
              <span
                key={cell}
                className={classes.join(' ')}
                style={{
                  left: (cell % COLS) * step + (step * (1 - DISC)) / 2,
                  top: Math.floor(cell / COLS) * step + (step * (1 - DISC)) / 2,
                  width: step * DISC,
                  height: step * DISC,
                  fontSize: step * 0.42,
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </div>

      <div className="sw-readout">{readout}</div>

      <div className="sw-actions">
        <button
          className={`sw-hint-btn${available > 0 ? ' sw-hint-ready' : ''}`}
          onClick={onHint}
          disabled={available <= 0 || done}
        >
          <span
            className="sw-hint-fill"
            style={{ width: `${available > 0 ? 100 : (towardNext / BONUS_PER_HINT) * 100}%` }}
          />
          <span className="sw-hint-label">
            {available > 0
              ? t('strands.hint')
              : t('strands.hintProgress', { n: towardNext, of: BONUS_PER_HINT })}
          </span>
        </button>
        <span className="sw-bonus-count">
          {t('strands.bonusCount', { n: bonusWords.length })}
        </span>
      </div>

      {loading && <span className="sw-dict-note">{t('strands.loadingWords')}</span>}

      {done && (
        <div className="sw-overlay">
          <div className="sw-modal">
            <div className="sw-modal-mark">{'✓'}</div>
            <h2>{t('strands.complete')}</h2>
            <p className="sw-modal-clue">{level.clue}</p>
            <div className="sw-modal-words">
              {level.words.map((word) => (
                <span
                  key={word.word}
                  className={word.spangram ? 'sw-chip sw-chip-span' : 'sw-chip'}
                >
                  {word.display}
                </span>
              ))}
            </div>
            <div className="sw-modal-stats">
              <div className="sw-modal-stat">
                <span className="sw-modal-value">{clock}</span>
                <span className="sw-modal-label">{t('strands.statTime')}</span>
              </div>
              <div className="sw-modal-stat">
                <span className="sw-modal-value sw-modal-gold">{bonusWords.length}</span>
                <span className="sw-modal-label">{t('strands.statBonus')}</span>
              </div>
              <div className="sw-modal-stat">
                <span className="sw-modal-value">{gameState.hintsUsed}</span>
                <span className="sw-modal-label">{t('strands.statHints')}</span>
              </div>
            </div>
            <button className="sw-btn sw-btn-primary" onClick={onNextLevel}>
              {t('strands.nextLevel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
