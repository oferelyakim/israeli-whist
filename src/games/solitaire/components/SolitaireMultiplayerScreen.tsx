import type { MultiplayerScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function SolitaireMultiplayerScreen({ onBack }: MultiplayerScreenProps) {
  const { t } = useTranslation();
  return (
    <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
      <p>{t('solitaire.noMultiplayer')}</p>
      <button
        onClick={onBack}
        style={{
          marginTop: 16, padding: '8px 24px', cursor: 'pointer',
          background: 'var(--accent)', border: 'none', borderRadius: 6,
          color: '#fff', fontSize: 14,
        }}
      >
        {t('common.backToMenu')}
      </button>
    </div>
  );
}
