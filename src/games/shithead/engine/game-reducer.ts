import type { ShitheadGameState, ShitheadAction, ShitheadPlayer, ShitheadGameSettings } from '../types';
import { ShitheadPhase } from '../types';
import { Rank, parseCardKey, cardEquals } from '../../../types/card';
import { nextSeatN } from '../../../types/game-common';
import { dealShithead } from './deck';
import { canPlayCard, shouldBurnPile, getPlayerPlayZone } from './validation';

export function createInitialShitheadState(settings: ShitheadGameSettings): ShitheadGameState {
  return {
    gameId: `shithead_${Date.now()}`,
    settings,
    phase: ShitheadPhase.DEALING,
    players: settings.playerNames.map((name, i) => ({
      seat: i,
      name,
      type: settings.playerTypes[i],
      hand: [],
      faceUp: [],
      faceDown: [],
      finished: false,
      finishOrder: 0,
      isConnected: true,
    })),
    drawPile: [],
    discardPile: [],
    currentPlayer: 0,
    numPlayers: settings.numPlayers,
    finishedCount: 0,
    lastPlayedBy: -1,
    shitheadSeat: null,
    burnAnimation: false,
  };
}

export function shitheadReducer(state: ShitheadGameState, action: ShitheadAction): ShitheadGameState {
  switch (action.type) {
    case 'DEAL': {
      const { players: dealt, drawPile } = dealShithead(state.numPlayers, action.seed);
      const players = state.players.map((p, i) => ({
        ...p,
        hand: dealt[i].hand,
        faceUp: dealt[i].faceUp,
        faceDown: dealt[i].faceDown,
        finished: false,
        finishOrder: 0,
      }));

      // Find player with lowest card in hand to go first
      let firstPlayer = 0;
      let lowestRank = (Rank.ACE as number) + 1;
      for (let i = 0; i < players.length; i++) {
        for (const card of players[i].hand) {
          if (card.rank < lowestRank || (card.rank === lowestRank && i < firstPlayer)) {
            lowestRank = card.rank;
            firstPlayer = i;
          }
        }
      }

      return {
        ...state,
        phase: ShitheadPhase.SWAPPING,
        players,
        drawPile,
        discardPile: [],
        currentPlayer: firstPlayer,
        finishedCount: 0,
        lastPlayedBy: -1,
        shitheadSeat: null,
        burnAnimation: false,
      };
    }

    case 'SWAP_CARDS': {
      if (state.phase !== ShitheadPhase.SWAPPING) return state;
      const player = state.players[action.seat];
      const handCard = parseCardKey(action.handCardKey);
      const faceUpCard = parseCardKey(action.faceUpCardKey);

      const handIdx = player.hand.findIndex(c => cardEquals(c, handCard));
      const faceUpIdx = player.faceUp.findIndex(c => cardEquals(c, faceUpCard));
      if (handIdx === -1 || faceUpIdx === -1) return state;

      const newHand = [...player.hand];
      const newFaceUp = [...player.faceUp];
      newHand[handIdx] = faceUpCard;
      newFaceUp[faceUpIdx] = handCard;

      const newPlayers = [...state.players];
      newPlayers[action.seat] = { ...player, hand: newHand, faceUp: newFaceUp };

      return { ...state, players: newPlayers };
    }

    case 'DONE_SWAPPING': {
      // Any player saying done triggers playing phase
      // (AI doesn't swap in v1)
      return { ...state, phase: ShitheadPhase.PLAYING };
    }

    case 'PLAY_CARDS': {
      if (state.phase !== ShitheadPhase.PLAYING) return state;
      const player = state.players[action.seat];
      if (player.finished) return state;
      if (state.currentPlayer !== action.seat) return state;

      const cards = action.cardKeys.map(parseCardKey);
      if (cards.length === 0) return state;

      // All cards must be same rank
      const rank = cards[0].rank;
      if (!cards.every(c => c.rank === rank)) return state;

      // Determine play zone
      const zone = getPlayerPlayZone(player, state.drawPile.length === 0);

      let sourceCards;
      if (zone === 'hand') sourceCards = player.hand;
      else if (zone === 'faceUp') sourceCards = player.faceUp;
      else return state; // faceDown uses PLAY_BLIND action

      // Validate cards exist in source
      for (const card of cards) {
        if (!sourceCards.some(c => cardEquals(c, card))) return state;
      }

      // Validate playability
      if (!canPlayCard(cards[0], state.discardPile)) return state;

      // Remove cards from source
      let newHand = [...player.hand];
      let newFaceUp = [...player.faceUp];
      const newFaceDown = [...player.faceDown];

      if (zone === 'hand') {
        for (const card of cards) {
          const idx = newHand.findIndex(c => cardEquals(c, card));
          if (idx !== -1) newHand.splice(idx, 1);
        }
      } else {
        for (const card of cards) {
          const idx = newFaceUp.findIndex(c => cardEquals(c, card));
          if (idx !== -1) newFaceUp.splice(idx, 1);
        }
      }

      // Add to discard pile
      let newDiscardPile = [...state.discardPile, ...cards];
      const newDrawPile = [...state.drawPile];

      // Draw back up to 3 (only from hand zone and while draw pile has cards)
      if (zone === 'hand') {
        while (newHand.length < 3 && newDrawPile.length > 0) {
          newHand.push(newDrawPile.pop()!);
        }
      }

      // Check for burn (10 or 4-of-a-kind)
      const isBurn = cards[0].rank === Rank.TEN || shouldBurnPile(newDiscardPile);
      if (isBurn) {
        newDiscardPile = [];
      }

      // Update player
      const newPlayer: ShitheadPlayer = {
        ...player,
        hand: newHand,
        faceUp: newFaceUp,
        faceDown: newFaceDown,
      };

      // Check if player is done
      let newFinishedCount = state.finishedCount;
      if (newHand.length === 0 && newFaceUp.length === 0 && newFaceDown.length === 0 && newDrawPile.length === 0) {
        newPlayer.finished = true;
        newFinishedCount++;
        newPlayer.finishOrder = newFinishedCount;
      }

      const newPlayers = [...state.players];
      newPlayers[action.seat] = newPlayer;

      // Check for game end (only 1 player left)
      const activePlayers = newPlayers.filter(p => !p.finished);
      if (activePlayers.length <= 1) {
        const shithead = activePlayers.length === 1 ? activePlayers[0].seat : null;
        if (shithead !== null) {
          newPlayers[shithead] = { ...newPlayers[shithead], finished: true, finishOrder: newFinishedCount + 1 };
        }
        return {
          ...state,
          phase: ShitheadPhase.ROUND_END,
          players: newPlayers,
          discardPile: newDiscardPile,
          drawPile: newDrawPile,
          finishedCount: state.numPlayers,
          shitheadSeat: shithead,
          burnAnimation: isBurn,
        };
      }

      // Determine next player
      let nextPlayer: number;
      if (isBurn) {
        // Same player goes again after burn (if not finished)
        nextPlayer = newPlayer.finished
          ? findNextActivePlayer(action.seat, newPlayers, state.numPlayers)
          : action.seat;
      } else {
        nextPlayer = findNextActivePlayer(action.seat, newPlayers, state.numPlayers);
      }

      return {
        ...state,
        players: newPlayers,
        discardPile: newDiscardPile,
        drawPile: newDrawPile,
        currentPlayer: nextPlayer,
        finishedCount: newFinishedCount,
        lastPlayedBy: action.seat,
        burnAnimation: isBurn,
      };
    }

    case 'PLAY_BLIND': {
      if (state.phase !== ShitheadPhase.PLAYING) return state;
      const player = state.players[action.seat];
      if (player.finished || state.currentPlayer !== action.seat) return state;

      const zone = getPlayerPlayZone(player, state.drawPile.length === 0);
      if (zone !== 'faceDown') return state;

      if (action.cardIndex < 0 || action.cardIndex >= player.faceDown.length) return state;

      const card = player.faceDown[action.cardIndex];
      const newFaceDown = [...player.faceDown];
      newFaceDown.splice(action.cardIndex, 1);

      // Check if the card can be played
      if (canPlayCard(card, state.discardPile)) {
        // Play it
        let newDiscardPile = [...state.discardPile, card];
        const isBurn = card.rank === Rank.TEN || shouldBurnPile(newDiscardPile);
        if (isBurn) newDiscardPile = [];

        const newPlayer: ShitheadPlayer = { ...player, faceDown: newFaceDown };

        let newFinishedCount = state.finishedCount;
        if (newPlayer.hand.length === 0 && newPlayer.faceUp.length === 0 && newPlayer.faceDown.length === 0) {
          newPlayer.finished = true;
          newFinishedCount++;
          newPlayer.finishOrder = newFinishedCount;
        }

        const newPlayers = [...state.players];
        newPlayers[action.seat] = newPlayer;

        const activePlayers = newPlayers.filter(p => !p.finished);
        if (activePlayers.length <= 1) {
          const shithead = activePlayers.length === 1 ? activePlayers[0].seat : null;
          if (shithead !== null) {
            newPlayers[shithead] = { ...newPlayers[shithead], finished: true, finishOrder: newFinishedCount + 1 };
          }
          return {
            ...state,
            phase: ShitheadPhase.ROUND_END,
            players: newPlayers,
            discardPile: newDiscardPile,
            drawPile: state.drawPile,
            finishedCount: state.numPlayers,
            shitheadSeat: shithead,
            burnAnimation: isBurn,
          };
        }

        const nextPlayer = isBurn && !newPlayer.finished
          ? action.seat
          : findNextActivePlayer(action.seat, newPlayers, state.numPlayers);

        return {
          ...state,
          players: newPlayers,
          discardPile: newDiscardPile,
          currentPlayer: nextPlayer,
          finishedCount: newFinishedCount,
          lastPlayedBy: action.seat,
          burnAnimation: isBurn,
        };
      } else {
        // Can't play -- pick up pile + the card goes into hand
        const newHand = [...state.discardPile, card];
        const newPlayer: ShitheadPlayer = { ...player, hand: newHand, faceDown: newFaceDown };
        const newPlayers = [...state.players];
        newPlayers[action.seat] = newPlayer;

        const nextPlayer = findNextActivePlayer(action.seat, newPlayers, state.numPlayers);

        return {
          ...state,
          players: newPlayers,
          discardPile: [],
          currentPlayer: nextPlayer,
          burnAnimation: false,
        };
      }
    }

    case 'PICK_UP_PILE': {
      if (state.phase !== ShitheadPhase.PLAYING) return state;
      const player = state.players[action.seat];
      if (player.finished || state.currentPlayer !== action.seat) return state;

      const newHand = [...player.hand, ...state.discardPile];
      const newPlayer: ShitheadPlayer = { ...player, hand: newHand };
      const newPlayers = [...state.players];
      newPlayers[action.seat] = newPlayer;

      const nextPlayer = findNextActivePlayer(action.seat, newPlayers, state.numPlayers);

      return {
        ...state,
        players: newPlayers,
        discardPile: [],
        currentPlayer: nextPlayer,
        burnAnimation: false,
      };
    }

    case 'NEW_GAME': {
      const fresh = createInitialShitheadState(state.settings);
      return shitheadReducer(fresh, { type: 'DEAL', seed: action.seed });
    }

    default:
      return state;
  }
}

function findNextActivePlayer(currentSeat: number, players: ShitheadPlayer[], numPlayers: number): number {
  let next = nextSeatN(currentSeat, numPlayers);
  let attempts = 0;
  while (players[next].finished && attempts < numPlayers) {
    next = nextSeatN(next, numPlayers);
    attempts++;
  }
  return next;
}
