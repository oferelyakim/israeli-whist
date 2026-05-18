import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey, StandardSuit } from '../types/card';
import type { GameState, GameSettings, PlayerSeat } from '../types/game';
import { GamePhase, PlayerType } from '../types/game';
import { gameReducer, createInitialGameState } from '../engine/game-reducer';
import { getAIAction } from '../ai/ai-player';
import { randomSeed } from '../utils/random';

interface UseGameReturn {
  gameState: GameState | null;
  startGame: (settings: GameSettings) => void;
  bid: (amount: number, suit?: StandardSuit) => void;
  selectDiscards: (cards: CardKey[]) => void;
  chooseTrump: (suit: StandardSuit) => void;
  raiseBid: (amount: number) => void;
  declare: (amount: number) => void;
  playCard: (cardKey: CardKey) => void;
  collectTrick: () => void;
  nextRound: () => void;
  endGame: () => void;
  humanSeat: PlayerSeat;
}

const HUMAN_SEAT: PlayerSeat = 0;
const AI_DELAY = 700;
const TRICK_VIEW_DELAY = 1200;

export function useGame(): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: Parameters<typeof gameReducer>[1]) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = gameReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Game reducer error:', e);
        return prev;
      }
    });
  }, []);

  // AI effect
  useEffect(() => {
    if (!gameState) return;
    const round = gameState.currentRound;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING (e.g. re-deal after 3 failed exchanges)
    if (round.phase === GamePhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Auto-collect completed tricks after a delay
    if (round.phase === GamePhase.TRICK_COMPLETE) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'COLLECT_TRICK' });
      }, TRICK_VIEW_DELAY);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Schedule AI actions
    const scheduleAI = () => {
      const state = gameRef.current;
      if (!state) return;
      const r = state.currentRound;

      // Exchange: process AI players one at a time
      if (r.phase === GamePhase.EXCHANGING && r.exchange) {
        for (let seat = 0; seat < 4; seat++) {
          const player = r.players[seat];
          if (player.type === PlayerType.AI && r.exchange.discards[seat] === null) {
            const action = getAIAction(state, seat as PlayerSeat);
            if (action) {
              safeDispatch(action);
              return;
            }
          }
        }
        return;
      }

      // Trump selection: check trump caller specifically
      if (r.phase === GamePhase.TRUMP_SELECTION && r.trumpCaller !== null) {
        const caller = r.players[r.trumpCaller];
        if (caller.type === PlayerType.AI) {
          const action = getAIAction(state, r.trumpCaller);
          if (action) safeDispatch(action);
        }
        return;
      }

      // Raise: check trump caller (only they can raise)
      if (r.phase === GamePhase.RAISE && r.trumpCaller !== null) {
        const caller = r.players[r.trumpCaller];
        if (caller.type === PlayerType.AI) {
          const action = getAIAction(state, r.trumpCaller);
          if (action) safeDispatch(action);
        }
        return;
      }

      // Declaring: check current declarer
      if (r.phase === GamePhase.DECLARING) {
        const player = r.players[r.currentPlayer];
        if (player?.type === PlayerType.AI) {
          const action = getAIAction(state, r.currentPlayer);
          if (action) safeDispatch(action);
        }
        return;
      }

      // Bidding / Playing: check current player
      if (r.phase === GamePhase.BIDDING || r.phase === GamePhase.PLAYING) {
        const player = r.players[r.currentPlayer];
        if (player?.type === PlayerType.AI) {
          const action = getAIAction(state, r.currentPlayer);
          if (action) safeDispatch(action);
        }
      }
    };

    const aiPhases = [
      GamePhase.BIDDING, GamePhase.EXCHANGING, GamePhase.TRUMP_SELECTION,
      GamePhase.RAISE, GamePhase.DECLARING, GamePhase.PLAYING,
    ];
    if (aiPhases.includes(round.phase)) {
      let needsAI = false;

      if (round.phase === GamePhase.EXCHANGING) {
        needsAI = round.players.some(
          (p, i) => p.type === PlayerType.AI && round.exchange?.discards[i] === null
        );
      } else if (round.phase === GamePhase.TRUMP_SELECTION) {
        needsAI = round.trumpCaller !== null && round.players[round.trumpCaller].type === PlayerType.AI;
      } else if (round.phase === GamePhase.RAISE) {
        needsAI = round.trumpCaller !== null && round.players[round.trumpCaller].type === PlayerType.AI;
      } else if (round.phase === GamePhase.DECLARING) {
        needsAI = round.players[round.currentPlayer]?.type === PlayerType.AI;
      } else {
        needsAI = round.players[round.currentPlayer]?.type === PlayerType.AI;
      }

      if (needsAI) {
        aiTimerRef.current = window.setTimeout(scheduleAI, AI_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const startGame = useCallback((settings: GameSettings) => {
    const initial = createInitialGameState(settings);
    const seed = randomSeed();
    const dealt = gameReducer(initial, { type: 'DEAL', seed });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const bid = useCallback((amount: number, suit?: StandardSuit) => {
    safeDispatch({ type: 'BID', seat: HUMAN_SEAT, amount, suit });
  }, [safeDispatch]);

  const selectDiscards = useCallback((cards: CardKey[]) => {
    safeDispatch({ type: 'SELECT_DISCARDS', seat: HUMAN_SEAT, cards });
  }, [safeDispatch]);

  const chooseTrump = useCallback((suit: StandardSuit) => {
    safeDispatch({ type: 'CHOOSE_TRUMP', seat: HUMAN_SEAT, suit });
  }, [safeDispatch]);

  const raiseBid = useCallback((amount: number) => {
    safeDispatch({ type: 'RAISE_BID', seat: HUMAN_SEAT, amount });
  }, [safeDispatch]);

  const declare = useCallback((amount: number) => {
    safeDispatch({ type: 'DECLARE', seat: HUMAN_SEAT, amount });
  }, [safeDispatch]);

  const playCard = useCallback((cardKey: CardKey) => {
    safeDispatch({ type: 'PLAY_CARD', seat: HUMAN_SEAT, card: cardKey });
  }, [safeDispatch]);

  const collectTrick = useCallback(() => {
    safeDispatch({ type: 'COLLECT_TRICK' });
  }, [safeDispatch]);

  const nextRound = useCallback(() => {
    safeDispatch({ type: 'NEXT_ROUND', seed: randomSeed() });
  }, [safeDispatch]);

  const endGame = useCallback(() => {
    safeDispatch({ type: 'END_GAME' });
  }, [safeDispatch]);

  return {
    gameState,
    startGame,
    bid,
    selectDiscards,
    chooseTrump,
    raiseBid,
    declare,
    playCard,
    collectTrick,
    nextRound,
    endGame,
    humanSeat: HUMAN_SEAT,
  };
}
