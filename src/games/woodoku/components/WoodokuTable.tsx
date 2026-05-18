import './WoodokuTable.css';
import type { WoodokuGameState, WoodokuPiece } from '../types';
import { useTranslation } from '../../../i18n/LanguageContext';

interface WoodokuTableProps {
  gameState: WoodokuGameState;
  previewCells: Array<[number, number]> | null;
  hoveredAnchor: [number, number] | null;
  onSetHoveredAnchor: (anchor: [number, number] | null) => void;
  onSelectPiece: (index: number) => void;
  onPlacePiece: (row: number, col: number) => void;
  onNewGame: () => void;
  onBack: () => void;
}

const MINI_CELL_SIZE = 14;
const MINI_GAP = 2;

function MiniPiecePreview({ piece }: { piece: WoodokuPiece }) {
  const maxRow = Math.max(...piece.cells.map(([r]) => r));
  const maxCol = Math.max(...piece.cells.map(([, c]) => c));
  const rows = maxRow + 1;
  const cols = maxCol + 1;

  const filledSet = new Set(piece.cells.map(([r, c]) => `${r},${c}`));

  return (
    <div
      className="wk-mini-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${MINI_CELL_SIZE}px)`,
        gridTemplateRows: `repeat(${rows}, ${MINI_CELL_SIZE}px)`,
        gap: MINI_GAP,
      }}
    >
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <div
            key={`${r},${c}`}
            className={`wk-mini-cell${filledSet.has(`${r},${c}`) ? ' wk-mini-cell--filled' : ''}`}
            style={{ width: MINI_CELL_SIZE, height: MINI_CELL_SIZE }}
          />
        )),
      )}
    </div>
  );
}

function PieceTray({
  piece,
  index,
  isSelected,
  onSelect,
}: {
  piece: WoodokuPiece | null;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}) {
  const isEmpty = piece === null;

  return (
    <button
      className={`wk-tray${isSelected ? ' wk-tray--selected' : ''}${isEmpty ? ' wk-tray--empty' : ''}`}
      onClick={() => !isEmpty && onSelect(index)}
      disabled={isEmpty}
      aria-pressed={isSelected}
      aria-label={isEmpty ? `Piece slot ${index + 1} empty` : `Piece slot ${index + 1}`}
    >
      {piece && <MiniPiecePreview piece={piece} />}
    </button>
  );
}

export function WoodokuTable({
  gameState,
  previewCells,
  onSetHoveredAnchor,
  onSelectPiece,
  onPlacePiece,
  onNewGame,
  onBack,
}: WoodokuTableProps) {
  const { t } = useTranslation();
  const { state, highScore } = gameState;
  const { board, offered, score, phase, selectedIndex } = state;

  const previewSet = new Set(previewCells?.map(([r, c]) => `${r},${c}`) ?? []);

  function handleCellClick(row: number, col: number) {
    if (phase !== 'PLAYING') return;
    if (selectedIndex === null) return;
    onPlacePiece(row, col);
  }

  function handleCellPointerEnter(row: number, col: number) {
    if (selectedIndex === null) return;
    onSetHoveredAnchor([row, col]);
  }

  function handleGridPointerLeave() {
    onSetHoveredAnchor(null);
  }

  return (
    <div className="wk-table">
      {/* Top bar */}
      <div className="wk-top-bar">
        <button className="wk-back-btn" onClick={onBack} aria-label={t('common.backToMenu')}>
          {t('common.backToMenu')}
        </button>
        <div className="wk-scores">
          <div className="wk-score-block">
            <span className="wk-score-label">{t('woodoku.score')}</span>
            <span className="wk-score-value">{score}</span>
          </div>
          <div className="wk-score-block">
            <span className="wk-score-label">{t('woodoku.highScore')}</span>
            <span className="wk-score-value wk-score-value--high">{highScore}</span>
          </div>
        </div>
      </div>

      {/* 9x9 grid */}
      <div className="wk-grid-wrapper">
        <div
          className="wk-grid"
          onPointerLeave={handleGridPointerLeave}
          role="grid"
          aria-label="Woodoku board"
        >
          {board.map((row, r) =>
            row.map((filled, c) => {
              const key = `${r},${c}`;
              const isPreview = previewSet.has(key);
              const boxRight = c === 2 || c === 5;
              const boxBottom = r === 2 || r === 5;

              let cellClass = 'wk-cell';
              if (filled) cellClass += ' wk-cell--filled';
              else if (isPreview) cellClass += ' wk-cell--preview';

              return (
                <div
                  key={key}
                  className={cellClass}
                  data-box-right={boxRight ? 'true' : undefined}
                  data-box-bottom={boxBottom ? 'true' : undefined}
                  role="gridcell"
                  aria-selected={isPreview}
                  onClick={() => handleCellClick(r, c)}
                  onPointerEnter={() => handleCellPointerEnter(r, c)}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Piece trays */}
      <div className="wk-trays" role="group" aria-label={t('woodoku.selectPiece')}>
        {offered.map((piece, i) => (
          <PieceTray
            key={i}
            piece={piece}
            index={i}
            isSelected={selectedIndex === i}
            onSelect={onSelectPiece}
          />
        ))}
      </div>

      {/* Game-over overlay */}
      {phase === 'GAME_OVER' && (
        <div className="wk-overlay" role="dialog" aria-modal="true" aria-label={t('woodoku.gameOver')}>
          <div className="wk-overlay-card">
            <div className="wk-overlay-title">{t('woodoku.gameOver')}</div>
            <div className="wk-overlay-score">
              {t('woodoku.score')}: <strong>{score}</strong>
            </div>
            {score >= highScore && score > 0 && (
              <div className="wk-overlay-score">
                {t('woodoku.highScore')}: <strong>{highScore}</strong>
              </div>
            )}
            <button className="wk-overlay-btn" onClick={onNewGame} autoFocus>
              {t('woodoku.newGame')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
