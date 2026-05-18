// src/types/game-common.ts
function nextSeatN(seat, numPlayers) {
  return (seat + 1) % numPlayers;
}

// src/types/card.ts
var STANDARD_SUITS = ["CLUBS" /* CLUBS */, "DIAMONDS" /* DIAMONDS */, "HEARTS" /* HEARTS */, "SPADES" /* SPADES */];
function cardKey(card2) {
  return `${card2.suit}_${card2.rank}`;
}

// src/utils/random.ts
function createRNG(seed) {
  let s = seed | 0;
  return function() {
    s = s + 1831565813 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/games/israeli-rummy/engine/deck.ts
var RANKS = [
  14 /* ACE */,
  2 /* TWO */,
  3 /* THREE */,
  4 /* FOUR */,
  5 /* FIVE */,
  6 /* SIX */,
  7 /* SEVEN */,
  8 /* EIGHT */,
  9 /* NINE */,
  10 /* TEN */,
  11 /* JACK */,
  12 /* QUEEN */,
  13 /* KING */
];
function createDoubleDeckWithJokers() {
  const deck = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of STANDARD_SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  deck.push({ suit: "JOKER_RED" /* JOKER_RED */, rank: 0 /* JOKER */ });
  deck.push({ suit: "JOKER_BLACK" /* JOKER_BLACK */, rank: 0 /* JOKER */ });
  return deck;
}
function shuffleDeck(deck, seed) {
  const rng = createRNG(seed);
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function dealIsraeliRummy(numPlayers, seed) {
  const deck = shuffleDeck(createDoubleDeckWithJokers(), seed);
  const cardsPerPlayer = 14;
  const players = [];
  let idx = 0;
  for (let p = 0; p < numPlayers; p++) {
    players.push({ hand: deck.slice(idx, idx + cardsPerPlayer) });
    idx += cardsPerPlayer;
  }
  const drawPile = deck.slice(idx);
  return { players, drawPile };
}

// src/games/israeli-rummy/engine/validation.ts
function isJokerCard(card2) {
  return card2.suit === "JOKER_RED" /* JOKER_RED */ || card2.suit === "JOKER_BLACK" /* JOKER_BLACK */;
}
function cardPointValue(card2) {
  if (isJokerCard(card2)) return 0;
  if (card2.rank === 14 /* ACE */) return 1;
  return card2.rank;
}
function rankOrder(rank) {
  if (rank === 14 /* ACE */) return 1;
  return rank;
}
function isValidSet(cards) {
  if (cards.length < 3 || cards.length > 4) return false;
  const jokers = cards.filter((c) => isJokerCard(c));
  const nonJokers = cards.filter((c) => !isJokerCard(c));
  if (nonJokers.length === 0) return false;
  const rank = nonJokers[0].rank;
  if (!nonJokers.every((c) => c.rank === rank)) return false;
  const suits = nonJokers.map((c) => c.suit);
  if (new Set(suits).size !== suits.length) return false;
  if (nonJokers.length + jokers.length > 4) return false;
  return true;
}
function isValidRun(cards) {
  if (cards.length < 3) return false;
  const nonJokers = cards.filter((c) => !isJokerCard(c));
  if (nonJokers.length === 0) return false;
  const suit = nonJokers[0].suit;
  if (!nonJokers.every((c) => c.suit === suit)) return false;
  if (STANDARD_SUITS.indexOf(suit) === -1) return false;
  let base = null;
  for (let i = 0; i < cards.length; i++) {
    if (isJokerCard(cards[i])) continue;
    const candidate = rankOrder(cards[i].rank) - i;
    if (base === null) base = candidate;
    else if (base !== candidate) return false;
  }
  if (base === null) return false;
  if (base < 1 || base + cards.length - 1 > 13) return false;
  return true;
}
function isValidMeld(cards) {
  if (isValidSet(cards)) return { valid: true, type: "set" };
  if (isValidRun(cards)) return { valid: true, type: "run" };
  return { valid: false, type: null };
}
function allMeldsValid(melds) {
  return melds.every((m) => isValidMeld(m.cards).valid);
}
function meldPointValue(cards) {
  const { type } = isValidMeld(cards);
  if (!type) return 0;
  if (type === "set") {
    const nonJokers = cards.filter((c) => !isJokerCard(c));
    if (nonJokers.length === 0) return 0;
    const rankVal = cardPointValue(nonJokers[0]);
    return rankVal * cards.length;
  }
  let base = null;
  for (let i = 0; i < cards.length; i++) {
    if (isJokerCard(cards[i])) continue;
    base = rankOrder(cards[i].rank) - i;
    break;
  }
  if (base === null) return 0;
  let total = 0;
  for (let i = 0; i < cards.length; i++) {
    total += base + i;
  }
  return total;
}
function meetsFirstMeldRequirement(melds, threshold) {
  if (melds.length === 0) return false;
  let totalPoints = 0;
  let hasRun = false;
  for (const m of melds) {
    const { valid, type } = isValidMeld(m);
    if (!valid) return false;
    totalPoints += meldPointValue(m);
    if (type === "run") hasRun = true;
  }
  return totalPoints >= threshold && hasRun;
}
function sortMeldCards(cards) {
  if (cards.length === 0) return cards;
  const jokers = cards.filter((c) => isJokerCard(c));
  const nonJokers = cards.filter((c) => !isJokerCard(c));
  if (nonJokers.length === 0) return cards;
  const { type } = isValidMeld(cards);
  if (type === "set") {
    const so = { CLUBS: 0, DIAMONDS: 1, HEARTS: 2, SPADES: 3 };
    const sorted = [...nonJokers].sort((a, b) => (so[a.suit] ?? 0) - (so[b.suit] ?? 0));
    return [...sorted, ...jokers];
  }
  const allSameSuit = nonJokers.every((c) => c.suit === nonJokers[0].suit);
  if (type === "run" || allSameSuit) {
    const sorted = [...nonJokers].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
    const result = [];
    let jokerIdx = 0;
    for (let i = 0; i < sorted.length; i++) {
      result.push(sorted[i]);
      if (i < sorted.length - 1) {
        const gap = rankOrder(sorted[i + 1].rank) - rankOrder(sorted[i].rank) - 1;
        for (let g = 0; g < gap && jokerIdx < jokers.length; g++) {
          result.push(jokers[jokerIdx++]);
        }
      }
    }
    const jokersLeft = jokers.length - jokerIdx;
    const minRank = result.length > 0 && !isJokerCard(result[0]) ? rankOrder(result[0].rank) : 1;
    const maxRank = result.length > 0 && !isJokerCard(result[result.length - 1]) ? rankOrder(result[result.length - 1].rank) : 13;
    const highRoom = Math.max(0, 13 - maxRank);
    const lowRoom = Math.max(0, minRank - 1);
    const extendHigh = Math.min(jokersLeft, highRoom);
    let extendLow = jokersLeft - extendHigh;
    if (extendLow > lowRoom) {
      extendLow = lowRoom;
    }
    for (let g = 0; g < extendLow && jokerIdx < jokers.length; g++) {
      result.unshift(jokers[jokerIdx++]);
    }
    for (let g = 0; g < extendHigh && jokerIdx < jokers.length; g++) {
      result.push(jokers[jokerIdx++]);
    }
    while (jokerIdx < jokers.length) {
      result.push(jokers[jokerIdx++]);
    }
    return result;
  }
  nonJokers.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  return [...nonJokers, ...jokers];
}
var SUIT_ORDER = {
  CLUBS: 0,
  DIAMONDS: 1,
  HEARTS: 2,
  SPADES: 3,
  JOKER_RED: 4,
  JOKER_BLACK: 5
};
function extractSets(hand) {
  const jokers = hand.filter((c) => isJokerCard(c));
  const nonJokers = hand.filter((c) => !isJokerCard(c));
  const byRank = /* @__PURE__ */ new Map();
  for (const c of nonJokers) {
    const group = byRank.get(c.rank) ?? [];
    group.push(c);
    byRank.set(c.rank, group);
  }
  const setCards = [];
  const remaining = [];
  for (const [_rank, cards] of byRank) {
    const bySuit = /* @__PURE__ */ new Map();
    const extras = [];
    for (const c of cards) {
      if (!bySuit.has(c.suit)) {
        bySuit.set(c.suit, c);
      } else {
        extras.push(c);
      }
    }
    const uniqueSuitCards = Array.from(bySuit.values());
    if (uniqueSuitCards.length >= 3) {
      setCards.push(...uniqueSuitCards);
      remaining.push(...extras);
    } else {
      remaining.push(...cards);
    }
  }
  setCards.sort((a, b) => {
    const rankDiff = rankOrder(a.rank) - rankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
  });
  return [setCards, [...remaining, ...jokers]];
}
function sortBySuit(hand) {
  const [setCards, remaining] = extractSets(hand);
  remaining.sort((a, b) => {
    if (isJokerCard(a) && !isJokerCard(b)) return 1;
    if (!isJokerCard(a) && isJokerCard(b)) return -1;
    if (isJokerCard(a) && isJokerCard(b)) return 0;
    const suitDiff = (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return rankOrder(a.rank) - rankOrder(b.rank);
  });
  return [...setCards, ...remaining];
}

// src/games/israeli-rummy/engine/game-reducer.ts
function lowestPointsWinner(state) {
  let bestSeat = 0;
  let bestScore = Infinity;
  for (let i = 0; i < state.players.length; i++) {
    const total = state.players[i].hand.reduce((s, c) => s + cardPointValue(c), 0);
    if (total < bestScore) {
      bestScore = total;
      bestSeat = i;
    }
  }
  return bestSeat;
}
var meldCounter = 0;
function nextMeldId() {
  return `irummy_meld_${++meldCounter}`;
}
function createInitialIsraeliRummyState(settings) {
  return {
    gameId: `irummy_${Date.now()}`,
    settings,
    phase: "DEALING" /* DEALING */,
    players: settings.playerNames.map((name, i) => ({
      seat: i,
      name,
      type: settings.playerTypes[i],
      hand: [],
      hasMetFirstMeld: false,
      isConnected: true
    })),
    drawPile: [],
    melds: [],
    currentPlayer: 0,
    turnAction: "CHOOSE" /* CHOOSE */,
    numPlayers: settings.numPlayers,
    winner: null,
    moveCount: 0,
    firstMeldThreshold: 30,
    boardSnapshot: null,
    consecutivePasses: 0
  };
}
function israeliRummyReducer(state, action) {
  const s = state;
  switch (action.type) {
    case "DEAL": {
      const { players: dealt, drawPile } = dealIsraeliRummy(s.numPlayers, action.seed);
      const newPlayers = s.players.map((p, i) => ({
        ...p,
        hand: sortBySuit(dealt[i].hand),
        hasMetFirstMeld: false
      }));
      return {
        ...s,
        phase: "PLAYING" /* PLAYING */,
        players: newPlayers,
        drawPile,
        currentPlayer: 0,
        turnAction: "CHOOSE" /* CHOOSE */,
        melds: [],
        winner: null,
        moveCount: 0,
        boardSnapshot: null,
        consecutivePasses: 0
      };
    }
    case "DRAW_CARD": {
      if (s.phase !== "PLAYING" /* PLAYING */) return s;
      if (s.turnAction !== "CHOOSE" /* CHOOSE */) return s;
      if (s.drawPile.length === 0) return s;
      const drawnCard = s.drawPile[s.drawPile.length - 1];
      const newDrawPile = s.drawPile.slice(0, -1);
      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortBySuit([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        players: newPlayers,
        drawPile: newDrawPile,
        currentPlayer: nextPlayer,
        turnAction: "CHOOSE" /* CHOOSE */,
        moveCount: s.moveCount + 1,
        consecutivePasses: s.consecutivePasses + 1
      };
    }
    case "START_REARRANGE": {
      if (s.phase !== "PLAYING" /* PLAYING */) return s;
      if (s.turnAction !== "CHOOSE" /* CHOOSE */) return s;
      const player = s.players[s.currentPlayer];
      return {
        ...s,
        turnAction: "REARRANGING" /* REARRANGING */,
        boardSnapshot: {
          melds: s.melds.map((m) => ({ ...m, cards: [...m.cards] })),
          hand: [...player.hand]
        }
      };
    }
    case "COMMIT_MELDS": {
      if (s.phase !== "PLAYING" /* PLAYING */) return s;
      if (s.turnAction !== "REARRANGING" /* REARRANGING */) return s;
      if (!s.boardSnapshot) return s;
      const proposedMelds = action.melds;
      const proposedHand2 = action.hand;
      if (!allMeldsValid(proposedMelds)) return s;
      const snapshotTableCards = collectAllCards(s.boardSnapshot.melds);
      const proposedTableCards = collectAllCards(proposedMelds);
      if (!allCardsPresent(snapshotTableCards, proposedTableCards)) return s;
      const snapshotHandCards = s.boardSnapshot.hand;
      const totalBefore = [...snapshotTableCards, ...snapshotHandCards];
      const totalAfter = [...proposedTableCards, ...proposedHand2];
      if (!cardMultisetsEqual(totalBefore, totalAfter)) return s;
      const player = s.players[s.currentPlayer];
      if (!player.hasMetFirstMeld) {
        const newTableCards = getNewTableCards(snapshotTableCards, proposedTableCards);
        if (newTableCards.length === 0) return s;
        if (!snapshotMeldsPreserved(s.boardSnapshot.melds, proposedMelds)) return s;
        const snapshotMeldIds = new Set(s.boardSnapshot.melds.map((m) => m.id));
        const newMeldCards = proposedMelds.filter((m) => !snapshotMeldIds.has(m.id)).map((m) => m.cards);
        if (!meetsFirstMeldRequirement(newMeldCards, s.firstMeldThreshold)) return s;
      }
      const finalMelds = proposedMelds.map((m) => ({
        ...m,
        id: m.id || nextMeldId(),
        cards: sortMeldCards(m.cards)
      }));
      const cardsPlacedFromHand = snapshotHandCards.length - proposedHand2.length;
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = {
        ...player,
        hand: sortBySuit(proposedHand2),
        hasMetFirstMeld: player.hasMetFirstMeld || cardsPlacedFromHand > 0
      };
      if (proposedHand2.length === 0) {
        return {
          ...s,
          players: newPlayers,
          melds: finalMelds,
          phase: "ROUND_END" /* ROUND_END */,
          winner: s.currentPlayer,
          turnAction: "CHOOSE" /* CHOOSE */,
          boardSnapshot: null,
          moveCount: s.moveCount + 1,
          consecutivePasses: 0
        };
      }
      const placedFromHand = cardsPlacedFromHand > 0;
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        players: newPlayers,
        melds: finalMelds,
        currentPlayer: nextPlayer,
        turnAction: "CHOOSE" /* CHOOSE */,
        boardSnapshot: null,
        moveCount: s.moveCount + 1,
        consecutivePasses: placedFromHand ? 0 : s.consecutivePasses + 1
      };
    }
    case "REVERT_REARRANGE": {
      if (s.phase !== "PLAYING" /* PLAYING */) return s;
      if (s.turnAction !== "REARRANGING" /* REARRANGING */) return s;
      if (!s.boardSnapshot) return s;
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = {
        ...s.players[s.currentPlayer],
        hand: [...s.boardSnapshot.hand]
      };
      return {
        ...s,
        players: newPlayers,
        melds: s.boardSnapshot.melds.map((m) => ({ ...m, cards: [...m.cards] })),
        turnAction: "CHOOSE" /* CHOOSE */,
        boardSnapshot: null
      };
    }
    case "PASS_TURN": {
      if (s.phase !== "PLAYING" /* PLAYING */) return s;
      if (s.turnAction !== "CHOOSE" /* CHOOSE */) return s;
      const passes = s.consecutivePasses + 1;
      if (s.drawPile.length === 0 && passes >= s.numPlayers * 2) {
        return {
          ...s,
          phase: "ROUND_END" /* ROUND_END */,
          winner: lowestPointsWinner(s),
          turnAction: "CHOOSE" /* CHOOSE */,
          moveCount: s.moveCount + 1,
          consecutivePasses: passes
        };
      }
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        currentPlayer: nextPlayer,
        turnAction: "CHOOSE" /* CHOOSE */,
        moveCount: s.moveCount + 1,
        consecutivePasses: passes
      };
    }
    case "NEW_GAME": {
      meldCounter = 0;
      const initial = createInitialIsraeliRummyState(s.settings);
      return israeliRummyReducer(initial, { type: "DEAL", seed: action.seed });
    }
    default:
      return s;
  }
}
function collectAllCards(melds) {
  const cards = [];
  for (const m of melds) {
    cards.push(...m.cards);
  }
  return cards;
}
function allCardsPresent(required, available) {
  const counts = /* @__PURE__ */ new Map();
  for (const c of available) {
    const key = cardKey(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of required) {
    const key = cardKey(c);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }
  return true;
}
function cardMultisetsEqual(a, b) {
  if (a.length !== b.length) return false;
  const counts = /* @__PURE__ */ new Map();
  for (const c of a) {
    const key = cardKey(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of b) {
    const key = cardKey(c);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }
  return true;
}
function snapshotMeldsPreserved(snapshotMelds, proposedMelds) {
  for (const snapMeld of snapshotMelds) {
    const proposed = proposedMelds.find((m) => m.id === snapMeld.id);
    if (!proposed) return false;
    if (!cardMultisetsEqual(snapMeld.cards, proposed.cards)) return false;
  }
  return true;
}
function getNewTableCards(snapshotCards, proposedCards) {
  const remaining = /* @__PURE__ */ new Map();
  for (const c of snapshotCards) {
    const key = cardKey(c);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const newCards = [];
  for (const c of proposedCards) {
    const key = cardKey(c);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      newCards.push(c);
    }
  }
  return newCards;
}

// scripts/test-first-meld.mts
function card(suit, rank) {
  return { suit, rank, isJoker: false };
}
var existingMeld = {
  id: "irummy_meld_existing_1",
  cards: [card("HEARTS", 5), card("CLUBS", 5), card("SPADES", 5)],
  type: "set"
};
var handBefore = [
  card("HEARTS", 3),
  card("HEARTS", 4),
  card("HEARTS", 5),
  // collides with the 5♥ already on the table
  card("CLUBS", 10),
  card("HEARTS", 10),
  card("SPADES", 10),
  card("DIAMONDS", 2),
  // a couple of leftover hand tiles
  card("DIAMONDS", 7)
];
var newRun = {
  id: "new_run_xyz",
  cards: [card("HEARTS", 3), card("HEARTS", 4), card("HEARTS", 5)],
  type: "run"
};
var newSet = {
  id: "new_set_xyz",
  cards: [card("CLUBS", 10), card("HEARTS", 10), card("SPADES", 10)],
  type: "set"
};
var baseState = {
  ...createInitialIsraeliRummyState({
    gameType: "ISRAELI_RUMMY" /* ISRAELI_RUMMY */,
    numPlayers: 2,
    playerNames: ["Player", "Bot"],
    playerTypes: ["HUMAN" /* HUMAN */, "AI" /* AI */]
  }),
  phase: "PLAYING" /* PLAYING */,
  turnAction: "REARRANGING" /* REARRANGING */,
  melds: [existingMeld],
  players: [
    {
      seat: 0,
      name: "Player",
      type: "HUMAN" /* HUMAN */,
      hand: handBefore,
      hasMetFirstMeld: false,
      isConnected: true
    },
    {
      seat: 1,
      name: "Bot",
      type: "AI" /* AI */,
      hand: [],
      hasMetFirstMeld: true,
      isConnected: true
    }
  ],
  currentPlayer: 0,
  boardSnapshot: {
    melds: [{ ...existingMeld, cards: [...existingMeld.cards] }],
    hand: [...handBefore]
  },
  drawPile: [card("DIAMONDS", 11)]
};
var proposedHand = [card("DIAMONDS", 2), card("DIAMONDS", 7)];
var next = israeliRummyReducer(baseState, {
  type: "COMMIT_MELDS",
  melds: [existingMeld, newRun, newSet],
  hand: proposedHand
});
var failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}
assert(next !== baseState, "reducer accepted the commit (returned a new state)");
assert(next.melds.length === 3, `melds length should be 3 (was ${next.melds.length})`);
assert(next.players[0].hasMetFirstMeld === true, "player has now met first meld");
assert(next.players[0].hand.length === 2, `player hand should have 2 leftover tiles (was ${next.players[0].hand.length})`);
assert(next.currentPlayer === 1, "turn advanced to next player");
var cheatNewRun = {
  id: "new_cheat",
  // Uses 5♣ (which is in the existing meld) — should be rejected
  cards: [card("CLUBS", 3), card("CLUBS", 4), card("CLUBS", 5)],
  type: "run"
};
var tamperedExisting = {
  ...existingMeld,
  cards: [card("HEARTS", 5), card("SPADES", 5)]
  // 5♣ removed
};
var cheatHand = handBefore.filter(
  (c) => !(c.suit === "HEARTS" && c.rank === 3) && !(c.suit === "HEARTS" && c.rank === 4) && !(c.suit === "HEARTS" && c.rank === 5)
);
cheatHand.push(card("CLUBS", 3), card("CLUBS", 4));
var cheatBase = {
  ...baseState,
  players: [
    { ...baseState.players[0], hand: [
      card("CLUBS", 3),
      card("CLUBS", 4),
      card("DIAMONDS", 2),
      card("DIAMONDS", 7)
    ] },
    baseState.players[1]
  ],
  boardSnapshot: {
    melds: [{ ...existingMeld, cards: [...existingMeld.cards] }],
    hand: [card("CLUBS", 3), card("CLUBS", 4), card("DIAMONDS", 2), card("DIAMONDS", 7)]
  }
};
var cheatResult = israeliRummyReducer(cheatBase, {
  type: "COMMIT_MELDS",
  melds: [tamperedExisting, cheatNewRun],
  hand: [card("DIAMONDS", 2), card("DIAMONDS", 7)]
});
assert(cheatResult === cheatBase, "reducer rejects rearranging an existing meld during first turn");
if (failures > 0) {
  console.error(`
${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed.");
