import { useState } from 'react';
import type { ArchetypeViewProps } from '../types';
import type { AnagramState } from './archetype';
import { useTranslation } from '../../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../../i18n/translations';

type TFn = (k: TranslationKey, p?: Record<string, string | number>) => string;

function renderHint(t: TFn, raw: string): string {
  const [key, ...args] = raw.split('|');
  if (key === 'escape.anagram.hint.reveal') {
    return t(key as TranslationKey, { masked: args.join('|') });
  }
  return raw;
}

export default function AnagramComponent({
  state,
  onSubmit,
  onRequestHint,
  hintsShown,
  disabled,
  lastFeedback,
}: ArchetypeViewProps<AnagramState, string>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = () => {
    if (disabled) return;
    onSubmit(value);
  };

  return (
    <div className="er-anagram">
      <div className="er-anagram__title">{t('escape.anagram.title')}</div>
      <div className="er-anagram__scrambled" aria-label={t('escape.anagram.scrambledAria')}>
        {state.scrambled.split('').map((c, i) => (
          <span key={i} className="er-anagram__tile">{c}</span>
        ))}
      </div>
      <div className="er-padlock__inputRow">
        <input
          className="er-padlock__input"
          maxLength={state.word.length}
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, state.word.length))}
          placeholder={'_'.repeat(state.word.length)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label={t('escape.anagram.inputAria')}
        />
        <button
          className="er-btn er-btn--primary"
          onClick={submit}
          disabled={disabled || value.length !== state.word.length}
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
