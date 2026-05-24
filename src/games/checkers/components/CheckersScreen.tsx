import { useCallback, useState } from 'react';
import type { GameScreenProps } from '../../registry';
import type { CheckersSettings } from '../types';
import { CHECKERS_DEFAULTS } from '../types';
import { useCheckersGame } from '../hooks/useCheckersGame';
import { CheckersTable } from './CheckersTable';
import { useTranslation } from '../../../i18n/LanguageContext';

const SETTINGS_KEY = 'checkers-settings';

function loadSavedSettings(): Partial<CheckersSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<CheckersSettings>) : {};
  } catch {
    return {};
  }
}

function saveSettings(s: Partial<CheckersSettings>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore quota errors
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

export default function CheckersScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const passedSettings = settings as CheckersSettings;

  const [saved] = useState(loadSavedSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(
    saved.difficulty ?? CHECKERS_DEFAULTS.difficulty
  );

  const effectiveSettings: CheckersSettings = {
    ...passedSettings,
    difficulty,
  };

  const { gameState, legalMoves, selectPiece, movePiece, newGame, humanColor } =
    useCheckersGame(effectiveSettings);

  const handleBack = useCallback(() => {
    if (window.confirm(t('checkers.exitConfirm'))) {
      onBack();
    }
  }, [t, onBack]);

  const handleNewGameWithSettings = useCallback(() => {
    saveSettings({ difficulty });
    setShowSettings(false);
    newGame();
  }, [difficulty, newGame]);

  return (
    <>
      <button style={exitBtnStyle} onClick={handleBack}>
        ✕ {t('common.backToMenu')}
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
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkers.settings')}</h2>

            <div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                {t('checkers.settingDifficulty')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([1, 2, 3] as Array<1 | 2 | 3>).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer',
                      fontWeight: 'bold', background: difficulty === d ? '#4a90d9' : '#333',
                      color: '#fff',
                      border: difficulty === d ? '2px solid #7ab8f5' : '2px solid transparent',
                    }}
                  >
                    {t(d === 1 ? 'checkers.diffEasy' : d === 2 ? 'checkers.diffMedium' : 'checkers.diffHard')}
                  </button>
                ))}
              </div>
            </div>

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
                {t('checkers.newGame')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CheckersTable
        gameState={gameState}
        humanColor={humanColor}
        legalMoves={legalMoves}
        onSelectPiece={selectPiece}
        onMovePiece={movePiece}
        onNewGame={newGame}
      />
    </>
  );
}
