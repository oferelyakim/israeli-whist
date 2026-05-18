import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { CardKey } from '../../../types/card';
import { cardKey } from '../../../types/card';
import type { RummyGameState } from '../types';
import { RummyPhase, TurnStep } from '../types';
import { Card as CardComponent } from '../../../components/cards/Card';
import { isValidMeld, canLayOff } from '../engine/validation';
import './RummyGameTable.css';

interface RummyGameTableProps {
  gameState: RummyGameState;
  humanSeat: number;
  onDrawFromStock: () => void;
  onDrawFromDiscard: () => void;
  onMeldCards: (cardKeys: CardKey[]) => void;
  onLayOff: (cardKey: CardKey, meldId: string) => void;
  onDiscard: (cardKey: CardKey) => void;
  onPassTurn: () => void;
  onNewGame: () => void;
  onBack: () => void;
}

export function RummyGameTable({
  gameState,
  humanSeat,
  onDrawFromStock,
  onDrawFromDiscard,
  onMeldCards,
  onLayOff,
  onDiscard,
  onPassTurn,
  onNewGame,
  onBack,
}: RummyGameTableProps) {
  const { t } = useTranslation();
  const [selectedCards, setSelectedCards] = useState<Set<CardKey>>(new Set());
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);

  const gs = gameState;
  const humanPlayer = gs.players[humanSeat];
  const isHumanTurn = gs.currentPlayer === humanSeat;
  const isPlaying = gs.phase === RummyPhase.PLAYING;
  const isDraw = gs.turnStep === TurnStep.DRAW;
  const isMeld = gs.turnStep === TurnStep.MELD;

  // Opponents (everyone except human)
  const opponents = useMemo(
    () => gs.players.filter((_, i) => i !== humanSeat),
    [gs.players, humanSeat]
  );

  // Check if selected cards form a valid meld
  const selectedCardsList = useMemo(() => {
    return humanPlayer.hand.filter(c => selectedCards.has(cardKey(c)));
  }, [humanPlayer.hand, selectedCards]);

  const canMeldSelected = useMemo(() => {
    if (selectedCardsList.length < 3) return false;
    return isValidMeld(selectedCardsList).valid;
  }, [selectedCardsList]);

  // Check if a single selected card can lay off onto any meld
  const layOffTarget = useMemo(() => {
    if (selectedCardsList.length !== 1) return null;
    const card = selectedCardsList[0];
    for (const meld of gs.melds) {
      if (canLayOff(card, meld)) return meld.id;
    }
    return null;
  }, [selectedCardsList, gs.melds]);

  // Toggle card selection
  const toggleCard = useCallback((key: CardKey) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Meld selected cards
  const handleMeld = useCallback(() => {
    if (!canMeldSelected) return;
    const keys = Array.from(selectedCards);
    onMeldCards(keys);
    setSelectedCards(new Set());
  }, [canMeldSelected, selectedCards, onMeldCards]);

  // Lay off selected card
  const handleLayOff = useCallback(() => {
    if (!layOffTarget || selectedCardsList.length !== 1) return;
    onLayOff(cardKey(selectedCardsList[0]), layOffTarget);
    setSelectedCards(new Set());
  }, [layOffTarget, selectedCardsList, onLayOff]);

  // Discard a card (click to discard when in meld phase, or if only 1 selected)
  const handleDiscard = useCallback((key: CardKey) => {
    if (!isHumanTurn || !isMeld) return;
    onDiscard(key);
    setSelectedCards(new Set());
  }, [isHumanTurn, isMeld, onDiscard]);

  // Current player name
  const currentPlayerName = gs.players[gs.currentPlayer]?.name ?? '';

  // ─── Render opponents ──────────────────────────────────────────

  const renderOpponents = () => (
    <div className="rummy-opponents">
      {opponents.map(p => (
        <div
          key={p.seat}
          className={`rummy-opponent ${gs.currentPlayer === p.seat ? 'rummy-opponent-active' : ''}`}
        >
          <span className="rummy-opponent-name">{p.name}</span>
          <div className="rummy-opponent-cards">
            {p.hand.slice(0, 7).map((card, i) => (
              <CardComponent key={i} card={card} faceDown />
            ))}
          </div>
          <span className="rummy-opponent-count">{p.hand.length} cards</span>
        </div>
      ))}
    </div>
  );

  // ─── Render center piles ───────────────────────────────────────

  const renderCenter = () => {
    const discardTop = gs.discardPile.length > 0
      ? gs.discardPile[gs.discardPile.length - 1]
      : null;

    const canDrawStock = isHumanTurn && isDraw && isPlaying;
    const canDrawDiscard = isHumanTurn && isDraw && isPlaying && discardTop !== null;
    const deckExhausted = gs.drawPile.length === 0 && gs.discardPile.length <= 1;
    const showPass = isHumanTurn && isDraw && isPlaying && deckExhausted;

    return (
      <div className="rummy-center">
        {/* Draw pile */}
        <div className="rummy-pile-area">
          <div
            className={`rummy-pile ${canDrawStock ? 'rummy-pile-clickable rummy-pile-highlight' : ''}`}
            onClick={canDrawStock ? onDrawFromStock : undefined}
          >
            {gs.drawPile.length > 0 ? (
              <>
                <div className="rummy-pile-card">
                  <CardComponent card={gs.drawPile[0]} faceDown />
                </div>
                <span className="rummy-pile-count">{gs.drawPile.length}</span>
              </>
            ) : (
              <div className="rummy-empty-pile">Empty</div>
            )}
          </div>
          <div className="rummy-pile-label">Draw</div>
        </div>

        {/* Discard pile */}
        <div className="rummy-pile-area">
          <div
            className={`rummy-pile ${canDrawDiscard ? 'rummy-pile-clickable rummy-pile-highlight' : ''}`}
            onClick={canDrawDiscard ? onDrawFromDiscard : undefined}
          >
            {discardTop ? (
              <div className="rummy-pile-card">
                <CardComponent card={discardTop} />
              </div>
            ) : (
              <div className="rummy-empty-pile">Empty</div>
            )}
            {gs.discardPile.length > 0 && (
              <span className="rummy-pile-count">{gs.discardPile.length}</span>
            )}
          </div>
          <div className="rummy-pile-label">Discard</div>
        </div>

        {showPass && (
          <div className="rummy-pass-area">
            <div className="rummy-pass-msg">{t('rummy.deckEmpty')}</div>
            <button className="rummy-btn rummy-btn-primary" onClick={onPassTurn}>
              {t('rummy.passTurn')}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Render melds on table ─────────────────────────────────────

  const renderMelds = () => (
    <div className="rummy-melds-area">
      {gs.melds.length > 0 && (
        <>
          <div className="rummy-melds-label">{t('rummy.melds')}</div>
          <div className="rummy-melds-grid">
            {gs.melds.map(meld => {
              const isTarget = layOffTarget === meld.id && isHumanTurn && isMeld;
              return (
                <div
                  key={meld.id}
                  className={`rummy-meld ${isTarget ? 'rummy-meld-highlight' : ''}`}
                  onClick={isTarget ? handleLayOff : undefined}
                >
                  {meld.cards.map(card => (
                    <CardComponent key={cardKey(card)} card={card} />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ─── Render player hand + actions ──────────────────────────────

  const renderPlayerArea = () => (
    <div className="rummy-player-area">
      {/* Action buttons */}
      {isPlaying && isHumanTurn && isMeld && (
        <div className="rummy-actions">
          <button
            className="rummy-btn rummy-btn-primary"
            disabled={!canMeldSelected}
            onClick={handleMeld}
          >
            {t('rummy.meld')} {selectedCards.size >= 3 ? `(${selectedCards.size})` : ''}
          </button>
          {layOffTarget && (
            <button
              className="rummy-btn rummy-btn-primary"
              onClick={handleLayOff}
            >
              {t('rummy.layOff')}
            </button>
          )}
          {selectedCards.size === 1 && (
            <button
              className="rummy-btn rummy-btn-danger"
              onClick={() => handleDiscard(Array.from(selectedCards)[0])}
            >
              {t('rummy.discard')}
            </button>
          )}
        </div>
      )}

      {/* Hand cards */}
      <div className="rummy-hand-row">
        {humanPlayer.hand.map(card => {
          const key = cardKey(card);
          const isSelected = selectedCards.has(key);
          const canInteract = isHumanTurn && isPlaying && isMeld;

          return (
            <div
              key={key}
              className={`rummy-hand-card ${isSelected ? 'rummy-card-selected' : ''} ${canInteract ? 'rummy-card-playable' : ''}`}
              onClick={canInteract ? () => toggleCard(key) : undefined}
              onDoubleClick={canInteract ? () => handleDiscard(key) : undefined}
            >
              <CardComponent card={card} />
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Round end overlay ─────────────────────────────────────────

  const renderRoundEnd = () => {
    if (gs.phase !== RummyPhase.ROUND_END || gs.winner === null) return null;
    const winner = gs.players[gs.winner];
    const isHumanWinner = gs.winner === humanSeat;

    return (
      <div className="rummy-round-end">
        <div className="rummy-round-end-card">
          <div className="rummy-round-end-emoji">{isHumanWinner ? '\u{1F3C6}' : '\u{1F614}'}</div>
          <h2 className="rummy-round-end-title">
            {t('rummy.winner', { name: winner.name })}
          </h2>
          <p className="rummy-round-end-subtitle">
            {t('rummy.moves', { n: String(gs.moveCount) })}
          </p>
          <div className="rummy-round-end-buttons">
            <button className="rummy-btn rummy-btn-primary" onClick={onNewGame}>
              {t('rummy.playAgain')}
            </button>
            <button className="rummy-btn" onClick={onBack}>
              {t('common.backToMenu')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────

  return (
    <div className="rummy-table">
      {/* Top bar */}
      <div className="rummy-top-bar">
        <button className="rummy-btn" onClick={onBack}>{'\u2190'} {t('common.backToMenu')}</button>
        <div className="rummy-top-bar-center">
          {t('rummy.moves', { n: String(gs.moveCount) })}
        </div>
      </div>

      {/* Opponents */}
      {renderOpponents()}

      {/* Turn indicator */}
      {isPlaying && (
        <div className="rummy-turn-indicator">
          {isHumanTurn
            ? (isDraw ? t('rummy.drawPhase') : t('rummy.meldPhase'))
            : `${currentPlayerName}'s turn`
          }
        </div>
      )}

      {/* Center piles */}
      {renderCenter()}

      {/* Melds on table */}
      {renderMelds()}

      {/* Player area */}
      {renderPlayerArea()}

      {/* Reshuffle button */}
      {isPlaying && (
        <button
          className="rummy-btn rummy-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleConfirm')}
        >
          {'\u21BB'}
        </button>
      )}
      {showReshuffleConfirm && (
        <div className="rummy-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="rummy-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="rummy-confirm-text">{t('common.reshuffleConfirm')}</p>
            <div className="rummy-confirm-buttons">
              <button className="rummy-btn rummy-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame(); }}>
                {t('common.yes')}
              </button>
              <button className="rummy-btn" onClick={() => setShowReshuffleConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round end */}
      {renderRoundEnd()}
    </div>
  );
}
