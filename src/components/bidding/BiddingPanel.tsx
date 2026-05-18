import { useState, useRef, useEffect } from 'react';
import type { StandardSuit } from '../../types/card';
import { Suit, SUITS, SUIT_SYMBOLS } from '../../types/card';
import type { BiddingState, PlayerSeat, AuctionBid } from '../../types/game';
import { HAND_SIZE, compareAuctionBids, SUIT_RANK } from '../../types/game';
import { useTranslation } from '../../i18n/LanguageContext';
import './BiddingPanel.css';

interface BiddingPanelProps {
  bidding: BiddingState;
  seat: PlayerSeat;
  onBid: (amount: number, suit?: StandardSuit) => void;
  playerNames: string[];
}

export function BiddingPanel({ bidding, seat, onBid, playerNames }: BiddingPanelProps) {
  const { t } = useTranslation();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<StandardSuit | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const isMyTurn = bidding.currentBidder === seat;

  // Auto-scroll history to bottom when new entries appear
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bidding.auctionHistory.length]);

  const isValidBid = (amount: number, suit: StandardSuit): boolean => {
    if (amount < bidding.minThreshold) return false;
    if (bidding.highestBid === null) return true;
    return compareAuctionBids({ amount, suit }, bidding.highestBid) > 0;
  };

  const isAmountPossible = (amount: number): boolean => {
    if (amount < bidding.minThreshold) return false;
    // Check if any suit makes this amount valid
    return SUITS.some((s) => isValidBid(amount, s));
  };

  const handlePass = () => {
    onBid(0);
    setSelectedAmount(null);
    setSelectedSuit(null);
  };

  const handleConfirm = () => {
    if (selectedAmount !== null && selectedSuit !== null) {
      onBid(selectedAmount, selectedSuit);
      setSelectedAmount(null);
      setSelectedSuit(null);
    }
  };

  const formatBid = (bid: AuctionBid | null): string => {
    if (bid === null) return t('common.pass');
    return `${bid.amount}${SUIT_SYMBOLS[bid.suit]}`;
  };

  // Sorted suits for display: Spades > Hearts > Diamonds > Clubs (highest first)
  const sortedSuits = [...SUITS].sort((a, b) => SUIT_RANK[b] - SUIT_RANK[a]);

  return (
    <div className="bidding-panel">
      <div className="bidding-header">
        <h3>{t('bidding.auction')} {bidding.exchangeRound > 0 ? t('bidding.exchangeRound', { n: bidding.exchangeRound }) : ''}</h3>
        <p className="bidding-threshold">{t('bidding.minBid', { n: bidding.minThreshold })}</p>
        {bidding.highestBid !== null && bidding.highestBidder !== null && (
          <p className="bidding-threshold">
            {t('bidding.highestBid', { bid: `${bidding.highestBid.amount}${SUIT_SYMBOLS[bidding.highestBid.suit]}`, name: playerNames[bidding.highestBidder] })}
          </p>
        )}
      </div>

      {/* Auction history log */}
      {bidding.auctionHistory.length > 0 && (
        <div className="auction-history">
          {bidding.auctionHistory.map((entry, i) => (
            <div key={i} className={`auction-history-entry ${entry.bid !== null ? 'auction-history-bid' : ''}`}>
              <span className="auction-history-name">{playerNames[entry.seat]}</span>
              <span className="auction-history-value">{formatBid(entry.bid)}</span>
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      )}

      {/* Current bidder indicator when it's not my turn */}
      {!isMyTurn && (
        <p className="waiting-text">{t('bidding.waitingFor', { name: playerNames[bidding.currentBidder] })}</p>
      )}

      {isMyTurn && (
        <div className="bid-controls">
          {/* Step 1: Pick a number */}
          <div className="bid-buttons">
            {Array.from({ length: HAND_SIZE - bidding.minThreshold + 1 }, (_, i) => i + bidding.minThreshold).map((val) => (
              <button
                key={val}
                className={`bid-btn ${selectedAmount === val ? 'bid-btn-selected' : ''} ${!isAmountPossible(val) ? 'bid-btn-restricted' : ''}`}
                disabled={!isAmountPossible(val)}
                onClick={() => {
                  setSelectedAmount(val);
                  setSelectedSuit(null); // Reset suit when changing amount
                }}
              >
                {val}
              </button>
            ))}
          </div>

          {/* Step 2: Pick a suit (only shown when amount is selected) */}
          {selectedAmount !== null && (
            <div className="bid-buttons suit-buttons">
              {sortedSuits.map((s) => {
                const valid = isValidBid(selectedAmount, s);
                return (
                  <button
                    key={s}
                    className={`bid-btn suit-btn ${selectedSuit === s ? 'bid-btn-selected' : ''} ${!valid ? 'bid-btn-restricted' : ''} ${s === Suit.HEARTS || s === Suit.DIAMONDS ? 'suit-red' : 'suit-black'}`}
                    disabled={!valid}
                    onClick={() => setSelectedSuit(s)}
                  >
                    {SUIT_SYMBOLS[s]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="bid-action-buttons">
            <button
              className="bid-confirm"
              onClick={handlePass}
            >
              {t('common.pass')}
            </button>
            <button
              className="bid-confirm"
              disabled={selectedAmount === null || selectedSuit === null}
              onClick={handleConfirm}
            >
              {t('bidding.confirmBid')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
