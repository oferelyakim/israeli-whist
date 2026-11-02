import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PipsDifficulty, PipsPhase } from '../types';
import type {
  CellKey,
  Orientation,
  PipsDomino,
  PipsGameState,
  PipsPlacement,
  PipsRegion,
} from '../types';
import {
  REGION_COLOURS,
  canPlace,
  cellValues,
  constraintLabel,
  occupiedCells,
  orientationOf,
  parseKey,
  placementCells,
  regionStatus,
  regionsByCell,
  stepFrom,
} from '../engine/board';
import { useTranslation } from '../../../i18n/LanguageContext';
import './PipsTable.css';

const CELL_MIN = 32;
const CELL_MAX = 88;
/** How far the mat reaches past the cells; overlapping mat squares fuse. */
const MAT_PAD = 5;
/** Gap between the mat and a cell's face. */
const FACE_INSET = 4;
/**
 * Badges hang off the outer corner of their region, so the ones on the right
 * and bottom edges stick out past the mat. The board has to be sized with room
 * for that or they are clipped by the viewport — half a badge wide, reserved on
 * both sides so the board still centres.
 */
const BADGE_OVERHANG = 18;
const TRAY_HALF = 30;
const TAP_SLOP = 8;

/**
 * One colour per region. The generator colours regions so that no two touching
 * ones share an index, which only works if this holds REGION_COLOURS entries.
 */
const PALETTE = [
  '#9b6bd6', '#e0506b', '#3f9aa8', '#e08a3c', '#2f6fb5', '#8a9a2b',
  '#c0399a', '#2f9e63', '#d4a017', '#6b7a9c', '#8c6d4f', '#4d5fd1',
];

function colourOf(region: PipsRegion): string {
  return PALETTE[region.colour % PALETTE.length];
}

if (PALETTE.length !== REGION_COLOURS) {
  // A short palette silently makes two touching regions the same colour.
  console.error(`Pips palette has ${PALETTE.length} colours, expected ${REGION_COLOURS}`);
}

/** Dot positions on a 3x3 grid, read left-to-right, top-to-bottom. */
const PIP_LAYOUT: Readonly<Record<number, readonly number[]>> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function PipFace({ value, size }: { value: number; size: number }) {
  const dots = PIP_LAYOUT[value] ?? [];
  return (
    <span className="pips-pipgrid" style={{ width: size, height: size }}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={dots.includes(i) ? 'pips-dot pips-dot-on' : 'pips-dot'} />
      ))}
    </span>
  );
}

/** Reads a tile left-to-right or top-to-bottom for the given orientation. */
function orientedValues(domino: PipsDomino, orientation: Orientation): [number, number] {
  return orientation === 2 || orientation === 3 ? [domino.b, domino.a] : [domino.a, domino.b];
}

function isVertical(orientation: Orientation): boolean {
  return orientation === 1 || orientation === 3;
}

function DominoBody({
  values, vertical, width, height,
}: {
  values: readonly [number, number];
  vertical: boolean;
  width: number;
  height: number;
}) {
  const pip = Math.min(width, height) * 0.62;
  return (
    <span
      className={`pips-tile ${vertical ? 'pips-tile-v' : 'pips-tile-h'}`}
      style={{ width, height }}
    >
      <span className="pips-tile-half"><PipFace value={values[0]} size={pip} /></span>
      <span className="pips-tile-half"><PipFace value={values[1]} size={pip} /></span>
    </span>
  );
}

/**
 * A tile spans two cells minus ONE face inset at each outer edge — not two per
 * cell. Getting this wrong leaves a visible notch at the seam.
 */
function tileSpan(cellSize: number, vertical: boolean): { width: number; height: number } {
  const long = cellSize * 2 - FACE_INSET * 2;
  const short = cellSize - FACE_INSET * 2;
  return vertical ? { width: short, height: long } : { width: long, height: short };
}

interface DragState {
  dominoId: string;
  /** Which half the finger grabbed, so the tile lands where it looks. */
  grabHalf: 0 | 1;
  orientation: Orientation;
  fromBoard: boolean;
  x: number;
  y: number;
  moved: boolean;
  anchor: CellKey | null;
  ok: boolean;
  /** Where the ghost sits when it is over a legal square. */
  snap: { left: number; top: number } | null;
  /** True while a tile held from the board hovers the tray, which drops it. */
  overTray: boolean;
}

const DIFFICULTY_CHOICES: ReadonlyArray<{ value: PipsDifficulty; label: 'pips.easy' | 'pips.medium' | 'pips.hard'; tiles: number }> = [
  { value: PipsDifficulty.EASY, label: 'pips.easy', tiles: 4 },
  { value: PipsDifficulty.MEDIUM, label: 'pips.medium', tiles: 6 },
  { value: PipsDifficulty.HARD, label: 'pips.hard', tiles: 8 },
];

export interface PipsTableProps {
  gameState: PipsGameState;
  onSelectDomino: (id: string | null) => void;
  onRotate: () => void;
  onPlace: (dominoId: string, anchor: CellKey, orientation: Orientation) => void;
  onLift: (cell: CellKey) => void;
  onClear: () => void;
  onHint: () => void;
  onNextLevel: () => void;
  onRestart: () => void;
  onSetDifficulty: (difficulty: PipsDifficulty) => void;
  onBack: () => void;
}

export function PipsTable({
  gameState, onSelectDomino, onRotate, onPlace, onLift,
  onClear, onHint, onNextLevel, onRestart, onSetDifficulty, onBack,
}: PipsTableProps) {
  const { t } = useTranslation();
  const areaRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<{ x: number; y: number } | null>(null);
  const [cell, setCell] = useState(44);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { puzzle, placements, selectedId, orientation, phase } = gameState;
  const solved = phase === PipsPhase.SOLVED;

  const values = useMemo(
    () => cellValues(puzzle.dominoes, placements),
    [puzzle.dominoes, placements],
  );
  const regionOf = useMemo(() => regionsByCell(puzzle.regions), [puzzle.regions]);
  const boardCells = useMemo(() => new Set(puzzle.cells), [puzzle.cells]);
  const placedIds = useMemo(
    () => new Set(placements.map((p) => p.dominoId)),
    [placements],
  );
  const tray = useMemo(
    () => puzzle.dominoes.filter((d) => !placedIds.has(d.id)),
    [puzzle.dominoes, placedIds],
  );

  // One cell size that fits the board area. The rect covers the area's own
  // padding and the mat reaches past the cells, so both come off the budget —
  // see CLAUDE.md, the Gem Blocks clipping trap.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const pad = getComputedStyle(el);
      const insetX = parseFloat(pad.paddingLeft) + parseFloat(pad.paddingRight)
        + MAT_PAD * 2 + BADGE_OVERHANG * 2;
      const insetY = parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom)
        + MAT_PAD * 2 + BADGE_OVERHANG * 2;
      const byWidth = (width - insetX) / puzzle.cols;
      const byHeight = (height - insetY) / puzzle.rows;
      setCell(Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(Math.min(byWidth, byHeight)))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [puzzle.rows, puzzle.cols]);

  const boardWidth = puzzle.cols * cell + MAT_PAD * 2;
  const boardHeight = puzzle.rows * cell + MAT_PAD * 2;

  /** Top-left of a cell's face, in board coordinates. */
  const faceBox = useCallback((row: number, col: number) => ({
    left: MAT_PAD + col * cell + FACE_INSET,
    top: MAT_PAD + row * cell + FACE_INSET,
  }), [cell]);

  const cellAt = useCallback((clientX: number, clientY: number): CellKey | null => {
    const el = boardRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const col = Math.floor((clientX - box.left - MAT_PAD) / cell);
    const row = Math.floor((clientY - box.top - MAT_PAD) / cell);
    if (row < 0 || row >= puzzle.rows || col < 0 || col >= puzzle.cols) return null;
    return `${row},${col}`;
  }, [cell, puzzle.rows, puzzle.cols]);

  /** Squares taken by everything except the tile currently in hand. */
  const occupiedExcept = useCallback((dominoId: string) => (
    occupiedCells(placements.filter((p) => p.dominoId !== dominoId))
  ), [placements]);

  const beginDrag = useCallback((
    e: React.PointerEvent,
    dominoId: string,
    grabHalf: 0 | 1,
    dragOrientation: Orientation,
    fromBoard: boolean,
  ) => {
    if (solved) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    grabRef.current = { x: e.clientX, y: e.clientY };
    setDrag({
      dominoId,
      grabHalf,
      orientation: dragOrientation,
      fromBoard,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      anchor: null,
      ok: false,
      snap: null,
      overTray: false,
    });
  }, [solved]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    setDrag((current) => {
      if (!current) return current;
      const start = grabRef.current;
      const moved = current.moved
        || (start !== null
          && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP);

      const under = cellAt(e.clientX, e.clientY);
      // The grabbed half is what sits under the finger, so a tile held by its
      // second half anchors one square back along its own direction.
      const anchor = under === null
        ? null
        : current.grabHalf === 0
          ? under
          : stepFrom(under, (current.orientation + 2) % 4);

      const ok = anchor !== null
        && canPlace(boardCells, occupiedExcept(current.dominoId), anchor, current.orientation);

      let snap: { left: number; top: number } | null = null;
      const el = boardRef.current;
      if (ok && anchor !== null && el) {
        const box = el.getBoundingClientRect();
        const [ar, ac] = parseKey(anchor);
        const [br, bc] = parseKey(stepFrom(anchor, current.orientation));
        const spot = faceBox(Math.min(ar, br), Math.min(ac, bc));
        snap = { left: box.left + spot.left, top: box.top + spot.top };
      }

      // A tile already on the board can be dragged back down to the tray. Only
      // that one tile goes back — the Clear button is the way to empty the
      // board — so the drop is read off the tray's own rect.
      const trayEl = trayRef.current;
      const trayBox = trayEl ? trayEl.getBoundingClientRect() : null;
      const overTray = current.fromBoard && trayBox !== null
        && e.clientX >= trayBox.left && e.clientX <= trayBox.right
        && e.clientY >= trayBox.top && e.clientY <= trayBox.bottom;

      return { ...current, x: e.clientX, y: e.clientY, moved, anchor, ok, snap, overTray };
    });
  }, [boardCells, cellAt, faceBox, occupiedExcept]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const current = drag;
    setDrag(null);
    grabRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (!current) return;

    if (current.moved) {
      if (current.anchor && current.ok) {
        onPlace(current.dominoId, current.anchor, current.orientation);
      } else if (current.overTray) {
        const placed = placements.find((p) => p.dominoId === current.dominoId);
        if (placed) onLift(placed.cells[0]);
      }
      return;
    }

    // A press that never moved is a tap: take a tile off the board, or pick up
    // (and on a second tap, turn) one in the tray.
    if (current.fromBoard) {
      const placed = placements.find((p) => p.dominoId === current.dominoId);
      if (placed) onLift(placed.cells[0]);
    } else {
      onSelectDomino(current.dominoId);
    }
  }, [drag, onLift, onPlace, onSelectDomino, placements]);

  const handleCellTap = useCallback((target: CellKey) => {
    if (solved || drag) return;
    const covering = placements.find((p) => p.cells[0] === target || p.cells[1] === target);
    if (covering) {
      onLift(target);
      return;
    }
    if (!selectedId) return;
    if (canPlace(boardCells, occupiedExcept(selectedId), target, orientation)) {
      onPlace(selectedId, target, orientation);
    }
  }, [boardCells, drag, occupiedExcept, onLift, onPlace, orientation, placements, selectedId, solved]);

  // Squares the held tile would land on, so the drop reads before it happens.
  const preview = useMemo(() => {
    if (drag && drag.moved && drag.anchor) {
      return { cells: placementCells(drag.anchor, drag.orientation), ok: drag.ok };
    }
    return null;
  }, [drag]);

  const dragDomino = drag ? puzzle.dominoes.find((d) => d.id === drag.dominoId) ?? null : null;
  const difficultyKey = puzzle.difficulty === PipsDifficulty.EASY
    ? 'pips.easy'
    : puzzle.difficulty === PipsDifficulty.MEDIUM ? 'pips.medium' : 'pips.hard';

  const minutes = Math.floor(gameState.elapsedSeconds / 60);
  const seconds = gameState.elapsedSeconds % 60;
  const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      className="pips-table"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="pips-top-bar">
        <button className="pips-icon-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="pips-title">
          <span className="pips-level">{t('pips.level', { n: gameState.levelIndex + 1 })}</span>
          <span className="pips-difficulty">{t(difficultyKey)}</span>
        </div>
        <div className="pips-stats">
          <span className="pips-clock">{clock}</span>
          <span>{t('pips.moves', { n: gameState.moves })}</span>
        </div>
        <button
          className="pips-icon-btn"
          onClick={() => setShowSettings(true)}
          aria-label={t('pips.settings')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <p className="pips-instruction">{t('pips.instruction')}</p>

      <div className="pips-board-area" ref={areaRef}>
        <div
          className="pips-board"
          ref={boardRef}
          style={{ width: boardWidth, height: boardHeight }}
        >
          {/* The mat. Squares overlap by MAT_PAD so they fuse into one shape. */}
          {puzzle.cells.map((boardCell) => {
            const [row, col] = parseKey(boardCell);
            return (
              <div
                key={`mat-${boardCell}`}
                className="pips-mat"
                style={{
                  left: col * cell,
                  top: row * cell,
                  width: cell + MAT_PAD * 2,
                  height: cell + MAT_PAD * 2,
                }}
              />
            );
          })}

          {/* Cell faces, tinted and dash-outlined by the region they belong to. */}
          {puzzle.cells.map((boardCell) => {
            const [row, col] = parseKey(boardCell);
            const region = regionOf.get(boardCell);
            const tint = region ? colourOf(region) : null;
            const spot = faceBox(row, col);
            const inPreview = preview?.cells.includes(boardCell) ?? false;

            // Dash only the edges where the region actually ends.
            const edge = (direction: number): string => {
              if (!region) return '2px solid transparent';
              const next = regionOf.get(stepFrom(boardCell, direction));
              return next === region ? '2px solid transparent' : `2px dashed ${tint}`;
            };

            const classes = ['pips-cell'];
            if (inPreview) classes.push(preview?.ok ? 'pips-cell-ok' : 'pips-cell-bad');

            return (
              <div
                key={`face-${boardCell}`}
                data-cell={boardCell}
                className={classes.join(' ')}
                style={{
                  left: spot.left,
                  top: spot.top,
                  width: cell - FACE_INSET * 2,
                  height: cell - FACE_INSET * 2,
                  background: tint ? `${tint}38` : 'rgba(0, 0, 0, 0.22)',
                  borderRight: edge(0),
                  borderBottom: edge(1),
                  borderLeft: edge(2),
                  borderTop: edge(3),
                }}
                onClick={() => handleCellTap(boardCell)}
              />
            );
          })}

          {/* Tiles already down. */}
          {placements.map((placed: PipsPlacement) => {
            const domino = puzzle.dominoes.find((d) => d.id === placed.dominoId);
            if (!domino) return null;
            const [r0, c0] = parseKey(placed.cells[0]);
            const [r1, c1] = parseKey(placed.cells[1]);
            const vertical = c0 === c1;
            const firstIsLead = vertical ? r0 < r1 : c0 < c1;
            const shown: [number, number] = firstIsLead ? [domino.a, domino.b] : [domino.b, domino.a];
            const spot = faceBox(Math.min(r0, r1), Math.min(c0, c1));
            const held = drag?.dominoId === placed.dominoId && drag.moved;

            return (
              <div
                key={`tile-${placed.dominoId}`}
                className={`pips-placed${held ? ' pips-placed-held' : ''}`}
                style={{ left: spot.left, top: spot.top }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const under = cellAt(e.clientX, e.clientY);
                  const half: 0 | 1 = under === placed.cells[1] ? 1 : 0;
                  beginDrag(e, placed.dominoId, half, orientationOf(placed.cells), true);
                }}
              >
                <DominoBody values={shown} vertical={vertical} {...tileSpan(cell, vertical)} />
              </div>
            );
          })}

          {/* Clue badges, each pinned to the outer corner of its region. */}
          {puzzle.regions.map((region) => {
            const anchor = region.cells.reduce((best, candidate) => {
              const [br, bc] = parseKey(best);
              const [cr, cc] = parseKey(candidate);
              return cr > br || (cr === br && cc > bc) ? candidate : best;
            }, region.cells[0]);
            const [row, col] = parseKey(anchor);
            const size = Math.max(22, Math.min(34, Math.round(cell * 0.6)));
            const status = regionStatus(region, values);

            return (
              <div
                key={`badge-${region.id}`}
                className={`pips-badge pips-badge-${status}`}
                style={{
                  left: MAT_PAD + (col + 1) * cell - size / 2,
                  top: MAT_PAD + (row + 1) * cell - size / 2,
                  width: size,
                  height: size,
                  background: colourOf(region),
                  fontSize: Math.max(11, Math.round(size * 0.46)),
                }}
              >
                <span className="pips-badge-text">{constraintLabel(region)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={trayRef}
        className={`pips-tray${drag?.overTray && drag.moved ? ' pips-tray-drop' : ''}`}
      >
        {tray.length === 0 ? (
          <span className="pips-tray-empty">{t('pips.trayEmpty')}</span>
        ) : tray.map((domino) => {
          const held = selectedId === domino.id;
          const shownOrientation: Orientation = held ? orientation : 0;
          return (
            <button
              key={domino.id}
              className={`pips-tray-btn${held ? ' pips-tray-btn-on' : ''}${drag?.dominoId === domino.id && drag.moved ? ' pips-tray-btn-dragging' : ''}`}
              aria-label={t('pips.tile', { a: domino.a, b: domino.b })}
              onPointerDown={(e) => beginDrag(e, domino.id, 0, shownOrientation, false)}
            >
              <DominoBody
                values={orientedValues(domino, shownOrientation)}
                vertical={isVertical(shownOrientation)}
                width={isVertical(shownOrientation) ? TRAY_HALF : TRAY_HALF * 2}
                height={isVertical(shownOrientation) ? TRAY_HALF * 2 : TRAY_HALF}
              />
            </button>
          );
        })}
      </div>

      <div className="pips-actions">
        <button className="pips-btn" onClick={onRotate} disabled={!selectedId || solved}>
          {t('pips.rotate')}
        </button>
        <button className="pips-btn" onClick={onClear} disabled={placements.length === 0 || solved}>
          {t('pips.clear')}
        </button>
        <button className="pips-btn" onClick={onHint} disabled={solved}>
          {t('pips.hint')}
        </button>
      </div>

      {/* The ghost snaps to the square it would land on rather than trailing the
          finger — a free-following ghost drifts off the preview it is showing. */}
      {drag && drag.moved && dragDomino && (
        <div
          className="pips-ghost"
          style={drag.snap
            ? { left: drag.snap.left, top: drag.snap.top }
            : {
              left: drag.x - tileSpan(cell, isVertical(drag.orientation)).width / 2,
              top: drag.y - tileSpan(cell, isVertical(drag.orientation)).height / 2,
            }}
        >
          <DominoBody
            values={orientedValues(dragDomino, drag.orientation)}
            vertical={isVertical(drag.orientation)}
            {...tileSpan(cell, isVertical(drag.orientation))}
          />
        </div>
      )}

      {showSettings && (
        <div className="pips-overlay" onClick={() => setShowSettings(false)}>
          <div className="pips-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('pips.settings')}</h2>
            <p>{t('pips.settingsNote')}</p>
            <div className="pips-choices">
              {DIFFICULTY_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  className={`pips-choice${puzzle.difficulty === choice.value ? ' pips-choice-on' : ''}`}
                  onClick={() => {
                    setShowSettings(false);
                    onSetDifficulty(choice.value);
                  }}
                  aria-pressed={puzzle.difficulty === choice.value}
                >
                  <span className="pips-choice-name">{t(choice.label)}</span>
                  <span className="pips-choice-note">{t('pips.tiles', { n: choice.tiles })}</span>
                </button>
              ))}
            </div>
            <div className="pips-modal-actions">
              <button className="pips-btn" onClick={() => setShowSettings(false)}>
                {t('pips.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {solved && (
        <div className="pips-overlay">
          <div className="pips-modal">
            <div className="pips-modal-mark">{'✓'}</div>
            <h2>{t('pips.solved')}</h2>
            <p>{t('pips.solvedMessage', { n: gameState.levelIndex + 1 })}</p>
            <div className="pips-modal-stats">
              <div className="pips-modal-stat">
                <span className="pips-modal-value">{clock}</span>
                <span className="pips-modal-label">{t('pips.statTime')}</span>
              </div>
              <div className="pips-modal-stat">
                <span className="pips-modal-value">{gameState.moves}</span>
                <span className="pips-modal-label">{t('pips.statMoves')}</span>
              </div>
              <div className="pips-modal-stat">
                <span className="pips-modal-value pips-modal-gold">{gameState.hintsUsed}</span>
                <span className="pips-modal-label">{t('pips.statHints')}</span>
              </div>
            </div>
            <div className="pips-modal-actions">
              <button className="pips-btn" onClick={onRestart}>{t('pips.replay')}</button>
              <button className="pips-btn pips-btn-primary" onClick={onNextLevel}>
                {t('pips.nextLevel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
