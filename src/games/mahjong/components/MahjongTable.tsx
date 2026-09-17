import { useEffect, useMemo, useRef, useState } from 'react';
import { MahjongLayoutId, MahjongPhase } from '../types';
import type { MahjongGameState, MahjongLeaderboardEntry } from '../types';
import { MAHJONG_LAYOUTS, MAHJONG_LAYOUT_IDS } from '../engine/layouts';
import { freeTileIds } from '../engine/board';
import { createRNG } from '../../../utils/random';
import { MahjongTileFace } from './MahjongTileFace';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations';
import './MahjongTable.css';

/** Tile height relative to width, and the 3D stack offset per layer. */
const TILE_ASPECT = 1.32;
const LAYER_OFFSET_RATIO = 0.11;
const MIN_TILE_W = 12;
const MAX_TILE_W = 62;

const LAYOUT_NAME_KEYS: Record<MahjongLayoutId, TranslationKey> = {
  [MahjongLayoutId.TURTLE]: 'mahjong.layout.turtle',
  [MahjongLayoutId.PYRAMID]: 'mahjong.layout.pyramid',
  [MahjongLayoutId.FORTRESS]: 'mahjong.layout.fortress',
  [MahjongLayoutId.TOWER]: 'mahjong.layout.tower',
};

const CELEB_KEYS: TranslationKey[] = [
  'mahjong.celebMsg1',
  'mahjong.celebMsg2',
  'mahjong.celebMsg3',
  'mahjong.celebMsg4',
  'mahjong.celebMsg5',
  'mahjong.celebMsg6',
];

/**
 * Confetti glyphs. Deliberately NOT from the Unicode mahjong block (U+1F000+):
 * those lack emoji-font coverage on common platforms and fall back to a blank
 * white box, which reads as a broken image mid-celebration. 🎴 carries the
 * tile-game flavour instead.
 */
const PARTICLE_GLYPHS = [
  '\u{1F3B4}', '\u{1F389}', '\u2B50', '\u2728', '\u{1F3C6}', '\u{1F3EE}',
  '\u{1F38B}', '\u{1F4AB}', '\u{1F38A}', '\u{1F451}', '\u{1F9E7}', '\u{1F3AF}',
];

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface MahjongTableProps {
  gameState: MahjongGameState;
  canUndo: boolean;
  /** Best times for this layout, shown in the win overlay. */
  leaderboard: MahjongLeaderboardEntry[];
  onTapTile: (tileId: string) => void;
  onClearSelection: () => void;
  onUndo: () => void;
  onHint: () => void;
  onShuffle: () => void;
  onNewGame: (layoutId?: MahjongLayoutId) => void;
  onRestartSameTiles: () => void;
  onBack: () => void;
}

export function MahjongTable({
  gameState,
  canUndo,
  leaderboard,
  onTapTile,
  onClearSelection,
  onUndo,
  onHint,
  onShuffle,
  onNewGame,
  onRestartSameTiles,
  onBack,
}: MahjongTableProps) {
  const { t } = useTranslation();
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const [tileWidth, setTileWidth] = useState(28);
  const [showSettings, setShowSettings] = useState(false);

  const layout = MAHJONG_LAYOUTS[gameState.layoutId];
  const free = useMemo(() => freeTileIds(layout, gameState.tiles), [layout, gameState.tiles]);

  // Scale the whole board to whatever space the viewport gives us, rather than
  // hardcoding tile sizes (same principle as the Israeli Rummy tier system).
  useEffect(() => {
    const element = boardAreaRef.current;
    if (!element) return;

    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const cols = layout.width / 2 + layout.maxLayer * LAYER_OFFSET_RATIO;
      const rows = layout.height / 2 + layout.maxLayer * LAYER_OFFSET_RATIO;
      const byWidth = width / cols;
      const byHeight = height / (rows * TILE_ASPECT);
      const next = Math.max(MIN_TILE_W, Math.min(MAX_TILE_W, Math.floor(Math.min(byWidth, byHeight))));
      setTileWidth(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [layout]);

  const tileHeight = Math.round(tileWidth * TILE_ASPECT);
  const offsetX = tileWidth * LAYER_OFFSET_RATIO;
  const offsetY = tileHeight * LAYER_OFFSET_RATIO;
  const boardWidth = (layout.width / 2) * tileWidth + layout.maxLayer * offsetX;
  const boardHeight = (layout.height / 2) * tileHeight + layout.maxLayer * offsetY;

  const hintIds = gameState.hintPair ? new Set(gameState.hintPair) : null;
  const remaining = gameState.tiles.length;
  const won = gameState.phase === MahjongPhase.WON;

  // Confetti and the flavour line are derived from the board seed rather than
  // Math.random(): react-x rejects impure calls during render, and a seeded
  // scatter is stable across re-renders (and matches the project convention).
  const celebIdx = gameState.seed % CELEB_KEYS.length;
  const particles = useMemo(() => {
    const rng = createRNG(gameState.seed + 1);
    return Array.from({ length: 28 }, (_, i) => ({
      glyph: PARTICLE_GLYPHS[i % PARTICLE_GLYPHS.length],
      left: rng() * 100,
      delay: rng() * 2.2,
      duration: 2.4 + rng() * 2.2,
      size: 16 + rng() * 20,
    }));
  }, [gameState.seed]);

  // A leaderboard row belongs to the run just finished when both its time and
  // its match count line up — the same test Solitaire's win card uses.
  const isCurrentRun = (entry: MahjongLeaderboardEntry) =>
    entry.seconds === gameState.elapsedSeconds && entry.moves === gameState.moves;
  const isNewRecord = leaderboard.length > 1 && isCurrentRun(leaderboard[0]);

  return (
    <div className="mj-table">
      <div className="mj-top-bar">
        <button className="mj-btn mj-btn-back" onClick={onBack}>
          {t('common.backToMenu')}
        </button>
        <div className="mj-stats">
          <span>{t('mahjong.time', { time: formatClock(gameState.elapsedSeconds) })}</span>
          <span>{t('mahjong.remaining', { n: remaining })}</span>
        </div>
        <div className="mj-actions">
          <button className="mj-btn" onClick={onUndo} disabled={!canUndo || won}>
            {t('mahjong.undo')}
          </button>
          <button className="mj-btn" onClick={onHint} disabled={won || gameState.stuck}>
            {t('mahjong.hint')}
          </button>
          <button className="mj-btn" onClick={onShuffle} disabled={won}>
            {t('mahjong.shuffle')}
          </button>
          <button className="mj-btn" onClick={() => setShowSettings(true)} aria-label={t('mahjong.settings')}>
            {'⚙'}
          </button>
        </div>
      </div>

      <div className="mj-board-area" ref={boardAreaRef}>
        <div
          className="mj-board"
          style={{ width: boardWidth, height: boardHeight }}
          onClick={onClearSelection}
        >
          {gameState.tiles.map(({ pos, tile }) => {
            const isFree = free.has(tile.id);
            const classNames = [
              'mj-tile',
              isFree ? 'mj-tile-free' : 'mj-tile-blocked',
              gameState.selectedId === tile.id ? 'mj-tile-selected' : '',
              hintIds?.has(tile.id) ? 'mj-tile-hinted' : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={tile.id}
                type="button"
                className={classNames}
                style={{
                  width: tileWidth,
                  height: tileHeight,
                  fontSize: tileHeight,
                  left: (pos.x / 2) * tileWidth + pos.layer * offsetX,
                  top: layout.maxLayer * offsetY + (pos.y / 2) * tileHeight - pos.layer * offsetY,
                  zIndex: pos.layer * 10000 + pos.y * 100 + pos.x,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTapTile(tile.id);
                }}
                disabled={!isFree || won}
              >
                <MahjongTileFace tile={tile} />
              </button>
            );
          })}
        </div>
      </div>

      {gameState.stuck && !won ? (
        <div className="mj-banner">
          <span>{t('mahjong.noMoves')}</span>
          <button className="mj-btn mj-btn-primary" onClick={onShuffle}>
            {t('mahjong.shuffle')}
          </button>
          <button className="mj-btn" onClick={() => onNewGame()}>
            {t('mahjong.newGame')}
          </button>
        </div>
      ) : null}

      {won ? (
        <div className="mj-win-overlay">
          <div className="mj-win-particles" aria-hidden>
            {particles.map((p, i) => (
              <span
                key={i}
                className="mj-particle"
                style={{
                  left: `${p.left}%`,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  fontSize: `${p.size}px`,
                }}
              >
                {p.glyph}
              </span>
            ))}
          </div>

          <div className="mj-win-card">
            <div className="mj-win-trophy">{'\u{1F3C6}'}</div>
            <h2 className="mj-win-title">{t('mahjong.youWon')}</h2>
            <p className="mj-win-celeb">{t(CELEB_KEYS[celebIdx])}</p>

            {isNewRecord ? <p className="mj-win-record">{t('mahjong.newRecord')}</p> : null}
            {gameState.shufflesUsed === 0 ? (
              <p className="mj-win-perfect">{t('mahjong.perfectClear')}</p>
            ) : null}

            <div className="mj-win-stats">
              <div className="mj-win-stat">
                <span className="mj-win-stat-value">{formatClock(gameState.elapsedSeconds)}</span>
                <span className="mj-win-stat-label">{t('mahjong.statTime')}</span>
              </div>
              <div className="mj-win-stat">
                <span className="mj-win-stat-value">{gameState.moves}</span>
                <span className="mj-win-stat-label">{t('mahjong.statMatches')}</span>
              </div>
              <div className="mj-win-stat">
                <span className="mj-win-stat-value">{gameState.shufflesUsed}</span>
                <span className="mj-win-stat-label">{t('mahjong.statShuffles')}</span>
              </div>
            </div>

            <p className="mj-win-layout">
              {t('mahjong.layoutLabel', { name: t(LAYOUT_NAME_KEYS[gameState.layoutId]) })}
            </p>

            {leaderboard.length > 0 ? (
              <div className="mj-leaderboard">
                <h3>{t('mahjong.leaderboard')}</h3>
                <ol className="mj-leaderboard-list">
                  {leaderboard.map((entry, i) => (
                    <li key={i} className={isCurrentRun(entry) ? 'mj-lb-current' : ''}>
                      <span className="mj-lb-rank">{i + 1}</span>
                      <span className="mj-lb-time">{formatClock(entry.seconds)}</span>
                      <span className="mj-lb-moves">
                        {t('mahjong.movesLabel', { n: entry.moves })}
                      </span>
                      <span className="mj-lb-date">{entry.date}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="mj-win-buttons">
              <button className="mj-btn mj-btn-primary mj-btn-play-again" onClick={() => onNewGame()}>
                {t('mahjong.playAgain')} {'\u21BB'}
              </button>
              <button className="mj-btn" onClick={onBack}>
                {t('common.backToMenu')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <div className="mj-overlay" onClick={() => setShowSettings(false)}>
          <div className="mj-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('mahjong.settings')}</h2>
            <p className="mj-modal-label">{t('mahjong.chooseLayout')}</p>
            <div className="mj-layout-choices">
              {MAHJONG_LAYOUT_IDS.map((id) => (
                <button
                  key={id}
                  className={`mj-btn ${id === gameState.layoutId ? 'mj-btn-primary' : ''}`}
                  onClick={() => {
                    setShowSettings(false);
                    onNewGame(id);
                  }}
                >
                  {t(LAYOUT_NAME_KEYS[id])}
                </button>
              ))}
            </div>
            <div className="mj-modal-actions">
              <button
                className="mj-btn"
                onClick={() => {
                  setShowSettings(false);
                  onRestartSameTiles();
                }}
              >
                {t('mahjong.restartSameTiles')}
              </button>
              <button className="mj-btn" onClick={() => setShowSettings(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
