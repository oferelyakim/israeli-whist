import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { CardKey } from '../../../types/card';
import { cardKey } from '../../../types/card';
import type { RummyGameState } from '../types';
import { RummyPhase, TurnStep } from '../types';
import { Card as CardComponent } from '../../../components/cards/Card';
import { findBestMelds, deadwoodValue, canKnock, hasGin } from '../engine/gin-reducer';
import { isValidSet, isValidRun } from '../engine/validation';
import './GinRummyTable.css';

interface GinRummyTableProps {
  gameState: RummyGameState;
  humanSeat: number;
  onDrawFromStock: () => void;
  onDrawFromDiscard: () => void;
  onDiscard: (cardKey: CardKey) => void;
  onKnock: (melds: CardKey[][]) => void;
  onGin: (melds: CardKey[][]) => void;
  onDefenderLayoff: (cardKey: CardKey, meldIndex: number) => void;
  onDefenderDone: () => void;
  onNewGame: () => void;
  onBack: () => void;
}

export function GinRummyTable({
  gameState,
  humanSeat,
  onDrawFromStock,
  onDrawFromDiscard,
  onDiscard,
  onKnock,
  onGin,
  onDefenderLayoff,
  onDefenderDone,
  onNewGame,
  onBack,
}: GinRummyTableProps) {
  const { t } = useTranslation();
  const [selectedCards, setSelectedCards] = useState<Set<CardKey>>(new Set());
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);

  const gs = gameState;
  const humanPlayer = gs.players[humanSeat];
  const opponentSeat = humanSeat === 0 ? 1 : 0;
  const opponent = gs.players[opponentSeat];
  const isHumanTurn = gs.currentPlayer === humanSeat;
  const isPlaying = gs.phase === RummyPhase.PLAYING;
  const isKnockReveal = gs.phase === RummyPhase.KNOCK_REVEAL;
  const isDraw = gs.turnStep === TurnStep.DRAW;
  const isMeld = gs.turnStep === TurnStep.MELD;

  // Calculate deadwood for human hand
  const humanDeadwood = useMemo(() => {
    if (!humanPlayer) return 0;
    const { deadwood } = findBestMelds(humanPlayer.hand);
    return deadwoodValue(deadwood);
  }, [humanPlayer]);

  const humanCanKnock = useMemo(() => {
    if (!humanPlayer || !isHumanTurn || !isMeld) return false;
    return canKnock(humanPlayer.hand);
  }, [humanPlayer, isHumanTurn, isMeld]);

  const humanHasGin = useMemo(() => {
    if (!humanPlayer || !isHumanTurn || !isMeld) return false;
    return hasGin(humanPlayer.hand);
  }, [humanPlayer, isHumanTurn, isMeld]);

  // Check if a card drawn from discard can't be discarded back
  const cantDiscardKey = gs.ginState?.lastDrawnFromDiscard ? gs.ginState.lastDrawnCard : null;

  // Toggle card selection
  const toggleCard = useCallback((key: CardKey) => {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Discard a card
  const handleDiscard = useCallback((key: CardKey) => {
    if (!isHumanTurn || !isMeld) return;
    if (cantDiscardKey === key) return;
    onDiscard(key);
    setSelectedCards(new Set());
  }, [isHumanTurn, isMeld, cantDiscardKey, onDiscard]);

  // Knock
  const handleKnock = useCallback(() => {
    if (!humanCanKnock) return;
    const { melds } = findBestMelds(humanPlayer.hand);
    const meldKeys = melds.map(m => m.map(c => cardKey(c)));
    if (humanHasGin) {
      onGin(meldKeys);
    } else {
      onKnock(meldKeys);
    }
    setSelectedCards(new Set());
  }, [humanCanKnock, humanHasGin, humanPlayer, onKnock, onGin]);

  // Defender layoff during knock reveal
  const handleDefenderLayoff = useCallback((key: CardKey, meldIndex: number) => {
    onDefenderLayoff(key, meldIndex);
    setSelectedCards(new Set());
  }, [onDefenderLayoff]);

  // Check which melds a selected card can be laid off onto during knock reveal
  const layoffTargets = useMemo(() => {
    if (!isKnockReveal || !isHumanTurn || !gs.ginState || gs.ginState.isGin) return [];
    if (selectedCards.size !== 1) return [];

    const selectedKey = Array.from(selectedCards)[0];
    const card = humanPlayer.hand.find(c => cardKey(c) === selectedKey);
    if (!card) return [];

    const targets: number[] = [];
    for (let i = 0; i < gs.ginState.knockerMelds.length; i++) {
      const meld = gs.ginState.knockerMelds[i];
      const extended = [...meld.cards, card];
      if (isValidSet(extended) || isValidRun(extended)) {
        targets.push(i);
      }
    }
    return targets;
  }, [isKnockReveal, isHumanTurn, gs.ginState, selectedCards, humanPlayer]);

  const currentPlayerName = gs.players[gs.currentPlayer]?.name ?? '';

  // ── Render opponent ───────────────────────────────────────────
  const renderOpponent = () => (
    <div className="gin-opponents">
      <div className={`gin-opponent ${gs.currentPlayer === opponentSeat ? 'gin-opponent-active' : ''}`}>
        <span className="gin-opponent-name">{opponent.name}</span>
        <div className="gin-opponent-cards">
          {opponent.hand.map((_card, i) => (
            <CardComponent key={i} card={_card} faceDown />
          ))}
        </div>
        <span className="gin-opponent-count">{opponent.hand.length} cards</span>
      </div>
    </div>
  );

  // ── Render center piles ───────────────────────────────────────
  const renderCenter = () => {
    const discardTop = gs.discardPile.length > 0
      ? gs.discardPile[gs.discardPile.length - 1]
      : null;

    const canDrawStock = isHumanTurn && isDraw && isPlaying;
    const canDrawDiscard = isHumanTurn && isDraw && isPlaying && discardTop !== null;

    return (
      <div className="gin-center">
        <div className="gin-pile-area">
          <div
            className={`gin-pile ${canDrawStock ? 'gin-pile-clickable gin-pile-highlight' : ''}`}
            onClick={canDrawStock ? onDrawFromStock : undefined}
          >
            {gs.drawPile.length > 0 ? (
              <>
                <div className="gin-pile-card">
                  <CardComponent card={gs.drawPile[0]} faceDown />
                </div>
                <span className="gin-pile-count">{gs.drawPile.length}</span>
              </>
            ) : (
              <div className="gin-empty-pile">Empty</div>
            )}
          </div>
          <div className="gin-pile-label">Draw</div>
        </div>

        <div className="gin-pile-area">
          <div
            className={`gin-pile ${canDrawDiscard ? 'gin-pile-clickable gin-pile-highlight' : ''}`}
            onClick={canDrawDiscard ? onDrawFromDiscard : undefined}
          >
            {discardTop ? (
              <div className="gin-pile-card">
                <CardComponent card={discardTop} />
              </div>
            ) : (
              <div className="gin-empty-pile">Empty</div>
            )}
            {gs.discardPile.length > 0 && (
              <span className="gin-pile-count">{gs.discardPile.length}</span>
            )}
          </div>
          <div className="gin-pile-label">Discard</div>
        </div>
      </div>
    );
  };

  // ── Render player hand + actions ──────────────────────────────
  const renderPlayerArea = () => (
    <div className="gin-player-area">
      {/* Deadwood indicator */}
      {isPlaying && (
        <div className="gin-deadwood-info">
          {t('rummy.deadwood', { n: String(humanDeadwood) })}
        </div>
      )}

      {/* Action buttons */}
      {isPlaying && isHumanTurn && isMeld && (
        <div className="gin-actions">
          {humanHasGin && (
            <button className="gin-btn gin-btn-gin" onClick={handleKnock}>
              {t('rummy.gin')}
            </button>
          )}
          {humanCanKnock && !humanHasGin && (
            <button className="gin-btn gin-btn-knock" onClick={handleKnock}>
              {t('rummy.knock')}
            </button>
          )}
          {selectedCards.size === 1 && (
            <button
              className="gin-btn gin-btn-danger"
              disabled={cantDiscardKey === Array.from(selectedCards)[0]}
              onClick={() => handleDiscard(Array.from(selectedCards)[0])}
            >
              {t('rummy.discard')}
            </button>
          )}
        </div>
      )}

      {/* Knock reveal: defender layoff actions */}
      {isKnockReveal && isHumanTurn && gs.ginState && !gs.ginState.isGin && (
        <div className="gin-actions">
          <span className="gin-layoff-hint">{t('rummy.layOffCards')}</span>
          <button className="gin-btn gin-btn-primary" onClick={onDefenderDone}>
            {t('rummy.defenderDone')}
          </button>
        </div>
      )}

      {/* Hand cards */}
      <div className="gin-hand-row">
        {humanPlayer.hand.map(card => {
          const key = cardKey(card);
          const isSelected = selectedCards.has(key);
          const canInteract = (isHumanTurn && isPlaying && isMeld) ||
                              (isHumanTurn && isKnockReveal);
          const isCantDiscard = cantDiscardKey === key;

          return (
            <div
              key={key}
              className={`gin-hand-card ${isSelected ? 'gin-card-selected' : ''} ${canInteract ? 'gin-card-playable' : ''} ${isCantDiscard ? 'gin-card-locked' : ''}`}
              onClick={canInteract ? () => toggleCard(key) : undefined}
              onDoubleClick={canInteract && isPlaying && isMeld && !isCantDiscard ? () => handleDiscard(key) : undefined}
            >
              <CardComponent card={card} />
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Knock reveal overlay ──────────────────────────────────────
  const renderKnockReveal = () => {
    if (!isKnockReveal || !gs.ginState) return null;

    const knockerSeat = gs.ginState.knocker;
    const knockerName = gs.players[knockerSeat].name;
    const isHumanKnocker = knockerSeat === humanSeat;

    return (
      <div className="gin-knock-reveal">
        <div className="gin-knock-reveal-title">
          {t('rummy.knockReveal')} - {knockerName} {gs.ginState.isGin ? t('rummy.gin') : t('rummy.knock')}
        </div>

        {/* Knocker's melds */}
        <div className="gin-reveal-section">
          <div className="gin-reveal-label">{knockerName} - {t('rummy.melds')}</div>
          <div className="gin-reveal-melds">
            {gs.ginState.knockerMelds.map((meld, meldIdx) => {
              const isTarget = layoffTargets.includes(meldIdx);
              return (
                <div
                  key={meld.id}
                  className={`gin-reveal-meld ${isTarget ? 'gin-reveal-meld-target' : ''}`}
                  onClick={isTarget ? () => {
                    const selectedKey = Array.from(selectedCards)[0];
                    handleDefenderLayoff(selectedKey, meldIdx);
                  } : undefined}
                >
                  {meld.cards.map(card => (
                    <CardComponent key={cardKey(card)} card={card} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Knocker's deadwood */}
        {gs.ginState.knockerDeadwood.length > 0 && (
          <div className="gin-reveal-section">
            <div className="gin-reveal-label">
              {t('rummy.deadwood', { n: String(deadwoodValue(gs.ginState.knockerDeadwood)) })}
            </div>
            <div className="gin-reveal-deadwood">
              {gs.ginState.knockerDeadwood.map(card => (
                <CardComponent key={cardKey(card)} card={card} />
              ))}
            </div>
          </div>
        )}

        {/* Defender's remaining cards */}
        <div className="gin-reveal-section">
          <div className="gin-reveal-label">
            {gs.players[isHumanKnocker ? opponentSeat : humanSeat].name} - {t('rummy.deadwood', { n: String(deadwoodValue(gs.ginState.defenderDeadwood)) })}
          </div>
          <div className="gin-reveal-deadwood">
            {gs.ginState.defenderDeadwood.map(card => (
              <CardComponent key={cardKey(card)} card={card} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Round end overlay ─────────────────────────────────────────
  const renderRoundEnd = () => {
    if (gs.phase !== RummyPhase.ROUND_END) return null;

    const isDraw = gs.winner === null;
    const isHumanWinner = gs.winner === humanSeat;

    // Determine undercut
    const isUndercut = gs.ginState && !gs.ginState.isGin &&
      gs.winner !== null && gs.winner !== gs.ginState.knocker;

    return (
      <div className="gin-round-end">
        <div className="gin-round-end-card">
          <div className="gin-round-end-emoji">
            {isDraw ? '\u{1F91D}' : isHumanWinner ? '\u{1F3C6}' : '\u{1F614}'}
          </div>
          <h2 className="gin-round-end-title">
            {isDraw
              ? 'Draw!'
              : gs.ginState?.isGin
                ? `${gs.players[gs.winner!].name} - ${t('rummy.gin')}`
                : isUndercut
                  ? `${gs.players[gs.winner!].name} - ${t('rummy.undercut')}`
                  : t('rummy.winner', { name: gs.players[gs.winner!].name })
            }
          </h2>

          {/* Show final deadwood comparison */}
          {gs.ginState && (
            <div className="gin-round-end-scores">
              <div>{gs.players[gs.ginState.knocker].name}: {deadwoodValue(gs.ginState.knockerDeadwood)}</div>
              <div>{gs.players[gs.ginState.knocker === 0 ? 1 : 0].name}: {deadwoodValue(gs.ginState.defenderDeadwood)}</div>
            </div>
          )}

          <p className="gin-round-end-subtitle">
            {t('rummy.moves', { n: String(gs.moveCount) })}
          </p>
          <div className="gin-round-end-buttons">
            <button className="gin-btn gin-btn-primary" onClick={onNewGame}>
              {t('rummy.playAgain')}
            </button>
            <button className="gin-btn" onClick={onBack}>
              {t('common.backToMenu')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────
  return (
    <div className="gin-table">
      {/* Top bar */}
      <div className="gin-top-bar">
        <button className="gin-btn" onClick={onBack}>{'\u2190'} {t('common.backToMenu')}</button>
        <div className="gin-top-bar-center">
          {t('rummy.variantGin')} - {t('rummy.moves', { n: String(gs.moveCount) })}
        </div>
      </div>

      {/* Opponent */}
      {renderOpponent()}

      {/* Turn indicator */}
      {isPlaying && (
        <div className="gin-turn-indicator">
          {isHumanTurn
            ? (isDraw ? t('rummy.drawPhase') : t('rummy.meldPhase'))
            : `${currentPlayerName}'s turn`
          }
        </div>
      )}

      {/* Center piles */}
      {renderCenter()}

      {/* Knock reveal area */}
      {renderKnockReveal()}

      {/* Player area */}
      {renderPlayerArea()}

      {/* Reshuffle button */}
      {isPlaying && (
        <button
          className="gin-btn gin-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleConfirm')}
        >
          {'\u21BB'}
        </button>
      )}
      {showReshuffleConfirm && (
        <div className="gin-confirm-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="gin-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="gin-confirm-text">{t('common.reshuffleConfirm')}</p>
            <div className="gin-confirm-buttons">
              <button className="gin-btn gin-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame(); }}>
                {t('common.yes')}
              </button>
              <button className="gin-btn" onClick={() => setShowReshuffleConfirm(false)}>
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
