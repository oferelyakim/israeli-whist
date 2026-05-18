import type { GameScreenProps } from '../../registry';
import type { WoodokuSettings } from '../types';
import { useWoodokuGame } from '../hooks/useWoodokuGame';
import { WoodokuTable } from './WoodokuTable';

export default function WoodokuScreen({ settings, onBack }: GameScreenProps) {
  const woodokuSettings = settings as WoodokuSettings;

  const {
    gameState,
    previewCells,
    hoveredAnchor,
    setHoveredAnchor,
    selectPiece,
    placePiece,
    newGame,
  } = useWoodokuGame(woodokuSettings);

  return (
    <WoodokuTable
      gameState={gameState}
      previewCells={previewCells}
      hoveredAnchor={hoveredAnchor}
      onSetHoveredAnchor={setHoveredAnchor}
      onSelectPiece={selectPiece}
      onPlacePiece={placePiece}
      onNewGame={newGame}
      onBack={onBack}
    />
  );
}
