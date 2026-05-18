import type { ShitheadGameState, ShitheadAction } from '../types';
import { ShitheadPhase } from '../types';
import type { Card } from '../../../types/card';
import { Rank, cardKey } from '../../../types/card';
import { canPlayCard, getPlayerPlayZone } from '../engine/validation';

export function getShitheadAIAction(state: ShitheadGameState, seat: number): ShitheadAction | null {
  const player = state.players[seat];
  if (!player || player.finished) return null;

  if (state.phase === ShitheadPhase.SWAPPING) {
    // AI doesn't swap (simple AI)
    return { type: 'DONE_SWAPPING', seat };
  }

  if (state.phase !== ShitheadPhase.PLAYING) return null;
  if (state.currentPlayer !== seat) return null;

  const zone = getPlayerPlayZone(player, state.drawPile.length === 0);

  if (zone === 'done') return null;

  if (zone === 'faceDown') {
    // Play random face-down card
    const idx = Math.floor(Math.random() * player.faceDown.length);
    return { type: 'PLAY_BLIND', seat, cardIndex: idx };
  }

  const sourceCards = zone === 'hand' ? player.hand : player.faceUp;

  // Group by rank
  const byRank = new Map<Rank, Card[]>();
  for (const card of sourceCards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }

  // Find playable ranks, sorted by rank value (play lowest first)
  const playableRanks: { rank: Rank; cards: Card[] }[] = [];
  for (const [rank, cards] of byRank) {
    if (canPlayCard(cards[0], state.discardPile)) {
      playableRanks.push({ rank, cards });
    }
  }

  if (playableRanks.length === 0) {
    return { type: 'PICK_UP_PILE', seat };
  }

  // Sort by rank -- play lowest possible (save high cards)
  // But prefer special cards strategically:
  // - Play 10 (bomb) only when pile is big (5+ cards)
  // - Play 2 (reset) as last resort
  playableRanks.sort((a, b) => {
    // Move 10s to end unless pile is big
    if (a.rank === Rank.TEN && state.discardPile.length < 5) return 1;
    if (b.rank === Rank.TEN && state.discardPile.length < 5) return -1;
    // Move 2s to near-end
    if (a.rank === Rank.TWO && b.rank !== Rank.TWO) return 1;
    if (b.rank === Rank.TWO && a.rank !== Rank.TWO) return -1;
    return a.rank - b.rank;
  });

  const chosen = playableRanks[0];
  // Play all cards of that rank (maximize multi-card plays)
  const cardKeys = chosen.cards.map(c => cardKey(c));

  return { type: 'PLAY_CARDS', seat, cardKeys };
}
