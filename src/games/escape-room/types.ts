export type ArchetypeId = string;
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface EscapeRoomSettings {
  gameType: 'ESCAPE_ROOM';
  playerNames: string[];
  numPlayers: 1;
  roundId?: string;
}
