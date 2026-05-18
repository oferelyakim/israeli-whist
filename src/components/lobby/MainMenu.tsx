import { useEffect, useState } from 'react';
import { GameType, PlayerType } from '../../types/game-common';
import { GAME_REGISTRY } from '../../games/registry';
import type { GameConfig } from '../../games/registry';
import { CardSetType } from '../../games/quartets/types';
import { RummyVariant } from '../../games/rummy/types';
import { useTranslation } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import './MainMenu.css';

// Map game types to their translation keys
const GAME_I18N: Record<GameType, { name: TranslationKey; description: TranslationKey; rules: TranslationKey[] }> = {
  [GameType.WHIST]: {
    name: 'registry.whist.name',
    description: 'registry.whist.description',
    rules: ['registry.whist.rule1', 'registry.whist.rule2', 'registry.whist.rule3', 'registry.whist.rule4', 'registry.whist.rule5', 'registry.whist.rule6'],
  },
  [GameType.YANIV]: {
    name: 'registry.yaniv.name',
    description: 'registry.yaniv.description',
    rules: ['registry.yaniv.rule1', 'registry.yaniv.rule2', 'registry.yaniv.rule3', 'registry.yaniv.rule4', 'registry.yaniv.rule5', 'registry.yaniv.rule6'],
  },
  [GameType.QUARTETS]: {
    name: 'registry.quartets.name',
    description: 'registry.quartets.description',
    rules: ['registry.quartets.rule1', 'registry.quartets.rule2', 'registry.quartets.rule3', 'registry.quartets.rule4', 'registry.quartets.rule5', 'registry.quartets.rule6'],
  },
  [GameType.SOLITAIRE]: {
    name: 'registry.solitaire.name',
    description: 'registry.solitaire.description',
    rules: ['registry.solitaire.rule1', 'registry.solitaire.rule2', 'registry.solitaire.rule3', 'registry.solitaire.rule4'],
  },
  [GameType.SHITHEAD]: {
    name: 'registry.shithead.name',
    description: 'registry.shithead.description',
    rules: ['registry.shithead.rule1', 'registry.shithead.rule2', 'registry.shithead.rule3', 'registry.shithead.rule4', 'registry.shithead.rule5', 'registry.shithead.rule6'],
  },
  [GameType.RUMMY]: {
    name: 'registry.rummy.name',
    description: 'registry.rummy.description',
    rules: ['registry.rummy.rule1', 'registry.rummy.rule2', 'registry.rummy.rule3', 'registry.rummy.rule4'],
  },
  [GameType.ISRAELI_RUMMY]: {
    name: 'registry.israeliRummy.name',
    description: 'registry.israeliRummy.description',
    rules: ['registry.israeliRummy.rule1', 'registry.israeliRummy.rule2', 'registry.israeliRummy.rule3', 'registry.israeliRummy.rule4'],
  },
  [GameType.GIN_RUMMY]: {
    name: 'registry.ginRummy.name',
    description: 'registry.ginRummy.description',
    rules: ['registry.ginRummy.rule1', 'registry.ginRummy.rule2', 'registry.ginRummy.rule3', 'registry.ginRummy.rule4'],
  },
  [GameType.BACKGAMMON]: {
    name: 'registry.backgammon.name',
    description: 'registry.backgammon.description',
    rules: ['registry.backgammon.rule1', 'registry.backgammon.rule2', 'registry.backgammon.rule3', 'registry.backgammon.rule4'],
  },
  [GameType.CHECKERS]: {
    name: 'registry.checkers.name',
    description: 'registry.checkers.description',
    rules: ['registry.checkers.rule1', 'registry.checkers.rule2', 'registry.checkers.rule3', 'registry.checkers.rule4'],
  },
  [GameType.WOODOKU]: {
    name: 'registry.woodoku.name',
    description: 'registry.woodoku.description',
    rules: ['registry.woodoku.rule1', 'registry.woodoku.rule2', 'registry.woodoku.rule3', 'registry.woodoku.rule4'],
  },
};

interface MainMenuProps {
  onStartGame: (gameType: GameType, settings: any) => void;
  onCreateRoom?: (gameType: GameType, numPlayers: number, playerName: string) => void;
  onJoinRoom?: (roomId: string, playerName: string) => void;
}

const BOT_NAME_KEYS = [
  'bot.name1', 'bot.name2', 'bot.name3', 'bot.name4',
  'bot.name5', 'bot.name6', 'bot.name7',
] as const;

const PLAYER_NAME_STORAGE_KEY = 'whist-player-name';

function loadStoredPlayerName(): string {
  try {
    const stored = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (stored && stored.trim() && stored.trim() !== 'You') return stored;
  } catch {
    // ignore (private mode, quota, etc.)
  }
  return 'You';
}

// Lazy check: only import firebase when actually needed
function checkFirebaseConfigured(): boolean {
  try {
    const env = import.meta.env;
    return !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_PROJECT_ID);
  } catch {
    return false;
  }
}

export function MainMenu({ onStartGame, onCreateRoom, onJoinRoom }: MainMenuProps) {
  const { t, language, setLanguage } = useTranslation();
  const [playerName, setPlayerName] = useState<string>(loadStoredPlayerName);

  useEffect(() => {
    const trimmed = playerName.trim();
    if (!trimmed || trimmed === 'You') return;
    try {
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed);
    } catch {
      // ignore
    }
  }, [playerName]);
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.WHIST);
  const [numPlayers, setNumPlayers] = useState<number>(GAME_REGISTRY[GameType.YANIV]!.defaultPlayers);
  const [cardSet, setCardSet] = useState<CardSetType>(CardSetType.EMOJI);
  const [rummyVariant, setRummyVariant] = useState<RummyVariant>(RummyVariant.BASIC);

  const firebaseReady = checkFirebaseConfigured();
  const gameConfig: GameConfig = GAME_REGISTRY[selectedGame]!;

  const handleGameSelect = (gameType: GameType) => {
    setSelectedGame(gameType);
    setNumPlayers(GAME_REGISTRY[gameType]!.defaultPlayers);
    setError('');
  };

  const handleSinglePlayer = () => {
    if (selectedGame === GameType.SOLITAIRE) {
      onStartGame(GameType.SOLITAIRE, {
        gameType: GameType.SOLITAIRE,
        numPlayers: 1,
        playerNames: [playerName],
        playerTypes: [PlayerType.HUMAN],
      });
      return;
    }

    if (selectedGame === GameType.WOODOKU) {
      onStartGame(GameType.WOODOKU, {
        gameType: GameType.WOODOKU,
        numPlayers: 1,
        playerNames: [playerName],
        playerTypes: [PlayerType.HUMAN],
      });
      return;
    }

    const playerCount = selectedGame === GameType.WHIST ? 4 : numPlayers;
    const aiNames = BOT_NAME_KEYS.slice(0, playerCount - 1).map((key) => t(key));
    const names = [playerName, ...aiNames];
    const types = [PlayerType.HUMAN, ...Array(playerCount - 1).fill(PlayerType.AI)];

    if (selectedGame === GameType.WHIST) {
      onStartGame(GameType.WHIST, {
        maxRounds: null,
        playerNames: names,
        playerTypes: types,
      });
    } else if (selectedGame === GameType.QUARTETS) {
      onStartGame(GameType.QUARTETS, {
        gameType: GameType.QUARTETS,
        numPlayers: playerCount,
        playerNames: names,
        playerTypes: types,
        cardSet,
      });
    } else if (selectedGame === GameType.SHITHEAD) {
      onStartGame(GameType.SHITHEAD, {
        gameType: GameType.SHITHEAD,
        numPlayers: playerCount,
        playerNames: names,
        playerTypes: types,
      });
    } else if (selectedGame === GameType.RUMMY) {
      const rummyPlayerCount = rummyVariant === RummyVariant.GIN ? 2 : playerCount;
      const rummyNames = rummyVariant === RummyVariant.GIN
        ? [playerName, BOT_NAME_KEYS.slice(0, 1).map((key) => t(key))[0]]
        : names;
      const rummyTypes = rummyVariant === RummyVariant.GIN
        ? [PlayerType.HUMAN, PlayerType.AI]
        : types;
      onStartGame(GameType.RUMMY, {
        gameType: GameType.RUMMY,
        numPlayers: rummyPlayerCount,
        playerNames: rummyNames,
        playerTypes: rummyTypes,
        variant: rummyVariant,
      });
    } else if (selectedGame === GameType.ISRAELI_RUMMY) {
      onStartGame(GameType.ISRAELI_RUMMY, {
        gameType: GameType.ISRAELI_RUMMY,
        numPlayers: playerCount,
        playerNames: names,
        playerTypes: types,
      });
    } else if (selectedGame === GameType.GIN_RUMMY) {
      onStartGame(GameType.GIN_RUMMY, {
        gameType: GameType.GIN_RUMMY,
        numPlayers: 2,
        playerNames: [playerName, BOT_NAME_KEYS.slice(0, 1).map((key) => t(key))[0]],
        playerTypes: [PlayerType.HUMAN, PlayerType.AI],
      });
    } else if (selectedGame === GameType.BACKGAMMON) {
      onStartGame(GameType.BACKGAMMON, {
        gameType: GameType.BACKGAMMON,
        numPlayers: 2,
        playerNames: [playerName, t('bot.name1')],
        playerTypes: [PlayerType.HUMAN, PlayerType.AI],
      });
    } else if (selectedGame === GameType.CHECKERS) {
      onStartGame(GameType.CHECKERS, {
        gameType: GameType.CHECKERS,
        numPlayers: 2,
        playerNames: [playerName, t('bot.name1')],
        playerTypes: [PlayerType.HUMAN, PlayerType.AI],
      });
    } else {
      // Yaniv settings with proper defaults
      onStartGame(GameType.YANIV, {
        gameType: GameType.YANIV,
        numPlayers: playerCount,
        playerNames: names,
        playerTypes: types,
        handSize: 5,
        yanivThreshold: 7,
        scoreLimit: 200,
        assafPenalty: 30,
        eliminationMode: false,
        ofer: false,
        fiftyReduction: true,
        australianReduction: false,
        useDoubleDeck: playerCount > 5,
      });
    }
  };

  const handleCreateRoom = async () => {
    if (!onCreateRoom) return;
    if (!playerName.trim() || playerName.trim() === 'You') {
      setError(t('menu.pleaseChangeName'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const playerCount = selectedGame === GameType.WHIST ? 4 : numPlayers;
      onCreateRoom(selectedGame, playerCount, playerName);
    } catch (e: any) {
      setError(e.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!onJoinRoom || !joinCode.trim()) return;
    if (!playerName.trim() || playerName.trim() === 'You') {
      setError(t('menu.pleaseChangeName'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      onJoinRoom(joinCode.trim().toUpperCase(), playerName);
    } catch (e: any) {
      setError(e.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const gameTypes = Object.values(GAME_REGISTRY);

  return (
    <div className="main-menu">
      <div className="menu-card">
        <button
          className="lang-toggle"
          onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}
          title={language === 'en' ? 'עברית' : 'English'}
        >
          {language === 'en' ? '🇮🇱 עברית' : '🇬🇧 English'}
        </button>
        <img src="/achim.png" alt="The Achim" className="menu-photo" />
        <h1 className="menu-title">
          <span className="suit-deco">{'\u2660'}</span>
          {t(GAME_I18N[selectedGame].name)}
          <span className="suit-deco red">{'\u2665'}</span>
        </h1>
        <p className="menu-subtitle">{t(GAME_I18N[selectedGame].description)}</p>

        {/* Game selection tabs */}
        <div className="game-selector">
          {gameTypes.map((config) => (
            <button
              key={config.type}
              className={`game-tab ${selectedGame === config.type ? 'game-tab-active' : ''}`}
              onClick={() => handleGameSelect(config.type)}
            >
              {t(GAME_I18N[config.type].name)}
            </button>
          ))}
        </div>

        {/* Player count selector for variable-player games */}
        {selectedGame !== GameType.WHIST && gameConfig.minPlayers !== gameConfig.maxPlayers && (
          <div className="player-count-selector">
            <label className="menu-label">
              {t('menu.numPlayers')}
              <div className="player-count-buttons">
                {Array.from(
                  { length: gameConfig.maxPlayers - gameConfig.minPlayers + 1 },
                  (_, i) => gameConfig.minPlayers + i
                ).map((count) => (
                  <button
                    key={count}
                    className={`player-count-btn ${numPlayers === count ? 'player-count-btn-active' : ''}`}
                    onClick={() => setNumPlayers(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </label>
          </div>
        )}

        {/* Card set picker for Quartets */}
        {selectedGame === GameType.QUARTETS && (
          <div className="player-count-selector">
            <label className="menu-label">
              {t('quartets.cardSetLabel')}
              <div className="player-count-buttons">
                <button
                  className={`player-count-btn ${cardSet === CardSetType.EMOJI ? 'player-count-btn-active' : ''}`}
                  onClick={() => setCardSet(CardSetType.EMOJI)}
                >
                  {t('quartets.cardSetEmoji')}
                </button>
                <button
                  className={`player-count-btn ${cardSet === CardSetType.IMAGES ? 'player-count-btn-active' : ''}`}
                  onClick={() => setCardSet(CardSetType.IMAGES)}
                >
                  {t('quartets.cardSetImages')}
                </button>
              </div>
            </label>
          </div>
        )}

        {/* Rummy variant picker */}
        {selectedGame === GameType.RUMMY && (
          <div className="player-count-selector">
            <label className="menu-label">
              {t('rummy.selectVariant')}
              <div className="player-count-buttons">
                <button
                  className={`player-count-btn ${rummyVariant === RummyVariant.BASIC ? 'player-count-btn-active' : ''}`}
                  onClick={() => setRummyVariant(RummyVariant.BASIC)}
                >
                  {t('rummy.variantBasic')}
                </button>
                <button
                  className={`player-count-btn ${rummyVariant === RummyVariant.GIN ? 'player-count-btn-active' : ''}`}
                  onClick={() => setRummyVariant(RummyVariant.GIN)}
                >
                  {t('rummy.variantGin')}
                </button>
              </div>
            </label>
          </div>
        )}

        <div className="menu-form">
          <label className="menu-label">
            {t('menu.yourName')}
            <input
              type="text"
              className="menu-input"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
            />
          </label>
        </div>

        <div className="menu-buttons">
          <button className="menu-btn menu-btn-primary" onClick={handleSinglePlayer}>
            {(selectedGame === GameType.SOLITAIRE || selectedGame === GameType.WOODOKU)
              ? t('solitaire.play')
              : t('menu.playVsAI')}
          </button>

          {firebaseReady && selectedGame !== GameType.SOLITAIRE && selectedGame !== GameType.WOODOKU ? (
            <>
              <button
                className="menu-btn menu-btn-secondary"
                onClick={handleCreateRoom}
                disabled={loading}
              >
                {loading ? t('menu.creating') : t('menu.createRoom')}
              </button>

              {!showJoin ? (
                <button
                  className="menu-btn menu-btn-secondary"
                  onClick={() => setShowJoin(true)}
                >
                  {t('menu.joinRoom')}
                </button>
              ) : (
                <div className="join-row">
                  <input
                    type="text"
                    className="menu-input join-input"
                    placeholder={t('menu.roomCode')}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <button
                    className="menu-btn menu-btn-secondary"
                    onClick={handleJoinRoom}
                    disabled={loading || joinCode.length < 4}
                  >
                    {t('menu.join')}
                  </button>
                </div>
              )}
            </>
          ) : selectedGame !== GameType.SOLITAIRE && selectedGame !== GameType.WOODOKU ? (
            <p className="firebase-hint">
              {t('menu.firebaseHint')}
            </p>
          ) : null}

          {error && <p className="menu-error">{error}</p>}
        </div>

        <div className="menu-rules">
          <h3>{t('menu.quickRules')}</h3>
          <ul>
            {GAME_I18N[selectedGame].rules.map((ruleKey, i) => (
              <li key={i}>{t(ruleKey)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="app-version" aria-label="app version">
        v{__APP_VERSION__}
      </div>
    </div>
  );
}
