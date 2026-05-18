import { useState, useCallback, useMemo } from 'react';
import type { Card as CardType, CardKey } from '../../../types/card';
import { cardKey, cardEquals } from '../../../types/card';
import { Card } from '../../../components/cards/Card';
import type { YanivGameState, YanivPlayer, YanivScoreEntry } from '../types';
import { YanivPhase } from '../types';
import { getHandValue, validateDiscard } from '../engine/discard-validation';
import { getDrawableFromDiscard } from '../engine/draw-validation';
import { useTranslation } from '../../../i18n/LanguageContext';
import './YanivGameTable.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface YanivGameTableProps {
  gameState: YanivGameState;
  humanSeat: number;
  onDiscardAndDraw: (discardCards: CardKey[], drawSource: 'pile' | 'discard', drawCardKey?: CardKey) => void;
  onDeclareYaniv: () => void;
  onQuickStick: (cardKey: CardKey) => void;
  onSkipQuickStick: () => void;
  onNextRound: () => void;
  onEndGame: () => void;
  onNewGame?: () => void;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Turn-flow sub-states for the human player
// ---------------------------------------------------------------------------

type HumanTurnStep = 'select-discard' | 'choose-draw' | 'idle';

// ---------------------------------------------------------------------------
// Player position helpers
// ---------------------------------------------------------------------------

type SeatPosition = 'bottom' | 'top' | 'left' | 'right' | 'top-left' | 'top-right';

/**
 * Map each seat to a CSS position class relative to the human.
 * Human is always "bottom". Layout depends on total player count.
 */
function getSeatPositions(numPlayers: number, humanSeat: number): SeatPosition[] {
  const positions: SeatPosition[] = new Array(numPlayers).fill('top');

  const relativeFor = (seat: number) => (seat - humanSeat + numPlayers) % numPlayers;

  if (numPlayers === 2) {
    for (let s = 0; s < numPlayers; s++) {
      const r = relativeFor(s);
      if (r === 0) positions[s] = 'bottom';
      else positions[s] = 'top';
    }
  } else if (numPlayers === 3) {
    for (let s = 0; s < numPlayers; s++) {
      const r = relativeFor(s);
      if (r === 0) positions[s] = 'bottom';
      else if (r === 1) positions[s] = 'top-left';
      else positions[s] = 'top-right';
    }
  } else if (numPlayers === 4) {
    const map: SeatPosition[] = ['bottom', 'left', 'top', 'right'];
    for (let s = 0; s < numPlayers; s++) {
      positions[s] = map[relativeFor(s)];
    }
  } else {
    // 5+ players: distribute evenly, human at bottom
    for (let s = 0; s < numPlayers; s++) {
      const r = relativeFor(s);
      if (r === 0) {
        positions[s] = 'bottom';
      } else if (r <= Math.floor((numPlayers - 1) / 2)) {
        if (r === 1) positions[s] = 'left';
        else positions[s] = 'top-left';
      } else if (r === Math.ceil((numPlayers - 1) / 2) && numPlayers % 2 === 1) {
        positions[s] = 'top';
      } else {
        if (r === numPlayers - 1) positions[s] = 'right';
        else positions[s] = 'top-right';
      }
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function YanivGameTable({
  gameState,
  humanSeat,
  onDiscardAndDraw,
  onDeclareYaniv,
  onQuickStick,
  onSkipQuickStick,
  onNextRound,
  onEndGame,
  onNewGame,
  onBack,
}: YanivGameTableProps) {
  const { t } = useTranslation();
  const round = gameState.currentRound;
  const phase = round.phase;
  const humanPlayer = round.players[humanSeat];
  const numPlayers = round.numPlayers;

  // --- Local state ---
  const [selectedCardKeys, setSelectedCardKeys] = useState<CardKey[]>([]);
  const [turnStep, setTurnStep] = useState<HumanTurnStep>('select-discard');
  const [pendingDiscard, setPendingDiscard] = useState<CardKey[]>([]);
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);

  // --- Derived ---
  const isHumanTurn = phase === YanivPhase.PLAYER_TURN && round.currentPlayer === humanSeat;
  const isQuickStickPhase = phase === YanivPhase.QUICK_STICK;

  const seatPositions = useMemo(
    () => getSeatPositions(numPlayers, humanSeat),
    [numPlayers, humanSeat],
  );

  const handValue = useMemo(
    () => getHandValue(humanPlayer.hand),
    [humanPlayer.hand],
  );

  const canDeclareYaniv = isHumanTurn && handValue <= gameState.settings.yanivThreshold;

  // Validate current selection
  const selectedCards = useMemo(() => {
    return humanPlayer.hand.filter((c) => selectedCardKeys.includes(cardKey(c)));
  }, [humanPlayer.hand, selectedCardKeys]);

  const discardValidation = useMemo(() => {
    if (selectedCards.length === 0) return 'none' as const;
    return validateDiscard(selectedCards);
  }, [selectedCards]);

  const isValidSelection = discardValidation !== 'none' && discardValidation !== 'invalid';

  // Drawable cards from last discard (for draw step)
  const drawableFromDiscard = useMemo(() => {
    if (!round.lastDiscard) return [];
    return getDrawableFromDiscard(round.lastDiscard);
  }, [round.lastDiscard]);

  // Was this player's own discard? (can't draw from own discard)
  const lastDiscardWasHuman = round.lastDiscardBySeat === humanSeat;

  // --- Handlers ---

  const handleHandCardClick = useCallback(
    (card: CardType) => {
      if (!isHumanTurn || turnStep !== 'select-discard') return;
      const key = cardKey(card);
      setSelectedCardKeys((prev) => {
        if (prev.includes(key)) {
          return prev.filter((k) => k !== key);
        }
        return [...prev, key];
      });
    },
    [isHumanTurn, turnStep],
  );

  const handleConfirmDiscard = useCallback(() => {
    if (!isValidSelection) return;
    const keys = selectedCards.map((c) => cardKey(c));
    setPendingDiscard(keys);
    setSelectedCardKeys([]);
    setTurnStep('choose-draw');
  }, [isValidSelection, selectedCards]);

  const handleDrawFromPile = useCallback(() => {
    onDiscardAndDraw(pendingDiscard, 'pile');
    setPendingDiscard([]);
    setTurnStep('select-discard');
  }, [pendingDiscard, onDiscardAndDraw]);

  const handleDrawFromDiscard = useCallback(
    (card: CardType) => {
      onDiscardAndDraw(pendingDiscard, 'discard', cardKey(card));
      setPendingDiscard([]);
      setTurnStep('select-discard');
    },
    [pendingDiscard, onDiscardAndDraw],
  );

  const handleDeclareYaniv = useCallback(() => {
    onDeclareYaniv();
    setSelectedCardKeys([]);
    setPendingDiscard([]);
    setTurnStep('select-discard');
  }, [onDeclareYaniv]);

  const handleQuickStickCard = useCallback(
    (card: CardType) => {
      onQuickStick(cardKey(card));
    },
    [onQuickStick],
  );

  // Reset local state when it's no longer our turn
  if (turnStep === 'choose-draw' && !isHumanTurn) {
    setTurnStep('select-discard');
    setPendingDiscard([]);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  /** Render an opponent player area */
  const renderOpponent = (player: YanivPlayer, position: SeatPosition) => {
    const isActive = round.currentPlayer === player.seat;
    const isEliminated = player.eliminated;

    return (
      <div
        key={player.seat}
        className={`yaniv-player-area yaniv-player-${position} ${isEliminated ? 'yaniv-player-eliminated' : ''}`}
      >
        <div className={`yaniv-player-info ${isActive ? 'yaniv-player-active' : ''}`}>
          <span className="yaniv-player-name">{player.name}</span>
          <span className="yaniv-player-details">
            {isEliminated ? t('yaniv.eliminated') : t('yaniv.nCards', { n: player.hand.length })}
          </span>
          <span className="yaniv-player-score-label">{t('game.score', { n: player.totalScore })}</span>
        </div>
        {!isEliminated && player.hand.length > 0 && (
          <div className="yaniv-opponent-cards">
            {player.hand.map((card, i) => (
              <Card key={`opp-${player.seat}-${i}`} card={card} faceDown small />
            ))}
          </div>
        )}
      </div>
    );
  };

  /** Render the human player area */
  const renderHumanPlayer = () => {
    const isActive = round.currentPlayer === humanSeat;

    return (
      <div className="yaniv-player-area yaniv-player-bottom">
        <div className={`yaniv-player-info ${isActive ? 'yaniv-player-active' : ''}`}>
          <span className="yaniv-player-name">{humanPlayer.name}</span>
          <span className="yaniv-player-score-label">{t('game.score', { n: humanPlayer.totalScore })}</span>
        </div>
        <div className="yaniv-hand">
          {humanPlayer.hand.map((card) => {
            const key = cardKey(card);
            const isSelected = selectedCardKeys.includes(key);
            const isClickable =
              (isHumanTurn && turnStep === 'select-discard') ||
              (isQuickStickPhase && round.quickStickEligible);

            return (
              <div
                key={key}
                className={`yaniv-hand-card ${isSelected ? 'yaniv-hand-card-selected' : ''}`}
                onClick={() => {
                  if (isQuickStickPhase && round.quickStickEligible) {
                    handleQuickStickCard(card);
                  } else {
                    handleHandCardClick(card);
                  }
                }}
                style={{ cursor: isClickable ? 'pointer' : 'default' }}
              >
                <Card card={card} playable={isClickable} selected={isSelected} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /** Render draw pile */
  const renderDrawPile = () => {
    const isClickable = isHumanTurn && turnStep === 'choose-draw';
    const pileSize = round.drawPile.length;
    // Use a dummy card object for face-down rendering
    const dummyCard: CardType = { suit: 'CLUBS' as any, rank: 2 as any };

    return (
      <div
        className={`yaniv-draw-pile ${isClickable ? 'yaniv-draw-pile-clickable' : ''}`}
        onClick={isClickable ? handleDrawFromPile : undefined}
      >
        <div className="yaniv-draw-pile-stack">
          {[...Array(Math.min(3, pileSize))].map((_, i) => (
            <Card key={`pile-${i}`} card={dummyCard} faceDown />
          ))}
          <div className="yaniv-pile-count">{pileSize}</div>
        </div>
        <div className="yaniv-pile-label">
          {isClickable ? t('yaniv.clickToDraw') : t('yaniv.drawPile')}
        </div>
      </div>
    );
  };

  /** Render discard pile */
  const renderDiscardArea = () => {
    const lastDiscard = round.lastDiscard;
    const isDrawPhase = isHumanTurn && turnStep === 'choose-draw';

    // Previous 2 discard groups for visual history
    const pile = round.discardPile;
    const historyGroups = pile.length >= 2
      ? pile.slice(Math.max(0, pile.length - 3), pile.length - 1)
      : [];

    if (!lastDiscard || lastDiscard.cards.length === 0) {
      return (
        <div className="yaniv-discard-area">
          <div className="yaniv-discard-empty">{t('yaniv.discard')}</div>
          <div className="yaniv-pile-label">{t('yaniv.discardPile')}</div>
        </div>
      );
    }

    return (
      <div className="yaniv-discard-area">
        {/* Previous discard groups (visual history, non-interactive) */}
        {historyGroups.map((group, i) => (
          <div
            key={`history-${pile.length - historyGroups.length + i}`}
            className="yaniv-discard-history"
            style={{ '--history-depth': historyGroups.length - i } as React.CSSProperties}
          >
            {group.cards.map((card) => (
              <Card key={cardKey(card)} card={card} />
            ))}
          </div>
        ))}

        {/* Current discard group (interactive) */}
        <div className="yaniv-discard-group">
          {lastDiscard.cards.map((card) => {
            const key = cardKey(card);
            const isDrawable =
              isDrawPhase &&
              !lastDiscardWasHuman &&
              drawableFromDiscard.some((dc) => cardEquals(dc, card));

            return (
              <div
                key={key}
                className={isDrawable ? 'yaniv-discard-drawable' : ''}
                onClick={isDrawable ? () => handleDrawFromDiscard(card) : undefined}
              >
                <Card card={card} playable={isDrawable} />
              </div>
            );
          })}
        </div>
        <div className="yaniv-pile-label">
          {isDrawPhase && !lastDiscardWasHuman ? t('yaniv.clickCardToDraw') : t('yaniv.discardPile')}
        </div>
      </div>
    );
  };

  /** Render action bar for discard selection step */
  const renderDiscardActionBar = () => {
    if (!isHumanTurn || turnStep !== 'select-discard') return null;

    let validationClass = 'yaniv-validation-prompt';
    let validationText = t('yaniv.selectToDiscard');

    if (selectedCards.length > 0) {
      if (discardValidation === 'invalid') {
        validationClass = 'yaniv-validation-invalid';
        validationText = t('yaniv.invalidCombo');
      } else if (discardValidation === 'single') {
        validationClass = 'yaniv-validation-valid';
        validationText = t('yaniv.singleCard');
      } else if (discardValidation === 'set') {
        validationClass = 'yaniv-validation-valid';
        validationText = t('yaniv.validSet');
      } else if (discardValidation === 'sequence') {
        validationClass = 'yaniv-validation-valid';
        validationText = t('yaniv.validSequence');
      }
    }

    return (
      <div className="yaniv-action-bar">
        <div className={`yaniv-validation-text ${validationClass}`}>{validationText}</div>
        <div className="yaniv-action-buttons">
          {canDeclareYaniv && (
            <button className="yaniv-btn yaniv-btn-yaniv" onClick={handleDeclareYaniv}>
              {t('yaniv.yanivDeclare', { n: handValue })}
            </button>
          )}
          <button
            className="yaniv-btn yaniv-btn-primary"
            disabled={!isValidSelection}
            onClick={handleConfirmDiscard}
          >
            {t('yaniv.confirmDiscard')}
          </button>
        </div>
      </div>
    );
  };

  /** Render draw source prompt */
  const renderDrawPrompt = () => {
    if (!isHumanTurn || turnStep !== 'choose-draw') return null;

    const canDrawFromDiscardPile = !lastDiscardWasHuman && drawableFromDiscard.length > 0;

    return (
      <div className="yaniv-draw-prompt">
        <div className="yaniv-draw-prompt-text">{t('yaniv.chooseWhereToDraw')}</div>
        <div className="yaniv-action-buttons">
          <button className="yaniv-btn yaniv-btn-primary" onClick={handleDrawFromPile}>
            {t('yaniv.drawFromPile')}
          </button>
        </div>
        {canDrawFromDiscardPile && (
          <div className="yaniv-draw-prompt-hint">
            {t('yaniv.orClickDiscard')}
          </div>
        )}
      </div>
    );
  };

  /** Render quick-stick panel */
  const renderQuickStickPanel = () => {
    if (!isQuickStickPhase) return null;

    if (!round.quickStickEligible) {
      return (
        <div className="yaniv-waiting-panel">
          {t('yaniv.quickStickWait')}
        </div>
      );
    }

    return (
      <div className="yaniv-quickstick-panel">
        <div className="yaniv-quickstick-title">{t('yaniv.quickStick')}</div>
        <div className="yaniv-quickstick-hint">
          {t('yaniv.quickStickHint')}
        </div>
        <div className="yaniv-action-buttons">
          <button className="yaniv-btn yaniv-btn-secondary" onClick={onSkipQuickStick}>
            {t('common.skip')}
          </button>
        </div>
      </div>
    );
  };

  /** Render waiting indicator when it's another player's turn */
  const renderWaiting = () => {
    if (phase !== YanivPhase.PLAYER_TURN) return null;
    if (round.currentPlayer === humanSeat) return null;

    const currentPlayerName = round.players[round.currentPlayer]?.name ?? 'Opponent';

    return (
      <div className="yaniv-waiting-panel">
        {t('yaniv.waitingForPlayer', { name: currentPlayerName })}
      </div>
    );
  };

  /** Render round summary overlay */
  const renderRoundSummary = () => {
    if (phase !== YanivPhase.ROUND_END) return null;

    const lastRoundScores: YanivScoreEntry[] | null =
      gameState.scoreboard.length > 0
        ? gameState.scoreboard[gameState.scoreboard.length - 1]
        : null;

    const declarer = round.yanivDeclarer;
    const declarerName = declarer !== null ? round.players[declarer].name : null;

    const wasAssafed = lastRoundScores?.some((e) => e.wasAssafed) ?? false;

    return (
      <div className="yaniv-round-overlay">
        <div className="yaniv-round-panel">
          <div className="yaniv-round-title">{t('yaniv.roundComplete', { n: round.roundNumber + 1 })}</div>
          <div className="yaniv-round-subtitle">
            {declarerName
              ? t('yaniv.declaredYaniv', { name: declarerName })
              : t('yaniv.roundEnded')}
          </div>

          {wasAssafed && (
            <div className="yaniv-assaf-banner">
              {t('yaniv.assaf', { name: declarerName ?? '' })}
            </div>
          )}

          {/* Show all players' revealed hands */}
          <div className="yaniv-revealed-hands">
            {round.players.map((player) => {
              const isDeclarer = player.seat === declarer;
              const playerHandValue = getHandValue(player.hand);

              return (
                <div
                  key={player.seat}
                  className={`yaniv-revealed-hand ${isDeclarer ? 'yaniv-revealed-hand-declarer' : ''}`}
                >
                  <span className="yaniv-revealed-name">
                    {isDeclarer ? t('yaniv.playerYaniv', { name: player.name }) : player.name}
                  </span>
                  <div className="yaniv-revealed-cards">
                    {player.hand.map((card, i) => (
                      <Card key={`rev-${player.seat}-${i}`} card={card} small />
                    ))}
                  </div>
                  <span className="yaniv-revealed-value">{t('yaniv.handValue', { n: playerHandValue })}</span>
                </div>
              );
            })}
          </div>

          {/* Score table */}
          {lastRoundScores && (
            <table className="yaniv-score-table">
              <thead>
                <tr>
                  <th>{t('common.player')}</th>
                  <th>{t('yaniv.hand')}</th>
                  <th>{t('common.round')}</th>
                  <th>{t('yaniv.reduction')}</th>
                  <th>{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {lastRoundScores.map((entry) => {
                  const player = round.players[entry.seat];
                  const rowClass = entry.declaredYaniv
                    ? 'yaniv-score-declarer'
                    : entry.wasAssafed
                      ? 'yaniv-score-assafed'
                      : '';

                  return (
                    <tr key={entry.seat} className={rowClass}>
                      <td>
                        {entry.eliminated ? t('yaniv.playerOut', { name: player.name }) : player.name}
                      </td>
                      <td>{entry.handValue}</td>
                      <td
                        className={
                          entry.roundScore > 0
                            ? 'yaniv-score-positive'
                            : entry.roundScore === 0
                              ? 'yaniv-score-zero'
                              : ''
                        }
                      >
                        +{entry.roundScore}
                      </td>
                      <td>
                        {entry.reductionApplied > 0 ? (
                          <span className="yaniv-score-reduction">
                            -{entry.reductionApplied}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{entry.cumulativeScore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="yaniv-round-buttons">
            <button className="yaniv-btn yaniv-btn-primary" onClick={onNextRound}>
              {t('common.nextRound')}
            </button>
            <button className="yaniv-btn yaniv-btn-danger" onClick={onEndGame}>
              {t('common.endGame')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /** Render game over overlay */
  const renderGameOver = () => {
    if (phase !== YanivPhase.GAME_OVER) return null;

    // In Yaniv lowest score wins. Sort ascending.
    const sortedPlayers = [...round.players].sort(
      (a, b) => a.totalScore - b.totalScore,
    );

    return (
      <div className="yaniv-gameover-overlay">
        <div className="yaniv-gameover-panel">
          <h2 className="yaniv-gameover-title">{t('common.gameOver')}</h2>
          <div className="yaniv-gameover-scores">
            {sortedPlayers.map((player, i) => (
              <div
                key={player.seat}
                className={`yaniv-gameover-entry ${i === 0 ? 'yaniv-gameover-winner' : ''}`}
              >
                <span className="yaniv-gameover-rank">#{i + 1}</span>
                <span className="yaniv-gameover-name">{player.name}</span>
                {player.eliminated && (
                  <span className="yaniv-gameover-eliminated-tag">{t('yaniv.eliminated')}</span>
                )}
                <span className="yaniv-gameover-score">{player.totalScore}</span>
              </div>
            ))}
          </div>
          <button
            className="yaniv-btn yaniv-btn-primary"
            onClick={() => window.location.reload()}
          >
            {t('common.backToMenu')}
          </button>
        </div>
      </div>
    );
  };

  /** Render full scoreboard modal */
  const renderScoreboard = () => {
    if (!showScoreboard) return null;

    const playerNames = round.players.map((p) => p.name);

    return (
      <div className="yaniv-scoreboard-overlay" onClick={() => setShowScoreboard(false)}>
        <div className="yaniv-scoreboard-panel" onClick={(e) => e.stopPropagation()}>
          <div className="yaniv-scoreboard-title">Scoreboard</div>
          {gameState.scoreboard.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
              {t('yaniv.noRoundsYet')}
            </div>
          ) : (
            <table className="yaniv-scoreboard-table">
              <thead>
                <tr>
                  <th>{t('common.round')}</th>
                  {playerNames.map((name, i) => (
                    <th key={i}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gameState.scoreboard.map((roundEntries, roundIdx) => (
                  <tr key={roundIdx}>
                    <td className="yaniv-sb-round-label">R{roundIdx + 1}</td>
                    {roundEntries.map((entry) => (
                      <td
                        key={entry.seat}
                        className={
                          entry.declaredYaniv
                            ? 'yaniv-score-declarer'
                            : entry.wasAssafed
                              ? 'yaniv-score-assafed'
                              : ''
                        }
                      >
                        {entry.cumulativeScore}
                        {entry.reductionApplied > 0 ? '*' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="yaniv-scoreboard-close" onClick={() => setShowScoreboard(false)}>
            Close
          </button>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="yaniv-table">
      {/* Game info (top-left) */}
      <div className="yaniv-game-info">
        <span>{t('game.roundN', { n: round.roundNumber + 1 })}</span>
        <span>{t('game.dealer', { name: round.players[round.dealerSeat]?.name })}</span>
      </div>

      {/* Score panel (top-right) */}
      <div className="yaniv-score-panel">
        <button className="yaniv-score-toggle" onClick={() => setShowScoreboard(true)}>
          {t('common.scores')}
        </button>
        <div className="yaniv-scores-mini">
          {round.players.map((player) => (
            <div
              key={player.seat}
              className={`yaniv-scores-mini-row ${player.eliminated ? 'yaniv-scores-mini-eliminated' : ''}`}
            >
              <span className="yaniv-scores-mini-name">{player.name}</span>
              <span className="yaniv-scores-mini-value">{player.totalScore}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Opponent player areas */}
      {round.players.map((player) => {
        const pos = seatPositions[player.seat];
        if (player.seat === humanSeat) return null;
        return renderOpponent(player, pos);
      })}

      {/* Human player at bottom */}
      {renderHumanPlayer()}

      {/* Center area: draw pile + discard pile */}
      <div className="yaniv-center-area">
        {renderDrawPile()}
        {renderDiscardArea()}
      </div>

      {/* Hand value indicator */}
      {(phase === YanivPhase.PLAYER_TURN || phase === YanivPhase.QUICK_STICK) && (
        <div
          className={`yaniv-hand-value ${
            handValue <= gameState.settings.yanivThreshold ? 'yaniv-hand-value-low' : ''
          }`}
        >
          {t('yaniv.handValueDisplay', { n: handValue })}
        </div>
      )}

      {/* Phase-specific UI */}
      {renderDiscardActionBar()}
      {renderDrawPrompt()}
      {renderQuickStickPanel()}
      {renderWaiting()}

      {/* Reshuffle button */}
      {(phase === YanivPhase.PLAYER_TURN || phase === YanivPhase.QUICK_STICK) && (
        <button
          className="yaniv-btn yaniv-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleTitle')}
        >{'\u21BB'}</button>
      )}
      {showReshuffleConfirm && (
        <div className="yaniv-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="yaniv-overlay-card" onClick={e => e.stopPropagation()}>
            <p style={{ color: '#fff', fontSize: '15px', margin: '0 0 16px' }}>{t('common.reshuffleTitle')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="yaniv-btn yaniv-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame?.(); }}>
                {t('common.reshuffleSame')}
              </button>
              <button className="yaniv-btn yaniv-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onBack?.(); }}>
                {t('common.reshuffleMenu')}
              </button>
              <button className="yaniv-btn" onClick={() => setShowReshuffleConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {renderRoundSummary()}
      {renderGameOver()}
      {renderScoreboard()}
    </div>
  );
}
