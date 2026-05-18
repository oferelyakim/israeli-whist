import { PlayerType } from '../../../types/game-common';
import type { QuartetCard, QuartetCategory } from '../types';
import { QuartetsPhase } from '../types';
import type {
  QuartetsPlayer,
  QuartetsRoundState,
  QuartetsGameSettings,
  QuartetsGameState,
  QuartetsAction,
} from '../types';
import { dealQuartetsHands } from './deck';
import { checkCompletedQuartet, hasValidAsk } from './validation';

// ─── Helpers ────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Remove completed quartets from a player's hand and record them.
 * Returns the categories that were completed.
 */
function removeCompletedQuartets(player: QuartetsPlayer): QuartetCategory[] {
  const completed: QuartetCategory[] = [];
  const categories = new Set(player.hand.map((c) => c.category));

  for (const cat of categories) {
    if (checkCompletedQuartet(player.hand, cat)) {
      completed.push(cat);
      player.completedQuartets.push(cat);
      player.hand = player.hand.filter((c) => c.category !== cat);
    }
  }

  return completed;
}

/**
 * Refill a player's hand to 4 cards from the draw pile.
 * After each draw, check for completed quartets (drawing can complete one).
 */
function refillHand(player: QuartetsPlayer, drawPile: QuartetCard[]): void {
  while (player.hand.length < 4 && drawPile.length > 0) {
    player.hand.push(drawPile.pop()!);
    removeCompletedQuartets(player);
  }
}

/**
 * Count total completed quartets across all players.
 */
function totalCompletedQuartets(players: QuartetsPlayer[]): number {
  return players.reduce((sum, p) => sum + p.completedQuartets.length, 0);
}

/**
 * Find the next player with cards (or valid ask potential).
 * Returns -1 if no active player exists.
 */
function findNextActivePlayer(
  currentSeat: number,
  players: QuartetsPlayer[],
  _drawPileLength: number,
): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (currentSeat + i) % n;
    const player = players[seat];
    // Player can play if they have cards with valid asks, or could get cards from pile
    if (player.hand.length > 0 && hasValidAsk(player)) {
      return seat;
    }
    // Player has cards but no valid ask — skip them
    // Player has no cards but pile exists — they should have been refilled already
  }
  return -1;
}

/**
 * Check if the game is over.
 */
function isGameOver(round: QuartetsRoundState): boolean {
  // All 12 quartets completed
  if (totalCompletedQuartets(round.players) >= 12) return true;

  // No player can make a valid ask
  const anyCanAsk = round.players.some(
    (p) => p.hand.length > 0 && hasValidAsk(p),
  );
  if (!anyCanAsk) return true;

  return false;
}

// ─── Create initial state ───────────────────────────────────────────

export function createInitialQuartetsState(
  settings: QuartetsGameSettings,
): QuartetsGameState {
  const players: QuartetsPlayer[] = settings.playerNames.map((name, i) => ({
    seat: i,
    name,
    type: settings.playerTypes[i],
    hand: [],
    completedQuartets: [],
    isConnected: settings.playerTypes[i] !== PlayerType.REMOTE,
  }));

  return {
    gameId: `quartets_${Date.now()}`,
    round: {
      phase: QuartetsPhase.DEALING,
      players,
      drawPile: [],
      currentPlayer: 0,
      numPlayers: settings.numPlayers,
      lastAsk: null,
      recentAsks: [],
      pendingRequest: null,
    },
    settings,
  };
}

// ─── Reducer ────────────────────────────────────────────────────────

export function quartetsReducer(
  state: QuartetsGameState,
  action: QuartetsAction,
): QuartetsGameState {
  const newState = deepClone(state);
  const round = newState.round;

  switch (action.type) {
    case 'DEAL': {
      if (round.phase !== QuartetsPhase.DEALING) return state;

      const { hands, drawPile } = dealQuartetsHands(
        action.seed,
        round.numPlayers,
      );

      for (let i = 0; i < round.numPlayers; i++) {
        round.players[i].hand = hands[i];
      }
      round.drawPile = drawPile;

      // Check if any initial hands have completed quartets (unlikely but possible)
      for (const player of round.players) {
        removeCompletedQuartets(player);
        refillHand(player, round.drawPile);
      }

      round.currentPlayer = 0;
      round.phase = QuartetsPhase.PLAYER_TURN;

      return newState;
    }

    case 'ASK_FOR_CARD': {
      if (round.phase !== QuartetsPhase.PLAYER_TURN) return state;
      if (round.currentPlayer !== action.seat) return state;

      const asker = round.players[action.seat];

      // Validate: must hold at least 1 card of that category
      const hasCategory = asker.hand.some(
        (c) => c.category === action.category,
      );
      if (!hasCategory) return state;

      // Store the pending request (category only) and wait for target to respond
      round.pendingRequest = {
        askerSeat: action.seat,
        targetSeat: action.targetSeat,
        category: action.category,
      };
      round.phase = QuartetsPhase.AWAITING_RESPONSE;
      return newState;
    }

    case 'RESOLVE_REQUEST': {
      // Target responds whether they have ANY card of the requested category
      if (round.phase !== QuartetsPhase.AWAITING_RESPONSE) return state;
      const req = round.pendingRequest;
      if (!req) return state;

      const target = round.players[req.targetSeat];

      // Check if target has ANY card of the category
      const targetHasCategory = target.hand.some(
        (c) => c.category === req.category,
      );

      if (targetHasCategory) {
        // Target has the category — asker now picks a color
        round.phase = QuartetsPhase.CHOOSING_COLOR;
        // Keep pendingRequest intact for CHOOSE_COLOR
        return newState;
      }

      // ── Category miss: "Go fish" ──
      // Card draw is deferred to ACKNOWLEDGE_RESULT so the human can see
      // the go-fish toast before the card appears in their hand.

      round.lastAsk = {
        askerSeat: req.askerSeat,
        targetSeat: req.targetSeat,
        category: req.category,
        success: false,
        completedQuartet: false,
      };

      // Record in history (for AI memory)
      if (!round.recentAsks) round.recentAsks = [];
      round.recentAsks.push({
        askerSeat: req.askerSeat,
        targetSeat: req.targetSeat,
        category: req.category,
        success: false,
      });
      if (round.recentAsks.length > 20) {
        round.recentAsks = round.recentAsks.slice(-20);
      }

      round.pendingRequest = null;
      round.phase = QuartetsPhase.TURN_RESULT;
      return newState;
    }

    case 'CHOOSE_COLOR': {
      // Asker picks a color after target confirmed they have the category
      if (round.phase !== QuartetsPhase.CHOOSING_COLOR) return state;
      const req = round.pendingRequest;
      if (!req) return state;
      if (action.seat !== req.askerSeat) return state;

      const asker = round.players[req.askerSeat];
      const target = round.players[req.targetSeat];

      // Check if target has the exact card (category + color)
      const targetCardIdx = target.hand.findIndex(
        (c) => c.category === req.category && c.color === action.color,
      );

      if (targetCardIdx >= 0) {
        // ── SUCCESS: transfer card ──
        const [card] = target.hand.splice(targetCardIdx, 1);
        asker.hand.push(card);

        const completed = removeCompletedQuartets(asker);
        refillHand(asker, round.drawPile);
        refillHand(target, round.drawPile);

        round.lastAsk = {
          askerSeat: req.askerSeat,
          targetSeat: req.targetSeat,
          category: req.category,
          color: action.color,
          success: true,
          completedQuartet: completed.length > 0,
        };
      } else {
        // ── Color miss: "Go fish" ──
        // Card draw is deferred to ACKNOWLEDGE_RESULT so the human can see
        // the go-fish toast before the card appears in their hand.

        round.lastAsk = {
          askerSeat: req.askerSeat,
          targetSeat: req.targetSeat,
          category: req.category,
          color: action.color,
          success: false,
          completedQuartet: false,
        };
      }

      // Record in history (for AI memory)
      if (!round.recentAsks) round.recentAsks = [];
      round.recentAsks.push({
        askerSeat: req.askerSeat,
        targetSeat: req.targetSeat,
        category: req.category,
        color: action.color,
        success: targetCardIdx >= 0,
      });
      if (round.recentAsks.length > 20) {
        round.recentAsks = round.recentAsks.slice(-20);
      }

      round.pendingRequest = null;
      round.phase = QuartetsPhase.TURN_RESULT;
      return newState;
    }

    case 'ACKNOWLEDGE_RESULT': {
      if (round.phase !== QuartetsPhase.TURN_RESULT) return state;

      const lastAsk = round.lastAsk;
      if (!lastAsk) return state;

      // Deferred go-fish draw: card appears only after result toast is dismissed
      if (!lastAsk.success) {
        const asker = round.players[lastAsk.askerSeat];
        if (round.drawPile.length > 0) {
          asker.hand.push(round.drawPile.pop()!);
          removeCompletedQuartets(asker);
          refillHand(asker, round.drawPile);
        }
      }

      // Check if game is over
      if (isGameOver(round)) {
        round.phase = QuartetsPhase.GAME_OVER;
        round.lastAsk = null;
        return newState;
      }

      if (lastAsk.success) {
        // Same player continues — check they can still ask
        const asker = round.players[lastAsk.askerSeat];
        if (asker.hand.length > 0 && hasValidAsk(asker)) {
          round.currentPlayer = lastAsk.askerSeat;
        } else {
          // Can't ask anymore, pass turn
          const next = findNextActivePlayer(
            lastAsk.askerSeat,
            round.players,
            round.drawPile.length,
          );
          if (next === -1) {
            round.phase = QuartetsPhase.GAME_OVER;
            round.lastAsk = null;
            return newState;
          }
          round.currentPlayer = next;
        }
      } else {
        // Failure: advance to next player
        const next = findNextActivePlayer(
          lastAsk.askerSeat,
          round.players,
          round.drawPile.length,
        );
        if (next === -1) {
          round.phase = QuartetsPhase.GAME_OVER;
          round.lastAsk = null;
          return newState;
        }
        round.currentPlayer = next;
      }

      round.lastAsk = null;
      round.phase = QuartetsPhase.PLAYER_TURN;
      return newState;
    }

    case 'END_GAME': {
      round.phase = QuartetsPhase.GAME_OVER;
      return newState;
    }

    default:
      return state;
  }
}
