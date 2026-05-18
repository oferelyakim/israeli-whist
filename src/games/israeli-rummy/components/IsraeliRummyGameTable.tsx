import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { Card } from '../../../types/card';
import { cardKey } from '../../../types/card';
import type { IsraeliRummyGameState, Meld } from '../types';
import { IsraeliRummyPhase } from '../types';
import { RummyTile as CardComponent } from './RummyTile';
import { isValidMeld, isJokerCard, meetsFirstMeldRequirement, meldPointValue, sortMeldCards, couldFitInMeld, findJokerToReplace, sortBySuit, sortBySequence, cardPointValue } from '../engine/validation';
import './IsraeliRummyGameTable.css';

interface IsraeliRummyGameTableProps {
  gameState: IsraeliRummyGameState;
  humanSeat: number;
  onDrawCard: () => void;
  onStartRearrange: () => void;
  onCommitMelds: (melds: Meld[], hand: Card[]) => void;
  onRevertRearrange: () => void;
  onPassTurn: () => void;
  onSortHand: (mode: 'suit' | 'sequence') => void;
  onReorderHand: (newHand: Card[]) => void;
  onNewGame: () => void;
  onEndGame: () => void;
  onBack: () => void;
}

// ─── DnD Types ──────────────────────────────────────────────────────────────

interface DragInfo {
  source: 'hand' | 'meld' | 'builder';
  handIndices: number[];       // For hand source: which indices
  meldId?: string;             // For meld source
  meldCardIdx?: number;        // For meld source
  builderIdx?: number;         // For new-set-builder source
  cards: Card[];               // The actual cards being dragged
  startX: number;
  startY: number;
  isDragging: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 8;
const PROXIMITY_PX = 50;
const ERROR_AUTO_DISMISS_MS = 3500;

/** Compute indices in the hand where a visual gap should appear (between highlighted groups).
 *  Detects both sets (3+ same rank, different suits) and runs (3+ consecutive same suit). */
function computeGapIndices(hand: Card[]): Set<number> {
  const gaps = new Set<number>();
  if (hand.length < 2) return gaps;
  let i = 0;
  while (i < hand.length) {
    if (isJokerCard(hand[i])) { i++; continue; }

    // Try detecting a set group (same rank, different suits)
    const rank = hand[i].rank;
    let j = i + 1;
    while (j < hand.length && !isJokerCard(hand[j]) && hand[j].rank === rank) j++;
    const groupSuits = new Set<string>();
    for (let k = i; k < j; k++) groupSuits.add(hand[k].suit);
    if (groupSuits.size >= 3 && j < hand.length) {
      gaps.add(j);
      i = j;
      continue;
    }

    // Try detecting a run group (consecutive ranks, same suit)
    const suit = hand[i].suit;
    let rj = i + 1;
    while (rj < hand.length && !isJokerCard(hand[rj]) && hand[rj].suit === suit) {
      const prevRank = hand[rj - 1].rank === 14 ? 1 : hand[rj - 1].rank; // ACE=14 -> 1
      const curRank = hand[rj].rank === 14 ? 1 : hand[rj].rank;
      if (curRank === prevRank + 1) {
        rj++;
      } else {
        break;
      }
    }
    if (rj - i >= 3 && rj < hand.length) {
      gaps.add(rj);
      i = rj;
      continue;
    }

    i = j;
  }
  return gaps;
}

// ─── Sparse hand-rack helpers ───────────────────────────────────────────────
//
// The hand rack is a sparse 2D grid: `handOrder: (HandSlotKey | null)[]`.
// Non-null entries are occurrence-aware keys for a specific tile in the hand;
// null entries are intentional visual gaps that persist across moves (until
// the user re-sorts). Because the Israeli Rummy deck has duplicates (double
// deck), we derive a per-occurrence key like `HEARTS_7#0`, `HEARTS_7#1` so we
// can distinguish two copies of the same tile.

/** Minimum grid slots (always fills a 2x7 grid even for a short hand). */
const HAND_MIN_SLOTS = 14;
/** Grid column count — must match CSS `grid-template-columns: repeat(7, ...)`. */
const HAND_COLS = 7;

type HandSlotKey = string;

/** Round slot count UP to the next full row, clamped to at least HAND_MIN_SLOTS. */
function roundUpSlots(minNeeded: number): number {
  const needed = Math.max(HAND_MIN_SLOTS, minNeeded);
  return Math.ceil(needed / HAND_COLS) * HAND_COLS;
}

/** Build a list of occurrence-aware keys for a hand, preserving array order.
 *  The k-th duplicate of card X gets key `${cardKey(X)}#${k}`. */
function buildHandKeys(hand: Card[]): HandSlotKey[] {
  const seen = new Map<string, number>();
  const keys: HandSlotKey[] = [];
  for (const c of hand) {
    const base = cardKey(c);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    keys.push(`${base}#${n}`);
  }
  return keys;
}

/** Sync an existing sparse handOrder with the new dense hand:
 *   - keep keys that are still present (at their current slot)
 *   - drop keys no longer in hand (slot becomes null)
 *   - append newly-arrived keys into the first null slot
 * Returns a new sparse array sized to the next multiple-of-7 rows. */
function syncHandOrder(
  prev: (HandSlotKey | null)[],
  hand: Card[],
): (HandSlotKey | null)[] {
  const keys = buildHandKeys(hand);
  // Multiset of hand keys remaining to place.
  const remaining = new Set<HandSlotKey>(keys);

  // Start by preserving prev entries whose key is still in hand.
  const next: (HandSlotKey | null)[] = prev.map((k) => {
    if (k !== null && remaining.has(k)) {
      remaining.delete(k);
      return k;
    }
    return null;
  });

  // Append newly-arrived keys (preserve original hand order) into first nulls.
  const toPlace = keys.filter((k) => remaining.has(k));
  for (const k of toPlace) {
    let idx = next.indexOf(null);
    if (idx === -1) {
      // Grow the grid by one full row.
      const extra = Array.from({ length: HAND_COLS }, () => null as HandSlotKey | null);
      next.push(...extra);
      idx = next.length - HAND_COLS;
    }
    next[idx] = k;
  }

  // Ensure we always have at least HAND_MIN_SLOTS and a full bottom row.
  const filled = next.filter((k) => k !== null).length;
  const minSlots = roundUpSlots(Math.max(filled, next.length));
  while (next.length < minSlots) next.push(null);

  // Trim trailing nulls only if doing so still keeps at least HAND_MIN_SLOTS
  // and preserves a full row (don't let grow-then-shrink leave orphan rows).
  let trimEnd = next.length;
  while (
    trimEnd > HAND_MIN_SLOTS
    && trimEnd % HAND_COLS === 0
    && next[trimEnd - 1] === null
    && next[trimEnd - HAND_COLS] === null
    // Entire last row must be null.
    && next.slice(trimEnd - HAND_COLS, trimEnd).every((v) => v === null)
  ) {
    // Only trim if the previous row is not sparse-only (avoid oscillation):
    // it's always safe to trim a fully-empty last row down to HAND_MIN_SLOTS.
    trimEnd -= HAND_COLS;
  }
  return next.slice(0, Math.max(HAND_MIN_SLOTS, trimEnd));
}

/** Build a dense handOrder (cards packed at 0..N-1, rest null) sized to
 *  the next multiple-of-7 rows. Used as the initial seed. */
function denseHandOrder(hand: Card[]): (HandSlotKey | null)[] {
  const keys = buildHandKeys(hand);
  const total = roundUpSlots(keys.length);
  const out: (HandSlotKey | null)[] = new Array(total).fill(null);
  for (let i = 0; i < keys.length; i++) out[i] = keys[i];
  return out;
}

/** Build a sparse handOrder from a dense sorted hand, inserting a single null
 *  slot at every gap boundary detected by computeGapIndices. Expands the grid
 *  to fit if the total (cards + gaps) exceeds HAND_MIN_SLOTS. */
function buildSortedHandOrderWithGaps(hand: Card[]): (HandSlotKey | null)[] {
  const keys = buildHandKeys(hand);
  const gaps = computeGapIndices(hand);
  const out: (HandSlotKey | null)[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (gaps.has(i)) out.push(null); // separator gap BEFORE index i
    out.push(keys[i]);
  }
  // Pad to the next full row, min HAND_MIN_SLOTS.
  const total = roundUpSlots(out.length);
  while (out.length < total) out.push(null);
  return out;
}

/**
 * Find the meld element closest to a screen point that the dragged cards could fit in.
 * If `dragCards` and `melds` are provided, only considers melds where at least one card
 * passes the `couldFitInMeld` check. Otherwise falls back to pure proximity.
 */
function findNearestMeld(
  x: number,
  y: number,
  meldEls: Map<string, HTMLElement>,
  excludeMeldId?: string,
  dragCards?: Card[],
  melds?: Meld[],
): string | null {
  let nearest: string | null = null;
  let minDist = PROXIMITY_PX;

  for (const [id, el] of meldEls) {
    if (id === excludeMeldId) continue;

    // If we have card info, skip melds where the card can't fit
    if (dragCards && dragCards.length > 0 && melds) {
      const meld = melds.find(m => m.id === id);
      if (meld) {
        const anyFits = dragCards.some(c => couldFitInMeld(c, meld));
        if (!anyFits) continue;
      }
    }

    const rect = el.getBoundingClientRect();
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
      nearest = id;
    }
  }
  return nearest;
}

/** Check if a point is inside a rect (with optional padding). */
function isInsideRect(x: number, y: number, rect: DOMRect, pad = 0): boolean {
  return x >= rect.left - pad && x <= rect.right + pad &&
         y >= rect.top - pad && y <= rect.bottom + pad;
}

// ─── Dynamic meld sizing ────────────────────────────────────────────────────

/** Tile base dimensions before scale is applied. ~34x48 keeps the tile
 *  aspect close to a physical Rummikub tile (~2:3). */
const BASE_CARD_W = 34;
const BASE_CARD_H = 48;
/**
 * Fixed-tier meld-area sizing. We pick ONE of three preset tiers based on
 * the total tile count across all table melds — predictable sizes, no
 * adaptive binary search. Tier thresholds are tuned so tiles stay readable
 * without the layout ever needing a scrollbar at reasonable meld counts.
 *
 * Thresholds (total tiles):
 *   <= 20   → LARGE   tiles (38x54)
 *   21..50  → MEDIUM  tiles (28x40)
 *   >= 51   → SMALL   tiles (22x32)
 *
 * Lowered on 2026-04-23: the previous thresholds (35/70) kept the LARGE
 * tier around until the table was overflowing, which caused tiles at the
 * top of tall melds to get clipped (the "only the rank number shows at
 * top of the block" bug). Smaller tiles earlier = no clipping.
 *
 * Returned CSS custom properties mirror the names consumed by
 * IsraeliRummyGameTable.css: --meld-card-w/-h, --meld-card-font,
 * --meld-gap, --meld-inner-gap, --meld-padding.
 */
interface MeldTier {
  cardW: number;
  cardH: number;
  font: string;
  meldGap: number;
  innerGap: number;
  meldPadding: number;
}
const MELD_TIER_LARGE: MeldTier = {
  cardW: 38, cardH: 54, font: '0.78em',
  meldGap: 8, innerGap: 2, meldPadding: 4,
};
const MELD_TIER_MEDIUM: MeldTier = {
  cardW: 28, cardH: 40, font: '0.68em',
  meldGap: 5, innerGap: 1, meldPadding: 2,
};
const MELD_TIER_SMALL: MeldTier = {
  cardW: 22, cardH: 32, font: '0.58em',
  meldGap: 3, innerGap: 1, meldPadding: 1,
};

function pickMeldTier(totalTableTiles: number): MeldTier {
  if (totalTableTiles <= 20) return MELD_TIER_LARGE;
  if (totalTableTiles <= 50) return MELD_TIER_MEDIUM;
  return MELD_TIER_SMALL;
}

/** Numeric index so we can compare tiers: 0 = LARGE (biggest tiles),
 *  1 = MEDIUM, 2 = SMALL (smallest). Higher index = smaller tiles. */
function meldTierIdx(tier: MeldTier): number {
  if (tier === MELD_TIER_LARGE) return 0;
  if (tier === MELD_TIER_MEDIUM) return 1;
  return 2;
}

function meldTierStyle(tier: MeldTier): React.CSSProperties {
  return {
    '--meld-card-w': `${tier.cardW}px`,
    '--meld-card-h': `${tier.cardH}px`,
    '--meld-card-font': tier.font,
    '--meld-gap': `${tier.meldGap}px`,
    '--meld-inner-gap': `${tier.innerGap}px`,
    '--meld-padding': `${tier.meldPadding}px`,
  } as React.CSSProperties;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function IsraeliRummyGameTable({
  gameState, humanSeat, onDrawCard, onStartRearrange, onCommitMelds,
  onRevertRearrange, onPassTurn, onSortHand, onReorderHand, onNewGame, onEndGame, onBack,
}: IsraeliRummyGameTableProps) {
  const { t } = useTranslation();

  // --- Core state ---
  const [selectedHandIndices, setSelectedHandIndices] = useState<Set<number>>(new Set());
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [workingMelds, setWorkingMelds] = useState<Meld[]>([]);
  const [workingHand, setWorkingHand] = useState<Card[]>([]);
  // "New meld" builder — tiles being assembled inside the "+ New Set" slot
  // at the top of the melds area. Replaces the old Joker Workbench: freed
  // jokers (from replacement) and any tiles dropped onto the new-set slot
  // live here until the player rearranges them into a valid meld and
  // commits. The slot shows these tiles inline with a dashed frame.
  const [newMeldBuilder, setNewMeldBuilder] = useState<Card[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Sparse hand rack layout ---
  // (HandSlotKey | null)[] sized to the grid. Non-null entries hold the
  // occurrence-aware key for a specific hand tile; nulls are persistent visual
  // gaps. Gaps only exist in this display array — the reducer's `hand` stays
  // dense. Sync'd with `hand` via useEffect below.
  const [handOrder, setHandOrder] = useState<(HandSlotKey | null)[]>(() =>
    denseHandOrder(gameState.players[humanSeat].hand),
  );

  // --- DnD state ---
  const dragRef = useRef<DragInfo | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const meldElRefs = useRef(new Map<string, HTMLElement>());
  const meldsAreaRef = useRef<HTMLDivElement>(null);
  const handAreaRef = useRef<HTMLDivElement>(null);
  // Ref to the new-set builder frame (also serves as the drop target for
  // anything dropped into "build a new meld"). Replaces the old
  // workbenchAreaRef — there is now only one drop zone at the top of the
  // melds area, not a separate banner.
  const builderAreaRef = useRef<HTMLDivElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [dragCards, setDragCards] = useState<Card[]>([]);
  const [dragSourceHandIdxs, setDragSourceHandIdxs] = useState<Set<number>>(new Set());
  const [dragSourceMeld, setDragSourceMeld] = useState<{ meldId: string; cardIdx: number } | null>(null);
  const [dragSourceBuilderIdx, setDragSourceBuilderIdx] = useState<number | null>(null);
  const [dropTargetMeldId, setDropTargetMeldId] = useState<string | null>(null);
  const [dropOnBoard, setDropOnBoard] = useState(false);
  const [dropOnNewSlot, setDropOnNewSlot] = useState(false);
  // Index in the *remaining* (post-removal) hand array where the dragged tiles
  // would be inserted if released now. null means pointer is not over the hand area.
  const [handInsertionIdx, setHandInsertionIdx] = useState<number | null>(null);
  // Mirror the above in a ref so the document-level pointerup handler (which
  // captures state at subscription time) can read the latest value.
  const handInsertionIdxRef = useRef<number | null>(null);
  handInsertionIdxRef.current = handInsertionIdx;

  // Frozen sizing: captured when rearrange starts so subsequent drops don't
  // visually resize existing tiles. `frozenMeldTierIdx` records WHICH tier
  // was frozen (0=LARGE, 1=MEDIUM, 2=SMALL). During rearrange we only use
  // the frozen style if the LIVE tier is still the same or larger; if more
  // tiles get added and the live tier shrinks, we downgrade to the smaller
  // tier so new melds fit without clipping (fixes the "tile body clipped,
  // only rank shows at top" bug when content grows mid-rearrange).
  const [frozenMeldStyle, setFrozenMeldStyle] = useState<React.CSSProperties | null>(null);
  const [frozenMeldTierIdx, setFrozenMeldTierIdx] = useState<number | null>(null);
  // Alias for the builder area — the new-set slot IS the builder. Having a
  // second name keeps the drop-target discovery code readable.
  const newSlotRef = builderAreaRef;
  // Live height of the building frame — retained for any future layout
  // consumer; the tier-based sizing no longer reads it, but the state
  // updater is still wired up via ResizeObserver downstream.
  const [builderAreaHeight, setBuilderAreaHeight] = useState<number>(0);

  // Live measurement of the melds-area container height. Driven by a
  // ResizeObserver installed on meldsAreaRef so we recompute tile sizing
  // whenever the hand rack grows/shrinks, the viewport resizes, or the
  // top-bar changes height. Seeded with an estimate for first render.
  const [meldsAreaHeight, setMeldsAreaHeight] = useState<number>(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    return Math.max(120, vh - 460);
  });
  // Also track viewport width so horizontal resizes re-run packing.
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 800,
  );

  // Track pointer-is-down for document listeners
  const [pointerTracking, setPointerTracking] = useState(false);

  // --- Derived values ---
  const gs = gameState;
  const humanPlayer = gs.players[humanSeat];
  const isHumanTurn = gs.currentPlayer === humanSeat;
  const isPlaying = gs.phase === IsraeliRummyPhase.PLAYING;
  const canInteract = isHumanTurn && isPlaying;

  const opponents = useMemo(
    () => gs.players.filter((_, i) => i !== humanSeat),
    [gs.players, humanSeat],
  );
  const currentPlayerName = gs.players[gs.currentPlayer]?.name ?? '';

  const displayHand = isRearranging ? workingHand : humanPlayer.hand;
  const displayMelds = isRearranging ? workingMelds : gs.melds;
  const gapIndices = useMemo(() => computeGapIndices(displayHand), [displayHand]);

  // Occurrence-aware keys for the current displayHand (index-aligned). A tile
  // at hand index i has key handKeys[i]. Used to find the slot of a given
  // hand index in handOrder.
  const handKeys = useMemo(() => buildHandKeys(displayHand), [displayHand]);

  // Sync `handOrder` whenever the underlying hand changes (draw / commit /
  // reorder / sort). Preserves user-chosen gap positions across moves.
  useEffect(() => {
    setHandOrder((prev) => syncHandOrder(prev, displayHand));
  }, [displayHand]);

  // Dev-only invariant: non-null entries in handOrder must match hand size.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const filled = handOrder.filter((k) => k !== null).length;
    if (filled > displayHand.length) {
      // eslint-disable-next-line no-console
      console.warn(
        '[IsraeliRummy] handOrder has more tiles than hand — resync will compact.',
        { filled, handLen: displayHand.length },
      );
    }
  }, [handOrder, displayHand]);

  // Keep latest values in ref so document-level handlers can read them
  const latestRef = useRef({
    isRearranging, workingMelds, workingHand, displayHand, displayMelds,
    selectedHandIndices, canInteract, onReorderHand,
    newMeldBuilder, handOrder, handKeys,
  });
  latestRef.current = {
    isRearranging, workingMelds, workingHand, displayHand, displayMelds,
    selectedHandIndices, canInteract, onReorderHand,
    newMeldBuilder, handOrder, handKeys,
  };

  // --- Auto-dismiss error messages ---
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), ERROR_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // --- Safety net: if the tab is hidden/closed mid-rearrange, auto-revert
  // so the persisted state never has turnAction=REARRANGING with working
  // melds/hand that only exist in React local state. Without this, on reload
  // the reducer rejects DRAW_CARD/PASS_TURN and the player is stuck.
  useEffect(() => {
    const revertIfRearranging = () => {
      if (latestRef.current.isRearranging) {
        onRevertRearrange();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') revertIfRearranging();
    };
    window.addEventListener('beforeunload', revertIfRearranging);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', revertIfRearranging);
    return () => {
      window.removeEventListener('beforeunload', revertIfRearranging);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', revertIfRearranging);
    };
  }, [onRevertRearrange]);

  // --- ResizeObserver on the melds area AND the hand rack: re-run tile
  // sizing whenever either changes height. The hand rack growing from 2
  // rows to 3 rows (when player draws beyond 14 tiles) squeezes the melds
  // area; and the melds area growing/shrinking when content changes both
  // need to trigger a re-pack. Also watches the builder frame so we can
  // reserve its height from the sizing budget.
  useEffect(() => {
    const meldsEl = meldsAreaRef.current;
    const handEl = handAreaRef.current;
    const builderEl = builderAreaRef.current;
    if (meldsEl) setMeldsAreaHeight(meldsEl.clientHeight);
    if (builderEl) setBuilderAreaHeight(builderEl.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const h = Math.round(entry.contentRect.height);
        if (target === meldsEl) {
          if (h > 0) setMeldsAreaHeight((prev) => (Math.abs(prev - h) >= 2 ? h : prev));
        } else if (target === handEl) {
          // Hand rack changed height → re-seed melds area height (since
          // meldsAreaRef may not have been observed to shrink yet).
          if (meldsEl) {
            const mh = meldsEl.clientHeight;
            if (mh > 0) setMeldsAreaHeight((prev) => (Math.abs(prev - mh) >= 2 ? mh : prev));
          }
        } else if (target === builderEl) {
          if (h >= 0) setBuilderAreaHeight((prev) => (Math.abs(prev - h) >= 2 ? h : prev));
        }
      }
    });
    if (meldsEl) ro.observe(meldsEl);
    if (handEl) ro.observe(handEl);
    if (builderEl) ro.observe(builderEl);
    return () => ro.disconnect();
    // We intentionally re-subscribe when isRearranging flips because the
    // builder frame is conditionally rendered and gets a fresh DOM node.
  }, [isRearranging]);

  // Also listen for window resizes (width changes packing, and some browsers
  // don't fire RO reliably on width-only changes of a flex child).
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      const el = meldsAreaRef.current;
      if (el) {
        const h = el.clientHeight;
        if (h > 0) setMeldsAreaHeight(h);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- Selection helpers ---
  const clearSelection = useCallback(() => {
    setSelectedHandIndices(new Set());
    setErrorMsg(null);
  }, []);

  // --- Enter rearrange mode (idempotent) ---
  const ensureRearranging = useCallback(() => {
    if (latestRef.current.isRearranging) return;
    onStartRearrange();
    setIsRearranging(true);
    setWorkingMelds(gs.melds.map(m => ({ ...m, cards: [...m.cards] })));
    setWorkingHand([...humanPlayer.hand]);

    // Freeze meld-area tile sizing at the values in effect right now, so
    // subsequent drops/regroups don't visually resize existing tiles.
    // Read live CSS custom props from the DOM (they were set by the previous
    // render via getMeldAreaStyle).
    const el = meldsAreaRef.current;
    if (el) {
      const cs = getComputedStyle(el);
      const read = (name: string) => cs.getPropertyValue(name).trim();
      const frozen: React.CSSProperties = {
        '--meld-card-w': read('--meld-card-w') || `${BASE_CARD_W}px`,
        '--meld-card-h': read('--meld-card-h') || `${BASE_CARD_H}px`,
        '--meld-card-font': read('--meld-card-font') || '0.7em',
        '--meld-gap': read('--meld-gap') || '8px',
        '--meld-inner-gap': read('--meld-inner-gap') || '2px',
        '--meld-padding': read('--meld-padding') || '4px',
      } as React.CSSProperties;
      setFrozenMeldStyle(frozen);
      // Record which tier was frozen so the renderer can decide whether to
      // keep the frozen style or downgrade when content grows during rearrange.
      const totalTiles = gs.melds.reduce((n, m) => n + m.cards.length, 0);
      setFrozenMeldTierIdx(meldTierIdx(pickMeldTier(totalTiles)));
    }
  }, [onStartRearrange, gs.melds, humanPlayer.hand]);

  // --- Meld ref callback ---
  const setMeldRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) meldElRefs.current.set(id, el);
    else meldElRefs.current.delete(id);
  }, []);

  /**
   * Given a pointer (x,y), compute the target SLOT INDEX on the 2D grid
   * under (or nearest to) the pointer. The hand rack is a grid of at least
   * 14 slots; slots 0..N-1 hold the current cards, slots N..total-1 are
   * empty placeholders. Returns the slot index in [0, totalSlots-1].
   *
   * Caller is responsible for clamping the returned slot to the actual
   * insertion position within the remaining (post-source-removal) hand.
   */
  const computeHandInsertionIdx = useCallback((
    pointerX: number,
    pointerY: number,
  ): number => {
    const handArea = handAreaRef.current;
    if (!handArea) return 0;
    const slots = handArea.querySelectorAll<HTMLElement>('[data-hand-slot]');
    if (slots.length === 0) return 0;
    // First pass: pointer directly inside a slot's rect.
    for (const el of slots) {
      const rect = el.getBoundingClientRect();
      if (
        pointerX >= rect.left && pointerX <= rect.right
        && pointerY >= rect.top && pointerY <= rect.bottom
      ) {
        return Number(el.dataset.handSlot);
      }
    }
    // Fallback: nearest slot by center distance (e.g. pointer between rows).
    let bestIdx = 0;
    let bestDist = Infinity;
    slots.forEach(el => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = Number(el.dataset.handSlot);
      }
    });
    return bestIdx;
  }, []);

  // ─── DnD: Pointer Down ────────────────────────────────────────────────────

  const handleCardPointerDown = useCallback((
    e: React.PointerEvent,
    source: 'hand' | 'meld' | 'builder',
    handIdx?: number,
    meldId?: string,
    meldCardIdx?: number,
    builderIdx?: number,
  ) => {
    // Meld/builder card drag requires canInteract; hand drag is always allowed (for reorder)
    if ((source === 'meld' || source === 'builder') && !latestRef.current.canInteract) return;
    e.preventDefault();
    e.stopPropagation();

    const sel = latestRef.current.selectedHandIndices;
    const hand = latestRef.current.displayHand;
    const melds = latestRef.current.displayMelds;
    const builder = latestRef.current.newMeldBuilder;

    let cards: Card[];
    let handIndices: number[];

    if (source === 'hand') {
      if (sel.has(handIdx!)) {
        // Drag all selected cards
        handIndices = Array.from(sel).sort((a, b) => a - b);
        cards = handIndices.map(i => hand[i]);
      } else {
        handIndices = [handIdx!];
        cards = [hand[handIdx!]];
      }
    } else if (source === 'meld') {
      handIndices = [];
      const meld = melds.find(m => m.id === meldId);
      cards = meld ? [meld.cards[meldCardIdx!]] : [];
    } else {
      // builder (new-set builder)
      handIndices = [];
      cards = builderIdx !== undefined && builder[builderIdx]
        ? [builder[builderIdx]]
        : [];
    }

    dragRef.current = {
      source,
      handIndices,
      meldId,
      meldCardIdx,
      builderIdx,
      cards,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
    setPointerTracking(true);
  }, []);

  // ─── DnD: Document Pointer Move / Up ──────────────────────────────────────

  useEffect(() => {
    if (!pointerTracking) return;

    const handleMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.isDragging) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        // Start drag
        drag.isDragging = true;
        setDragActive(true);
        setDragCards(drag.cards);
        if (drag.source === 'hand') {
          setDragSourceHandIdxs(new Set(drag.handIndices));
        } else if (drag.source === 'meld') {
          setDragSourceMeld(drag.meldId && drag.meldCardIdx !== undefined
            ? { meldId: drag.meldId, cardIdx: drag.meldCardIdx }
            : null);
        } else {
          // builder (new-set builder)
          setDragSourceBuilderIdx(drag.builderIdx ?? null);
        }
      }

      // Move ghost
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${e.clientX - 25}px, ${e.clientY - 40}px)`;
      }

      // Detect if pointer is over the hand area (used both for insertion
      // indicator and to suppress meld-drop hints when reordering the rack).
      const st = latestRef.current;
      const handArea = handAreaRef.current;
      let overHand = false;
      if (drag.source === 'hand' && handArea) {
        const handRect = handArea.getBoundingClientRect();
        overHand = e.clientY >= handRect.top && e.clientY <= handRect.bottom
          && e.clientX >= handRect.left && e.clientX <= handRect.right;
      }

      if (overHand) {
        const slotIdx = computeHandInsertionIdx(e.clientX, e.clientY);
        setHandInsertionIdx(slotIdx);
        // Inside the hand area, hand-reorder has priority over meld-drop:
        // suppress all board/meld drop hints so the player sees a clean insertion bar.
        setDropTargetMeldId(null);
        setDropOnBoard(false);
        setDropOnNewSlot(false);
      } else {
        setHandInsertionIdx(null);
        // Detect drop target (only compatible melds)
        const currentMelds = st.isRearranging ? st.workingMelds : gs.melds;
        const nearest = findNearestMeld(e.clientX, e.clientY, meldElRefs.current, drag.meldId, drag.cards, currentMelds);

        // The new-set builder now absorbs ANY drops onto the "+ New Set" slot
        // (not just jokers). Check it FIRST so the builder highlights even
        // when a meld is nearby.
        const slot = newSlotRef.current;
        const overBuilder = slot
          ? isInsideRect(e.clientX, e.clientY, slot.getBoundingClientRect(), 8)
          : false;
        if (overBuilder && drag.source !== 'builder') {
          setDropOnNewSlot(true);
          setDropTargetMeldId(null);
          setDropOnBoard(false);
        } else {
          setDropOnNewSlot(false);
          setDropTargetMeldId(nearest);
          // Detect if over board area
          const boardArea = meldsAreaRef.current;
          if (boardArea) {
            const rect = boardArea.getBoundingClientRect();
            setDropOnBoard(isInsideRect(e.clientX, e.clientY, rect, 20));
          }
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      // Capture the insertion index computed during the last pointermove BEFORE
      // we clear state — we need it to decide between hand-reorder vs meld-drop.
      const pendingHandInsertIdx = handInsertionIdxRef.current;
      dragRef.current = null;
      setPointerTracking(false);
      setDragActive(false);
      setDragCards([]);
      setDragSourceHandIdxs(new Set());
      setDragSourceMeld(null);
      setDragSourceBuilderIdx(null);
      setDropTargetMeldId(null);
      setDropOnBoard(false);
      setDropOnNewSlot(false);
      setHandInsertionIdx(null);

      if (!drag) return;

      if (!drag.isDragging) {
        // Was a tap, not drag — only toggle selection during player's turn
        if (drag.source === 'hand' && latestRef.current.canInteract) {
          setSelectedHandIndices(prev => {
            const next = new Set(prev);
            const idx = drag.handIndices[0];
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
          });
          setErrorMsg(null);
        }
        return;
      }

      // --- Handle Drop ---
      const st2 = latestRef.current;
      const boardArea = meldsAreaRef.current;
      const handArea = handAreaRef.current;
      const currentMelds2 = st2.isRearranging ? st2.workingMelds : gs.melds;

      // Determine drop zone (only compatible melds)
      const nearestMeld = findNearestMeld(e.clientX, e.clientY, meldElRefs.current, drag.meldId, drag.cards, currentMelds2);
      const onBoard = boardArea ? isInsideRect(e.clientX, e.clientY, boardArea.getBoundingClientRect(), 20) : false;
      const onHand = handArea ? isInsideRect(e.clientX, e.clientY, handArea.getBoundingClientRect(), 20) : false;
      const newSlot = newSlotRef.current;
      const onNewSlot = newSlot ? isInsideRect(e.clientX, e.clientY, newSlot.getBoundingClientRect(), 8) : false;

      // Build working copies
      let melds = st2.isRearranging
        ? st2.workingMelds.map(m => ({ ...m, cards: [...m.cards] }))
        : gs.melds.map(m => ({ ...m, cards: [...m.cards] }));
      let hand = st2.isRearranging ? [...st2.workingHand] : [...humanPlayer.hand];
      let builder = [...st2.newMeldBuilder];

      if (drag.source === 'hand') {
        // --- Dragging from hand ---
        // Hand-reorder takes priority whenever the pointer is inside the hand
        // area (tracked via pendingHandInsertIdx, set in pointermove). This
        // prevents accidental meld drops when the user only wants to reorder
        // the rack. It also doesn't require canInteract — players may organize
        // their rack any time during play, even before committing a turn.
        if (pendingHandInsertIdx !== null || onHand) {
          // SPARSE DROP: gaps are allowed. The dragged tiles move into
          // consecutive target slots K..K+n-1. Their previous slots become
          // null. If the target range collides with occupants (non-source
          // tiles), swap those occupants into the vacated source slots, then
          // fall back to pushing overflow to the nearest null slot.
          let targetSlot = pendingHandInsertIdx;
          if (targetSlot === null) {
            targetSlot = computeHandInsertionIdx(e.clientX, e.clientY);
          }
          const prevOrder = st2.handOrder;
          const handKeysLocal = st2.handKeys;
          const dragKeys = drag.handIndices
            .map((i) => handKeysLocal[i])
            .filter((k): k is HandSlotKey => typeof k === 'string');
          if (dragKeys.length === 0) { clearSelection(); return; }

          // Source slot indices in handOrder for the dragged keys.
          const sourceSlots = dragKeys
            .map((k) => prevOrder.indexOf(k))
            .filter((s) => s >= 0)
            .sort((a, b) => a - b);
          const sourceSet = new Set(sourceSlots);

          // Work on a mutable copy. Grow by a full row if target would
          // overflow so gaps+drops never get silently clipped.
          const next: (HandSlotKey | null)[] = [...prevOrder];
          const ensureLen = (want: number) => {
            while (next.length < want) next.push(null);
            const rows = Math.ceil(next.length / HAND_COLS);
            while (next.length < rows * HAND_COLS) next.push(null);
          };
          ensureLen(Math.max(HAND_MIN_SLOTS, targetSlot + dragKeys.length));

          // Clamp target so the whole group fits.
          const startSlot = Math.max(
            0,
            Math.min(targetSlot, next.length - dragKeys.length),
          );

          // Step 1: null out the source slots so they're available for swaps.
          for (const s of sourceSlots) next[s] = null;

          // Step 2: displace any non-source occupants in the target range.
          // Prefer reusing vacated source slots (pure swap), else push to
          // the first null slot we can find.
          const freedSourceSlots = [...sourceSlots];
          for (let i = 0; i < dragKeys.length; i++) {
            const slot = startSlot + i;
            const occupant = next[slot];
            if (occupant !== null && !sourceSet.has(slot)) {
              next[slot] = null;
              // Place occupant in a freed source slot if available.
              const reuse = freedSourceSlots.shift();
              if (reuse !== undefined) {
                next[reuse] = occupant;
              } else {
                // Fallback: first null slot anywhere.
                let nullIdx = next.indexOf(null);
                if (nullIdx === -1) {
                  ensureLen(next.length + HAND_COLS);
                  nullIdx = next.indexOf(null);
                }
                next[nullIdx] = occupant;
              }
            }
          }

          // Step 3: place dragged keys at target range.
          for (let i = 0; i < dragKeys.length; i++) {
            next[startSlot + i] = dragKeys[i];
          }

          // Compact new handOrder → dense hand array for the reducer.
          const keyToCard = new Map<HandSlotKey, Card>();
          for (let i = 0; i < handKeysLocal.length; i++) {
            keyToCard.set(handKeysLocal[i], hand[i]);
          }
          const newHand: Card[] = [];
          for (const k of next) {
            if (k !== null) {
              const c = keyToCard.get(k);
              if (c) newHand.push(c);
            }
          }

          setHandOrder(next);
          if (st2.isRearranging) {
            setWorkingHand(newHand);
          } else {
            latestRef.current.onReorderHand(newHand);
          }
          clearSelection();
        } else if (onNewSlot && st2.canInteract) {
          // Drop on the "+ New Set" builder slot → append to the builder
          // buffer (no meld is committed until player finishes arranging).
          // This replaces BOTH the old workbench (joker-only holding) and
          // the old "new meld" creation — they're now the same drop zone.
          ensureRearranging();
          const indicesToRemove = new Set(drag.handIndices);
          hand = hand.filter((_, i) => !indicesToRemove.has(i));
          builder = [...builder, ...drag.cards];
          setIsRearranging(true);
          setWorkingHand(hand);
          setNewMeldBuilder(builder);
          clearSelection();
        } else if (nearestMeld && st2.canInteract) {
          // Drop near existing meld → add cards to it (only during turn).
          //
          // Joker replacement special case: if the player is dropping a single
          // non-joker tile from the hand onto a valid meld, and that tile would
          // legally replace a joker already in the meld, perform the swap:
          //   - insert the real card in the joker's slot
          //   - pop the joker off the meld into the new-set builder
          // This preserves card conservation and gives the player a second
          // chance to use the released joker before committing the turn.
          ensureRearranging();
          const indicesToRemove = new Set(drag.handIndices);

          const targetMeld = melds.find(m => m.id === nearestMeld);
          let didReplace = false;
          if (
            targetMeld
            && drag.cards.length === 1
            && !isJokerCard(drag.cards[0])
          ) {
            const jokerIdx = findJokerToReplace(targetMeld.cards, drag.cards[0]);
            if (jokerIdx !== null) {
              // Insert real card, pop joker out, push joker to the new-set
              // builder (user will place it elsewhere before committing).
              const replaced = targetMeld.cards.slice();
              const freedJoker = replaced[jokerIdx];
              replaced[jokerIdx] = drag.cards[0];
              const sortedReplaced = sortMeldCards(replaced);
              const { type } = isValidMeld(sortedReplaced);
              hand = hand.filter((_, i) => !indicesToRemove.has(i));
              melds = melds.map(m =>
                m.id === nearestMeld
                  ? { ...m, cards: sortedReplaced, type: type ?? m.type }
                  : m,
              );
              builder = [...builder, freedJoker];
              setIsRearranging(true);
              setWorkingMelds(melds);
              setWorkingHand(hand);
              setNewMeldBuilder(builder);
              clearSelection();
              didReplace = true;
            }
          }

          if (!didReplace) {
            hand = hand.filter((_, i) => !indicesToRemove.has(i));
            melds = melds.map(m => {
              if (m.id !== nearestMeld) return m;
              const newCards = sortMeldCards([...m.cards, ...drag.cards]);
              const { type } = isValidMeld(newCards);
              return { ...m, cards: newCards, type: type ?? m.type };
            });
            setIsRearranging(true);
            setWorkingMelds(melds);
            setWorkingHand(hand);
            clearSelection();
          }
        } else if (onBoard && st2.canInteract) {
          // Drop on empty board → create new meld (only during turn)
          ensureRearranging();
          const indicesToRemove = new Set(drag.handIndices);
          hand = hand.filter((_, i) => !indicesToRemove.has(i));
          const newMeld: Meld = {
            id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            cards: sortMeldCards(drag.cards),
            type: isValidMeld(drag.cards).type ?? 'set',
          };
          melds = [...melds, newMeld];
          setIsRearranging(true);
          setWorkingMelds(melds);
          setWorkingHand(hand);
          clearSelection();
        }
        // else: dropped somewhere not useful (e.g. over the turn indicator
        // strip) → cancel the drag. Hand-reorder + meld-drop are both already
        // handled above. Release gestures outside any valid target are treated
        // as a no-op rather than quietly mutating the hand.

      } else if (drag.source === 'meld' && drag.meldId !== undefined && drag.meldCardIdx !== undefined) {
        // --- Dragging from meld ---
        if (onNewSlot) {
          // Drop on the "+ New Set" builder slot → move the tile from the
          // meld into the builder buffer. Accepts ANY card (joker or real) —
          // the builder is now the general-purpose "new meld in progress"
          // zone, not a joker-only workbench.
          ensureRearranging();
          melds = melds.map(m => {
            if (m.id !== drag.meldId) return m;
            return { ...m, cards: m.cards.filter((_, i) => i !== drag.meldCardIdx) };
          }).filter(m => m.cards.length > 0);
          builder = [...builder, ...drag.cards];
          setIsRearranging(true);
          setWorkingMelds(melds);
          setWorkingHand(hand);
          setNewMeldBuilder(builder);
        } else if (nearestMeld) {
          // Drop near a different meld → move card there
          ensureRearranging();
          melds = melds.map(m => {
            if (m.id === drag.meldId) {
              return { ...m, cards: m.cards.filter((_, i) => i !== drag.meldCardIdx) };
            }
            if (m.id === nearestMeld) {
              const newCards = sortMeldCards([...m.cards, ...drag.cards]);
              const { type } = isValidMeld(newCards);
              return { ...m, cards: newCards, type: type ?? m.type };
            }
            return m;
          }).filter(m => m.cards.length > 0);
          setIsRearranging(true);
          setWorkingMelds(melds);
          setWorkingHand(hand);
        } else if (onBoard || onHand) {
          // Drop anywhere else → create new group on the board (table cards stay on table)
          ensureRearranging();
          melds = melds.map(m => {
            if (m.id !== drag.meldId) return m;
            return { ...m, cards: m.cards.filter((_, i) => i !== drag.meldCardIdx) };
          }).filter(m => m.cards.length > 0);
          const newMeld: Meld = {
            id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            cards: drag.cards,
            type: 'set',
          };
          melds = [...melds, newMeld];
          setIsRearranging(true);
          setWorkingMelds(melds);
          setWorkingHand(hand);
        }
      } else if (drag.source === 'builder' && drag.builderIdx !== undefined) {
        // --- Dragging from the new-set builder ---
        // Builder tiles can be moved: back to the hand, into an existing
        // meld, back into the builder (no-op), onto empty board (creates a
        // standalone meld if valid). Whatever the destination, the tile is
        // removed from the builder buffer first.
        const bIdx = drag.builderIdx;
        const tile = builder[bIdx];
        if (!tile) return;

        if (onNewSlot) {
          // Dropped back on the builder → no-op, tile stays where it was.
          return;
        }

        // Remove the tile from the builder buffer.
        const nextBuilder = builder.filter((_, i) => i !== bIdx);

        if (onHand) {
          // Return to hand — insert near pointer position for predictability.
          let insertIdx = hand.length;
          if (handArea) {
            const handCards = handArea.querySelectorAll('[data-hand-idx]');
            for (const el of handCards) {
              const idx = Number((el as HTMLElement).dataset.handIdx);
              const rect = el.getBoundingClientRect();
              const midX = rect.left + rect.width / 2;
              if (e.clientX < midX) { insertIdx = idx; break; }
            }
          }
          hand = [...hand.slice(0, insertIdx), tile, ...hand.slice(insertIdx)];
          setWorkingHand(hand);
          setNewMeldBuilder(nextBuilder);
        } else if (nearestMeld) {
          melds = melds.map(m => {
            if (m.id !== nearestMeld) return m;
            const newCards = sortMeldCards([...m.cards, tile]);
            const { type } = isValidMeld(newCards);
            return { ...m, cards: newCards, type: type ?? m.type };
          });
          setWorkingMelds(melds);
          setNewMeldBuilder(nextBuilder);
        } else if (onBoard) {
          // Drop on empty board → create a fresh meld with just this tile.
          const newMeld: Meld = {
            id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            cards: [tile],
            type: 'set',
          };
          melds = [...melds, newMeld];
          setWorkingMelds(melds);
          setNewMeldBuilder(nextBuilder);
        }
        // else: dropped into dead space — cancel (tile stays in builder).
      }
    };

    document.addEventListener('pointermove', handleMove, { passive: false });
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointerTracking]);

  // ─── Place Meld (tap-based fallback: select 3+ cards then tap button) ─────

  const handlePlaceMeld = useCallback(() => {
    if (selectedHandIndices.size < 3) return;
    const cards = Array.from(selectedHandIndices).sort((a, b) => a - b).map(i => displayHand[i]);
    const { valid, type } = isValidMeld(cards);
    if (!valid) { setErrorMsg(t('israeliRummy.invalidMeld')); return; }

    ensureRearranging();
    const melds = (latestRef.current.isRearranging ? workingMelds : gs.melds)
      .map(m => ({ ...m, cards: [...m.cards] }));
    const hand = (latestRef.current.isRearranging ? [...workingHand] : [...humanPlayer.hand])
      .filter((_, i) => !selectedHandIndices.has(i));

    const newMeld: Meld = {
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      cards: sortMeldCards(cards),
      type: type ?? 'set',
    };

    setIsRearranging(true);
    setWorkingMelds([...melds, newMeld]);
    setWorkingHand(hand);
    clearSelection();
  }, [selectedHandIndices, displayHand, ensureRearranging, workingMelds, workingHand, gs.melds, humanPlayer.hand, clearSelection, t]);

  // ─── Commit (Done) ────────────────────────────────────────────────────────

  const handleCommit = useCallback(() => {
    // New-set builder handling. If the builder holds tiles, require a valid
    // meld (3+ tiles, passes isValidMeld) — then fold them into workingMelds
    // as a fresh meld. If invalid or < 3 tiles, block commit with a hint so
    // the player puts them back somewhere before finishing.
    //
    // Validate the SORTED builder — `isValidMeld` for runs is positional
    // (cards[i] must equal base + i) but the builder array is in the order
    // tiles were dropped. Sorting via sortMeldCards arranges them
    // positionally so [11, 13, joker] becomes [11, joker, 13] and validates.
    let meldsToCommit = workingMelds;
    if (newMeldBuilder.length > 0) {
      const sortedBuilder = sortMeldCards(newMeldBuilder);
      const builderCheck = isValidMeld(sortedBuilder);
      if (sortedBuilder.length < 3 || !builderCheck.valid) {
        setErrorMsg(t('israeliRummy.builderBlocksCommit'));
        return;
      }
      const builderMeld: Meld = {
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        cards: sortedBuilder,
        type: builderCheck.type ?? 'set',
      };
      meldsToCommit = [...workingMelds, builderMeld];
    }

    for (const meld of meldsToCommit) {
      if (!isValidMeld(meld.cards).valid) {
        setErrorMsg(t('israeliRummy.invalidCommit'));
        return;
      }
    }

    const originalHandSize = gs.boardSnapshot?.hand.length ?? humanPlayer.hand.length;
    if (workingHand.length >= originalHandSize) {
      setErrorMsg(t('israeliRummy.mustPlaceCard'));
      return;
    }

    const player = gs.players[gs.currentPlayer];
    if (!player.hasMetFirstMeld && gs.boardSnapshot) {
      // First meld rule: every existing table meld must be unchanged
      // (same multiset of cards). Length alone is not enough — a player
      // could swap a tile for one of equal value, which is still a
      // rearrangement.
      for (const snapMeld of gs.boardSnapshot.melds) {
        const proposed = meldsToCommit.find(m => m.id === snapMeld.id);
        if (!proposed || proposed.cards.length !== snapMeld.cards.length) {
          setErrorMsg(t('israeliRummy.firstMeldNoRearrange'));
          return;
        }
        const counts = new Map<string, number>();
        for (const c of snapMeld.cards) {
          const k = cardKey(c);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        for (const c of proposed.cards) {
          const k = cardKey(c);
          counts.set(k, (counts.get(k) ?? 0) - 1);
        }
        for (const v of counts.values()) {
          if (v !== 0) {
            setErrorMsg(t('israeliRummy.firstMeldNoRearrange'));
            return;
          }
        }
      }

      // Identify NEW melds by ID. We can't classify by card value because
      // Israeli Rummy uses two decks — a tile placed from hand can share
      // its (suit, rank) with a tile in an existing table meld
      // (e.g. existing [5♥,5♣,5♠] + new run [3♥,4♥,5♥]). The previous
      // value-based classifier misidentified the unchanged existing meld
      // as "new" and then failed the all-from-hand check.
      //
      // Once snapshot melds are preserved (above) and total cards are
      // conserved (the reducer enforces this), any meld whose ID is not
      // in the snapshot is, by construction, made entirely of hand tiles —
      // so a separate "all from hand" check is redundant.
      const snapshotMeldIds = new Set(gs.boardSnapshot.melds.map(m => m.id));
      const newMeldCards: Card[][] = meldsToCommit
        .filter(m => !snapshotMeldIds.has(m.id))
        .map(m => m.cards);

      if (!meetsFirstMeldRequirement(newMeldCards, gs.firstMeldThreshold)) {
        setErrorMsg(t('israeliRummy.firstMeldFail', { n: String(gs.firstMeldThreshold) }));
        return;
      }
    }

    if (gs.boardSnapshot) {
      const origCounts = new Map<string, number>();
      for (const m of gs.boardSnapshot.melds) {
        for (const c of m.cards) {
          const k = `${c.suit}_${c.rank}`;
          origCounts.set(k, (origCounts.get(k) ?? 0) + 1);
        }
      }
      const newCounts = new Map<string, number>();
      for (const m of meldsToCommit) {
        for (const c of m.cards) {
          const k = `${c.suit}_${c.rank}`;
          newCounts.set(k, (newCounts.get(k) ?? 0) + 1);
        }
      }
      for (const [k, count] of origCounts) {
        if ((newCounts.get(k) ?? 0) < count) {
          setErrorMsg(t('israeliRummy.invalidCommit'));
          return;
        }
      }
    }

    onCommitMelds(meldsToCommit, workingHand);
    setIsRearranging(false);
    setFrozenMeldStyle(null);
    setFrozenMeldTierIdx(null);
    setNewMeldBuilder([]);
    clearSelection();
  }, [workingMelds, workingHand, newMeldBuilder, gs, humanPlayer.hand, onCommitMelds, clearSelection, t]);

  // ─── Revert (Cancel) ─────────────────────────────────────────────────────

  const handleRevert = useCallback(() => {
    onRevertRearrange();
    setIsRearranging(false);
    setFrozenMeldStyle(null);
    setFrozenMeldTierIdx(null);
    // The builder is an ephemeral rearrange-scoped buffer — reverting the
    // rearrange restores the original melds, so any tiles sitting in the
    // builder go back with them implicitly. Just clear the local buffer.
    setNewMeldBuilder([]);
    clearSelection();
  }, [onRevertRearrange, clearSelection]);

  // ─── Draw Card ────────────────────────────────────────────────────────────

  const handleDraw = useCallback(() => {
    if (isRearranging) return;
    clearSelection();
    onDrawCard();
  }, [isRearranging, onDrawCard, clearSelection]);

  const handlePassTurn = useCallback(() => {
    if (isRearranging) return;
    clearSelection();
    onPassTurn();
  }, [isRearranging, onPassTurn, clearSelection]);

  // ─── Sort with separator gaps ─────────────────────────────────────────────
  //
  // Auto-sort (Sort Suit / Sort 123) dispatches through the reducer to get a
  // new dense hand order. We mirror the same pure sort locally to compute the
  // target dense hand, then translate it to a sparse handOrder with a single
  // null slot between detected groups (runs/sets ≥3). The dense hand itself
  // stays gap-free — gaps are purely visual and live in handOrder only.
  const handleSortHand = useCallback((mode: 'suit' | 'sequence') => {
    onSortHand(mode);
    clearSelection();
    // Compute the same sorted-dense hand the reducer will produce, then build
    // a sparse handOrder with a null between each detected group.
    if (latestRef.current.isRearranging) {
      // During rearrange the reducer doesn't sort workingHand — leave as-is.
      return;
    }
    const sorted = mode === 'suit'
      ? sortBySuit(displayHand)
      : sortBySequence(displayHand);
    setHandOrder(buildSortedHandOrderWithGaps(sorted));
  }, [onSortHand, clearSelection, displayHand]);

  // ─── Render: Opponents ────────────────────────────────────────────────────

  const getOpponentPos = (idx: number, total: number): 'top' | 'left' | 'right' => {
    if (total === 1) return 'top';
    if (total === 2) return idx === 0 ? 'left' : 'right';
    return idx === 0 ? 'left' : idx === 1 ? 'top' : 'right';
  };

  const renderOpponents = () => (
    <>
      {opponents.map((p, idx) => {
        const pos = getOpponentPos(idx, opponents.length);
        const active = gs.currentPlayer === p.seat;
        return (
          <div
            key={p.seat}
            className={[
              'irummy-opponent-chip',
              `irummy-opponent-${pos}`,
              active ? 'irummy-opponent-active' : '',
            ].join(' ')}
          >
            <span className="irummy-opponent-name">{p.name}</span>
            <span className="irummy-opponent-count">
              <span className="irummy-opponent-count-num">{p.hand.length}</span>
              <span className="irummy-opponent-count-label">{t('israeliRummy.blocksShort')}</span>
            </span>
            <span className={`irummy-opponent-first-meld ${p.hasMetFirstMeld ? 'irummy-opponent-first-meld-met' : ''}`}>
              {p.hasMetFirstMeld ? '\u2713' : `${gs.firstMeldThreshold}+`}
            </span>
          </div>
        );
      })}
    </>
  );

  // ─── Render: Draw Pile ────────────────────────────────────────────────────

  const renderDrawPile = () => {
    const canDraw = canInteract && !isRearranging && gs.drawPile.length > 0;
    const canPass = canInteract && !isRearranging && gs.drawPile.length === 0;
    return (
      <div className="irummy-center">
        <div className="irummy-pile-area">
          <div
            className={`irummy-pile ${canDraw ? 'irummy-pile-clickable irummy-pile-highlight' : ''}`}
            onClick={canDraw ? handleDraw : undefined}
          >
            {gs.drawPile.length > 0 ? (
              <>
                <div className="irummy-pile-card">
                  <CardComponent card={gs.drawPile[0]} faceDown />
                </div>
                <span className="irummy-pile-count">{gs.drawPile.length}</span>
              </>
            ) : (
              <div className="irummy-empty-pile">{t('israeliRummy.deckEmpty')}</div>
            )}
          </div>
          {canDraw && <div className="irummy-pile-label">{t('israeliRummy.draw')}</div>}
          {canPass && (
            <button
              className="irummy-btn irummy-btn-primary irummy-pass-btn"
              onClick={handlePassTurn}
              title={t('israeliRummy.passHint')}
            >
              {t('israeliRummy.passTurn')}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── Render: Melds ────────────────────────────────────────────────────────

  const renderMeldGroup = (meld: Meld) => {
    const meldValid = isValidMeld(meld.cards).valid;
    const isDropTarget = dropTargetMeldId === meld.id;
    const sortedCards = sortMeldCards(meld.cards);
    const meldTypeClass = meldValid
      ? (meld.type === 'run' ? 'irummy-meld-type-run' : 'irummy-meld-type-set')
      : '';
    return (
      <div
        key={meld.id}
        ref={el => setMeldRef(meld.id, el)}
        className={[
          'irummy-meld',
          meldTypeClass,
          isDropTarget ? 'irummy-meld-drop-target' : '',
          !meldValid ? 'irummy-meld-invalid' : '',
        ].join(' ')}
      >
        {sortedCards.map((card, sortedIdx) => {
          const origIdx = meld.cards.indexOf(card);
          const isDragSource = dragSourceMeld?.meldId === meld.id && dragSourceMeld?.cardIdx === origIdx;
          return (
            <div
              key={`${cardKey(card)}_${sortedIdx}`}
              className={[
                'irummy-meld-card',
                canInteract ? 'irummy-meld-card-draggable' : '',
                isDragSource ? 'irummy-drag-source' : '',
              ].join(' ')}
              onPointerDown={canInteract ? (e) => handleCardPointerDown(e, 'meld', undefined, meld.id, origIdx) : undefined}
            >
              <CardComponent card={card} />
            </div>
          );
        })}
      </div>
    );
  };

  const renderMelds = () => {
    const showDropZone = dragActive;

    // Fixed-tier sizing based on total tile count. No adaptive search —
    // three preset sizes give predictable, jitter-free tile dimensions. When
    // rearranging we FREEZE the sizing captured at rearrange start so
    // dragging tiles around doesn't resize anything mid-drag.
    const totalTableTiles = displayMelds.reduce((n, m) => n + m.cards.length, 0);
    const liveTier = pickMeldTier(totalTableTiles);
    const tierStyle = meldTierStyle(liveTier);
    // During rearrange, KEEP the frozen tier even if the live tier wants
    // smaller tiles. Player feedback (2026-05-02): "I drop a block and the
    // whole board moves and I have to find my set again." A mid-rearrange
    // tier downgrade reflows every meld simultaneously which is exactly what
    // the player wanted us to stop doing. After commit/revert the freeze
    // clears and the tier recalculates from scratch — the board does adjust
    // between turns, just not while the player is mid-interaction. The
    // overflow-protection rationale that drove the old downgrade behavior
    // still applies between turns; within a single rearrange the player can
    // see overflow and stop adding tiles.
    let meldAreaStyle: React.CSSProperties = tierStyle;
    if (frozenMeldStyle !== null) {
      meldAreaStyle = frozenMeldStyle;
    }
    // frozenMeldTierIdx is retained for potential future use (e.g. clamping
    // very large additions) but no longer drives the tier choice.
    void frozenMeldTierIdx;

    // Retained state access so ResizeObserver triggered re-renders still
    // flow through here. The tier itself no longer depends on these values,
    // but consumers (CSS media queries, other layout code) may still benefit
    // from the re-render cadence.
    void viewportWidth;
    void meldsAreaHeight;
    void builderAreaHeight;

    // Builder state. The "+ New Set" / "Building..." frame renders inline
    // inside the unified melds grid as the FIRST item with `order: -1`
    // styling — that way toggling its visibility doesn't reflow existing
    // melds, and melds flipping valid↔invalid don't jump between sections.
    //
    // Suppress during a pure hand-reorder gesture: when the user is dragging
    // hand tiles and the pointer is still over the hand area, they intend to
    // rearrange their own rack, not to create a new meld. Toggling the
    // builder frame during that gesture reflows the whole meld grid — the
    // "table seems to change when I move tiles in my hand" bug.
    const isHandReorderInProgress =
      dragActive
      && dragSourceHandIdxs.size > 0
      && handInsertionIdx !== null
      && !isRearranging;
    const showNewSlot =
      canInteract && (isRearranging || (dragActive && !isHandReorderInProgress));
    const builderCards = newMeldBuilder;
    // Sorted view of the builder. Used both for the visual valid/invalid
    // class AND for rendering — the underlying `newMeldBuilder` stays in
    // insertion order so `dragSourceBuilderIdx` (computed from the raw
    // index) keeps pointing at the right tile during drag.
    const sortedBuilderCards = sortMeldCards(builderCards);
    const builderValid = sortedBuilderCards.length >= 3 && isValidMeld(sortedBuilderCards).valid;

    return (
      <div
        ref={meldsAreaRef}
        className={[
          'irummy-melds-area',
          'irummy-melds-layout-rows',
          // Anchor melds to the row start during rearrange/drag so growing
          // a meld by one tile doesn't re-center the whole row. Outside
          // rearrange the centered layout still gives a balanced look.
          (isRearranging || dragActive) ? 'irummy-melds-stable-rows' : '',
          showDropZone ? 'irummy-melds-droppable' : '',
          dragActive && dropOnBoard && !dropTargetMeldId && !dropOnNewSlot ? 'irummy-melds-new-target' : '',
        ].join(' ')}
        style={meldAreaStyle}
      >
        {displayMelds.length === 0 && !dragActive && !showNewSlot && (
          <div className="irummy-melds-empty">
            {canInteract ? t('israeliRummy.dragHint') : ''}
          </div>
        )}
        {displayMelds.length === 0 && dragActive && !showNewSlot && (
          <div className="irummy-melds-drop-hint">{t('israeliRummy.dropHere')}</div>
        )}

        {/* Unified melds grid. ALL melds render here in their stable array
            order (workingMelds order is preserved by the drop handlers).
            Invalid / in-progress groups are visually distinguished via the
            `irummy-meld-invalid` class applied by renderMeldGroup — they do
            NOT jump to a separate section when a drag flips validity. The
            builder slot is the first grid child with `order: -1` so
            toggling its visibility doesn't shift melds below. */}
        <div className="irummy-melds-grid">
          {showNewSlot && (
            <div
              ref={newSlotRef}
              className={[
                'irummy-melds-new-slot',
                'irummy-melds-new-slot-inline',
                dropOnNewSlot ? 'irummy-melds-new-slot-drop-target' : '',
                builderCards.length === 0 ? 'irummy-melds-new-slot-empty' : '',
                builderValid ? 'irummy-melds-new-slot-valid' : '',
                !builderValid && builderCards.length > 0 ? 'irummy-melds-new-slot-invalid' : '',
              ].filter(Boolean).join(' ')}
              style={{ order: -1 }}
              aria-label={t('israeliRummy.newMeldSlot')}
            >
              <div className="irummy-melds-new-slot-label">
                {builderCards.length === 0
                  ? t('israeliRummy.newMeldSlot')
                  : t('israeliRummy.workingArea')}
              </div>
              <div className="irummy-melds-new-slot-tiles">
                {builderCards.length === 0 ? (
                  <>
                    <span className="irummy-new-slot-plus" aria-hidden="true">{'\u002B'}</span>
                  </>
                ) : (
                  (() => {
                    // Pre-compute a stable mapping from sorted index back to
                    // the original index in `newMeldBuilder`. With a double
                    // deck two identical cards may exist; naive `indexOf`
                    // would return the first occurrence twice. Walk both
                    // arrays once and match by reference identity, falling
                    // back to a per-key occurrence counter so duplicates
                    // resolve to distinct origIdx values.
                    const usedRaw = new Set<number>();
                    return sortedBuilderCards.map((card, sortedIdx) => {
                      let origIdx = builderCards.indexOf(card);
                      if (origIdx === -1 || usedRaw.has(origIdx)) {
                        origIdx = -1;
                        for (let i = 0; i < builderCards.length; i++) {
                          if (usedRaw.has(i)) continue;
                          const c = builderCards[i];
                          if (cardKey(c) === cardKey(card)) { origIdx = i; break; }
                        }
                      }
                      if (origIdx >= 0) usedRaw.add(origIdx);
                      const isDragSource = dragSourceBuilderIdx === origIdx;
                    return (
                      <div
                        key={`builder_${cardKey(card)}_${sortedIdx}`}
                        className={[
                          'irummy-melds-new-slot-tile',
                          canInteract ? 'irummy-meld-card-draggable' : '',
                          isDragSource ? 'irummy-drag-source' : '',
                        ].join(' ')}
                        onPointerDown={canInteract
                          ? (e) => handleCardPointerDown(e, 'builder', undefined, undefined, undefined, origIdx)
                          : undefined}
                      >
                        <CardComponent card={card} />
                      </div>
                    );
                    });
                  })()
                )}
              </div>
            </div>
          )}
          {displayMelds.map(meld => renderMeldGroup(meld))}
        </div>
      </div>
    );
  };

  // ─── Render: Player Area ──────────────────────────────────────────────────

  // First-meld progress: sum of point values from newly-placed cards on the table.
  const firstMeldProgress = useMemo(() => {
    if (!isRearranging || humanPlayer.hasMetFirstMeld || !gs.boardSnapshot) return null;
    // Count which cards on the working table are new (not in snapshot).
    const snapshotCounts = new Map<string, number>();
    for (const m of gs.boardSnapshot.melds) {
      for (const c of m.cards) {
        const k = cardKey(c);
        snapshotCounts.set(k, (snapshotCounts.get(k) ?? 0) + 1);
      }
    }
    // Determine melds containing any new card; sum their point value.
    let total = 0;
    for (const meld of workingMelds) {
      const newInMeld = meld.cards.some(c => {
        const k = cardKey(c);
        const left = snapshotCounts.get(k) ?? 0;
        if (left > 0) { snapshotCounts.set(k, left - 1); return false; }
        return true;
      });
      if (newInMeld && isValidMeld(meld.cards).valid) {
        total += meldPointValue(meld.cards);
      }
    }
    // Also count the new-set builder — tiles sitting in it are about to be
    // folded into a fresh meld on commit and must contribute to first-meld
    // progress. Validate against the sorted builder (runs are positional).
    if (newMeldBuilder.length >= 3) {
      const sortedBuilder = sortMeldCards(newMeldBuilder);
      if (isValidMeld(sortedBuilder).valid) {
        total += meldPointValue(sortedBuilder);
      }
    }
    return total;
  }, [isRearranging, workingMelds, newMeldBuilder, gs.boardSnapshot, humanPlayer.hasMetFirstMeld]);

  // NOTE: renderWorkbench was removed. Freed jokers now land in the
  // new-set builder rendered inside renderMelds (the "+ New Set" frame
  // above the meld grid). This eliminates the separate banner that used
  // to hide melds behind it.

  const renderPlayerArea = () => {
    const showPlaceMeld = canInteract && selectedHandIndices.size >= 3;
    const showDoneCancel = isRearranging;

    return (
      <div className="irummy-player-area">
        {isPlaying && !isRearranging && (
          <div className={`irummy-first-meld-indicator ${humanPlayer.hasMetFirstMeld ? 'irummy-first-meld-met' : ''}`}>
            {humanPlayer.hasMetFirstMeld
              ? t('israeliRummy.firstMeldMet')
              : t('israeliRummy.firstMeld', { n: String(gs.firstMeldThreshold) })
            }
          </div>
        )}

        {isPlaying && (
          <div className="irummy-sort-buttons">
            <button
              className="irummy-btn irummy-btn-small"
              onClick={() => handleSortHand('suit')}
              disabled={isRearranging && false /* sorting hand is ok during rearrange */}
              title={t('israeliRummy.sortBySuit')}
            >
              {t('israeliRummy.sortBySuit')}
            </button>
            <button
              className="irummy-btn irummy-btn-small"
              onClick={() => handleSortHand('sequence')}
              title={t('israeliRummy.sortBySeq')}
            >
              {t('israeliRummy.sortBySeq')}
            </button>
          </div>
        )}

        {canInteract && showPlaceMeld && !showDoneCancel && (
          <div className="irummy-actions">
            <button className="irummy-btn irummy-btn-primary" onClick={handlePlaceMeld}>
              {t('israeliRummy.placeMeld')} ({selectedHandIndices.size})
            </button>
          </div>
        )}

        {errorMsg && <div className="irummy-error-msg">{errorMsg}</div>}

        <div ref={handAreaRef} className="irummy-hand-row">
          {(() => {
            // SPARSE 2D grid. Iterate `handOrder`: each entry is either a
            // HandSlotKey (look up the card/hand index by key) or null (a
            // persistent visual gap — either user-chosen or a sort
            // separator). Gaps are cosmetic; they never participate in the
            // reducer's dense hand array.
            const keyToHandIdx = new Map<HandSlotKey, number>();
            for (let i = 0; i < handKeys.length; i++) keyToHandIdx.set(handKeys[i], i);

            const totalSlots = Math.max(HAND_MIN_SLOTS, handOrder.length);
            const dragCount = dragCards.length || 1;

            // The glow spans `dragCount` consecutive slots starting at the
            // target slot. Clamp the start so the group fits within the grid.
            const glowStart = (dragActive && handInsertionIdx !== null)
              ? Math.max(0, Math.min(handInsertionIdx, totalSlots - dragCount))
              : -1;
            const glowEnd = glowStart >= 0 ? glowStart + dragCount - 1 : -1;

            const nodes: React.ReactNode[] = [];
            for (let slot = 0; slot < totalSlots; slot++) {
              const inGlow = glowStart >= 0 && slot >= glowStart && slot <= glowEnd;
              const key = slot < handOrder.length ? handOrder[slot] : null;
              const handIdx = key !== null ? (keyToHandIdx.get(key) ?? -1) : -1;
              if (key !== null && handIdx >= 0) {
                const card = displayHand[handIdx];
                const isDragSource = dragActive && dragSourceHandIdxs.has(handIdx);
                const isSelected = selectedHandIndices.has(handIdx);
                // Legacy "group boundary" ring, still useful when the user
                // manually drags tiles together without re-sorting. With a
                // fresh sort-with-gaps, boundaries usually fall on null slots
                // so this rarely activates post-sort.
                const hasGap = gapIndices.has(handIdx);
                nodes.push(
                  <div
                    key={`slot-${slot}-${key}`}
                    data-hand-slot={slot}
                    data-hand-idx={handIdx}
                    className={[
                      'irummy-hand-slot',
                      'irummy-hand-card',
                      isSelected ? 'irummy-card-selected' : '',
                      canInteract ? 'irummy-card-playable' : '',
                      isPlaying ? 'irummy-hand-draggable' : '',
                      hasGap ? 'irummy-hand-gap' : '',
                      isDragSource ? 'irummy-drag-source' : '',
                      inGlow ? 'irummy-hand-slot-glow' : '',
                    ].filter(Boolean).join(' ')}
                    onPointerDown={isPlaying ? (e) => handleCardPointerDown(e, 'hand', handIdx) : undefined}
                  >
                    <CardComponent card={card} />
                  </div>
                );
              } else {
                nodes.push(
                  <div
                    key={`empty-${slot}`}
                    data-hand-slot={slot}
                    className={[
                      'irummy-hand-slot',
                      'irummy-hand-empty-slot',
                      inGlow ? 'irummy-hand-slot-glow' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={t('israeliRummy.emptySlot')}
                    aria-hidden={!inGlow}
                  />
                );
              }
            }
            return nodes;
          })()}
        </div>
      </div>
    );
  };

  // ─── Render: Round End ────────────────────────────────────────────────────

  const renderRoundEnd = () => {
    if (gs.phase !== IsraeliRummyPhase.ROUND_END || gs.winner === null) return null;
    const winner = gs.players[gs.winner];
    const isHumanWinner = gs.winner === humanSeat;
    // Deadlock vs standard win: nobody emptied their hand → winner chosen
    // by lowest point total. Show the point count + explanatory subtitle
    // so the ending doesn't look like a bug.
    const isDeadlock = winner.hand.length > 0;
    const winnerPoints = isDeadlock
      ? winner.hand.reduce((n, c) => n + cardPointValue(c), 0)
      : 0;
    return (
      <div className="irummy-round-end">
        <div className="irummy-round-end-card">
          <div className="irummy-round-end-emoji">{isHumanWinner ? '\u{1F3C6}' : '\u{1F614}'}</div>
          <h2 className="irummy-round-end-title">
            {isDeadlock
              ? t('israeliRummy.deadlockWinner', { name: winner.name, points: String(winnerPoints) })
              : t('israeliRummy.winner', { name: winner.name })}
          </h2>
          <p className="irummy-round-end-subtitle">
            {isDeadlock
              ? t('israeliRummy.deadlockSubtitle')
              : t('israeliRummy.moves', { n: String(gs.moveCount) })}
          </p>
          <div className="irummy-round-end-buttons">
            <button className="irummy-btn irummy-btn-primary" onClick={onNewGame}>{t('israeliRummy.playAgain')}</button>
            <button className="irummy-btn" onClick={onBack}>{t('common.backToMenu')}</button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render: Drag Ghost ───────────────────────────────────────────────────

  const renderDragGhost = () => {
    if (!dragActive || dragCards.length === 0) return null;
    return (
      <div
        ref={ghostRef}
        className="irummy-drag-ghost"
        style={{ transform: 'translate(-9999px, -9999px)' }}
      >
        {dragCards.map((card, i) => (
          <div key={i} className="irummy-ghost-card" style={{ marginLeft: i > 0 ? -30 : 0 }}>
            <CardComponent card={card} />
          </div>
        ))}
      </div>
    );
  };

  // ─── Main Render ──────────────────────────────────────────────────────────

  const turnText = isRearranging
    ? t('israeliRummy.rearranging')
    : isHumanTurn
      ? (selectedHandIndices.size > 0 ? t('israeliRummy.selectCards') : t('israeliRummy.yourTurn'))
      : t('israeliRummy.waitingTurn', { name: currentPlayerName });

  return (
    <div className={`irummy-table ${isRearranging ? 'irummy-rearranging' : ''}`}>
      <div className="irummy-top-bar">
        <button className="irummy-btn" onClick={onBack}>{'\u2190'} {t('common.backToMenu')}</button>
        <div className="irummy-top-bar-center">{t('israeliRummy.moves', { n: String(gs.moveCount) })}</div>
      </div>

      {renderOpponents()}

      {isPlaying && (
        <div className={`irummy-turn-indicator ${isHumanTurn ? 'irummy-turn-yours' : ''}`}>
          {turnText}
        </div>
      )}

      {renderDrawPile()}
      {renderMelds()}
      {renderPlayerArea()}

      {isPlaying && !isRearranging && (
        <button
          className="irummy-btn irummy-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleConfirm')}
        >{'\u21BB'}</button>
      )}
      {showReshuffleConfirm && (
        <div className="irummy-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="irummy-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="irummy-confirm-text">{t('common.reshuffleTitle')}</p>
            <div className="irummy-confirm-buttons" style={{ flexDirection: 'column', gap: '8px' }}>
              <button className="irummy-btn irummy-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame(); }}>{t('common.reshuffleSame')}</button>
              <button className="irummy-btn irummy-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onEndGame(); onBack(); }}>{t('common.reshuffleMenu')}</button>
              <button className="irummy-btn" onClick={() => setShowReshuffleConfirm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {isRearranging && canInteract && (
        <div className="irummy-rearrange-bar">
          {!humanPlayer.hasMetFirstMeld && firstMeldProgress !== null && (
            <div className="irummy-rearrange-progress">
              <span className="irummy-rearrange-progress-label">
                {t('israeliRummy.firstMeldProgress')}
              </span>
              <div className="irummy-rearrange-progress-track">
                <div
                  className="irummy-rearrange-progress-fill"
                  style={{
                    width: `${Math.min(100, (firstMeldProgress / gs.firstMeldThreshold) * 100)}%`,
                    background: firstMeldProgress >= gs.firstMeldThreshold
                      ? 'linear-gradient(90deg, #4caf50, #81c784)'
                      : 'linear-gradient(90deg, #ff9800, #ffc107)',
                  }}
                />
              </div>
              <span className="irummy-rearrange-progress-value">
                {firstMeldProgress} / {gs.firstMeldThreshold}
              </span>
            </div>
          )}
          <div className="irummy-rearrange-actions">
            <button className="irummy-btn irummy-btn-danger" onClick={handleRevert}>
              {t('israeliRummy.cancel')}
            </button>
            <button className="irummy-btn irummy-btn-success" onClick={handleCommit}>
              {t('israeliRummy.done')}
            </button>
          </div>
        </div>
      )}

      {renderRoundEnd()}
      {renderDragGhost()}
    </div>
  );
}
