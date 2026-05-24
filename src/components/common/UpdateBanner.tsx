import { useTranslation } from '../../i18n/LanguageContext';

export function UpdateBanner() {
  const { t } = useTranslation();
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1b5e20', color: '#fff',
      padding: '10px 16px', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      fontSize: 14, boxShadow: '0 -2px 8px rgba(0,0,0,0.4)',
    }}>
      <span>{t('common.updateAvailable')}</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#fff', color: '#1b5e20',
          border: 'none', borderRadius: 6,
          padding: '5px 14px', cursor: 'pointer',
          fontWeight: 'bold', fontSize: 13,
        }}
      >
        {t('common.updateRefresh')}
      </button>
    </div>
  );
}
