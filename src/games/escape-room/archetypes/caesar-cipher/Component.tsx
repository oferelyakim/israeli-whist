import { useState } from 'react';
import type { ArchetypeViewProps } from '../types';
import type { CaesarState } from './archetype';
import { useTranslation } from '../../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../../i18n/translations';

type TFn = (k: TranslationKey, p?: Record<string, string | number>) => string;

function renderHint(t: TFn, raw: string): string {
  const [key, ...args] = raw.split('|');
  if (key === 'escape.caesar.hint.firstLetter') {
    return t(key as TranslationKey, { letter: args[0] });
  }
  if (key === 'escape.caesar.hint.shift') {
    return t(key as TranslationKey, { n: args[0] });
  }
  if (key === 'escape.caesar.hint.reveal') {
    return t(key as TranslationKey, { plaintext: args.join('|') });
  }
  return raw;
}

export default function CaesarComponent({
  state,
  onSubmit,
  onRequestHint,
  hintsShown,
  disabled,
  lastFeedback,
}: ArchetypeViewProps<CaesarState, string>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = () => {
    if (disabled) return;
    onSubmit(value);
  };

  return (
    <div className="er-caesar">
      <div className="er-caesar__title">{t('escape.caesar.title')}</div>
      <div className="er-caesar__prompt">
        {state.shiftKnown
          ? t('escape.caesar.promptKnownShift', { n: state.shift })
          : t('escape.caesar.promptUnknownShift')}
      </div>
      <div className="er-caesar__cipher" dir="ltr">
        {state.ciphertext.split('').map((c, i) => (
          <span
            key={i}
            className={`er-caesar__tile ${c === ' ' ? 'er-caesar__tile--space' : ''}`}
          >
            {c === ' ' ? '·' : c}
          </span>
        ))}
      </div>
      <div className="er-padlock__inputRow">
        <input
          className="er-padlock__input er-padlock__input--text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z ]/g, ''))}
          placeholder={t('escape.caesar.placeholder')}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label={t('escape.caesar.inputAria')}
        />
        <button
          className="er-btn er-btn--primary"
          onClick={submit}
          disabled={disabled || value.trim() === ''}
        >
          {t('escape.submit')}
        </button>
      </div>
      {lastFeedback && <div className="er-feedback">{t(lastFeedback as TranslationKey)}</div>}
      {hintsShown.length > 0 && (
        <div className="er-hints">
          <div className="er-hints__label">{t('escape.hintsRevealed')}</div>
          <ul>
            {hintsShown.map((h, i) => (
              <li key={i}>{renderHint(t, h)}</li>
            ))}
          </ul>
        </div>
      )}
      <button className="er-btn er-btn--ghost" onClick={onRequestHint} disabled={disabled}>
        {t('escape.hintButton')}
      </button>
    </div>
  );
}
