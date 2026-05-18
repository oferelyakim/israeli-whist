import { CardSetType, QuartetColor } from './types';

// ─── Card set definitions ───────────────────────────────────────────

export interface CardSetDefinition {
  type: CardSetType;
  categories: { emoji: string }[];
}

/** Emoji set: abstract/fun symbols */
export const EMOJI_CARD_SET: CardSetDefinition = {
  type: CardSetType.EMOJI,
  categories: [
    { emoji: '😀' }, // 0  smiley
    { emoji: '❤️' },  // 1  heart
    { emoji: '⭐' }, // 2  star
    { emoji: '🌙' }, // 3  moon
    { emoji: '🔔' }, // 4  bell
    { emoji: '🎵' }, // 5  music
    { emoji: '🌸' }, // 6  flower
    { emoji: '🍎' }, // 7  apple
    { emoji: '⚡' }, // 8  lightning
    { emoji: '🐱' }, // 9  cat
    { emoji: '🦋' }, // 10 butterfly
    { emoji: '🌈' }, // 11 rainbow
  ],
};

/** Images set: everyday objects */
export const IMAGES_CARD_SET: CardSetDefinition = {
  type: CardSetType.IMAGES,
  categories: [
    { emoji: '🚗' }, // 0  car
    { emoji: '🏠' }, // 1  house
    { emoji: '🌳' }, // 2  tree
    { emoji: '🐕' }, // 3  dog
    { emoji: '✈️' },  // 4  airplane
    { emoji: '🚢' }, // 5  ship
    { emoji: '🎈' }, // 6  balloon
    { emoji: '🍕' }, // 7  pizza
    { emoji: '🏀' }, // 8  basketball
    { emoji: '🎸' }, // 9  guitar
    { emoji: '📱' }, // 10 phone
    { emoji: '🧸' }, // 11 teddy bear
  ],
};

export const CARD_SETS: Record<CardSetType, CardSetDefinition> = {
  [CardSetType.EMOJI]: EMOJI_CARD_SET,
  [CardSetType.IMAGES]: IMAGES_CARD_SET,
};

// ─── Color display values ───────────────────────────────────────────

export const QUARTET_COLOR_HEX: Record<QuartetColor, string> = {
  [QuartetColor.BLUE]: '#2196F3',
  [QuartetColor.GREEN]: '#4CAF50',
  [QuartetColor.YELLOW]: '#FFC107',
  [QuartetColor.RED]: '#F44336',
};

export const QUARTET_COLOR_GRADIENT: Record<QuartetColor, string> = {
  [QuartetColor.BLUE]: 'linear-gradient(135deg, #1976D2, #42A5F5)',
  [QuartetColor.GREEN]: 'linear-gradient(135deg, #388E3C, #66BB6A)',
  [QuartetColor.YELLOW]: 'linear-gradient(135deg, #F9A825, #FFCA28)',
  [QuartetColor.RED]: 'linear-gradient(135deg, #D32F2F, #EF5350)',
};

export const QUARTET_COLOR_EMOJI: Record<QuartetColor, string> = {
  [QuartetColor.BLUE]: '🟦',
  [QuartetColor.GREEN]: '🟩',
  [QuartetColor.YELLOW]: '🟨',
  [QuartetColor.RED]: '🟥',
};
