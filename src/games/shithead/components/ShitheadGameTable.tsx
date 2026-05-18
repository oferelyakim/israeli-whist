import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { CardKey } from '../../../types/card';
import { cardKey, parseCardKey } from '../../../types/card';
import type { ShitheadGameState } from '../types';
import { ShitheadPhase } from '../types';
import { Card as CardComponent } from '../../../components/cards/Card';
import { canPlayCard, getPlayerPlayZone } from '../engine/validation';
import './ShitheadGameTable.css';

interface ShitheadGameTableProps {
  gameState: ShitheadGameState;
  humanSeat: number;
  onPlayCards: (cardKeys: CardKey[]) => void;
  onPickUpPile: () => void;
  onPlayBlind: (cardIndex: number) => void;
  onSwapCards: (handCardKey: CardKey, faceUpCardKey: CardKey) => void;
  onDoneSwapping: () => void;
  onNewGame: () => void;
  onEndGame?: () => void;
  onBack: () => void;
  fastForward?: boolean;
  onToggleFastForward?: () => void;
}

export function ShitheadGameTable({
  gameState,
  humanSeat,
  onPlayCards,
  onPickUpPile,
  onPlayBlind,
  onSwapCards,
  onDoneSwapping,
  onNewGame,
  onEndGame,
  onBack,
  fastForward,
  onToggleFastForward,
}: ShitheadGameTableProps) {
  const { t } = useTranslation();
  const [selectedCards, setSelectedCards] = useState<Set<CardKey>>(new Set());
  const [swapHandCard, setSwapHandCard] = useState<CardKey | null>(null);
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);

  const humanPlayer = gameState.players[humanSeat];
  const isHumanTurn = gameState.currentPlayer === humanSeat;
  const isSwapping = gameState.phase === ShitheadPhase.SWAPPING;
  const isPlaying = gameState.phase === ShitheadPhase.PLAYING;
  const isRoundEnd = gameState.phase === ShitheadPhase.ROUND_END;
  const drawPileEmpty = gameState.drawPile.length === 0;

  const playZone = useMemo(
    () => getPlayerPlayZone(humanPlayer, drawPileEmpty),
    [humanPlayer, drawPileEmpty]
  );

  // Opponents (all seats except human)
  const opponents = useMemo(
    () => gameState.players.filter((_, i) => i !== humanSeat),
    [gameState.players, humanSeat]
  );

  // Current player name for turn indicator
  const currentPlayerName = gameState.players[gameState.currentPlayer]?.name ?? '';

  // Cards that can be played from hand/faceUp
  const playableCardKeys = useMemo(() => {
    if (!isHumanTurn || !isPlaying) return new Set<CardKey>();
    const zone = playZone;
    if (zone === 'done' || zone === 'faceDown') return new Set<CardKey>();

    const cards = zone === 'hand' ? humanPlayer.hand : humanPlayer.faceUp;
    const playable = new Set<CardKey>();
    for (const card of cards) {
      if (canPlayCard(card, gameState.discardPile)) {
        playable.add(cardKey(card));
      }
    }
    return playable;
  }, [isHumanTurn, isPlaying, playZone, humanPlayer, gameState.discardPile]);

  // Can play selected cards?
  const canPlaySelected = useMemo(() => {
    if (selectedCards.size === 0) return false;
    // All selected must be same rank
    const keys = Array.from(selectedCards);
    const cards = keys.map(k => parseCardKey(k));
    const rank = cards[0].rank;
    return cards.every(c => c.rank === rank);
  }, [selectedCards]);

  // Toggle card selection (hand or face-up)
  const toggleCardSelection = useCallback((key: CardKey) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Only allow selecting same-rank cards
        if (next.size > 0) {
          const existingCard = parseCardKey(Array.from(next)[0]);
          const newCard = parseCardKey(key);
          if (existingCard.rank !== newCard.rank) {
            // Different rank - start new selection
            return new Set([key]);
          }
        }
        next.add(key);
      }
      return next;
    });
  }, []);

  const handlePlaySelected = useCallback(() => {
    if (selectedCards.size === 0) return;
    onPlayCards(Array.from(selectedCards));
    setSelectedCards(new Set());
  }, [selectedCards, onPlayCards]);

  const handlePickUp = useCallback(() => {
    onPickUpPile();
    setSelectedCards(new Set());
  }, [onPickUpPile]);

  const handleBlindPlay = useCallback((index: number) => {
    onPlayBlind(index);
  }, [onPlayBlind]);

  // Swap phase: tap hand card, then tap face-up card
  const handleSwapHandTap = useCallback((key: CardKey) => {
    setSwapHandCard(prev => prev === key ? null : key);
  }, []);

  const handleSwapFaceUpTap = useCallback((key: CardKey) => {
    if (swapHandCard) {
      onSwapCards(swapHandCard, key);
      setSwapHandCard(null);
    }
  }, [swapHandCard, onSwapCards]);

  const handleDoneSwapping = useCallback(() => {
    setSwapHandCard(null);
    onDoneSwapping();
  }, [onDoneSwapping]);

  // Discard pile top card (last element)
  const discardTop = gameState.discardPile.length > 0
    ? gameState.discardPile[gameState.discardPile.length - 1]
    : null;

  // Render opponent section
  const renderOpponent = (player: typeof gameState.players[0]) => {
    const isActive = gameState.currentPlayer === player.seat && isPlaying;
    const oppZone = getPlayerPlayZone(player, drawPileEmpty);

    return (
      <div
        key={player.seat}
        className={`sh-opponent ${isActive ? 'sh-opponent-active' : ''} ${player.finished ? 'sh-opponent-finished' : ''}`}
      >
        <div className="sh-opponent-name">
          {player.name}
          {player.finished && player.finishOrder > 0 && ` (#${player.finishOrder})`}
        </div>
        <div className="sh-opponent-info">
          {player.finished
            ? 'Finished'
            : oppZone === 'faceDown'
              ? `${player.faceDown.length} blind`
              : oppZone === 'faceUp'
                ? `${player.faceUp.length} face-up`
                : `${player.hand.length} cards`
          }
        </div>
        {/* Show face-up cards */}
        {player.faceUp.length > 0 && (
          <div className="sh-opponent-cards">
            {player.faceUp.map((card, i) => (
              <CardComponent key={i} card={card} small />
            ))}
          </div>
        )}
        {/* Show face-down cards as backs */}
        {player.faceDown.length > 0 && (
          <div className="sh-opponent-cards">
            {player.faceDown.map((card, i) => (
              <CardComponent key={i} card={card} faceDown small />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sh-table">
      {/* Top bar */}
      <div className="sh-top-bar">
        <div className="sh-top-bar-left">
          <button className="sh-btn sh-btn-back" onClick={onBack}>&larr; Back</button>
        </div>
        <div className="sh-top-bar-center">
          Draw: {gameState.drawPile.length} | Pile: {gameState.discardPile.length}
        </div>
      </div>

      {/* Opponents */}
      <div className="sh-opponents">
        {opponents.map(renderOpponent)}
      </div>

      {/* Turn indicator — above the piles */}
      {isPlaying && (
        <div className="sh-turn-indicator">
          {isHumanTurn ? 'Your turn!' : `${currentPlayerName}'s turn`}
        </div>
      )}

      {/* Center: discard + draw piles */}
      <div className="sh-center">
        {/* Discard pile */}
        <div className="sh-pile-area">
          <div className={`sh-pile ${gameState.burnAnimation ? 'sh-burn-flash' : ''}`}>
            {discardTop ? (
              <div className="sh-pile-card">
                <CardComponent card={discardTop} />
              </div>
            ) : (
              <div className="sh-empty-pile">Empty</div>
            )}
            {gameState.discardPile.length > 0 && (
              <span className="sh-pile-count">{gameState.discardPile.length}</span>
            )}
          </div>
          <div className="sh-pile-label">Discard</div>
        </div>

        {/* Draw pile */}
        <div className="sh-pile-area">
          <div className="sh-pile">
            {gameState.drawPile.length > 0 ? (
              <>
                <div className="sh-pile-card">
                  <CardComponent card={gameState.drawPile[0]} faceDown />
                </div>
                <span className="sh-pile-count">{gameState.drawPile.length}</span>
              </>
            ) : (
              <div className="sh-empty-pile">Empty</div>
            )}
          </div>
          <div className="sh-pile-label">Draw</div>
        </div>
      </div>

      {/* Player area */}
      <div className="sh-player-area">
        {/* Swap phase banner */}
        {isSwapping && gameState.currentPlayer === humanSeat && (
          <div className="sh-swap-banner">
            <p>Swap Phase: Tap a hand card, then a face-up card to swap them</p>
            {swapHandCard && (
              <div className="sh-swap-selection">
                <span className="sh-swap-selected-label">Hand card selected</span>
                <span>&rarr; tap a face-up card to swap</span>
              </div>
            )}
            <div className="sh-actions" style={{ marginTop: 8 }}>
              <button className="sh-btn sh-btn-success" onClick={handleDoneSwapping}>
                Ready!
              </button>
            </div>
          </div>
        )}

        {isSwapping && gameState.currentPlayer !== humanSeat && (
          <div className="sh-swap-banner">
            <p>Waiting for others to finish swapping...</p>
          </div>
        )}

        {/* Action buttons — above the table cards */}
        {isPlaying && isHumanTurn && !humanPlayer.finished && playZone !== 'faceDown' && (
          <div className="sh-actions">
            <button
              className="sh-btn sh-btn-primary"
              disabled={!canPlaySelected}
              onClick={handlePlaySelected}
            >
              Play{selectedCards.size > 0 ? ` (${selectedCards.size})` : ''}
            </button>
            <button
              className="sh-btn sh-btn-danger"
              onClick={handlePickUp}
            >
              Pick up pile
            </button>
          </div>
        )}

        {isPlaying && isHumanTurn && playZone === 'faceDown' && (
          <div className="sh-actions">
            <p style={{ fontSize: 13, color: '#ffd700', margin: 0 }}>
              Tap a face-down card to play blind!
            </p>
          </div>
        )}

        <div className="sh-card-rows">
          {/* Face-down cards */}
          {humanPlayer.faceDown.length > 0 && (
            <div className="sh-face-down-row">
              {humanPlayer.faceDown.map((card, i) => (
                <div
                  key={i}
                  className={isHumanTurn && isPlaying && playZone === 'faceDown' ? 'sh-face-down-clickable' : ''}
                  onClick={isHumanTurn && isPlaying && playZone === 'faceDown' ? () => handleBlindPlay(i) : undefined}
                >
                  <CardComponent card={card} faceDown />
                </div>
              ))}
            </div>
          )}

          {/* Face-up cards */}
          {humanPlayer.faceUp.length > 0 && (
            <div className="sh-face-up-row">
              {humanPlayer.faceUp.map((card) => {
                const key = cardKey(card);
                const isPlayable = isHumanTurn && isPlaying && playZone === 'faceUp' && playableCardKeys.has(key);
                const isSelected = selectedCards.has(key);
                const isSwapTarget = isSwapping && gameState.currentPlayer === humanSeat;

                return (
                  <div
                    key={key}
                    className={`${isSelected ? 'sh-card-selected' : ''} ${isPlayable || isSwapTarget ? 'sh-card-clickable' : ''}`}
                    onClick={
                      isSwapTarget
                        ? () => handleSwapFaceUpTap(key)
                        : isPlayable
                          ? () => toggleCardSelection(key)
                          : undefined
                    }
                  >
                    <CardComponent
                      card={card}
                      playable={isPlayable || isSwapTarget}
                      selected={isSelected}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Hand cards */}
          {humanPlayer.hand.length > 0 && (
            <div className="sh-hand-row">
              {humanPlayer.hand.map((card) => {
                const key = cardKey(card);
                const isPlayable = isHumanTurn && isPlaying && playZone === 'hand' && playableCardKeys.has(key);
                const isSelected = selectedCards.has(key);
                const isSwapSource = isSwapping && gameState.currentPlayer === humanSeat;

                return (
                  <div
                    key={key}
                    className={`sh-hand-card ${isSelected ? 'sh-card-selected' : ''} ${isPlayable || isSwapSource ? 'sh-card-clickable' : ''}`}
                    onClick={
                      isSwapSource
                        ? () => handleSwapHandTap(key)
                        : isPlayable
                          ? () => toggleCardSelection(key)
                          : undefined
                    }
                  >
                    <CardComponent
                      card={card}
                      playable={isPlayable || isSwapSource}
                      selected={isSelected || swapHandCard === key}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reshuffle (new game) button */}
      {isPlaying && (
        <button
          className="sh-btn sh-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title="New Game"
        >
          ↻
        </button>
      )}
      {showReshuffleConfirm && (
        <div className="sh-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="sh-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="sh-confirm-text">{t('common.reshuffleTitle')}</p>
            <div className="sh-confirm-buttons" style={{ flexDirection: 'column', gap: '8px' }}>
              <button className="sh-btn sh-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame(); }}>
                {t('common.reshuffleSame')}
              </button>
              <button className="sh-btn sh-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onEndGame?.(); onBack(); }}>
                {t('common.reshuffleMenu')}
              </button>
              <button className="sh-btn" onClick={() => setShowReshuffleConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fast-forward button */}
      {humanPlayer.finished && isPlaying && onToggleFastForward && (
        <button
          className={`sh-btn sh-btn-fast-forward ${fastForward ? 'sh-ff-active' : ''}`}
          onClick={onToggleFastForward}
          title="Fast Forward"
        >
          {'\u23E9'}
        </button>
      )}

      {/* Round end overlay */}
      {isRoundEnd && gameState.shitheadSeat !== null && (
        <div className="sh-round-end">
          <div className="sh-round-end-card">
            <div className="sh-round-end-emoji">
              {gameState.shitheadSeat === humanSeat ? '😱' : '😂'}
            </div>
            <h2 className="sh-round-end-title">Game Over!</h2>
            <p className="sh-round-end-loser">
              {gameState.players[gameState.shitheadSeat].name} is the 💩 Shithead!
            </p>
            <ul className="sh-round-end-order">
              {gameState.players
                .filter(p => p.finishOrder > 0)
                .sort((a, b) => a.finishOrder - b.finishOrder)
                .map(p => (
                  <li key={p.seat} style={{ color: p.seat === humanSeat ? '#ffd700' : '#ccc' }}>
                    #{p.finishOrder} — {p.name}
                  </li>
                ))
              }
              {gameState.shitheadSeat !== null && (
                <li style={{ color: '#ff6b6b', fontWeight: 'bold' }}>
                  💩 — {gameState.players[gameState.shitheadSeat].name}
                </li>
              )}
            </ul>
            <div className="sh-round-end-buttons">
              <button className="sh-btn sh-btn-primary" onClick={onNewGame}>
                Play Again
              </button>
              <button className="sh-btn" onClick={onBack}>
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
