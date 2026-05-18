import './CheckersTable.css';
import type { CheckersGameState, PieceColor } from '../types';
import { useTranslation } from '../../../i18n/LanguageContext';

interface CheckersTableProps {
  gameState: CheckersGameState;
  humanColor: PieceColor;
  legalMoves: Array<[number, number]>;
  onSelectPiece: (row: number, col: number) => void;
  onMovePiece: (toRow: number, toCol: number) => void;
  onNewGame: () => void;
  opponentName?: string;
}

export function CheckersTable({
  gameState,
  humanColor,
  legalMoves,
  onSelectPiece,
  onMovePiece,
  onNewGame,
  opponentName,
}: CheckersTableProps) {
  const { t } = useTranslation();
  const { state, settings } = gameState;
  const { board, turn, phase, winner, selectedRow, selectedCol, forcedPieces } = state;

  const isHumanTurn = turn === humanColor;
  const opponentColor: PieceColor = humanColor === 'red' ? 'black' : 'red';
  const displayOpponentName =
    opponentName ?? settings.playerNames[humanColor === 'red' ? 1 : 0] ?? 'Opponent';

  const legalSet = new Set(legalMoves.map(([r, c]) => `${r},${c}`));
  const forcedSet = new Set(forcedPieces.map(([r, c]) => `${r},${c}`));

  function getTurnLabel(): string {
    if (phase === 'GAME_OVER') return t('checkers.gameOver');
    if (isHumanTurn) return t('checkers.yourTurn');
    return t('checkers.opponentTurn', { name: displayOpponentName });
  }

  function getHintLabel(): string {
    if (phase === 'GAME_OVER') {
      if (winner === humanColor) return t('checkers.youWin');
      return t('checkers.youLose', { name: displayOpponentName });
    }
    if (isHumanTurn) {
      if (forcedPieces.length > 0) return t('checkers.mustCapture');
      if (selectedRow === null) return t('checkers.selectPiece');
    }
    return '';
  }

  function handleSquareClick(row: number, col: number) {
    if (phase !== 'PLAYING') return;
    if (!isHumanTurn) return;

    const key = `${row},${col}`;

    // If this square is a legal move destination, move there
    if (legalSet.has(key)) {
      onMovePiece(row, col);
      return;
    }

    // Otherwise try to select the piece on this square
    const piece = board[row][col];
    if (piece && piece.color === humanColor) {
      onSelectPiece(row, col);
    }
  }

  return (
    <div className="cq-root">
      <div className="cq-status-bar">
        <div className={`cq-turn-label${isHumanTurn && phase === 'PLAYING' ? ' cq-turn-yours' : ''}`}>
          {getTurnLabel()}
        </div>
        <div className={`cq-hint-label${isHumanTurn && forcedPieces.length > 0 && phase === 'PLAYING' ? ' cq-must-capture' : ''}`}>
          {getHintLabel()}
        </div>
        <div className="cq-scores">
          {t('checkers.scores', {
            you: String(state.scores[humanColor]),
            opp: String(state.scores[opponentColor]),
          })}
        </div>
      </div>

      <div className="cq-board-wrapper">
        <div className="cq-board" role="grid" aria-label="Checkers board">
          {board.map((rowArr, rowIndex) =>
            rowArr.map((piece, colIndex) => {
              const isDark = (rowIndex + colIndex) % 2 === 1;
              const key = `${rowIndex},${colIndex}`;
              const isLegal = legalSet.has(key);
              const isSelected =
                selectedRow === rowIndex && selectedCol === colIndex;
              const isForced = forcedSet.has(key);
              const isSelectable =
                isDark &&
                isHumanTurn &&
                phase === 'PLAYING' &&
                piece !== null &&
                piece.color === humanColor &&
                (!forcedPieces.length || isForced);

              let squareClass = isDark ? 'cq-square cq-square-dark' : 'cq-square cq-square-light';
              if (isSelectable) squareClass += ' cq-square-selectable';
              if (isLegal) squareClass += ' cq-square-legal';

              return (
                <div
                  key={key}
                  className={squareClass}
                  role="gridcell"
                  aria-label={`${String.fromCharCode(65 + colIndex)}${8 - rowIndex}`}
                  onClick={() => handleSquareClick(rowIndex, colIndex)}
                >
                  {piece !== null && (
                    <div
                      className={[
                        'cq-piece',
                        piece.color === 'red' ? 'cq-piece-red' : 'cq-piece-black',
                        isSelected ? 'cq-piece-selected' : '',
                        isForced && isHumanTurn && phase === 'PLAYING' ? 'cq-piece-forced' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="button"
                      tabIndex={isSelectable ? 0 : -1}
                      aria-label={`${piece.color}${piece.king ? ` ${t('checkers.king')}` : ''} at ${String.fromCharCode(65 + colIndex)}${8 - rowIndex}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSquareClick(rowIndex, colIndex);
                        }
                      }}
                    >
                      {piece.king && (
                        <span className="cq-king-crown" aria-hidden="true">★</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {phase === 'GAME_OVER' && (
        <div className="cq-game-over-banner">
          <div className="cq-game-over-title">{t('checkers.gameOver')}</div>
          <div className="cq-game-over-result">
            {winner === humanColor
              ? t('checkers.youWin')
              : t('checkers.youLose', { name: displayOpponentName })}
          </div>
          <button className="cq-new-game-btn" onClick={onNewGame}>
            {t('checkers.newGame')}
          </button>
        </div>
      )}
    </div>
  );
}
