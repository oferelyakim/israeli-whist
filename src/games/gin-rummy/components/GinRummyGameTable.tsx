import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { CardKey } from '../../../types/card';
import { cardKey } from '../../../types/card';
import type { GinRummyGameState } from '../types';
import { GinRummyPhase, TurnStep } from '../types';
import { Card as CardComponent } from '../../../components/cards/Card';
import { findBestMelds, deadwoodValue, canKnock, isGin, isValidSet, isValidRun } from '../engine/validation';
import './GinRummyGameTable.css';

interface GinRummyGameTableProps {
  gameState: GinRummyGameState;
  humanSeat: number;
  onDrawFromStock: () => void;
  onDrawFromDiscard: () => void;
  onDiscard: (cardKey: CardKey, knock?: boolean) => void;
  onLayOffOnKnock: (cardKey: CardKey, meldIndex: number) => void;
  onDoneLayingOff: () => void;
  onNewGame: () => void;
  onBack: () => void;
}

export function GinRummyGameTable({
  gameState,
  humanSeat,
  onDrawFromStock,
  onDrawFromDiscard,
  onDiscard,
  onLayOffOnKnock,
  onDoneLayingOff,
  onNewGame,
  onBack,
}: GinRummyGameTableProps) {
  const { t } = useTranslation();
  const [selectedCard, setSelectedCard] = useState<CardKey | null>(null);
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);

  const gs = gameState;
  const humanPlayer = gs.players[humanSeat];
  const opponentSeat = humanSeat === 0 ? 1 : 0;
  const opponent = gs.players[opponentSeat];
  const isHumanTurn = gs.currentPlayer === humanSeat;
  const isPlaying = gs.phase === GinRummyPhase.PLAYING;
  const isDraw = gs.turnStep === TurnStep.DRAW;
  const isDiscard = gs.turnStep === TurnStep.DISCARD;

  // Calculate human deadwood
  const humanDeadwoodInfo = useMemo(() => {
    if (gs.phase !== GinRummyPhase.PLAYING) return null;
    return findBestMelds(humanPlayer.hand);
  }, [humanPlayer.hand, gs.phase]);

  const humanDWValue = humanDeadwoodInfo ? deadwoodValue(humanDeadwoodInfo.deadwood) : 0;

  // Check if human can knock/gin after discarding selected card
  const canKnockAfterDiscard = useMemo(() => {
    if (!selectedCard || !isHumanTurn || !isDiscard) return false;
    // Can't discard card just drawn from discard
    if (gs.lastDrawnFromDiscard && gs.lastDrawnCard === selectedCard) return false;
    const remaining = humanPlayer.hand.filter(c => cardKey(c) !== selectedCard);
    return canKnock(remaining);
  }, [selectedCard, isHumanTurn, isDiscard, humanPlayer.hand, gs.lastDrawnFromDiscard, gs.lastDrawnCard]);

  const canGinAfterDiscard = useMemo(() => {
    if (!selectedCard || !isHumanTurn || !isDiscard) return false;
    if (gs.lastDrawnFromDiscard && gs.lastDrawnCard === selectedCard) return false;
    const remaining = humanPlayer.hand.filter(c => cardKey(c) !== selectedCard);
    return isGin(remaining);
  }, [selectedCard, isHumanTurn, isDiscard, humanPlayer.hand, gs.lastDrawnFromDiscard, gs.lastDrawnCard]);

  // Check which knocker melds a selected card can lay off onto (LAYING_OFF phase)
  const layOffTargets = useMemo(() => {
    if (gs.phase !== GinRummyPhase.LAYING_OFF || !isHumanTurn || !selectedCard) return [];
    if (gs.knocker === null) return [];
    const knockerPlayer = gs.players[gs.knocker];
    const card = humanPlayer.hand.find(c => cardKey(c) === selectedCard);
    if (!card) return [];

    const targets: number[] = [];
    for (let i = 0; i < knockerPlayer.melds.length; i++) {
      const meld = knockerPlayer.melds[i];
      const extended = [...meld.cards, card];
      if (isValidSet(extended) || isValidRun(extended)) {
        targets.push(i);
      }
    }
    return targets;
  }, [gs.phase, gs.knocker, gs.players, isHumanTurn, selectedCard, humanPlayer.hand]);

  // Toggle card selection
  const toggleCard = useCallback((key: CardKey) => {
    setSelectedCard(prev => prev === key ? null : key);
  }, []);

  // Handle discard
  const handleDiscard = useCallback(() => {
    if (!selectedCard || !isHumanTurn || !isDiscard) return;
    // Can't discard card just drawn from discard
    if (gs.lastDrawnFromDiscard && gs.lastDrawnCard === selectedCard) return;
    onDiscard(selectedCard);
    setSelectedCard(null);
  }, [selectedCard, isHumanTurn, isDiscard, gs.lastDrawnFromDiscard, gs.lastDrawnCard, onDiscard]);

  // Handle knock
  const handleKnock = useCallback(() => {
    if (!selectedCard || !canKnockAfterDiscard) return;
    onDiscard(selectedCard, true);
    setSelectedCard(null);
  }, [selectedCard, canKnockAfterDiscard, onDiscard]);

  // Handle lay off
  const handleLayOff = useCallback((meldIndex: number) => {
    if (!selectedCard) return;
    onLayOffOnKnock(selectedCard, meldIndex);
    setSelectedCard(null);
  }, [selectedCard, onLayOffOnKnock]);

  // Current player name
  const currentPlayerName = gs.players[gs.currentPlayer]?.name ?? '';

  // ─── Render opponent ───────────────────────────────────────────

  const renderOpponent = () => {
    const isActive = gs.currentPlayer === opponentSeat;
    const showCards = gs.phase === GinRummyPhase.ROUND_END || gs.phase === GinRummyPhase.LAYING_OFF;

    return (
      <div className={`ginrummy-opponent ${isActive ? 'ginrummy-opponent-active' : ''}`}>
        <span className="ginrummy-opponent-name">{opponent.name}</span>
        <div className="ginrummy-opponent-cards">
          {opponent.hand.slice(0, 10).map((card, i) => (
            <CardComponent key={i} card={card} faceDown={!showCards} />
          ))}
        </div>
        <span className="ginrummy-opponent-count">{opponent.hand.length} cards</span>
      </div>
    );
  };

  // ─── Render center piles ────────────────────────────────────────

  const renderCenter = () => {
    const discardTop = gs.discardPile.length > 0
      ? gs.discardPile[gs.discardPile.length - 1]
      : null;

    const canDrawStock = isHumanTurn && isDraw && isPlaying;
    const canDrawDiscard = isHumanTurn && isDraw && isPlaying && discardTop !== null;

    return (
      <div className="ginrummy-center">
        {/* Draw pile */}
        <div className="ginrummy-pile-area">
          <div
            className={`ginrummy-pile ${canDrawStock ? 'ginrummy-pile-clickable ginrummy-pile-highlight' : ''}`}
            onClick={canDrawStock ? onDrawFromStock : undefined}
          >
            {gs.drawPile.length > 0 ? (
              <>
                <div className="ginrummy-pile-card">
                  <CardComponent card={gs.drawPile[0]} faceDown />
                </div>
                <span className="ginrummy-pile-count">{gs.drawPile.length}</span>
              </>
            ) : (
              <div className="ginrummy-empty-pile">Empty</div>
            )}
          </div>
          <div className="ginrummy-pile-label">Draw</div>
        </div>

        {/* Discard pile */}
        <div className="ginrummy-pile-area">
          <div
            className={`ginrummy-pile ${canDrawDiscard ? 'ginrummy-pile-clickable ginrummy-pile-highlight' : ''}`}
            onClick={canDrawDiscard ? onDrawFromDiscard : undefined}
          >
            {discardTop ? (
              <div className="ginrummy-pile-card">
                <CardComponent card={discardTop} />
              </div>
            ) : (
              <div className="ginrummy-empty-pile">Empty</div>
            )}
            {gs.discardPile.length > 0 && (
              <span className="ginrummy-pile-count">{gs.discardPile.length}</span>
            )}
          </div>
          <div className="ginrummy-pile-label">Discard</div>
        </div>
      </div>
    );
  };

  // ─── Render knock reveal / laying off ─────────────────────────

  const renderKnockReveal = () => {
    if (gs.phase !== GinRummyPhase.LAYING_OFF || gs.knocker === null) return null;

    const knockerPlayer = gs.players[gs.knocker];
    const isHumanKnocker = gs.knocker === humanSeat;

    return (
      <div className="ginrummy-knock-reveal">
        <div className="ginrummy-knock-section">
          <div className="ginrummy-knock-section-title">
            {knockerPlayer.name}{isHumanKnocker ? '' : "'s"} melds:
          </div>
          <div className="ginrummy-melds-grid">
            {knockerPlayer.melds.map((meld, meldIdx) => {
              const isTarget = !isHumanKnocker && isHumanTurn && layOffTargets.includes(meldIdx);
              return (
                <div
                  key={meld.id}
                  className={`ginrummy-meld ${isTarget ? 'ginrummy-meld-highlight' : ''}`}
                  onClick={isTarget ? () => handleLayOff(meldIdx) : undefined}
                >
                  {meld.cards.map(card => (
                    <CardComponent key={cardKey(card)} card={card} />
                  ))}
                </div>
              );
            })}
            {knockerPlayer.deadwood.length > 0 && (
              <div className="ginrummy-deadwood-cards">
                {knockerPlayer.deadwood.map(card => (
                  <CardComponent key={cardKey(card)} card={card} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Render player hand + actions ──────────────────────────────

  const renderPlayerArea = () => {
    const isLayingOff = gs.phase === GinRummyPhase.LAYING_OFF && isHumanTurn;

    return (
      <div className="ginrummy-player-area">
        {/* Deadwood display during play */}
        {isPlaying && isHumanTurn && isDiscard && (
          <div className="ginrummy-deadwood-info">
            {t('ginRummy.deadwood', { n: String(humanDWValue) })}
          </div>
        )}

        {/* Action buttons */}
        {isPlaying && isHumanTurn && isDiscard && selectedCard && (
          <div className="ginrummy-actions">
            <button
              className="ginrummy-btn ginrummy-btn-danger"
              onClick={handleDiscard}
              disabled={gs.lastDrawnFromDiscard && gs.lastDrawnCard === selectedCard}
            >
              {t('ginRummy.discardPhase')}
            </button>
            {canGinAfterDiscard && (
              <button
                className="ginrummy-btn ginrummy-btn-gin"
                onClick={handleKnock}
              >
                {t('ginRummy.gin')}
              </button>
            )}
            {canKnockAfterDiscard && !canGinAfterDiscard && (
              <button
                className="ginrummy-btn ginrummy-btn-knock"
                onClick={handleKnock}
              >
                {t('ginRummy.knock')}
              </button>
            )}
          </div>
        )}

        {/* Laying off actions */}
        {isLayingOff && (
          <div className="ginrummy-actions">
            <button
              className="ginrummy-btn ginrummy-btn-primary"
              onClick={onDoneLayingOff}
            >
              {t('ginRummy.done')}
            </button>
          </div>
        )}

        {/* Hand cards */}
        <div className="ginrummy-hand-row">
          {humanPlayer.hand.map(card => {
            const key = cardKey(card);
            const isSelected = selectedCard === key;
            const canInteract = (isHumanTurn && isPlaying && isDiscard) || isLayingOff;

            return (
              <div
                key={key}
                className={`ginrummy-hand-card ${isSelected ? 'ginrummy-card-selected' : ''} ${canInteract ? 'ginrummy-card-playable' : ''}`}
                onClick={canInteract ? () => toggleCard(key) : undefined}
              >
                <CardComponent card={card} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Round end overlay ─────────────────────────────────────────

  const renderRoundEnd = () => {
    if (gs.phase !== GinRummyPhase.ROUND_END) return null;

    // Draw game (stock exhausted)
    if (gs.winner === null) {
      return (
        <div className="ginrummy-round-end">
          <div className="ginrummy-round-end-card">
            <div className="ginrummy-round-end-emoji">{'\u{1F91D}'}</div>
            <h2 className="ginrummy-round-end-title">Draw!</h2>
            <p className="ginrummy-round-end-subtitle">
              Stock depleted - no winner this round.
            </p>
            <p className="ginrummy-round-end-detail">
              {t('ginRummy.moves', { n: String(gs.moveCount) })}
            </p>
            <div className="ginrummy-round-end-buttons">
              <button className="ginrummy-btn ginrummy-btn-primary" onClick={onNewGame}>
                {t('ginRummy.playAgain')}
              </button>
              <button className="ginrummy-btn" onClick={onBack}>
                {t('common.backToMenu')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const winner = gs.players[gs.winner];
    const isHumanWinner = gs.winner === humanSeat;
    const knocker = gs.knocker !== null ? gs.players[gs.knocker] : null;
    const isUndercut = gs.knocker !== null && gs.winner !== gs.knocker && !gs.isGin;

    // Show deadwood info
    const knockerDW = knocker ? deadwoodValue(knocker.deadwood) : 0;
    const defenderSeat = gs.knocker !== null ? (gs.knocker === 0 ? 1 : 0) : null;
    const defenderDW = defenderSeat !== null ? deadwoodValue(gs.players[defenderSeat].deadwood) : 0;

    return (
      <div className="ginrummy-round-end">
        <div className="ginrummy-round-end-card">
          <div className="ginrummy-round-end-emoji">
            {gs.isGin ? '\u{1F31F}' : isUndercut ? '\u{1F4A5}' : isHumanWinner ? '\u{1F3C6}' : '\u{1F614}'}
          </div>
          <h2 className="ginrummy-round-end-title">
            {gs.isGin
              ? `${t('ginRummy.gin')} ${t('ginRummy.winner', { name: winner.name })}`
              : isUndercut
                ? `${t('ginRummy.undercut')} ${t('ginRummy.winner', { name: winner.name })}`
                : t('ginRummy.winner', { name: winner.name })
            }
          </h2>
          {knocker && (
            <p className="ginrummy-round-end-subtitle">
              {knocker.name}: {t('ginRummy.deadwood', { n: String(knockerDW) })}
              {defenderSeat !== null && ` | ${gs.players[defenderSeat].name}: ${t('ginRummy.deadwood', { n: String(defenderDW) })}`}
            </p>
          )}
          <p className="ginrummy-round-end-detail">
            {t('ginRummy.moves', { n: String(gs.moveCount) })}
          </p>
          <div className="ginrummy-round-end-buttons">
            <button className="ginrummy-btn ginrummy-btn-primary" onClick={onNewGame}>
              {t('ginRummy.playAgain')}
            </button>
            <button className="ginrummy-btn" onClick={onBack}>
              {t('common.backToMenu')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render melds at round end ─────────────────────────────────

  const renderRoundEndMelds = () => {
    if (gs.phase !== GinRummyPhase.ROUND_END || gs.knocker === null) return null;

    return (
      <div className="ginrummy-melds-area">
        {gs.players.map(p => (
          <div key={p.seat} className="ginrummy-knock-section">
            <div className="ginrummy-melds-label">{p.name}</div>
            <div className="ginrummy-melds-grid">
              {p.melds.map(meld => (
                <div key={meld.id} className="ginrummy-meld">
                  {meld.cards.map(card => (
                    <CardComponent key={cardKey(card)} card={card} />
                  ))}
                </div>
              ))}
              {p.deadwood.length > 0 && (
                <div className="ginrummy-deadwood-cards">
                  {p.deadwood.map(card => (
                    <CardComponent key={cardKey(card)} card={card} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────

  return (
    <div className="ginrummy-table">
      {/* Top bar */}
      <div className="ginrummy-top-bar">
        <button className="ginrummy-btn" onClick={onBack}>{'\u2190'} {t('common.backToMenu')}</button>
        <div className="ginrummy-top-bar-center">
          {t('ginRummy.moves', { n: String(gs.moveCount) })}
        </div>
      </div>

      {/* Opponent */}
      {renderOpponent()}

      {/* Turn indicator */}
      {isPlaying && (
        <div className="ginrummy-turn-indicator">
          {isHumanTurn
            ? (isDraw ? t('ginRummy.drawPhase') : t('ginRummy.discardPhase'))
            : `${currentPlayerName}'s turn`
          }
        </div>
      )}
      {gs.phase === GinRummyPhase.LAYING_OFF && (
        <div className="ginrummy-turn-indicator">
          {t('ginRummy.knockPhase')}
        </div>
      )}

      {/* Center piles */}
      {renderCenter()}

      {/* Knock reveal (laying off phase) */}
      {renderKnockReveal()}

      {/* Round end melds */}
      {renderRoundEndMelds()}

      {/* Player area */}
      {renderPlayerArea()}

      {/* Reshuffle button */}
      {isPlaying && (
        <button
          className="ginrummy-btn ginrummy-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleConfirm')}
        >
          {'\u21BB'}
        </button>
      )}
      {showReshuffleConfirm && (
        <div className="ginrummy-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="ginrummy-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="ginrummy-confirm-text">{t('common.reshuffleConfirm')}</p>
            <div className="ginrummy-confirm-buttons">
              <button className="ginrummy-btn ginrummy-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame(); }}>
                {t('common.yes')}
              </button>
              <button className="ginrummy-btn" onClick={() => setShowReshuffleConfirm(false)}>
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
