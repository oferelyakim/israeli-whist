import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WordPhase } from '../types';
import type { WordLang, WordWondersGameState } from '../types';
import { buildGrid, HINT_COST } from '../engine/game-reducer';
import { useTranslation } from '../../../i18n/LanguageContext';
import './WordWondersTable.css';

const WHEEL_SIZE = 248;
const WHEEL_RADIUS = 88;
const LETTER_SIZE = 50;
/** Pointer must travel this far before a press counts as a swipe, not a tap. */
const DRAG_THRESHOLD = 8;
const CELL_GAP = 4;
const CELL_MIN = 20;
const CELL_MAX = 56;

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface WordWondersTableProps {
  gameState: WordWondersGameState;
  levelIndex: number;
  onTraceStart: (wheelIndex: number) => void;
  onTraceEnter: (wheelIndex: number) => void;
  onTraceEnd: () => void;
  onClearResult: () => void;
  onShuffle: () => void;
  onHint: () => void;
  onNextLevel: () => void;
  onSetLanguage: (lang: WordLang) => void;
  onBack: () => void;
}

export function WordWondersTable({
  gameState,
  levelIndex,
  onTraceStart,
  onTraceEnter,
  onTraceEnd,
  onClearResult,
  onShuffle,
  onHint,
  onNextLevel,
  onSetLanguage,
  onBack,
}: WordWondersTableProps) {
  const { t } = useTranslation();
  const boardRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(34);
  const [showSettings, setShowSettings] = useState(false);

  const pressedRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const level = gameState.level;
  const rtl = gameState.lang === 'he';
  const complete = gameState.phase === WordPhase.COMPLETE;
  const cells = useMemo(() => buildGrid(gameState), [gameState]);

  // One cell size that fits the whole board, rather than hardcoding per layout.
  useEffect(() => {
    const el = boardRef.current;
    if (!el || !level) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const byWidth = (width - (level.cols - 1) * CELL_GAP) / level.cols;
      const byHeight = (height - (level.rows - 1) * CELL_GAP) / level.rows;
      setCellSize(Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(Math.min(byWidth, byHeight)))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [level]);

  // Wheel geometry: one slot per letter, evenly spaced from the top.
  const slots = useMemo(() => {
    if (!level) return [];
    const n = gameState.wheelOrder.length;
    return gameState.wheelOrder.map((letterIndex, slot) => {
      const angle = (-90 + slot * (360 / n)) * (Math.PI / 180);
      return {
        letterIndex,
        letter: level.letters[letterIndex],
        cx: WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.cos(angle),
        cy: WHEEL_SIZE / 2 + WHEEL_RADIUS * Math.sin(angle),
      };
    });
  }, [gameState.wheelOrder, level]);

  const hitTest = useCallback((clientX: number, clientY: number): number | null => {
    const el = wheelRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    for (let i = 0; i < slots.length; i++) {
      const dx = x - slots[i].cx;
      const dy = y - slots[i].cy;
      if (dx * dx + dy * dy <= (LETTER_SIZE / 2 + 4) ** 2) return i;
    }
    return null;
  }, [slots]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (complete) return;
    const slot = hitTest(e.clientX, e.clientY);
    if (slot === null) return;
    pressedRef.current = slot;
    draggedRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY };
    wheelRef.current?.setPointerCapture(e.pointerId);
  }, [complete, hitTest]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (pressedRef.current === null || !originRef.current) return;
    if (!draggedRef.current) {
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      // Only now is it a swipe; the trace begins at the letter first pressed.
      draggedRef.current = true;
      onTraceStart(pressedRef.current);
    }
    const slot = hitTest(e.clientX, e.clientY);
    if (slot !== null) onTraceEnter(slot);
  }, [hitTest, onTraceStart, onTraceEnter]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const pressed = pressedRef.current;
    pressedRef.current = null;
    originRef.current = null;
    if (wheelRef.current?.hasPointerCapture(e.pointerId)) {
      wheelRef.current.releasePointerCapture(e.pointerId);
    }
    if (pressed === null) return;
    if (draggedRef.current) {
      draggedRef.current = false;
      onTraceEnd();
    } else {
      // A tap adds one letter and waits — that is the keyboard/mouse path, with
      // the Enter button below to submit.
      if (gameState.picked.length === 0) onTraceStart(pressed);
      else onTraceEnter(pressed);
    }
  }, [gameState.picked.length, onTraceStart, onTraceEnter, onTraceEnd]);

  // Clear the "not a word" / "already found" flash after a moment.
  const resultKind = gameState.lastResult.kind;
  useEffect(() => {
    if (resultKind === 'none' || resultKind === 'found') return;
    const timer = window.setTimeout(onClearResult, 1400);
    return () => window.clearTimeout(timer);
  }, [resultKind, gameState.bonusWords.length, onClearResult]);

  if (!level) return null;

  const tracedLetters = gameState.picked.map((slot) => slots[slot]?.letter ?? '');
  const tracePoints = gameState.picked
    .map((slot) => `${slots[slot]?.cx ?? 0},${slots[slot]?.cy ?? 0}`)
    .join(' ');

  const readoutClass = resultKind === 'invalid' || resultKind === 'repeat'
    ? 'ww-readout ww-readout-reject'
    : 'ww-readout';

  return (
    <div className={`ww-table ${rtl ? 'ww-rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>

      <div className="ww-top-bar">
        <button className="ww-icon-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={rtl ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
          </svg>
        </button>
        <div className="ww-title-block">
          <div className="ww-level">{t('wordwonders.level', { n: levelIndex + 1 })}</div>
          <div className="ww-progress">
            {t('wordwonders.wordsOf', { found: gameState.foundIds.length, total: level.words.length })}
          </div>
        </div>
        <div className="ww-coins">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffc233" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5h5" />
          </svg>
          <span>{gameState.coins}</span>
        </div>
        <button className="ww-icon-btn" onClick={() => setShowSettings(true)} aria-label={t('wordwonders.settings')}>
          {'⚙'}
        </button>
      </div>

      <div className="ww-board-area" ref={boardRef}>
        <div
          className="ww-grid"
          style={{
            gridTemplateColumns: `repeat(${level.cols}, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            gap: CELL_GAP,
            direction: rtl ? 'rtl' : 'ltr',
          }}
        >
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="ww-cell-blank" />;
            return (
              <div
                key={i}
                className={cell.shown ? 'ww-cell ww-cell-shown' : 'ww-cell'}
                style={{ fontSize: Math.round(cellSize * 0.56) }}
              >
                {cell.shown ? cell.letter : ''}
              </div>
            );
          })}
        </div>
      </div>

      {gameState.bonusWords.length > 0 ? (
        <div className="ww-bonus-row">
          <span className="ww-bonus-label">{t('wordwonders.bonusFound', { n: gameState.bonusWords.length })}</span>
        </div>
      ) : null}

      <div className={readoutClass}>
        {gameState.picked.length > 0 ? (
          <div className="ww-traced">
            {tracedLetters.map((ch, i) => (
              <span key={i} className="ww-traced-tile">{ch}</span>
            ))}
          </div>
        ) : resultKind === 'bonus' && gameState.lastResult.kind === 'bonus' ? (
          <span className="ww-readout-msg ww-readout-bonus">
            {t('wordwonders.bonusWord', { word: gameState.lastResult.word })}
          </span>
        ) : resultKind === 'repeat' ? (
          <span className="ww-readout-msg">{t('wordwonders.alreadyFound')}</span>
        ) : resultKind === 'invalid' ? (
          <span className="ww-readout-msg">{t('wordwonders.notAWord')}</span>
        ) : (
          <span className="ww-readout-msg ww-readout-idle">{t('wordwonders.swipeHint')}</span>
        )}
      </div>

      <div className="ww-wheel-area">
        <div
          className="ww-wheel"
          ref={wheelRef}
          style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {gameState.picked.length > 1 ? (
            <svg className="ww-trace-line" width={WHEEL_SIZE} height={WHEEL_SIZE} aria-hidden="true">
              <polyline points={tracePoints} fill="none" stroke="#ffd166" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
            </svg>
          ) : null}
          {slots.map((slot, i) => {
            const on = gameState.picked.includes(i);
            return (
              <button
                key={`${slot.letterIndex}-${i}`}
                type="button"
                className={on ? 'ww-letter ww-letter-on' : 'ww-letter'}
                style={{
                  left: slot.cx - LETTER_SIZE / 2,
                  top: slot.cy - LETTER_SIZE / 2,
                  width: LETTER_SIZE,
                  height: LETTER_SIZE,
                }}
                tabIndex={0}
              >
                {slot.letter}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ww-actions">
        <button className="ww-btn" onClick={onShuffle}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          {t('wordwonders.shuffle')}
        </button>
        {gameState.picked.length > 0 ? (
          <button className="ww-btn ww-btn-primary" onClick={onTraceEnd}>
            {t('wordwonders.enter')}
          </button>
        ) : (
          <button className="ww-btn" onClick={onHint} disabled={gameState.coins < HINT_COST}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1h6c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z" />
            </svg>
            {t('wordwonders.hint', { n: HINT_COST })}
          </button>
        )}
      </div>

      {complete ? (
        <div className="ww-overlay">
          <div className="ww-modal">
            <div className="ww-trophy">{'\u{1F3C6}'}</div>
            <h2>{t('wordwonders.levelCleared')}</h2>
            <p>{t('wordwonders.clearedMessage', { word: level.seedDisplay })}</p>
            <div className="ww-stats">
              <div className="ww-stat">
                <span className="ww-stat-value">{formatClock(gameState.elapsedSeconds)}</span>
                <span className="ww-stat-label">{t('wordwonders.statTime')}</span>
              </div>
              <div className="ww-stat">
                <span className="ww-stat-value">{level.words.length}</span>
                <span className="ww-stat-label">{t('wordwonders.statWords')}</span>
              </div>
              <div className="ww-stat">
                <span className="ww-stat-value ww-stat-gold">+{gameState.bonusWords.length}</span>
                <span className="ww-stat-label">{t('wordwonders.statBonus')}</span>
              </div>
            </div>
            {gameState.bonusWords.length > 0 ? (
              <div className="ww-bonus-list">
                <h3>{t('wordwonders.bonusTitle')}</h3>
                <div className="ww-bonus-chips">
                  {gameState.bonusWords.map((w) => (
                    <span key={w} className="ww-chip">{w}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="ww-modal-actions">
              <button className="ww-btn ww-btn-primary" onClick={onNextLevel}>
                {t('wordwonders.nextLevel')}
              </button>
              <button className="ww-btn" onClick={onBack}>{t('common.backToMenu')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="ww-overlay" onClick={() => setShowSettings(false)}>
          <div className="ww-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('wordwonders.settings')}</h2>
            <p className="ww-modal-label">{t('wordwonders.puzzleLanguage')}</p>
            <div className="ww-lang-choices">
              <button
                className={`ww-btn ${gameState.lang === 'en' ? 'ww-btn-primary' : ''}`}
                onClick={() => { setShowSettings(false); onSetLanguage('en'); }}
              >
                English
              </button>
              <button
                className={`ww-btn ${gameState.lang === 'he' ? 'ww-btn-primary' : ''}`}
                onClick={() => { setShowSettings(false); onSetLanguage('he'); }}
              >
                {'עברית'}
              </button>
            </div>
            <p className="ww-modal-note">{t('wordwonders.languageNote')}</p>
            <div className="ww-modal-actions">
              <button className="ww-btn" onClick={() => setShowSettings(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
