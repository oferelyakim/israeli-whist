import { useCallback, useState } from 'react';
import { BackgammonTable } from './BackgammonTable';
import { useBackgammonGame } from '../hooks/useBackgammonGame';
import type { BackgammonSettings, BgColor } from '../types';
import { BG_DEFAULTS } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

const SETTINGS_KEY = 'backgammon-settings';

function loadSavedBgSettings(): Partial<BackgammonSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<BackgammonSettings>) : {};
  } catch {
    return {};
  }
}

function saveBgSettings(s: Partial<BackgammonSettings>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

const exitBtnStyle: React.CSSProperties = {
  position: 'fixed', top: 10, left: 10, zIndex: 999,
  background: 'rgba(0,0,0,0.5)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px',
  padding: '5px 10px', cursor: 'pointer', fontSize: '13px', lineHeight: 1,
};

const gearBtnStyle: React.CSSProperties = {
  position: 'fixed', top: 10, right: 10, zIndex: 999,
  background: 'rgba(0,0,0,0.5)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px',
  padding: '5px 10px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
};

export default function BackgammonScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const passedSettings = settings as BackgammonSettings;

  const [saved] = useState(loadSavedBgSettings);
  const [showSettings, setShowSettings] = useState(false);

  const [playerColor, setPlayerColor] = useState<BgColor>(
    saved.playerColor ?? BG_DEFAULTS.playerColor
  );
  const [homeRight, setHomeRight] = useState<boolean>(
    saved.homeRight ?? BG_DEFAULTS.homeRight
  );
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(
    saved.difficulty ?? BG_DEFAULTS.difficulty
  );
  const [showMoveHints, setShowMoveHints] = useState<boolean>(
    saved.showMoveHints ?? BG_DEFAULTS.showMoveHints
  );

  const effectiveSettings: BackgammonSettings = {
    ...passedSettings,
    playerColor,
    homeRight,
    difficulty,
    showMoveHints,
  };

  const {
    gameState, legalMoves, allLegalSources, selectedFrom,
    rollDice, selectChecker, moveChecker, newGame, undo, canUndo, humanColor,
  } = useBackgammonGame(effectiveSettings);

  const handleExit = useCallback(() => {
    if (window.confirm(t('backgammon.exitConfirm'))) onBack();
  }, [t, onBack]);

  const handleNewGameWithSettings = useCallback(() => {
    saveBgSettings({ playerColor, homeRight, difficulty, showMoveHints });
    setShowSettings(false);
    newGame();
  }, [playerColor, homeRight, difficulty, showMoveHints, newGame]);

  const isHumanTurn = gameState.state.turn === humanColor;

  return (
    <>
      <button style={exitBtnStyle} onClick={handleExit}>
        ✕ {t('common.exitGame')}
      </button>
      <button style={gearBtnStyle} onClick={() => setShowSettings(true)}>
        ⚙
      </button>

      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1a2e', border: '1px solid #444', borderRadius: 12,
            padding: 24, minWidth: 280, color: '#f0f0f0', display: 'flex',
            flexDirection: 'column', gap: 16,
          }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('backgammon.settings')}</h2>

            {/* Color */}
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                {t('backgammon.settingColor')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['white', 'black'] as BgColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setPlayerColor(c)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                      fontWeight: 'bold', background: playerColor === c ? '#4a90d9' : '#333',
                      color: '#fff',
                      border: playerColor === c ? '2px solid #7ab8f5' : '2px solid transparent',
                    }}
                  >
                    {t(c === 'white' ? 'backgammon.colorWhite' : 'backgammon.colorBlack')}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                {t('backgammon.settingDirection')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([true, false] as const).map((hr) => (
                  <button
                    key={String(hr)}
                    onClick={() => setHomeRight(hr)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                      background: homeRight === hr ? '#4a90d9' : '#333',
                      color: '#fff',
                      border: homeRight === hr ? '2px solid #7ab8f5' : '2px solid transparent',
                    }}
                  >
                    {t(hr ? 'backgammon.homeRight' : 'backgammon.homeLeft')}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                {t('backgammon.settingDifficulty')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([1, 2, 3] as Array<1 | 2 | 3>).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                      background: difficulty === d ? '#4a90d9' : '#333',
                      color: '#fff',
                      border: difficulty === d ? '2px solid #7ab8f5' : '2px solid transparent',
                    }}
                  >
                    {t(
                      d === 1
                        ? 'backgammon.diffEasy'
                        : d === 2
                        ? 'backgammon.diffMedium'
                        : 'backgammon.diffHard'
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Show move hints */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showMoveHints}
                onChange={(e) => setShowMoveHints(e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>{t('backgammon.settingShowHints')}</span>
            </label>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  flex: 1, padding: 8, background: '#444', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleNewGameWithSettings}
                style={{
                  flex: 1, padding: 8, background: '#2d7a2d', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
                }}
              >
                {t('backgammon.newGame')}
              </button>
            </div>
          </div>
        </div>
      )}

      <BackgammonTable
        gameState={gameState}
        legalMoves={legalMoves}
        allLegalSources={allLegalSources}
        selectedFrom={selectedFrom}
        rollDice={rollDice}
        selectChecker={selectChecker}
        moveChecker={moveChecker}
        newGame={newGame}
        humanColor={humanColor}
        isHumanTurn={isHumanTurn}
        homeRight={homeRight}
        showMoveHints={showMoveHints}
        onUndo={undo}
        canUndo={canUndo}
      />
    </>
  );
}
