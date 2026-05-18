import { PlayerType } from '../../../types/game-common';
import { createRNG } from '../../../utils/random';
import type { BackgammonAction, BackgammonGameState, BackgammonSettings, BgColor, BgState } from '../types';
import { createInitialBoard, getLegalMoves } from './board';

function createInitialBgStateData(_seed: number): BgState {
  return {
    board: createInitialBoard(),
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    dice: [],
    diceRolled: false,
    turn: 'white',
    phase: 'ROLLING',
    winner: null,
    scores: { white: 0, black: 0 },
  };
}

export function createInitialBgState(settings: BackgammonSettings, seed: number): BackgammonGameState {
  const playerNames = settings.playerNames ?? ['Player 1', 'Player 2'];
  const playerTypes = settings.playerTypes ?? [PlayerType.HUMAN, PlayerType.AI];

  return {
    gameId: `bg_${seed}`,
    state: createInitialBgStateData(seed),
    settings,
    players: [
      { seat: 0, name: playerNames[0] ?? 'Player 1', type: playerTypes[0] ?? PlayerType.HUMAN, color: 'white' },
      { seat: 1, name: playerNames[1] ?? 'Player 2', type: playerTypes[1] ?? PlayerType.AI, color: 'black' },
    ],
  };
}

function opponent(color: BgColor): BgColor {
  return color === 'white' ? 'black' : 'white';
}

function endTurn(state: BgState): BgState {
  const nextTurn = opponent(state.turn);
  return {
    ...state,
    turn: nextTurn,
    dice: [],
    diceRolled: false,
    phase: 'ROLLING',
  };
}

function removeUsedDie(dice: number[], pip: number): number[] {
  const idx = dice.indexOf(pip);
  if (idx === -1) return dice;
  return [...dice.slice(0, idx), ...dice.slice(idx + 1)];
}

function applyRollDice(gameState: BackgammonGameState, seed: number): BackgammonGameState {
  const state = gameState.state;
  if (state.phase !== 'ROLLING') return gameState;

  const rng = createRNG(seed);
  const d1 = Math.floor(rng() * 6) + 1;
  const d2 = Math.floor(rng() * 6) + 1;
  const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];

  const newState: BgState = { ...state, dice, diceRolled: true, phase: 'MOVING' };

  const legalMoves = getLegalMoves(newState, state.turn);
  if (legalMoves.length === 0) {
    // No legal moves — auto-pass
    return { ...gameState, state: endTurn(newState) };
  }

  return { ...gameState, state: newState };
}

function applyMoveChecker(
  gameState: BackgammonGameState,
  from: number | 'bar',
  to: number
): BackgammonGameState {
  const state = gameState.state;
  if (state.phase !== 'MOVING') return gameState;

  const color = state.turn;
  const opp = opponent(color);
  let board = state.board.map((p) => ({ ...p }));
  let bar = { ...state.bar };
  let off = { ...state.off };

  // Lift checker from source
  if (from === 'bar') {
    if (bar[color] <= 0) return gameState;
    bar = { ...bar, [color]: bar[color] - 1 };
  } else {
    if (board[from].color !== color || board[from].count <= 0) return gameState;
    board[from] = {
      color: board[from].count === 1 ? null : color,
      count: board[from].count - 1,
    };
  }

  // Compute which die was used
  let usedPip: number;
  if (to === -1) {
    // Bear-off: die pip = distance from point
    const pointIdx = from === 'bar' ? -1 : from;
    if (pointIdx === -1) return gameState;
    usedPip = color === 'white' ? pointIdx + 1 : 24 - pointIdx;
  } else {
    const fromIdx = from === 'bar'
      ? (color === 'white' ? 24 : -1)
      : from;
    usedPip = color === 'white' ? fromIdx - to : to - fromIdx;
  }

  // Determine which die index to remove — prefer exact match for bear-off
  if (to === -1) {
    // Find the smallest die that's >= usedPip (for bear-off with larger die)
    const exactIdx = state.dice.indexOf(usedPip);
    if (exactIdx !== -1) {
      const newDice = removeUsedDie(state.dice, usedPip);
      const newOff = { ...off, [color]: off[color] + 1 };
      const winner: BgColor | null = newOff[color] >= 15 ? color : null;
      const phase = winner ? 'GAME_OVER' : state.phase;
      const scores = winner
        ? { ...state.scores, [color]: state.scores[color] + 1 }
        : state.scores;

      const postState: BgState = {
        ...state,
        board,
        bar,
        off: newOff,
        dice: newDice,
        winner,
        phase,
        scores,
      };

      if (winner || newDice.length === 0 || getLegalMoves(postState, color).length === 0) {
        return { ...gameState, state: winner ? postState : endTurn(postState) };
      }
      return { ...gameState, state: postState };
    } else {
      // Use larger die for bear-off
      const larger = state.dice.find((d) => d > usedPip);
      if (larger === undefined) return gameState;
      const newDice = removeUsedDie(state.dice, larger);
      const newOff = { ...off, [color]: off[color] + 1 };
      const winner: BgColor | null = newOff[color] >= 15 ? color : null;
      const phase = winner ? 'GAME_OVER' : state.phase;
      const scores = winner
        ? { ...state.scores, [color]: state.scores[color] + 1 }
        : state.scores;

      const postState: BgState = {
        ...state,
        board,
        bar,
        off: newOff,
        dice: newDice,
        winner,
        phase,
        scores,
      };

      if (winner || newDice.length === 0 || getLegalMoves(postState, color).length === 0) {
        return { ...gameState, state: winner ? postState : endTurn(postState) };
      }
      return { ...gameState, state: postState };
    }
  }

  // Regular move
  const targetPoint = board[to];
  if (targetPoint.color === opp && targetPoint.count === 1) {
    // Hit — send opponent to bar
    board[to] = { color: null, count: 0 };
    bar = { ...bar, [opp]: bar[opp] + 1 };
  } else if (targetPoint.color === opp && targetPoint.count >= 2) {
    // Blocked — invalid move
    return gameState;
  }

  board[to] = {
    color,
    count: (board[to].color === color ? board[to].count : 0) + 1,
  };

  const newDice = removeUsedDie(state.dice, usedPip);

  const postState: BgState = {
    ...state,
    board,
    bar,
    off,
    dice: newDice,
  };

  if (newDice.length === 0 || getLegalMoves(postState, color).length === 0) {
    return { ...gameState, state: endTurn(postState) };
  }

  return { ...gameState, state: postState };
}

function applyCombinedMove(
  gameState: BackgammonGameState,
  from: number | 'bar',
  via: number,
  to: number
): BackgammonGameState {
  // Apply both dice steps atomically so the turn doesn't end between them.
  const step1 = applyMoveChecker(gameState, from, via);
  // Only continue if the turn is still in MOVING phase (it always should be for valid combined moves)
  if (step1.state.phase !== 'MOVING') return step1;
  return applyMoveChecker(step1, via, to);
}

function applyPassTurn(gameState: BackgammonGameState): BackgammonGameState {
  const state = gameState.state;
  if (state.phase !== 'MOVING') return gameState;
  return { ...gameState, state: endTurn(state) };
}

function applyNewGame(gameState: BackgammonGameState, seed: number): BackgammonGameState {
  const currentScores = gameState.state.scores;
  const newState = createInitialBgStateData(seed);
  return {
    ...gameState,
    gameId: `bg_${seed}`,
    state: { ...newState, scores: currentScores },
  };
}

export function backgammonReducer(
  state: BackgammonGameState,
  action: BackgammonAction
): BackgammonGameState {
  switch (action.type) {
    case 'ROLL_DICE':
      return applyRollDice(state, action.seed);
    case 'MOVE_CHECKER':
      return applyMoveChecker(state, action.from, action.to);
    case 'COMBINED_MOVE':
      return applyCombinedMove(state, action.from, action.via, action.to);
    case 'PASS_TURN':
      return applyPassTurn(state);
    case 'NEW_GAME':
      return applyNewGame(state, action.seed);
    default:
      return state;
  }
}
