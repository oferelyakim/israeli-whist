import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { SolitaireGameState, MoveSource } from '../types';
import { SolitairePhase } from '../types';
import type { Card as CardType, CardKey } from '../../../types/card';
import { cardKey, isJoker } from '../../../types/card';
import { Card } from '../../../components/cards/Card';
import { canPlaceOnFoundation } from '../engine/validation';
import { allRevealed } from '../engine/validation';
import { loadLeaderboard, saveToLeaderboard } from '../engine/leaderboard';
import type { LeaderboardEntry } from '../types';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations';
import './SolitaireGameTable.css';

interface SolitaireGameTableProps {
  gameState: SolitaireGameState;
  onDrawFromStock: () => void;
  onRecycleWaste: () => void;
  onMoveToTableau: (source: MoveSource, cardIndex: number, destColumn: number) => void;
  onMoveToFoundation: (source: MoveSource, destFoundation: number) => void;
  onUndo: () => void;
  onHint: () => void;
  onAutoComplete: () => void;
  onNewGame: () => void;
  onRestartSameCards: () => void;
  onBack: () => void;
}

interface Selection {
  source: MoveSource;
  cardIndex: number;
  cardKeys: CardKey[];
}

const FOUNDATION_SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];

const BG_OPTIONS = [
  { id: 'green', bg: 'radial-gradient(ellipse at center, #1e7a3f 0%, #145a2c 60%, #0d3d1d 100%)' },
  { id: 'blue', bg: 'radial-gradient(ellipse at center, #1a5276 0%, #154360 60%, #0e2f44 100%)' },
  { id: 'red', bg: 'radial-gradient(ellipse at center, #7a1e1e 0%, #5a1414 60%, #3d0d0d 100%)' },
  { id: 'purple', bg: 'radial-gradient(ellipse at center, #4a1a6b 0%, #351250 60%, #220d35 100%)' },
  { id: 'dark', bg: 'radial-gradient(ellipse at center, #333 0%, #222 60%, #111 100%)' },
];

const CARD_BACK_OPTIONS = [
  { id: 'pink', color: '#e84060', border: '#cc3050' },
  { id: 'blue', color: '#1e4d8c', border: '#153a6a' },
  { id: 'red', color: '#c62828', border: '#a31e1e' },
  { id: 'green', color: '#2e7d32', border: '#1b5e20' },
  { id: 'purple', color: '#6a1b9a', border: '#4a148c' },
  { id: 'black', color: '#333', border: '#222' },
];

const SETTINGS_KEY = 'solitaire-settings';

function loadSettings(): { bgId: string; backId: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { bgId: 'green', backId: 'pink' };
}

function saveSettings(s: { bgId: string; backId: string }) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function SolitaireGameTable({
  gameState: gs,
  onDrawFromStock,
  onRecycleWaste,
  onMoveToTableau,
  onMoveToFoundation,
  onUndo,
  onHint,
  onAutoComplete,
  onNewGame,
  onRestartSameCards,
  onBack,
}: SolitaireGameTableProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());
  const [wonSaved, setWonSaved] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [shakingCard] = useState<CardKey | null>(null);
  const draggingKeysRef = useRef<CardKey[]>([]);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const touchDragRef = useRef<{
    source: MoveSource;
    cardIndex: number;
    keys: CardKey[];
    clone: HTMLElement;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const currentBg = BG_OPTIONS.find(b => b.id === settings.bgId) ?? BG_OPTIONS[0];
  const currentBack = CARD_BACK_OPTIONS.find(b => b.id === settings.backId) ?? CARD_BACK_OPTIONS[0];

  const updateSettings = useCallback((patch: Partial<{ bgId: string; backId: string }>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const hintSet = useMemo(
    () => new Set(gs.hintHighlight ?? []),
    [gs.hintHighlight],
  );

  const hintTarget = gs.hintTarget;
  const hintMessage = gs.hintMessage;

  const isSelected = useCallback(
    (key: CardKey) => selection?.cardKeys.includes(key) ?? false,
    [selection],
  );

  const isHinted = useCallback(
    (key: CardKey) => hintSet.has(key),
    [hintSet],
  );

  // Save to leaderboard on win (once)
  if (gs.phase === SolitairePhase.WON && !wonSaved) {
    const updated = saveToLeaderboard(gs.moveCount);
    setLeaderboard(updated);
    setWonSaved(true);
  }

  // ─── Click handlers ────────────────────────────────────────────────

  const handleCardClick = useCallback((card: CardType, source: MoveSource, cardIndex: number) => {
    if (gs.phase !== SolitairePhase.PLAYING) return;

    const key = cardKey(card);

    // If already selected, deselect
    if (selection && selection.cardKeys.includes(key)) {
      setSelection(null);
      return;
    }

    // If we have a selection, try to place it at the clicked destination
    if (selection) {
      if (source.type === 'tableau') {
        onMoveToTableau(selection.source, selection.cardIndex, source.columnIndex);
        setSelection(null);
        return;
      }
      if (source.type === 'foundation') {
        onMoveToFoundation(selection.source, source.pileIndex);
        setSelection(null);
        return;
      }
      // Clicked something else — fall through to auto-move logic below
    }

    // ── Single-click auto-move: try foundation first, then tableau ──
    if (!isJoker(card)) {
      // Only auto-move for single cards (top of pile, waste, foundation)
      const isSingleCard = source.type === 'waste' || source.type === 'foundation'
        || (source.type === 'tableau' && cardIndex === gs.tableau[source.columnIndex].faceUp.length - 1);

      if (isSingleCard) {
        // Try foundation
        for (let fi = 0; fi < 4; fi++) {
          if (canPlaceOnFoundation(card, gs.foundations[fi])) {
            onMoveToFoundation(source, fi);
            setSelection(null);
            return;
          }
        }
      }
    }

    // Select this card (for manual placement)
    let keys: CardKey[] = [key];
    if (source.type === 'tableau') {
      const col = gs.tableau[source.columnIndex];
      keys = col.faceUp.slice(cardIndex).map(c => cardKey(c));
    }
    setSelection({ source, cardIndex, cardKeys: keys });
  }, [gs, selection, onMoveToTableau, onMoveToFoundation]);

  const handleColumnClick = useCallback((colIndex: number) => {
    if (!selection || gs.phase !== SolitairePhase.PLAYING) return;
    onMoveToTableau(selection.source, selection.cardIndex, colIndex);
    setSelection(null);
  }, [selection, gs.phase, onMoveToTableau]);

  const handleFoundationClick = useCallback((fi: number) => {
    if (!selection || gs.phase !== SolitairePhase.PLAYING) return;
    onMoveToFoundation(selection.source, fi);
    setSelection(null);
  }, [selection, gs.phase, onMoveToFoundation]);

  const handleStockClick = useCallback(() => {
    if (gs.phase !== SolitairePhase.PLAYING) return;
    setSelection(null);
    if (gs.stock.length > 0) {
      onDrawFromStock();
    } else if (gs.waste.length > 0) {
      onRecycleWaste();
    }
  }, [gs, onDrawFromStock, onRecycleWaste]);

  const handleJokerClick = useCallback(() => {
    if (gs.phase !== SolitairePhase.PLAYING) return;
    if (gs.jokerLocation.type !== 'available') return;
    if (selection && selection.source.type === 'joker') {
      setSelection(null);
      return;
    }
    setSelection({
      source: { type: 'joker' },
      cardIndex: 0,
      cardKeys: ['JOKER_RED_0' as CardKey],
    });
  }, [gs, selection]);

  const handleNewGame = useCallback(() => {
    setSelection(null);
    setWonSaved(false);
    onNewGame();
  }, [onNewGame]);

  const handleRestartSameCards = useCallback(() => {
    setSelection(null);
    setWonSaved(false);
    onRestartSameCards();
  }, [onRestartSameCards]);

  // ─── Drag & Drop handlers ──────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, source: MoveSource, cardIndex: number, keys: CardKey[]) => {
    if (gs.phase !== SolitairePhase.PLAYING) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify({ source, cardIndex }));
    e.dataTransfer.effectAllowed = 'move';
    draggingKeysRef.current = keys;
    setSelection(null);
  }, [gs.phase]);

  const handleDragEnd = useCallback(() => {
    draggingKeysRef.current = [];
    setDragOverTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnColumn = useCallback((e: React.DragEvent, colIndex: number) => {
    e.preventDefault();
    draggingKeysRef.current = [];
    setDragOverTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      onMoveToTableau(data.source, data.cardIndex, colIndex);
    } catch { /* ignore bad data */ }
  }, [onMoveToTableau]);

  const handleDropOnFoundation = useCallback((e: React.DragEvent, fi: number) => {
    e.preventDefault();
    draggingKeysRef.current = [];
    setDragOverTarget(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      onMoveToFoundation(data.source, fi);
    } catch { /* ignore bad data */ }
  }, [onMoveToFoundation]);

  // ─── Touch drag handlers ─────────────────────────────────────────

  const cleanupTouchDrag = useCallback(() => {
    if (touchDragRef.current) {
      touchDragRef.current.clone.remove();
      touchDragRef.current = null;
    }
    // Also remove any orphaned clones
    document.querySelectorAll('.sol-touch-clone').forEach(el => el.remove());
    draggingKeysRef.current = [];
    setDragOverTarget(null);
    setIsTouchDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, source: MoveSource, cardIndex: number, keys: CardKey[]) => {
    if (gs.phase !== SolitairePhase.PLAYING) return;

    // Clean up any stale drag state first
    cleanupTouchDrag();

    const touch = e.touches[0];
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    let clone: HTMLElement;

    // Multi-card drag: clone all cards in the sub-stack with overlapping layout
    if (source.type === 'tableau' && keys.length > 1) {
      const colEl = target.closest('[data-col]');
      if (colEl) {
        const faceUpEls = colEl.querySelectorAll('.sol-tableau-faceup');
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.width = `${rect.width}px`;
        // Use negative margins like the actual pile — only show ~28px (desktop) or ~20px (mobile) of each card
        const negMargin = window.innerWidth <= 600 ? -48 : -72;
        for (let i = 0; i < keys.length; i++) {
          const el = faceUpEls[cardIndex + i];
          if (el) {
            const cloned = el.cloneNode(true) as HTMLElement;
            cloned.style.position = 'relative';
            cloned.style.marginTop = i === 0 ? '0' : `${negMargin}px`;
            cloned.style.zIndex = `${i}`;
            wrapper.appendChild(cloned);
          }
        }
        clone = wrapper;
      } else {
        clone = target.cloneNode(true) as HTMLElement;
      }
    } else {
      clone = target.cloneNode(true) as HTMLElement;
    }

    clone.className = (clone.className || '') + ' sol-touch-clone';
    clone.style.position = 'fixed';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '9999';
    clone.style.left = `${touch.clientX - rect.width / 2}px`;
    clone.style.top = `${touch.clientY - rect.height * 0.7}px`;
    document.body.appendChild(clone);

    touchDragRef.current = {
      source,
      cardIndex,
      keys,
      clone,
      offsetX: rect.width / 2,
      offsetY: rect.height * 0.7,
    };
    draggingKeysRef.current = keys;
    setIsTouchDragging(true);
    setSelection(null);
  }, [gs.phase, cleanupTouchDrag]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const td = touchDragRef.current;
    if (!td) return;
    e.preventDefault();
    const touch = e.touches[0];
    td.clone.style.left = `${touch.clientX - td.offsetX}px`;
    td.clone.style.top = `${touch.clientY - td.offsetY}px`;

    // Detect drop target under finger
    td.clone.style.display = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    td.clone.style.display = '';

    if (el) {
      const col = (el as HTMLElement).closest('[data-col]');
      const found = (el as HTMLElement).closest('[data-found]');
      if (col) {
        setDragOverTarget(`c-${col.getAttribute('data-col')}`);
      } else if (found) {
        setDragOverTarget(`f-${found.getAttribute('data-found')}`);
      } else {
        setDragOverTarget(null);
      }
    }
  }, []);

  const findNearestDropTarget = useCallback((x: number, y: number): { type: 'column' | 'foundation'; index: number } | null => {
    let best: { type: 'column' | 'foundation'; index: number } | null = null;
    let bestDist = Infinity;
    document.querySelectorAll('[data-col]').forEach(el => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const dist = Math.abs(x - cx);
      if (dist < bestDist && y >= rect.top - 20) {
        bestDist = dist;
        best = { type: 'column', index: parseInt(el.getAttribute('data-col')!) };
      }
    });
    document.querySelectorAll('[data-found]').forEach(el => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const dist = Math.abs(x - cx);
      if (dist < bestDist && y >= rect.top - 20 && y <= rect.bottom + 20) {
        bestDist = dist;
        best = { type: 'foundation', index: parseInt(el.getAttribute('data-found')!) };
      }
    });
    return bestDist < 60 ? best : null;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const td = touchDragRef.current;
    if (!td) return;
    const touch = e.changedTouches[0];

    // Find drop target
    td.clone.style.display = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    td.clone.style.display = '';

    let moved = false;
    if (el) {
      const col = (el as HTMLElement).closest('[data-col]');
      const found = (el as HTMLElement).closest('[data-found]');
      if (col) {
        const ci = parseInt(col.getAttribute('data-col')!, 10);
        onMoveToTableau(td.source, td.cardIndex, ci);
        moved = true;
      } else if (found) {
        const fi = parseInt(found.getAttribute('data-found')!, 10);
        onMoveToFoundation(td.source, fi);
        moved = true;
      }
    }

    // Fallback: find nearest column/foundation within tolerance
    if (!moved) {
      const nearest = findNearestDropTarget(touch.clientX, touch.clientY);
      if (nearest) {
        if (nearest.type === 'column') {
          onMoveToTableau(td.source, td.cardIndex, nearest.index);
        } else {
          onMoveToFoundation(td.source, nearest.index);
        }
      }
    }

    // Cleanup
    cleanupTouchDrag();
  }, [onMoveToTableau, onMoveToFoundation, findNearestDropTarget, cleanupTouchDrag]);

  const handleTouchCancel = useCallback(() => {
    cleanupTouchDrag();
  }, [cleanupTouchDrag]);

  // Prevent scrolling while touch-dragging; also handle touchend/cancel at document level as safety net
  useEffect(() => {
    if (!isTouchDragging) return;
    const prevent = (e: TouchEvent) => {
      if (touchDragRef.current) e.preventDefault();
    };
    const safetyCleanup = () => {
      cleanupTouchDrag();
    };
    document.addEventListener('touchmove', prevent, { passive: false });
    document.addEventListener('touchcancel', safetyCleanup);
    return () => {
      document.removeEventListener('touchmove', prevent);
      document.removeEventListener('touchcancel', safetyCleanup);
    };
  }, [isTouchDragging, cleanupTouchDrag]);

  const canAutoComplete = gs.phase === SolitairePhase.PLAYING && allRevealed(gs);
  const isAutoCompleting = gs.phase === SolitairePhase.AUTO_COMPLETING;

  // ─── Render helpers ────────────────────────────────────────────────

  const renderCard = (
    card: CardType,
    source: MoveSource,
    cardIndex: number,
    faceDown = false,
    extraClass = '',
  ) => {
    const key = cardKey(card);
    const selected = isSelected(key);
    const hinted = isHinted(key);
    // Joker in tableau can't be moved if cards are on top of it
    const isJokerLocked = isJoker(card) && source.type === 'tableau'
      && cardIndex < gs.tableau[source.columnIndex].faceUp.length - 1;
    const isDraggable = !faceDown && gs.phase === SolitairePhase.PLAYING && !isJokerLocked;
    const isDragging = draggingKeysRef.current.includes(key);
    const isShaking = shakingCard === key;

    // Build the keys array for this drag (for tableau: this card + all below)
    let dragKeys: CardKey[] = [key];
    if (source.type === 'tableau') {
      const col = gs.tableau[source.columnIndex];
      dragKeys = col.faceUp.slice(cardIndex).map(c => cardKey(c));
    }

    return (
      <div
        key={`${key}-${source.type}-${'columnIndex' in source ? source.columnIndex : ''}-${cardIndex}`}
        className={`sol-card-wrapper ${selected ? 'sol-selected' : ''} ${hinted ? 'sol-hint-glow' : ''} ${isDragging ? 'sol-dragging' : ''} ${isShaking ? 'sol-shake' : ''} ${extraClass}`}
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => handleDragStart(e, source, cardIndex, dragKeys) : undefined}
        onDragEnd={handleDragEnd}
        onTouchStart={isDraggable ? (e) => handleTouchStart(e, source, cardIndex, dragKeys) : undefined}
        onTouchMove={isDraggable ? handleTouchMove : undefined}
        onTouchEnd={isDraggable ? handleTouchEnd : undefined}
        onTouchCancel={isDraggable ? handleTouchCancel : undefined}
      >
        <Card
          card={card}
          faceDown={faceDown}
          playable={isDraggable}
          selected={selected}
          onClick={faceDown ? undefined : () => handleCardClick(card, source, cardIndex)}
        />
      </div>
    );
  };

  // ─── Stock ─────────────────────────────────────────────────────────

  const renderStock = () => {
    const isHintDest = hintTarget?.type === 'stock';
    return (
    <div className={`sol-stock ${isHintDest ? 'sol-hint-target' : ''}`} onClick={handleStockClick}>
      {gs.stock.length > 0 ? (
        <div className="sol-card-wrapper">
          <Card card={gs.stock[gs.stock.length - 1]} faceDown />
        </div>
      ) : gs.waste.length > 0 ? (
        <div className="sol-empty-slot sol-recycle">{'\u21BB'}</div>
      ) : (
        <div className="sol-empty-slot" />
      )}
      {gs.stock.length > 0 && (
        <div className="sol-stock-count">{gs.stock.length}</div>
      )}
    </div>
  );
  };

  // ─── Waste (show top 3 fanned) ────────────────────────────────────

  const renderWaste = () => {
    const shown = gs.waste.slice(-3);
    return (
      <div className="sol-waste">
        {shown.length === 0 && <div className="sol-empty-slot" />}
        {shown.map((card, i) => {
          const isTop = i === shown.length - 1;
          return (
            <div
              key={cardKey(card)}
              className="sol-waste-card"
              style={{
                marginLeft: i > 0 ? 'calc(var(--card-width, 70px) * -0.5)' : 0,
                zIndex: i,
              }}
            >
              {renderCard(
                card,
                { type: 'waste' },
                0,
                false,
                isTop ? '' : 'sol-waste-buried',
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Foundations ────────────────────────────────────────────────────

  const renderFoundations = () => (
    <div className="sol-foundations">
      {gs.foundations.map((pile, fi) => {
        const isHintDest = hintTarget?.type === 'foundation' && hintTarget.pileIndex === fi;
        return (
        <div
          key={fi}
          className={`sol-foundation ${selection ? 'sol-droppable' : ''} ${dragOverTarget === `f-${fi}` ? 'sol-drag-over' : ''} ${isHintDest ? 'sol-hint-target' : ''}`}
          data-found={fi}
          onClick={() => handleFoundationClick(fi)}
          onDragOver={handleDragOver}
          onDragEnter={() => setDragOverTarget(`f-${fi}`)}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null); }}
          onDrop={(e) => handleDropOnFoundation(e, fi)}
        >
          {pile.cards.length > 0 ? (
            renderCard(
              pile.cards[pile.cards.length - 1],
              { type: 'foundation', pileIndex: fi },
              0,
            )
          ) : (
            <div className="sol-empty-slot sol-foundation-empty">
              <span className="sol-foundation-suit">{FOUNDATION_SUITS[fi]}</span>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );

  // ─── Joker indicator ───────────────────────────────────────────────

  const renderJokerIndicator = () => {
    if (gs.jokerLocation.type !== 'available') return null;
    const jokerSelected = selection?.source.type === 'joker';
    return (
      <div
        className={`sol-joker-indicator ${jokerSelected ? 'sol-selected' : ''}`}
        onClick={handleJokerClick}
        title={t('solitaire.jokerAvailable')}
      >
        <span className="sol-joker-star">{'\u2605'}</span>
        <span className="sol-joker-label">{t('solitaire.jokerLabel')}</span>
      </div>
    );
  };

  // ─── Tableau ───────────────────────────────────────────────────────

  const renderTableau = () => (
    <div className="sol-tableau">
      {gs.tableau.map((col, ci) => {
        const isHintDest = hintTarget?.type === 'tableau' && hintTarget.columnIndex === ci;
        return (
        <div
          key={ci}
          className={`sol-column ${selection ? 'sol-droppable' : ''} ${dragOverTarget === `c-${ci}` ? 'sol-drag-over' : ''} ${isHintDest ? 'sol-hint-target' : ''}`}
          data-col={ci}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.sol-card-wrapper')) return;
            handleColumnClick(ci);
          }}
          onDragOver={handleDragOver}
          onDragEnter={() => setDragOverTarget(`c-${ci}`)}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null); }}
          onDrop={(e) => handleDropOnColumn(e, ci)}
        >
          {col.faceDown.length === 0 && col.faceUp.length === 0 && (
            <div className="sol-empty-slot sol-column-empty" />
          )}
          {col.faceDown.map((card, i) => (
            <div key={`fd-${i}`} className="sol-tableau-card sol-tableau-facedown" style={{ zIndex: i }}>
              <Card card={card} faceDown small={false} />
            </div>
          ))}
          {col.faceUp.map((card, i) => (
            <div key={cardKey(card)} className="sol-tableau-card sol-tableau-faceup" style={{ zIndex: col.faceDown.length + i }}>
              {renderCard(
                card,
                { type: 'tableau', columnIndex: ci },
                i,
              )}
            </div>
          ))}
        </div>
        );
      })}
    </div>
  );

  // ─── Action bar ────────────────────────────────────────────────────

  const renderActionBar = () => (
    <div className="sol-top-bar">
      <button className="sol-btn sol-btn-back" onClick={onBack}>{'\u2190'} {t('common.backToMenu')}</button>
      <span className="sol-moves">{t('solitaire.moves', { n: String(gs.moveCount) })}</span>
      <div className="sol-actions">
        <button
          className="sol-btn"
          onClick={onUndo}
          disabled={gs.moveHistory.length === 0 || gs.phase !== SolitairePhase.PLAYING}
        >
          {t('solitaire.undo')}
        </button>
        <button
          className="sol-btn"
          onClick={onHint}
          disabled={gs.phase !== SolitairePhase.PLAYING}
        >
          {t('solitaire.hint')}
        </button>
      </div>
    </div>
  );

  // ─── Auto-complete bar ─────────────────────────────────────────────

  const renderAutoComplete = () => {
    if (!canAutoComplete && !isAutoCompleting) return null;
    return (
      <div className="sol-auto-complete-bar">
        <button
          className="sol-btn sol-btn-auto"
          onClick={onAutoComplete}
          disabled={isAutoCompleting}
        >
          {isAutoCompleting ? t('solitaire.autoCompleting') : t('solitaire.autoComplete')}
        </button>
      </div>
    );
  };

  // ─── Win overlay ───────────────────────────────────────────────────

  const CELEB_KEYS = useMemo(() => [
    'solitaire.celebMsg1' as const,
    'solitaire.celebMsg2' as const,
    'solitaire.celebMsg3' as const,
    'solitaire.celebMsg4' as const,
    'solitaire.celebMsg5' as const,
    'solitaire.celebMsg6' as const,
  ], []);
  const [celebIdx] = useState(() => Math.floor(Math.random() * 6));

  const PARTICLES = useMemo(() => {
    const emojis = ['\u2B50', '\u2764\uFE0F', '\u{1F389}', '\u{1F3C6}', '\u{1F451}', '\u2728', '\u{1F0CF}', '\u2660\uFE0F', '\u2665\uFE0F', '\u2666\uFE0F', '\u2663\uFE0F', '\u{1F4AB}'];
    return Array.from({ length: 30 }, (_, i) => ({
      emoji: emojis[i % emojis.length],
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2,
      size: 16 + Math.random() * 20,
    }));
  }, []);

  const renderWinOverlay = () => {
    if (gs.phase !== SolitairePhase.WON) return null;
    return (
      <div className="sol-win-overlay">
        <div className="sol-win-particles" aria-hidden>
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="sol-particle"
              style={{
                left: `${p.left}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                fontSize: `${p.size}px`,
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>
        <div className="sol-win-card">
          <div className="sol-win-trophy">{'\u{1F3C6}'}</div>
          <h2 className="sol-win-title">{t('solitaire.youWon')}</h2>
          <p className="sol-win-celeb">{t(CELEB_KEYS[celebIdx])}</p>
          <p className="sol-win-message">
            {t('solitaire.wonMessage', { n: String(gs.moveCount) })}
          </p>
          {leaderboard.length > 0 && (
            <div className="sol-leaderboard">
              <h3>{t('solitaire.leaderboard')}</h3>
              <ol className="sol-leaderboard-list">
                {leaderboard.map((entry, i) => (
                  <li key={i} className={entry.moves === gs.moveCount ? 'sol-lb-current' : ''}>
                    <span className="sol-lb-moves">{entry.moves} {t('solitaire.movesLabel')}</span>
                    <span className="sol-lb-date">{entry.date}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="sol-win-buttons">
            <button className="sol-btn sol-btn-primary sol-btn-play-again" onClick={handleNewGame}>
              {t('solitaire.playAgain')} {'\u21BB'}
            </button>
            <button className="sol-btn" onClick={() => window.location.reload()}>
              {t('common.backToMenu')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Stuck dialog ─────────────────────────────────────────────────

  const renderStuckDialog = () => {
    if (!gs.showStuckDialog) return null;
    return (
      <div className="sol-stuck-overlay">
        <div className="sol-stuck-card">
          <h2 className="sol-stuck-title">{t('solitaire.noMoves')}</h2>
          <div className="sol-stuck-buttons">
            <button className="sol-btn sol-btn-primary" onClick={handleRestartSameCards}>
              {t('solitaire.restartSameCards')}
            </button>
            <button className="sol-btn sol-btn-primary" onClick={handleNewGame}>
              {t('solitaire.newGameShuffle')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────

  return (
    <div
      className={`sol-table ${isTouchDragging ? 'sol-touch-active' : ''}`}
      ref={tableRef}
      style={{
        background: currentBg.bg,
        '--card-back-color': currentBack.color,
        '--card-back-border': currentBack.border,
      } as React.CSSProperties}
    >
      {renderActionBar()}
      <div className="sol-top-area">
        <div className="sol-foundations-area">
          {renderFoundations()}
        </div>
        <div className="sol-stock-waste">
          {renderWaste()}
          {renderStock()}
        </div>
      </div>
      {renderTableau()}
      {renderJokerIndicator()}
      {gs.phase === SolitairePhase.PLAYING && (
        <button
          className="sol-btn sol-btn-settings"
          onClick={() => setShowSettings(s => !s)}
          title={t('solitaire.settings')}
        >
          <span>{'\u2699'}</span>
          <span className="sol-settings-label">{t('solitaire.settings')}</span>
        </button>
      )}
      {gs.phase === SolitairePhase.PLAYING && (
        <button
          className="sol-btn sol-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('solitaire.newGameShuffle')}
        >
          <span>{'\u21BB'}</span>
          <span className="sol-reshuffle-label">{t('solitaire.reshuffleLabel')}</span>
        </button>
      )}
      {showReshuffleConfirm && (
        <div className="sol-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="sol-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="sol-confirm-text">{t('common.reshuffleConfirm')}</p>
            <div className="sol-confirm-buttons">
              <button className="sol-btn sol-btn-primary" onClick={() => { setShowReshuffleConfirm(false); handleNewGame(); }}>
                {t('common.yes')}
              </button>
              <button className="sol-btn" onClick={() => setShowReshuffleConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div className="sol-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="sol-settings-panel" onClick={e => e.stopPropagation()}>
            <h3>{t('solitaire.background')}</h3>
            <div className="sol-settings-row">
              {BG_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`sol-swatch sol-swatch-bg ${settings.bgId === opt.id ? 'sol-swatch-active' : ''}`}
                  style={{ background: opt.bg }}
                  onClick={() => updateSettings({ bgId: opt.id })}
                />
              ))}
            </div>
            <h3>{t('solitaire.cardBack')}</h3>
            <div className="sol-settings-row">
              {CARD_BACK_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`sol-swatch sol-swatch-card ${settings.backId === opt.id ? 'sol-swatch-active' : ''}`}
                  style={{ background: opt.color }}
                  onClick={() => updateSettings({ backId: opt.id })}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      {hintMessage && (
        <div className="sol-hint-message">
          {t(hintMessage as TranslationKey)}
        </div>
      )}
      {renderAutoComplete()}
      {renderWinOverlay()}
      {renderStuckDialog()}
    </div>
  );
}
