import { useState, useCallback } from 'react';
import type { CardKey } from '../../types/card';
import type { Card as CardType, StandardSuit } from '../../types/card';
import { cardKey, cardEquals, SUIT_SYMBOLS } from '../../types/card';
import type { GameState, PlayerSeat } from '../../types/game';
import { GamePhase, HAND_SIZE } from '../../types/game';
import { getPlayableCards } from '../../engine/trick';
import { getRestrictedBid } from '../../engine/bidding';
import { EXCHANGE_CARD_COUNT } from '../../engine/exchange';
import { CardFan } from '../cards/CardFan';
import { TrickArea } from '../cards/TrickArea';
import { BiddingPanel } from '../bidding/BiddingPanel';
import { ExchangePanel } from '../exchange/ExchangePanel';
import { RoundSummary } from '../scoring/RoundSummary';
import { Scoreboard } from '../scoring/Scoreboard';
import { useTranslation } from '../../i18n/LanguageContext';
import './GameTable.css';

interface GameTableProps {
  gameState: GameState;
  humanSeat: PlayerSeat;
  onBid: (amount: number, suit?: StandardSuit) => void;
  onSelectDiscards: (cards: CardKey[]) => void;
  onChooseTrump: (suit: StandardSuit) => void;
  onRaiseBid: (amount: number) => void;
  onDeclare: (amount: number) => void;
  onPlayCard: (cardKey: CardKey) => void;
  onCollectTrick: () => void;
  onNextRound: () => void;
  onEndGame: () => void;
  onHome?: () => void;
}

export function GameTable({
  gameState,
  humanSeat,
  onBid,
  onSelectDiscards,
  onChooseTrump: _onChooseTrump,
  onRaiseBid,
  onDeclare,
  onPlayCard,
  onCollectTrick,
  onNextRound,
  onEndGame,
  onHome,
}: GameTableProps) {
  const { t } = useTranslation();
  const [selectedExchangeCards, setSelectedExchangeCards] = useState<CardKey[]>([]);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [selectedRaise, setSelectedRaise] = useState<number | null>(null);
  const [selectedDeclare, setSelectedDeclare] = useState<number | null>(null);

  const round = gameState.currentRound;
  const humanPlayer = round.players[humanSeat];
  const playerNames = round.players.map((p) => p.name);

  // Get positions relative to human (human is always at bottom)
  const getRelativePosition = (seat: PlayerSeat): 'bottom' | 'left' | 'top' | 'right' => {
    const diff = ((seat - humanSeat + 4) % 4);
    return (['bottom', 'left', 'top', 'right'] as const)[diff];
  };

  // Get playable cards for human
  const playableCards = round.phase === GamePhase.PLAYING && round.currentPlayer === humanSeat
    ? getPlayableCards(humanPlayer.hand, round.currentTrick.leadSuit)
    : [];

  // Handle card click
  const handleCardClick = useCallback((card: CardType) => {
    if (round.phase === GamePhase.PLAYING && round.currentPlayer === humanSeat) {
      const isPlayable = playableCards.some((c) => cardEquals(c, card));
      if (isPlayable) {
        onPlayCard(cardKey(card));
      }
    } else if (round.phase === GamePhase.EXCHANGING) {
      const key = cardKey(card);
      setSelectedExchangeCards((prev) => {
        if (prev.includes(key)) {
          return prev.filter((k) => k !== key);
        }
        if (prev.length < EXCHANGE_CARD_COUNT) {
          return [...prev, key];
        }
        return prev;
      });
    }
  }, [round.phase, round.currentPlayer, humanSeat, playableCards, onPlayCard]);

  const handleExchangeConfirm = () => {
    onSelectDiscards(selectedExchangeCards);
    setSelectedExchangeCards([]);
  };

  const handleRaiseConfirm = () => {
    if (selectedRaise !== null) {
      onRaiseBid(selectedRaise);
      setSelectedRaise(null);
    }
  };

  const handleDeclareConfirm = () => {
    if (selectedDeclare !== null) {
      onDeclare(selectedDeclare);
      setSelectedDeclare(null);
    }
  };

  // Last round scores for summary
  const lastScores = gameState.scoreboard.length > 0
    ? gameState.scoreboard[gameState.scoreboard.length - 1]
    : null;

  // Check for DECLARING phase: is the human the last declarer?
  const isLastDeclarerForHuman = round.phase === GamePhase.DECLARING
    && round.bidding.currentBidder === humanSeat
    && (() => {
      // Count how many non-trumpCaller players have already declared
      const declared = round.bidding.bids.filter((b, i) => b !== null && i !== round.trumpCaller).length;
      return declared === 2;
    })();
  const restrictedDeclare = isLastDeclarerForHuman ? getRestrictedBid(round.bidding.bids) : null;

  return (
    <div className="game-table">
      {/* Score button + info panel */}
      <div className="top-right-panel">
        <button className="score-toggle" onClick={() => setShowScoreboard(true)}>
          {t('common.scores')}
        </button>
        <div className="bids-summary">
          {round.trumpSuit && (
            <div className="summary-trump">{t('game.trump')} {SUIT_SYMBOLS[round.trumpSuit]}</div>
          )}
          {round.players.map((p) => (
            <div key={p.seat} className="summary-row">
              <span className="summary-name">{p.name}</span>
              <span className="summary-bid">{p.bid !== null ? p.bid : '-'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Home button + Game info */}
      <div className="game-info-area">
        {onHome && (
          <button className="home-btn" onClick={onHome} title={t('common.backToMenu')}>
            <img src="/achim.png" alt="Home" className="home-logo" />
          </button>
        )}
        <div className="game-info">
          <span>{t('game.roundN', { n: round.roundNumber + 1 })}</span>
          <span>{t('game.dealer', { name: playerNames[round.dealerSeat] })}</span>
        </div>
      </div>

      {/* Player positions */}
      {round.players.map((player) => {
        const pos = getRelativePosition(player.seat);
        const isHuman = player.seat === humanSeat;

        return (
          <div key={player.seat} className={`player-area player-area-${pos}`}>
            <div className={`player-info ${round.currentPlayer === player.seat ? 'player-active' : ''}`}>
              <span className="player-name">{player.name}</span>
              <span className="player-stats">
                {player.bid !== null && t('game.bid', { n: player.bid })}
                {round.phase === GamePhase.PLAYING || round.phase === GamePhase.TRICK_COMPLETE
                  ? ` | ${t('game.won', { n: player.tricksWon })}` : ''}
              </span>
              <span className="player-score">{t('game.score', { n: player.score })}</span>
            </div>
            <CardFan
              cards={player.hand}
              faceDown={!isHuman}
              playableCards={isHuman ? playableCards : undefined}
              selectedCards={isHuman && round.phase === GamePhase.EXCHANGING ? selectedExchangeCards : undefined}
              onCardClick={isHuman ? handleCardClick : undefined}
              position={pos}
            />
          </div>
        );
      })}

      {/* Center trick area */}
      <TrickArea
        trick={round.currentTrick}
        trumpSuit={round.trumpSuit}
        trickNumber={round.trickNumber}
        lastTrick={round.completedTricks.length > 0 ? round.completedTricks[round.completedTricks.length - 1] : null}
        playerNames={playerNames}
      />

      {/* Click to collect trick */}
      {round.phase === GamePhase.TRICK_COMPLETE && (
        <button className="collect-trick-btn" onClick={onCollectTrick}>
          {round.currentTrick.winnerSeat !== null
            ? t('game.winsClickContinue', { name: playerNames[round.currentTrick.winnerSeat] })
            : t('game.clickContinue')}
        </button>
      )}

      {/* Phase-specific UI */}
      {round.phase === GamePhase.BIDDING && (
        <BiddingPanel
          bidding={round.bidding}
          seat={humanSeat}
          onBid={onBid}
          playerNames={playerNames}
        />
      )}

      {/* RAISE phase */}
      {round.phase === GamePhase.RAISE && round.trumpCaller === humanSeat && (
        <div className="bidding-panel">
          <div className="bidding-header">
            <h3>{t('game.raiseTitle')}</h3>
            <p className="bidding-threshold">
              {t('game.raiseInfo', { trump: round.trumpSuit ? SUIT_SYMBOLS[round.trumpSuit] : '?', bid: round.bidding.highestBid?.amount ?? 0 })}
            </p>
            <p className="bidding-threshold">
              {t('game.raiseHint')}
            </p>
          </div>
          <div className="bid-controls">
            <div className="bid-buttons">
              {Array.from({ length: HAND_SIZE + 1 }, (_, i) => i).map((val) => (
                <button
                  key={val}
                  className={`bid-btn ${selectedRaise === val ? 'bid-btn-selected' : ''} ${val < (round.bidding.highestBid?.amount ?? 0) ? 'bid-btn-restricted' : ''}`}
                  disabled={val < (round.bidding.highestBid?.amount ?? 0)}
                  onClick={() => setSelectedRaise(val)}
                >
                  {val}
                </button>
              ))}
            </div>
            <button
              className="bid-confirm"
              disabled={selectedRaise === null}
              onClick={handleRaiseConfirm}
            >
              {selectedRaise === (round.bidding.highestBid?.amount ?? 0) ? t('game.keepBid') : t('game.confirmRaise')}
            </button>
          </div>
        </div>
      )}

      {round.phase === GamePhase.RAISE && round.trumpCaller !== humanSeat && (
        <div className="waiting-panel">
          {t('game.waitingRaise', { name: playerNames[round.trumpCaller!] })}
        </div>
      )}

      {/* DECLARING phase */}
      {round.phase === GamePhase.DECLARING && round.bidding.currentBidder === humanSeat && (
        <div className="bidding-panel">
          <div className="bidding-header">
            <h3>{t('game.declareTitle')}</h3>
            <p className="bidding-threshold">
              {t('game.declareInfo', { trump: round.trumpSuit ? SUIT_SYMBOLS[round.trumpSuit] : '?', name: `${playerNames[round.trumpCaller!]} (bid ${round.bidding.bids[round.trumpCaller!]})` })}
            </p>
          </div>
          <div className="bids-display">
            {round.bidding.bids.map((bid, i) => (
              <div key={i} className={`bid-entry ${round.bidding.currentBidder === i ? 'bid-current' : ''}`}>
                <span className="bid-name">{playerNames[i]}</span>
                <span className="bid-value">
                  {bid !== null ? bid : (round.bidding.currentBidder === i ? '...' : '-')}
                </span>
              </div>
            ))}
          </div>
          <div className="bid-controls">
            <div className="bid-buttons">
              {Array.from({ length: HAND_SIZE + 1 }, (_, i) => i).map((val) => (
                <button
                  key={val}
                  className={`bid-btn ${selectedDeclare === val ? 'bid-btn-selected' : ''} ${restrictedDeclare === val ? 'bid-btn-restricted' : ''}`}
                  disabled={restrictedDeclare === val}
                  onClick={() => setSelectedDeclare(val)}
                  title={restrictedDeclare === val ? t('game.cannotDeclare') : ''}
                >
                  {val}
                </button>
              ))}
            </div>
            <button
              className="bid-confirm"
              disabled={selectedDeclare === null}
              onClick={handleDeclareConfirm}
            >
              {t('game.confirmDeclare')}
            </button>
          </div>
        </div>
      )}

      {round.phase === GamePhase.DECLARING && round.bidding.currentBidder !== humanSeat && (
        <div className="waiting-panel">
          {t('game.waitingDeclare', { name: playerNames[round.bidding.currentBidder] })}
        </div>
      )}

      {round.phase === GamePhase.EXCHANGING && (
        <ExchangePanel
          selectedCards={selectedExchangeCards}
          onConfirm={handleExchangeConfirm}
          exchangeRound={round.bidding.exchangeRound}
        />
      )}

      {round.phase === GamePhase.ROUND_END && lastScores && (
        <RoundSummary
          scores={lastScores}
          playerNames={playerNames}
          roundNumber={round.roundNumber}
          onNextRound={onNextRound}
          onEndGame={onEndGame}
        />
      )}

      {round.phase === GamePhase.GAME_OVER && (
        <div className="game-over-overlay">
          <div className="game-over-panel">
            <h2>{t('common.gameOver')}</h2>
            {lastScores && (
              <div className="final-scores">
                {[...lastScores]
                  .sort((a, b) => b.cumulativeScore - a.cumulativeScore)
                  .map((entry, i) => (
                    <div key={entry.seat} className={`final-entry ${i === 0 ? 'final-winner' : ''}`}>
                      <span className="final-rank">#{i + 1}</span>
                      <span className="final-name">{playerNames[entry.seat]}</span>
                      <span className="final-score">{entry.cumulativeScore}</span>
                    </div>
                  ))}
              </div>
            )}
            <button className="menu-btn menu-btn-primary" onClick={() => window.location.reload()}>
              {t('common.backToMenu')}
            </button>
          </div>
        </div>
      )}

      {/* Scoreboard modal */}
      <Scoreboard
        scoreboard={gameState.scoreboard}
        playerNames={playerNames}
        show={showScoreboard}
        onClose={() => setShowScoreboard(false)}
      />
    </div>
  );
}
