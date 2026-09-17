import { useEffect, useMemo, useRef, useState } from 'react';
import { MahjongLayoutId, MahjongPhase } from '../types';
import type { MahjongGameState } from '../types';
import { MAHJONG_LAYOUTS, MAHJONG_LAYOUT_IDS } from '../engine/layouts';
import { freeTileIds } from '../engine/board';
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

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface MahjongTableProps {
  gameState: MahjongGameState;
  canUndo: boolean;
  /** Best recorded time for this layout, shown after a win. */
  bestSeconds: number | null;
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
  bestSeconds,
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
        <div className="mj-overlay">
          <div className="mj-modal">
            <h2>{t('mahjong.youWon')}</h2>
            <p>{t('mahjong.wonMessage', { time: formatClock(gameState.elapsedSeconds), n: gameState.moves })}</p>
            {bestSeconds !== null ? (
              <p>{t('mahjong.best', { time: formatClock(bestSeconds) })}</p>
            ) : null}
            <div className="mj-modal-actions">
              <button className="mj-btn mj-btn-primary" onClick={() => onNewGame()}>
                {t('mahjong.playAgain')}
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
