/** Shared types used across all games (Whist, Yaniv, etc.) */

export enum GameType {
  WHIST = 'WHIST',
  YANIV = 'YANIV',
  QUARTETS = 'QUARTETS',
  SOLITAIRE = 'SOLITAIRE',
  SHITHEAD = 'SHITHEAD',
  RUMMY = 'RUMMY',
  ISRAELI_RUMMY = 'ISRAELI_RUMMY',
  GIN_RUMMY = 'GIN_RUMMY',
  BACKGAMMON = 'BACKGAMMON',
  CHECKERS = 'CHECKERS',
  WOODOKU = 'WOODOKU',
  ESCAPE_ROOM = 'ESCAPE_ROOM',
}

export enum PlayerType {
  HUMAN = 'HUMAN',
  AI = 'AI',
  REMOTE = 'REMOTE',
}

export interface BaseGameSettings {
  gameType: GameType;
  playerNames: string[];
  playerTypes: PlayerType[];
  numPlayers: number;
}

/** Helper: create array of seat indices [0, 1, ..., n-1] */
export function allSeats(numPlayers: number): number[] {
  return Array.from({ length: numPlayers }, (_, i) => i);
}

export function nextSeatN(seat: number, numPlayers: number): number {
  return (seat + 1) % numPlayers;
}

export function prevSeatN(seat: number, numPlayers: number): number {
  return (seat + numPlayers - 1) % numPlayers;
}
