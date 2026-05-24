import { useState } from 'react';
import type { ArchetypeViewProps } from '../types';
import type { NumberSequenceState } from './archetype';
import { useTranslation } from '../../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../../i18n/translations';

type TFn = (k: TranslationKey, p?: Record<string, string | number>) => string;

function renderHint(t: TFn, raw: string): string {
  const [key, ...args] = raw.split('|');
  if (key === 'escape.numseq.hint.family') {
    return t(key as TranslationKey, { family: args[0] });
  }
  if (key === 'escape.numseq.hint.shape') {
    const parity = args[0] === 'even' ? t('escape.numseq.parityEven') : t('escape.numseq.parityOdd');
    const sign = args[1] === 'negative' ? t('escape.numseq.signNegative') : t('escape.numseq.signPositive');
    return t(key as TranslationKey, { parity, sign });
  }
  if (key === 'escape.numseq.hint.reveal') {
    return t(key as TranslationKey, { n: args[0] });
  }
  return raw;
}

export default function NumberSequenceComponent({
  state,
  onSubmit,
  onRequestHint,
  hintsShown,
  disabled,
  lastFeedback,
}: ArchetypeViewProps<NumberSequenceState, string>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = () => {
    if (disabled) return;
    onSubmit(value);
  };

  return (
    <div className="er-numseq">
      <div className="er-numseq__title">{t('escape.numseq.title')}</div>
      <div className="er-numseq__row" dir="ltr">
        {state.shown.map((n, i) => (
          <span key={i} className="er-numseq__tile">{n}</span>
        ))}
        <span className="er-numseq__sep">,</span>
        <span className="er-numseq__tile er-numseq__tile--mystery">?</span>
      </div>
      <div className="er-padlock__inputRow">
        <input
          className="er-padlock__input"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))}
          placeholder={t('escape.numseq.placeholder')}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label={t('escape.numseq.inputAria')}
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
