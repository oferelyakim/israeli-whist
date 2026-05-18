import { useEffect, useRef } from 'react';
import { useRummyGame } from '../hooks/useRummyGame';
import { useGinRummyGame } from '../hooks/useGinRummyGame';
import { RummyGameTable } from './RummyGameTable';
import { GinRummyTable } from './GinRummyTable';
import { RummyPhase, RummyVariant } from '../types';
import type { RummyGameSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function RummyGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const rummySettings = settings as RummyGameSettings;
  const variant = rummySettings.variant ?? RummyVariant.BASIC;

  // Basic Rummy hook
  const basic = useRummyGame();
  // Gin Rummy hook
  const gin = useGinRummyGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      if (variant === RummyVariant.GIN) {
        gin.startGame(rummySettings);
      } else {
        basic.startGame(rummySettings);
      }
    }
  }, [rummySettings, variant, basic, gin]);

  if (variant === RummyVariant.GIN) {
    if (!gin.gameState || gin.gameState.phase === RummyPhase.DEALING) {
      return (
        <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
          {t('common.loadingGame')}
        </div>
      );
    }

    return (
      <GinRummyTable
        gameState={gin.gameState}
        humanSeat={gin.humanSeat}
        onDrawFromStock={gin.drawFromStock}
        onDrawFromDiscard={gin.drawFromDiscard}
        onDiscard={gin.discard}
        onKnock={gin.knock}
        onGin={gin.gin}
        onDefenderLayoff={gin.defenderLayoff}
        onDefenderDone={gin.defenderDone}
        onNewGame={gin.newGame}
        onBack={onBack}
      />
    );
  }

  // Basic Rummy
  if (!basic.gameState || basic.gameState.phase === RummyPhase.DEALING) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <RummyGameTable
      gameState={basic.gameState}
      humanSeat={basic.humanSeat}
      onDrawFromStock={basic.drawFromStock}
      onDrawFromDiscard={basic.drawFromDiscard}
      onMeldCards={basic.meldCards}
      onLayOff={basic.layOff}
      onDiscard={basic.discard}
      onPassTurn={basic.passTurn}
      onNewGame={basic.newGame}
      onBack={onBack}
    />
  );
}
