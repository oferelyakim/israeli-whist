import { lazy } from 'react';
import type { ComponentType } from 'react';
import { GameType } from '../types/game-common';

export interface GameScreenProps {
  settings: any;
  onBack: () => void;
}

export interface MultiplayerScreenProps {
  roomId: string;
  humanSeat: number;
  isHost: boolean;
  onBack: () => void;
}

export interface GameConfig {
  type: GameType;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  defaultPlayers: number;
  description: string;
  rulesSnippet: string[];
  GameScreen: React.LazyExoticComponent<ComponentType<GameScreenProps>>;
  MultiplayerScreen: React.LazyExoticComponent<ComponentType<MultiplayerScreenProps>>;
}

export const GAME_REGISTRY: Partial<Record<GameType, GameConfig>> = {
  [GameType.WHIST]: {
    type: GameType.WHIST,
    displayName: 'WhistAchim',
    minPlayers: 4,
    maxPlayers: 4,
    defaultPlayers: 4,
    description: 'Trick-taking card game for 4 players',
    rulesSnippet: [
      '4 players, 13 cards each, trick-taking game',
      'Bid how many tricks you\'ll take (someone must bid 5+ for trump)',
      'Last bidder can\'t make total = 13',
      'If no one bids high enough: exchange 3 cards, re-bid',
      'Hit your bid: bid\u00B2 + 10 points',
      'Miss: -10 per trick off',
    ],
    GameScreen: lazy(() => import('../WhistGameScreen')),
    MultiplayerScreen: lazy(() => import('../MultiplayerGameScreen').then(m => ({ default: m.MultiplayerGameScreen }))),
  },
  [GameType.YANIV]: {
    type: GameType.YANIV,
    displayName: 'Yaniv',
    minPlayers: 2,
    maxPlayers: 8,
    defaultPlayers: 4,
    description: 'Hand-shedding card game for 2-8 players',
    rulesSnippet: [
      '2-8 players, get hand value to 7 or less',
      'Discard singles, pairs/sets, or same-suit sequences',
      'Draw 1 card from pile or previous discard',
      'Call "Yaniv" when hand ≤ 7 to end the round',
      'Beware of "Assaf" — if someone has equal or lower!',
      'Score multiples of 50: subtract 50 points',
    ],
    GameScreen: lazy(() => import('./yaniv/components/YanivGameScreen')),
    MultiplayerScreen: lazy(() => import('./yaniv/components/YanivMultiplayerScreen')),
  },
  [GameType.QUARTETS]: {
    type: GameType.QUARTETS,
    displayName: 'Quartets',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 3,
    description: 'Card matching game for 2-4 players',
    rulesSnippet: [
      '2-4 players, collect complete sets of 4',
      'Ask opponents for specific cards you need',
      'Must already hold a card from that set to ask',
      'Got it? Ask again! Go fish? Draw from pile.',
      'Hand drops below 4? Draw up to 4.',
      'Most completed quartets wins!',
    ],
    GameScreen: lazy(() => import('./quartets/components/QuartetsGameScreen')),
    MultiplayerScreen: lazy(() => import('./quartets/components/QuartetsMultiplayerScreen')),
  },
  [GameType.SOLITAIRE]: {
    type: GameType.SOLITAIRE,
    displayName: 'Solitaire',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    description: 'Classic Klondike Solitaire with a Joker twist',
    rulesSnippet: [
      'Build 4 foundation piles from Ace to King by suit',
      '7 tableau columns \u2014 build down in alternating colors',
      'The Joker is wild \u2014 place it anywhere, any card goes on top',
      'Unlimited undo and hints available',
    ],
    GameScreen: lazy(() => import('./solitaire/components/SolitaireGameScreen')),
    MultiplayerScreen: lazy(() => import('./solitaire/components/SolitaireMultiplayerScreen')),
  },
  [GameType.SHITHEAD]: {
    type: GameType.SHITHEAD,
    displayName: 'Shithead',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    description: 'Last player with cards is the Shithead!',
    rulesSnippet: [
      '2-4 players, shed all your cards to win',
      'Play equal or higher than the top card',
      '2=reset, 3=invisible, 7=reverse, 10=burn the pile',
      'Can\'t play? Pick up the entire pile!',
      'Hand → face-up → face-down (blind!)',
      'Last player left is the Shithead 💩',
    ],
    GameScreen: lazy(() => import('./shithead/components/ShitheadGameScreen')),
    MultiplayerScreen: lazy(() => import('./shithead/components/ShitheadMultiplayerScreen')),
  },
  // Basic Rummy hidden — code kept in src/games/rummy/
  // [GameType.RUMMY]: { ... },
  [GameType.ISRAELI_RUMMY]: {
    type: GameType.ISRAELI_RUMMY,
    displayName: 'registry.israeliRummy.name',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    description: 'registry.israeliRummy.description',
    rulesSnippet: [
      'registry.israeliRummy.rule1',
      'registry.israeliRummy.rule2',
      'registry.israeliRummy.rule3',
      'registry.israeliRummy.rule4',
    ],
    GameScreen: lazy(() => import('./israeli-rummy/components/IsraeliRummyGameScreen')),
    MultiplayerScreen: lazy(() => import('./israeli-rummy/components/IsraeliRummyMultiplayerScreen')),
  },
  // Gin Rummy hidden — code kept in src/games/gin-rummy/
  // [GameType.GIN_RUMMY]: { ... },
  [GameType.BACKGAMMON]: {
    type: GameType.BACKGAMMON,
    displayName: 'registry.backgammon.name',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    description: 'registry.backgammon.description',
    rulesSnippet: [
      'registry.backgammon.rule1',
      'registry.backgammon.rule2',
      'registry.backgammon.rule3',
      'registry.backgammon.rule4',
    ],
    GameScreen: lazy(() => import('./backgammon/components/BackgammonScreen')),
    MultiplayerScreen: lazy(() => import('./backgammon/components/BackgammonMultiplayerScreen')),
  },
  [GameType.CHECKERS]: {
    type: GameType.CHECKERS,
    displayName: 'registry.checkers.name',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    description: 'registry.checkers.description',
    rulesSnippet: [
      'registry.checkers.rule1',
      'registry.checkers.rule2',
      'registry.checkers.rule3',
      'registry.checkers.rule4',
    ],
    GameScreen: lazy(() => import('./checkers/components/CheckersScreen')),
    MultiplayerScreen: lazy(() => import('./checkers/components/CheckersMultiplayerScreen')),
  },
  // Woodoku hidden from menu — work in progress, will be re-added later
  // [GameType.WOODOKU]: { ... }
  [GameType.ESCAPE_ROOM]: {
    type: GameType.ESCAPE_ROOM,
    displayName: 'registry.escapeRoom.name',
    minPlayers: 1,
    maxPlayers: 1,
    defaultPlayers: 1,
    description: 'registry.escapeRoom.description',
    rulesSnippet: [
      'registry.escapeRoom.rule1',
      'registry.escapeRoom.rule2',
      'registry.escapeRoom.rule3',
      'registry.escapeRoom.rule4',
    ],
    GameScreen: lazy(() => import('./escape-room/components/EscapeRoomGameScreen')),
    MultiplayerScreen: lazy(() => import('./escape-room/components/EscapeRoomMultiplayerScreen')),
  },
};
