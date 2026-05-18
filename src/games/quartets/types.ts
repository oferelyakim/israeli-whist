import { GameType } from '../../types/game-common';
import type { PlayerType, BaseGameSettings } from '../../types/game-common';

// ─── Card color (background) ────────────────────────────────────────

export enum QuartetColor {
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED',
}

export const QUARTET_COLORS = [
  QuartetColor.BLUE,
  QuartetColor.GREEN,
  QuartetColor.YELLOW,
  QuartetColor.RED,
] as const;

// ─── Card category (0-11 index into card set) ──────────────────────

export type QuartetCategory = number; // 0–11

export const NUM_CATEGORIES = 12;

// ─── Card set type ──────────────────────────────────────────────────

export enum CardSetType {
  EMOJI = 'EMOJI',
  IMAGES = 'IMAGES',
}

// ─── Quartet card ───────────────────────────────────────────────────

export interface QuartetCard {
  category: QuartetCategory;
  color: QuartetColor;
}

export type QuartetCardKey = `${QuartetCategory}_${QuartetColor}`;

export function quartetCardKey(card: QuartetCard): QuartetCardKey {
  return `${card.category}_${card.color}` as QuartetCardKey;
}

export function parseQuartetCardKey(key: QuartetCardKey): QuartetCard {
  const underscoreIdx = key.indexOf('_');
  const category = Number(key.slice(0, underscoreIdx));
  const color = key.slice(underscoreIdx + 1) as QuartetColor;
  return { category, color };
}

// ─── Game phases ────────────────────────────────────────────────────

export enum QuartetsPhase {
  DEALING = 'DEALING',
  PLAYER_TURN = 'PLAYER_TURN',
  AWAITING_RESPONSE = 'AWAITING_RESPONSE',
  CHOOSING_COLOR = 'CHOOSING_COLOR',
  TURN_RESULT = 'TURN_RESULT',
  GAME_OVER = 'GAME_OVER',
}

// ─── Player state ───────────────────────────────────────────────────

export interface QuartetsPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: QuartetCard[];
  completedQuartets: QuartetCategory[];
  isConnected: boolean;
}

// ─── Round / game state ─────────────────────────────────────────────

export interface LastAskResult {
  askerSeat: number;
  targetSeat: number;
  category: QuartetCategory;
  color?: QuartetColor;
  success: boolean;
  /** true if the asker just completed a quartet from this ask */
  completedQuartet: boolean;
}

/** Record of a past ask (for AI memory). */
export interface AskRecord {
  askerSeat: number;
  targetSeat: number;
  category: QuartetCategory;
  color?: QuartetColor;
  success: boolean;
}

export interface QuartetsRoundState {
  phase: QuartetsPhase;
  players: QuartetsPlayer[];
  drawPile: QuartetCard[];
  currentPlayer: number;
  numPlayers: number;
  lastAsk: LastAskResult | null;
  /** Rolling history of recent asks so AI can avoid repeating failures. */
  recentAsks: AskRecord[];
  /** In-flight request awaiting target player response. */
  pendingRequest: PendingAsk | null;
}

export interface QuartetsGameSettings extends BaseGameSettings {
  gameType: GameType.QUARTETS;
  cardSet: CardSetType;
}

export interface QuartetsGameState {
  gameId: string;
  round: QuartetsRoundState;
  settings: QuartetsGameSettings;
}

// ─── Pending ask (UI-level, before engine resolves) ─────────────────

export interface PendingAsk {
  askerSeat: number;
  targetSeat: number;
  category: QuartetCategory;
}

// ─── Actions ────────────────────────────────────────────────────────

export type QuartetsAction =
  | { type: 'DEAL'; seed: number }
  | {
      type: 'ASK_FOR_CARD';
      seat: number;
      targetSeat: number;
      category: QuartetCategory;
    }
  | { type: 'RESOLVE_REQUEST'; seat: number }
  | { type: 'CHOOSE_COLOR'; seat: number; color: QuartetColor }
  | { type: 'ACKNOWLEDGE_RESULT'; seat: number }
  | { type: 'END_GAME' };
