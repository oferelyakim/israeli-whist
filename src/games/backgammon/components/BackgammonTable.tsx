import './BackgammonTable.css';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { BackgammonGameState, BgColor, BgMove } from '../types';
import { pipCount } from '../engine/board';

interface BackgammonTableProps {
  gameState: BackgammonGameState;
  legalMoves: BgMove[];
  selectedFrom: number | 'bar' | null;
  allLegalSources: Array<number | 'bar'>;
  rollDice: () => void;
  selectChecker: (from: number | 'bar') => void;
  moveChecker: (to: number) => void;
  newGame: () => void;
  humanColor: BgColor;
  isHumanTurn: boolean;
  homeRight: boolean;
  showMoveHints: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
}

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function CheckerStack({
  color,
  count,
  selected,
  onClick,
  isBottom,
}: {
  color: BgColor;
  count: number;
  selected: boolean;
  onClick: () => void;
  isBottom: boolean;
}) {
  const MAX_VISIBLE = 5;
  const visible = Math.min(count, MAX_VISIBLE);
  const overflow = count > MAX_VISIBLE;

  return (
    <div className="bg-checkers">
      {Array.from({ length: visible }, (_, i) => {
        const isTop = isBottom ? i === visible - 1 : i === 0;
        const showCount = overflow && isTop;
        return (
          <button
            key={i}
            className={`bg-checker bg-checker--${color}${selected && isTop ? ' bg-checker--selected' : ''}`}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            aria-label={`${color} checker`}
          >
            {showCount ? <span className="bg-stack-count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function BoardPoint({
  pointIdx,
  board,
  isBottom,
  isValidTarget,
  isSelectedSource,
  isHinted,
  onSelectChecker,
  onMoveChecker,
}: {
  pointIdx: number;
  board: Array<{ color: BgColor | null; count: number }>;
  isBottom: boolean;
  isValidTarget: boolean;
  isSelectedSource: boolean;
  isHinted: boolean;
  onSelectChecker: (from: number) => void;
  onMoveChecker: (to: number) => void;
}) {
  const point = board[pointIdx];
  // Same parity formula for both halves.
  // Bottom idx + top idx in the same column always = 23 (different parities),
  // so using the same formula guarantees facing triangles are opposite colors.
  const isLight = pointIdx % 2 === 0;

  const handleClick = () => {
    if (isValidTarget) {
      onMoveChecker(pointIdx);
    } else if (point.color !== null && point.count > 0) {
      onSelectChecker(pointIdx);
    }
  };

  const displayNum = pointIdx + 1;

  const classNames = [
    'bg-point',
    `bg-point--${isBottom ? 'bottom' : 'top'}`,
    isValidTarget ? 'bg-point--valid-target' : '',
    isHinted ? 'bg-point--hinted' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      onClick={handleClick}
      role="button"
      aria-label={`Point ${displayNum}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div
        className={`bg-point-triangle bg-point-triangle--${isLight ? 'light' : 'dark'}`}
      />
      <span className="bg-point-num">{displayNum}</span>
      {point.color !== null && point.count > 0 && (
        <CheckerStack
          color={point.color}
          count={point.count}
          selected={isSelectedSource}
          onClick={handleClick}
          isBottom={isBottom}
        />
      )}
    </div>
  );
}

export function BackgammonTable({
  gameState,
  legalMoves,
  allLegalSources,
  selectedFrom,
  rollDice,
  selectChecker,
  moveChecker,
  newGame,
  humanColor,
  isHumanTurn,
  homeRight,
  showMoveHints,
  onUndo,
  canUndo = false,
}: BackgammonTableProps) {
  const { t } = useTranslation();
  const { state, players } = gameState;
  const { board, bar, off, dice, phase, winner, turn, scores } = state;

  const validTargets = new Set(legalMoves.map((m) => m.to));
  const canMoveFromBar = legalMoves.some((m) => m.from === 'bar');

  const whitePips = pipCount(board, bar, 'white');
  const blackPips = pipCount(board, bar, 'black');

  const whiteName = players.find((p) => p.color === 'white')?.name ?? 'White';
  const blackName = players.find((p) => p.color === 'black')?.name ?? 'Black';

  const turnName = turn === 'white' ? whiteName : blackName;

  const statusText = phase === 'GAME_OVER'
    ? t('backgammon.gameOver')
    : turn === humanColor && phase === 'ROLLING'
    ? t('backgammon.yourTurn')
    : turn === humanColor && phase === 'MOVING'
    ? t('backgammon.selectChecker')
    : t('backgammon.opponentTurn', { name: turnName });

  // homeRight=true (standard): white home (idx 0-5, points 1-6) on the RIGHT
  // homeRight=false (mirrored): white home on the LEFT
  const topIndices = homeRight
    ? [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    : [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12];

  const bottomIndices = homeRight
    ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const hintSources = new Set(
    showMoveHints && selectedFrom === null && isHumanTurn
      ? allLegalSources
      : []
  );

  return (
    <div className="bg-container">
      <div className="bg-status-bar">
        <span className="bg-status-turn">{statusText}</span>
        <div className="bg-scores">
          <span>{whiteName}: {scores.white}</span>
          <span>{blackName}: {scores.black}</span>
        </div>
      </div>

      <div className="bg-pips-row">
        <span>{whiteName}: {t('backgammon.pips', { n: whitePips })}</span>
        <span>{blackName}: {t('backgammon.pips', { n: blackPips })}</span>
      </div>

      <div className="bg-board-wrap">
        <div className="bg-board">
          {/* Top half: pointing downward */}
          <div className="bg-half bg-half--top">
            <div className="bg-points-half">
              {topIndices.slice(0, 6).map((idx) => (
                <BoardPoint
                  key={idx}
                  pointIdx={idx}
                  board={board}
                  isBottom={false}
                  isValidTarget={validTargets.has(idx)}
                  isSelectedSource={selectedFrom === idx}
                  isHinted={hintSources.has(idx)}
                  onSelectChecker={selectChecker}
                  onMoveChecker={moveChecker}
                />
              ))}
            </div>

            <div className="bg-bar">
              <div className="bg-bar-section">
                <span className="bg-bar-label">{t('backgammon.bar')}</span>
                {bar.black > 0 && (
                  <button
                    className={`bg-checker bg-checker--black${selectedFrom === 'bar' && turn === 'black' ? ' bg-checker--selected' : ''}${canMoveFromBar && turn === 'black' ? ' bg-checker--bar' : ''}`}
                    onClick={() => turn === 'black' && selectChecker('bar')}
                    aria-label="Black checker on bar"
                  >
                    <span className="bg-stack-count">{bar.black}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-points-half">
              {topIndices.slice(6).map((idx) => (
                <BoardPoint
                  key={idx}
                  pointIdx={idx}
                  board={board}
                  isBottom={false}
                  isValidTarget={validTargets.has(idx)}
                  isSelectedSource={selectedFrom === idx}
                  isHinted={hintSources.has(idx)}
                  onSelectChecker={selectChecker}
                  onMoveChecker={moveChecker}
                />
              ))}
            </div>
          </div>

          {/* Bottom half: pointing upward */}
          <div className="bg-half bg-half--bottom">
            <div className="bg-points-half">
              {bottomIndices.slice(0, 6).map((idx) => (
                <BoardPoint
                  key={idx}
                  pointIdx={idx}
                  board={board}
                  isBottom={true}
                  isValidTarget={validTargets.has(idx)}
                  isSelectedSource={selectedFrom === idx}
                  isHinted={hintSources.has(idx)}
                  onSelectChecker={selectChecker}
                  onMoveChecker={moveChecker}
                />
              ))}
            </div>

            <div className="bg-bar">
              <div className="bg-bar-section">
                {bar.white > 0 && (
                  <button
                    className={`bg-checker bg-checker--white${selectedFrom === 'bar' && turn === 'white' ? ' bg-checker--selected' : ''}${canMoveFromBar && turn === 'white' ? ' bg-checker--bar' : ''}`}
                    onClick={() => turn === 'white' && selectChecker('bar')}
                    aria-label="White checker on bar"
                  >
                    <span className="bg-stack-count">{bar.white}</span>
                  </button>
                )}
                <span className="bg-bar-label">{t('backgammon.bar')}</span>
              </div>
            </div>

            <div className="bg-points-half">
              {bottomIndices.slice(6).map((idx) => (
                <BoardPoint
                  key={idx}
                  pointIdx={idx}
                  board={board}
                  isBottom={true}
                  isValidTarget={validTargets.has(idx)}
                  isSelectedSource={selectedFrom === idx}
                  isHinted={hintSources.has(idx)}
                  onSelectChecker={selectChecker}
                  onMoveChecker={moveChecker}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bear-off area */}
        <div className="bg-off-area">
          <div className="bg-off-section">
            <span className="bg-off-label">{t('backgammon.off')}</span>
            <div className="bg-off-stack">
              {Array.from({ length: Math.min(off.black, 8) }, (_, i) => (
                <div key={i} className="bg-off-chip bg-off-chip--black" />
              ))}
            </div>
            <span className="bg-off-count">{off.black}</span>
          </div>

          <div className="bg-off-section">
            <div className="bg-off-stack">
              {Array.from({ length: Math.min(off.white, 8) }, (_, i) => (
                <div key={i} className="bg-off-chip bg-off-chip--white" />
              ))}
            </div>
            <span className="bg-off-count">{off.white}</span>
            <span className="bg-off-label">{t('backgammon.off')}</span>
          </div>
        </div>
      </div>

      {/* Dice / Roll area */}
      <div className="bg-dice-area">
        {phase === 'ROLLING' && isHumanTurn && (
          <button className="bg-roll-btn" onClick={rollDice}>
            {t('backgammon.roll')}
          </button>
        )}
        {phase === 'ROLLING' && !isHumanTurn && (
          <span style={{ opacity: 0.6, fontSize: 14 }}>{t('backgammon.rolling')}</span>
        )}
        {phase === 'MOVING' && dice.map((pip, i) => (
          <div key={i} className="bg-die" aria-label={`Die showing ${pip}`}>
            {DICE_FACES[pip]}
          </div>
        ))}
        {onUndo && phase !== 'GAME_OVER' && (
          <button
            className="bg-undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('backgammon.undo')}
          >
            ↩ {t('backgammon.undo')}
          </button>
        )}
      </div>

      {/* Bear-off button target area */}
      {phase === 'MOVING' && validTargets.has(-1) && (
        <button
          className="bg-roll-btn"
          onClick={() => moveChecker(-1)}
          style={{ background: '#2d7a2d', marginBottom: 8 }}
        >
          {t('backgammon.off')} ↓
        </button>
      )}

      {/* Game over banner */}
      {phase === 'GAME_OVER' && winner !== null && (
        <div className="bg-game-over-banner">
          <div className="bg-game-over-title">
            {winner === humanColor ? t('backgammon.youWin') : t('backgammon.youLose')}
          </div>
          <div className="bg-scores" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <span>{whiteName}: {scores.white}</span>
            <span>{blackName}: {scores.black}</span>
          </div>
          <button className="bg-new-game-btn" onClick={newGame}>
            {t('backgammon.newGame')}
          </button>
        </div>
      )}

      <div className="bg-info-row">
        {turn !== humanColor && phase === 'MOVING' && (
          <span>{turnName}...</span>
        )}
      </div>
    </div>
  );
}
