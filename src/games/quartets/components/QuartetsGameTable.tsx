import { useState, useCallback, useMemo } from 'react';
import type { QuartetCategory, QuartetCard as QCard, QuartetsGameState } from '../types';
import { QuartetColor, QuartetsPhase, QUARTET_COLORS } from '../types';
import { CARD_SETS, QUARTET_COLOR_EMOJI, QUARTET_COLOR_HEX } from '../card-sets';
import type { CardSetDefinition } from '../card-sets';
import { QuartetCardComponent } from './QuartetCard';
import { DrumPicker } from './DrumPicker';
import type { DrumPickerItem } from './DrumPicker';
import { getAskableCategories } from '../engine/validation';
import { useTranslation } from '../../../i18n/LanguageContext';
import './QuartetsGameTable.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuartetsGameTableProps {
  gameState: QuartetsGameState;
  humanSeat: number;
  onAskForCard: (targetSeat: number, category: QuartetCategory) => void;
  onChooseColor: (color: QuartetColor) => void;
  onAcknowledgeResult: () => void;
  onEndGame: () => void;
  onNewGame?: () => void;
  onBack?: () => void;
  onResolveRequest: () => void;
}

// ---------------------------------------------------------------------------
// Seat positions (reuse Yaniv layout logic)
// ---------------------------------------------------------------------------

type SeatPosition = 'bottom' | 'top' | 'left' | 'right' | 'top-left' | 'top-right';

function getSeatPositions(numPlayers: number, humanSeat: number): SeatPosition[] {
  const positions: SeatPosition[] = new Array(numPlayers).fill('top');
  const relativeFor = (seat: number) => (seat - humanSeat + numPlayers) % numPlayers;

  if (numPlayers === 2) {
    for (let s = 0; s < numPlayers; s++) {
      positions[s] = relativeFor(s) === 0 ? 'bottom' : 'top';
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
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuartetsGameTable({
  gameState,
  humanSeat,
  onAskForCard,
  onChooseColor,
  onAcknowledgeResult,
  onEndGame,
  onNewGame,
  onBack,
  onResolveRequest,
}: QuartetsGameTableProps) {
  const { t } = useTranslation();
  const round = gameState.round;
  const phase = round.phase;
  const humanPlayer = round.players[humanSeat];
  const numPlayers = round.numPlayers;
  const cardSet: CardSetDefinition = CARD_SETS[gameState.settings.cardSet];

  // --- Local state for ask UI ---
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [showReshuffleConfirm, setShowReshuffleConfirm] = useState(false);

  const isHumanTurn = phase === QuartetsPhase.PLAYER_TURN && round.currentPlayer === humanSeat;

  const seatPositions = useMemo(
    () => getSeatPositions(numPlayers, humanSeat),
    [numPlayers, humanSeat],
  );

  // Categories the human can ask about
  const askableCategories = useMemo(
    () => getAskableCategories(humanPlayer.hand),
    [humanPlayer.hand],
  );

  const selectedCategory = askableCategories[categoryIdx] ?? -1;

  const handleCategoryChange = useCallback((idx: number) => {
    setCategoryIdx(idx);
  }, []);

  // Sort human hand by category then color
  const sortedHand = useMemo(() => {
    return [...humanPlayer.hand].sort((a, b) => {
      if (a.category !== b.category) return a.category - b.category;
      return QUARTET_COLORS.indexOf(a.color) - QUARTET_COLORS.indexOf(b.color);
    });
  }, [humanPlayer.hand]);

  // --- Render helpers ---

  const renderOpponent = (playerIdx: number, position: SeatPosition) => {
    const player = round.players[playerIdx];
    const isActive = round.currentPlayer === playerIdx;

    return (
      <div
        key={playerIdx}
        className={`quartets-player-area quartets-player-${position}`}
      >
        <div className={`quartets-player-info ${isActive ? 'quartets-player-active' : ''}`}>
          <span className="quartets-player-name">{player.name}</span>
          <span className="quartets-player-details">
            {t('quartets.nCards', { n: player.hand.length })}
            {player.completedQuartets.length > 0 &&
              ` · ${player.completedQuartets.length} ✓`}
          </span>
        </div>
        {player.completedQuartets.length > 0 && (
          <div className="quartets-completed-emojis">
            {player.completedQuartets.map((cat) => (
              <span key={cat}>{cardSet.categories[cat]?.emoji}</span>
            ))}
          </div>
        )}
        {player.hand.length > 0 && (
          <div className="quartets-opponent-cards">
            {player.hand.map((_, i) => (
              <QuartetCardComponent
                key={`opp-${playerIdx}-${i}`}
                card={{ category: 0, color: QuartetColor.BLUE }}
                cardSet={cardSet}
                faceDown
                small
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderHumanPlayer = () => {
    const isActive = round.currentPlayer === humanSeat;

    return (
      <div className="quartets-player-area quartets-player-bottom">
        <div className={`quartets-player-info ${isActive ? 'quartets-player-active' : ''}`}>
          <span className="quartets-player-name">{humanPlayer.name}</span>
          <span className="quartets-player-details">
            {humanPlayer.completedQuartets.length > 0 &&
              `${humanPlayer.completedQuartets.length} ✓`}
          </span>
        </div>
        {humanPlayer.completedQuartets.length > 0 && (
          <div className="quartets-completed-emojis">
            {humanPlayer.completedQuartets.map((cat) => (
              <span key={cat}>{cardSet.categories[cat]?.emoji}</span>
            ))}
          </div>
        )}
        <div className="quartets-hand">
          {sortedHand.map((card, _i) => (
            <div key={`hand-${card.category}-${card.color}`} className="quartets-hand-card">
              <QuartetCardComponent card={card} cardSet={cardSet} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDrawPile = () => {
    const pileSize = round.drawPile.length;
    const dummyCard: QCard = { category: 0, color: QuartetColor.BLUE };

    return (
      <div className="quartets-center">
        <div className="quartets-draw-pile">
          {[...Array(Math.min(3, pileSize))].map((_, i) => (
            <QuartetCardComponent
              key={`pile-${i}`}
              card={dummyCard}
              cardSet={cardSet}
              faceDown
            />
          ))}
          {pileSize > 0 && (
            <div className="quartets-pile-count">{pileSize}</div>
          )}
        </div>
        <div className="quartets-pile-label">{t('quartets.drawPile')}</div>
      </div>
    );
  };

  const renderAskPanel = () => {
    if (!isHumanTurn) return null;
    if (askableCategories.length === 0) return null;

    // Build category picker items
    const categoryItems: DrumPickerItem[] = askableCategories.map((cat) => ({
      key: `cat-${cat}`,
      render: <span style={{ fontSize: 32 }}>{cardSet.categories[cat]?.emoji}</span>,
    }));

    // Opponents with cards
    const opponents = round.players.filter(
      (p) => p.seat !== humanSeat && p.hand.length > 0,
    );

    const canAsk = selectedTarget !== null && selectedCategory >= 0;

    return (
      <div className="quartets-action-panel">
        <div className="quartets-action-title">{t('quartets.yourTurn')}</div>

        {/* Step 1: Choose target */}
        <div className="quartets-target-row">
          {opponents.map((p) => (
            <button
              key={p.seat}
              className={`quartets-target-btn ${selectedTarget === p.seat ? 'quartets-target-btn-active' : ''}`}
              onClick={() => setSelectedTarget(p.seat)}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Step 2: Category picker */}
        {selectedTarget !== null && (
          <>
            <div className="quartets-pickers">
              <div>
                <DrumPicker
                  items={categoryItems}
                  selectedIndex={Math.min(categoryIdx, categoryItems.length - 1)}
                  onSelect={handleCategoryChange}
                />
                <div className="quartets-picker-label">{t('quartets.category')}</div>
              </div>
            </div>
            <button
              className="quartets-ask-btn"
              disabled={!canAsk}
              onClick={() => {
                if (selectedTarget !== null && selectedCategory >= 0) {
                  onAskForCard(selectedTarget, selectedCategory);
                  setSelectedTarget(null);
                  setCategoryIdx(0);
                }
              }}
            >
              {t('quartets.ask')}
            </button>
          </>
        )}
      </div>
    );
  };

  const renderWaiting = () => {
    if (phase !== QuartetsPhase.PLAYER_TURN) return null;
    if (round.currentPlayer === humanSeat) return null;

    const currentPlayerName = round.players[round.currentPlayer]?.name ?? 'Opponent';

    return (
      <div className="quartets-waiting">
        {t('quartets.waitingFor', { name: currentPlayerName })}
      </div>
    );
  };

  const renderBeingAsked = () => {
    const pendingRequest = round.pendingRequest;
    if (phase !== QuartetsPhase.AWAITING_RESPONSE || !pendingRequest) return null;
    // Only show interactive dialog to the target player
    if (pendingRequest.targetSeat !== humanSeat) return null;

    const askerName = round.players[pendingRequest.askerSeat]?.name ?? '';
    const emoji = cardSet.categories[pendingRequest.category]?.emoji ?? '?';

    // Check if human has ANY card of the asked category
    const hasCategory = humanPlayer.hand.some(
      (c) => c.category === pendingRequest.category,
    );

    return (
      <div className="quartets-being-asked-overlay">
        <div className="quartets-being-asked-panel">
          <div className="quartets-being-asked-title">
            {t('quartets.doYouHave', { name: askerName, emoji })}
          </div>
          <div className="quartets-being-asked-card-display">
            <span className="quartets-being-asked-emoji" style={{ fontSize: 48 }}>{emoji}</span>
          </div>
          {hasCategory ? (
            <button
              className="quartets-yes-btn"
              onClick={onResolveRequest}
            >
              {t('quartets.yesIHaveIt')}
            </button>
          ) : (
            <button
              className="quartets-gofish-btn"
              onClick={onResolveRequest}
            >
              {t('quartets.goFish')}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderChooseColor = () => {
    const pendingRequest = round.pendingRequest;
    if (phase !== QuartetsPhase.CHOOSING_COLOR || !pendingRequest) return null;
    // Only show to the asker
    if (pendingRequest.askerSeat !== humanSeat) return null;

    const targetName = round.players[pendingRequest.targetSeat]?.name ?? '';
    const emoji = cardSet.categories[pendingRequest.category]?.emoji ?? '?';

    // Colors the asker doesn't already have for this category
    const ownedColors = new Set(
      humanPlayer.hand
        .filter((c) => c.category === pendingRequest.category)
        .map((c) => c.color),
    );

    return (
      <div className="quartets-being-asked-overlay">
        <div className="quartets-being-asked-panel">
          <div className="quartets-being-asked-title">
            {t('quartets.chooseColorPrompt', { name: targetName, emoji })}
          </div>
          <div className="quartets-color-choices">
            {QUARTET_COLORS.map((color) => {
              const owned = ownedColors.has(color);
              return (
                <button
                  key={color}
                  className="quartets-color-choice-btn"
                  style={{ background: QUARTET_COLOR_HEX[color] }}
                  disabled={owned}
                  onClick={() => onChooseColor(color)}
                >
                  <span className="quartets-color-choice-emoji">{QUARTET_COLOR_EMOJI[color]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderRequestNotification = () => {
    const pendingRequest = round.pendingRequest;
    // Show during both AWAITING_RESPONSE and CHOOSING_COLOR
    if (phase !== QuartetsPhase.AWAITING_RESPONSE && phase !== QuartetsPhase.CHOOSING_COLOR) return null;
    if (!pendingRequest) return null;
    // Only show to players who are NOT the asker or target
    if (pendingRequest.askerSeat === humanSeat || pendingRequest.targetSeat === humanSeat) return null;

    const askerName = round.players[pendingRequest.askerSeat]?.name ?? '';
    const targetName = round.players[pendingRequest.targetSeat]?.name ?? '';
    const emoji = cardSet.categories[pendingRequest.category]?.emoji ?? '?';

    return (
      <div className="quartets-request-notification">
        <div className="quartets-request-notification-content">
          <span>{emoji}</span>
          <span>{t('quartets.requestNotification', { asker: askerName, target: targetName, emoji })}</span>
        </div>
      </div>
    );
  };

  const renderTurnResult = () => {
    if (phase !== QuartetsPhase.TURN_RESULT) return null;
    const lastAsk = round.lastAsk;
    if (!lastAsk) return null;

    const askerName = round.players[lastAsk.askerSeat]?.name ?? '';
    const targetName = round.players[lastAsk.targetSeat]?.name ?? '';
    const emoji = cardSet.categories[lastAsk.category]?.emoji ?? '?';
    const colorEmoji = lastAsk.color ? QUARTET_COLOR_EMOJI[lastAsk.color] : '';

    // If human was the target, they already interacted via the being-asked dialog
    // Show a brief auto-dismissing result (no click needed)
    const humanWasTarget = lastAsk.targetSeat === humanSeat;

    return (
      <div
        className={`quartets-result-toast ${!lastAsk.success ? 'quartets-result-toast-fail' : ''}`}
        onClick={humanWasTarget ? undefined : onAcknowledgeResult}
      >
        <div className="quartets-result-emoji">
          {emoji} {colorEmoji}
        </div>
        <div className="quartets-result-text">
          {lastAsk.success
            ? t('quartets.gotIt', { asker: askerName, target: targetName })
            : lastAsk.color
              ? t('quartets.goFish', { target: targetName })
              : t('quartets.noCategory', { target: targetName, emoji })}
        </div>
        {lastAsk.completedQuartet && (
          <div className="quartets-result-sub">
            {t('quartets.completedQuartet', { name: askerName })} {emoji}
          </div>
        )}
        {!humanWasTarget && (
          <div className="quartets-result-hint">{t('game.clickContinue')}</div>
        )}
      </div>
    );
  };

  const renderGameOver = () => {
    if (phase !== QuartetsPhase.GAME_OVER) return null;

    const sorted = [...round.players].sort(
      (a, b) => b.completedQuartets.length - a.completedQuartets.length,
    );

    return (
      <div className="quartets-gameover-overlay">
        <div className="quartets-gameover-panel">
          <h2 className="quartets-gameover-title">{t('common.gameOver')}</h2>
          <div className="quartets-gameover-scores">
            {sorted.map((player, i) => (
              <div
                key={player.seat}
                className={`quartets-gameover-entry ${i === 0 ? 'quartets-gameover-winner' : ''}`}
              >
                <span className="quartets-gameover-rank">#{i + 1}</span>
                <span className="quartets-gameover-name">{player.name}</span>
                <span className="quartets-gameover-emojis">
                  {player.completedQuartets.map((cat) => cardSet.categories[cat]?.emoji).join(' ')}
                </span>
                <span className="quartets-gameover-count">
                  {player.completedQuartets.length}
                </span>
              </div>
            ))}
          </div>
          <button className="quartets-gameover-btn" onClick={onEndGame}>
            {t('common.backToMenu')}
          </button>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="quartets-table">
      {/* Game info */}
      <div className="quartets-info">
        <span>{t('quartets.drawPile')}: {round.drawPile.length}</span>
      </div>

      {/* Opponent areas */}
      {round.players.map((player) => {
        if (player.seat === humanSeat) return null;
        return renderOpponent(player.seat, seatPositions[player.seat]);
      })}

      {/* Human player */}
      {renderHumanPlayer()}

      {/* Center: draw pile */}
      {renderDrawPile()}

      {/* Phase-specific UI */}
      {renderAskPanel()}
      {renderWaiting()}
      {renderBeingAsked()}
      {renderChooseColor()}
      {renderRequestNotification()}
      {renderTurnResult()}
      {renderGameOver()}

      {/* Reshuffle button */}
      {phase !== QuartetsPhase.GAME_OVER && (
        <button
          className="quartets-btn quartets-btn-reshuffle"
          onClick={() => setShowReshuffleConfirm(true)}
          title={t('common.reshuffleTitle')}
        >{'\u21BB'}</button>
      )}
      {showReshuffleConfirm && (
        <div className="quartets-overlay" onClick={() => setShowReshuffleConfirm(false)}>
          <div className="quartets-overlay-card" onClick={e => e.stopPropagation()}>
            <p style={{ color: '#fff', fontSize: '15px', margin: '0 0 16px' }}>{t('common.reshuffleTitle')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="quartets-btn quartets-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onNewGame?.(); }}>
                {t('common.reshuffleSame')}
              </button>
              <button className="quartets-btn quartets-btn-primary" onClick={() => { setShowReshuffleConfirm(false); onBack?.(); }}>
                {t('common.reshuffleMenu')}
              </button>
              <button className="quartets-btn" onClick={() => setShowReshuffleConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
