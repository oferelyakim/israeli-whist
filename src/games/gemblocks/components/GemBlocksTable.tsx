import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GemPhase } from '../types';
import type { GemBlocksGameState, GemBlocksRecord, OfferedPiece } from '../types';
import { BOARD_SIZE, canPlace } from '../engine/board';
import { pieceSize } from '../engine/pieces';
import { useTranslation } from '../../../i18n/LanguageContext';
import './GemBlocksTable.css';

const CELL_GAP = 3;
const CELL_MIN = 22;
const CELL_MAX = 46;
const TRAY_CELL = 17;
const TRAY_GAP = 2;
/** A dragged piece rides this far above the finger so it stays visible. */
const DRAG_LIFT = 46;
const TAP_SLOP = 8;

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The shared gradient every gem paints with; rendered once per table. */
function GemDefs() {
  return (
    <svg className="gb-defs" aria-hidden="true">
      <defs>
        <linearGradient id="gb-gem-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6f5ff" />
          <stop offset="0.45" stopColor="#52d6ea" />
          <stop offset="1" stopColor="#1795bb" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Gem({ size }: { size: number }) {
  return (
    <svg className="gb-gem" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 2.5h9l5 5v9l-5 5h-9l-5-5v-9z" fill="url(#gb-gem-face)" />
      <path d="M7.5 2.5h9l-2.4 3.6H9.9z" fill="#e8fcff" opacity="0.9" />
      <path d="M2.5 7.5l5-5 2.4 3.6L6.2 9.9z" fill="#9deaf8" opacity="0.75" />
      <path d="M21.5 7.5l-5-5-2.4 3.6 3.7 3.8z" fill="#1d9cc0" opacity="0.85" />
      <path d="M6.2 9.9h11.6l1.9 3.4-4.6 6.2H8.9l-4.6-6.2z" fill="#6fdeef" opacity="0.45" />
      <path
        d="M7.5 2.5h9l5 5v9l-5 5h-9l-5-5v-9z"
        fill="none"
        stroke="#0a5f7c"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `gap` must match the surface it is drawn on, or the ghost drifts off the
 *  board preview by a pixel per row. */
function TrayPiece({ offer, cell, gap = TRAY_GAP }: { offer: OfferedPiece; cell: number; gap?: number }) {
  const { rows, cols } = pieceSize(offer.piece);
  const index = new Map(offer.piece.cells.map(([r, c], i) => [`${r},${c}`, i]));
  return (
    <div
      className="gb-tray-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        gap,
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const at = index.get(`${r},${c}`);
        if (at === undefined) return <div key={i} className="gb-tray-gap" />;
        return (
          <div key={i} className="gb-tray-cell">
            {offer.gemIndex === at ? <Gem size={Math.round(cell * 0.82)} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export interface GemBlocksTableProps {
  gameState: GemBlocksGameState;
  record: GemBlocksRecord | null;
  onSelectPiece: (index: number | null) => void;
  onPlacePiece: (index: number, row: number, col: number) => void;
  onClearFlash: () => void;
  onNewGame: () => void;
  onBack: () => void;
}

export function GemBlocksTable({
  gameState,
  record,
  onSelectPiece,
  onPlacePiece,
  onClearFlash,
  onNewGame,
  onBack,
}: GemBlocksTableProps) {
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(32);
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  // `moved` lives in state, not the ref, because the ghost's visibility is
  // rendered from it and react-x forbids reading a ref during render.
  const [dragging, setDragging] = useState<
    {
      index: number; x: number; y: number; moved: boolean; dr: number; dc: number;
      /** Pixel position of the landing square, so the ghost sits exactly on the
       *  preview instead of sliding between cells as the finger moves. */
      snap: { left: number; top: number } | null;
    } | null
  >(null);

  const grabRef = useRef<{ index: number; dr: number; dc: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const { board, gems, offered, selectedIndex, phase, lastClear } = gameState;
  const over = phase !== GemPhase.PLAYING;

  // One cell size that fits the board area, rather than a hardcoded value.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const byWidth = (width - (BOARD_SIZE - 1) * CELL_GAP) / BOARD_SIZE;
      const byHeight = (height - (BOARD_SIZE - 1) * CELL_GAP) / BOARD_SIZE;
      setCellSize(Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(Math.min(byWidth, byHeight)))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Let a clear flash play, then drop it.
  useEffect(() => {
    if (!lastClear) return;
    const timer = window.setTimeout(onClearFlash, 420);
    return () => window.clearTimeout(timer);
  }, [lastClear, onClearFlash]);

  const activeIndex = dragging?.index ?? selectedIndex;
  const activeOffer = activeIndex === null ? null : offered[activeIndex] ?? null;

  const previewCells = useMemo(() => {
    if (!activeOffer || !anchor) return null;
    const ok = canPlace(board, activeOffer.piece, anchor.row, anchor.col);
    const keys = new Set<string>();
    for (const [dr, dc] of activeOffer.piece.cells) {
      keys.add(`${anchor.row + dr},${anchor.col + dc}`);
    }
    return { keys, ok };
  }, [activeOffer, anchor, board]);

  /** Board cell under a client point, or null when outside the grid. */
  const cellAt = useCallback((clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const step = cellSize + CELL_GAP;
    const col = Math.floor((clientX - box.left) / step);
    const row = Math.floor((clientY - box.top) / step);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    return { row, col };
  }, [cellSize]);

  /** Resolves the pointer to a landing square and where that square sits. */
  const resolveAnchor = useCallback((clientX: number, clientY: number) => {
    const grab = grabRef.current;
    const el = boardRef.current;
    if (!grab || !el) return null;
    const at = cellAt(clientX, clientY - DRAG_LIFT);
    if (!at) return null;
    const box = el.getBoundingClientRect();
    const step = cellSize + CELL_GAP;
    const row = at.row - grab.dr;
    const col = at.col - grab.dc;
    return { row, col, snap: { left: box.left + col * step, top: box.top + row * step } };
  }, [cellAt, cellSize]);

  const handleTrayPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (over) return;
    const offer = offered[index];
    if (!offer) return;
    e.preventDefault();

    // Which cell of the shape was grabbed, so the piece tracks the finger from
    // the point it was picked up rather than snapping its corner to it.
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { rows, cols } = pieceSize(offer.piece);
    const stepX = box.width / cols;
    const stepY = box.height / rows;
    const dc = Math.min(cols - 1, Math.max(0, Math.floor((e.clientX - box.left) / stepX)));
    const dr = Math.min(rows - 1, Math.max(0, Math.floor((e.clientY - box.top) / stepY)));

    grabRef.current = { index, dr, dc, x: e.clientX, y: e.clientY };
    movedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelectPiece(index);
    setDragging({ index, x: e.clientX, y: e.clientY, moved: false, dr, dc, snap: null });
  }, [over, offered, onSelectPiece]);

  const handleTrayPointerMove = useCallback((e: React.PointerEvent) => {
    const grab = grabRef.current;
    if (!grab) return;
    if (!movedRef.current) {
      const dx = e.clientX - grab.x;
      const dy = e.clientY - grab.y;
      if (dx * dx + dy * dy < TAP_SLOP * TAP_SLOP) return;
      movedRef.current = true;
    }
    const resolved = resolveAnchor(e.clientX, e.clientY);
    setAnchor(resolved ? { row: resolved.row, col: resolved.col } : null);
    setDragging({
      index: grab.index, x: e.clientX, y: e.clientY, moved: true,
      dr: grab.dr, dc: grab.dc, snap: resolved?.snap ?? null,
    });
  }, [resolveAnchor]);

  const handleTrayPointerUp = useCallback((e: React.PointerEvent) => {
    const grab = grabRef.current;
    grabRef.current = null;
    setDragging(null);
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (!grab) return;

    if (movedRef.current) {
      // A drag drops the piece where the preview sat; a tap just leaves it
      // selected, so the board can be tapped next.
      const offer = offered[grab.index];
      if (offer && anchor && canPlace(board, offer.piece, anchor.row, anchor.col)) {
        onPlacePiece(grab.index, anchor.row, anchor.col);
      }
      setAnchor(null);
    }
    movedRef.current = false;
  }, [offered, anchor, board, onPlacePiece]);

  const handleBoardClick = useCallback((row: number, col: number) => {
    if (over || selectedIndex === null) return;
    const offer = offered[selectedIndex];
    if (!offer) return;
    // Tapped placement centres the shape on the tapped cell the same way a drag
    // would, using the middle of its bounding box.
    const { rows, cols } = pieceSize(offer.piece);
    const r = row - Math.floor((rows - 1) / 2);
    const c = col - Math.floor((cols - 1) / 2);
    if (canPlace(board, offer.piece, r, c)) onPlacePiece(selectedIndex, r, c);
  }, [over, selectedIndex, offered, board, onPlacePiece]);

  const boardPx = BOARD_SIZE * cellSize + (BOARD_SIZE - 1) * CELL_GAP;
  const clearedKeys = lastClear ? new Set(lastClear.cells) : null;
  const gemSize = Math.round(cellSize * 0.84);

  return (
    <div className="gb-table">
      <GemDefs />

      <div className="gb-top-bar">
        <button className="gb-icon-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="gb-goal">
          <Gem size={30} />
          <span className="gb-goal-count">
            {gameState.gemsCollected}<span className="gb-goal-of"> / {gameState.goal}</span>
          </span>
        </div>
        <div className="gb-stats">
          <span>{t('gemblocks.score', { n: gameState.score })}</span>
          <span className="gb-clock">{formatClock(gameState.elapsedSeconds)}</span>
        </div>
        <button className="gb-icon-btn" onClick={onNewGame} aria-label={t('gemblocks.newGame')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 1 3 6.7M3 20v-5h5" />
          </svg>
        </button>
      </div>

      <div className="gb-board-area" ref={areaRef}>
        {/* The frame carries the padding and backing; the grid itself is what
            `cellAt` measures, so pointer-to-cell maths needs no fudge factor. */}
        <div className="gb-board-frame">
        <div
          className="gb-board"
          ref={boardRef}
          style={{
            width: boardPx,
            height: boardPx,
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            gap: CELL_GAP,
          }}
        >
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
            const row = Math.floor(i / BOARD_SIZE);
            const col = i % BOARD_SIZE;
            const key = `${row},${col}`;
            const filled = board[row][col];
            const gem = gems[row][col];
            const inPreview = previewCells?.keys.has(key) ?? false;

            const classes = ['gb-cell'];
            if (filled) classes.push('gb-cell-filled');
            if (col % 3 === 0 && col > 0) classes.push('gb-cell-boxl');
            if (row % 3 === 0 && row > 0) classes.push('gb-cell-boxt');
            if (inPreview) classes.push(previewCells?.ok ? 'gb-cell-ok' : 'gb-cell-bad');
            if (clearedKeys?.has(key)) classes.push('gb-cell-flash');

            return (
              <div
                key={key}
                className={classes.join(' ')}
                onClick={() => handleBoardClick(row, col)}
              >
                {gem ? <Gem size={gemSize} /> : null}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      <div className="gb-tray">
        {offered.map((offer, index) => (
          <div className="gb-tray-slot" key={offer?.key ?? `empty-${index}`}>
            {offer ? (
              <button
                type="button"
                className={`gb-tray-btn${selectedIndex === index ? ' gb-tray-btn-on' : ''}${dragging?.index === index ? ' gb-tray-btn-dragging' : ''}`}
                onPointerDown={(e) => handleTrayPointerDown(e, index)}
                onPointerMove={handleTrayPointerMove}
                onPointerUp={handleTrayPointerUp}
                onPointerCancel={handleTrayPointerUp}
                aria-label={t('gemblocks.pieceSlot', { n: index + 1 })}
                aria-pressed={selectedIndex === index}
              >
                <TrayPiece offer={offer} cell={TRAY_CELL} />
              </button>
            ) : (
              <div className="gb-tray-empty" />
            )}
          </div>
        ))}
      </div>

      {dragging?.moved && activeOffer ? (
        // Over the board the ghost sits on the landing square itself. Off the
        // board it falls back to following the pointer, offset by the grabbed
        // cell rather than the shape's centre so it still reads correctly.
        <div
          className="gb-drag-ghost"
          style={
            dragging.snap
              ? { left: dragging.snap.left, top: dragging.snap.top }
              : {
                  left: dragging.x - (dragging.dc + 0.5) * (cellSize + CELL_GAP),
                  top: dragging.y - DRAG_LIFT - (dragging.dr + 0.5) * (cellSize + CELL_GAP),
                }
          }
          aria-hidden="true"
        >
          <TrayPiece offer={activeOffer} cell={cellSize} gap={CELL_GAP} />
        </div>
      ) : null}

      {phase === GemPhase.WON ? (
        <div className="gb-overlay">
          <div className="gb-modal">
            <div className="gb-modal-gem"><Gem size={56} /></div>
            <h2>{t('gemblocks.won')}</h2>
            <p>{t('gemblocks.wonMessage', { n: gameState.goal })}</p>
            <div className="gb-modal-stats">
              <div className="gb-modal-stat">
                <span className="gb-modal-value">{gameState.moves}</span>
                <span className="gb-modal-label">{t('gemblocks.statMoves')}</span>
              </div>
              <div className="gb-modal-stat">
                <span className="gb-modal-value">{formatClock(gameState.elapsedSeconds)}</span>
                <span className="gb-modal-label">{t('gemblocks.statTime')}</span>
              </div>
              <div className="gb-modal-stat">
                <span className="gb-modal-value gb-modal-gold">{gameState.score}</span>
                <span className="gb-modal-label">{t('gemblocks.statScore')}</span>
              </div>
            </div>
            {record ? (
              <p className="gb-modal-record">
                {t('gemblocks.best', { moves: record.moves, time: formatClock(record.seconds) })}
              </p>
            ) : null}
            <div className="gb-modal-actions">
              <button className="gb-btn gb-btn-primary" onClick={onNewGame}>{t('gemblocks.playAgain')}</button>
              <button className="gb-btn" onClick={onBack}>{t('common.backToMenu')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === GemPhase.GAME_OVER ? (
        <div className="gb-overlay">
          <div className="gb-modal">
            <h2 className="gb-modal-over">{t('gemblocks.gameOver')}</h2>
            <p>{t('gemblocks.gameOverMessage', { got: gameState.gemsCollected, goal: gameState.goal })}</p>
            <div className="gb-modal-actions">
              <button className="gb-btn gb-btn-primary" onClick={onNewGame}>{t('gemblocks.tryAgain')}</button>
              <button className="gb-btn" onClick={onBack}>{t('common.backToMenu')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
