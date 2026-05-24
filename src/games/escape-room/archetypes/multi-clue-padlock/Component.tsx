import { useState } from 'react';
import type { ArchetypeViewProps } from '../types';
import type { PadlockState } from './archetype';
import { useTranslation } from '../../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../../i18n/translations';

type TFn = (k: TranslationKey, p?: Record<string, string | number>) => string;
type ClueRow = PadlockState['clues'][number];

function renderClue(t: TFn, c: ClueRow): string {
  switch (c.kind) {
    case 'sumEquals':
      return t('escape.padlock.clue.sumEquals', { n: c.n });
    case 'productEquals':
      return t('escape.padlock.clue.productEquals', { n: c.n });
    case 'parityAt':
      return c.parity === 'even'
        ? t('escape.padlock.clue.parityEven', { pos: c.pos + 1 })
        : t('escape.padlock.clue.parityOdd', { pos: c.pos + 1 });
    case 'digitAt':
      return t('escape.padlock.clue.digitAt', { pos: c.pos + 1, digit: c.digit });
    case 'rangeAt':
      return t('escape.padlock.clue.rangeAt', { pos: c.pos + 1, min: c.min, max: c.max });
    case 'allDifferent':
      return t('escape.padlock.clue.allDifferent');
    case 'allSame':
      return t('escape.padlock.clue.allSame');
    case 'containsDigit':
      return t('escape.padlock.clue.containsDigit', { digit: c.digit });
    case 'noDigit':
      return t('escape.padlock.clue.noDigit', { digit: c.digit });
    case 'compareTwo':
      if (c.rel === 'gt')
        return t('escape.padlock.clue.compareGt', { posA: c.posA + 1, posB: c.posB + 1 });
      if (c.rel === 'lt')
        return t('escape.padlock.clue.compareLt', { posA: c.posA + 1, posB: c.posB + 1 });
      return t('escape.padlock.clue.compareEq', { posA: c.posA + 1, posB: c.posB + 1 });
    case 'diffAbs':
      return t('escape.padlock.clue.diffAbs', { posA: c.posA + 1, posB: c.posB + 1, diff: c.diff });
    case 'countOf':
      return t('escape.padlock.clue.countOf', { digit: c.digit, n: c.n });
  }
}

function renderHint(t: TFn, raw: string): string {
  const [key, ...args] = raw.split('|');
  if (key === 'escape.padlock.hint.reveal') {
    return t(key as TranslationKey, { masked: args.join('|') });
  }
  return raw;
}

export default function PadlockComponent({
  state,
  onSubmit,
  onRequestHint,
  hintsShown,
  disabled,
  lastFeedback,
}: ArchetypeViewProps<PadlockState, string>) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = () => {
    if (disabled) return;
    onSubmit(value);
  };

  return (
    <div className="er-padlock">
      <div className="er-padlock__title">{t('escape.padlock.title')}</div>
      <div className="er-padlock__subtitle">
        {t('escape.padlock.subtitle', { n: state.codeLength })}
      </div>
      <ul className="er-padlock__clues">
        {state.clues.map((c, i) => (
          <li key={i}>{renderClue(t, c)}</li>
        ))}
      </ul>
      <div className="er-padlock__inputRow">
        <input
          className="er-padlock__input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={state.codeLength}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, state.codeLength))}
          placeholder={'•'.repeat(state.codeLength)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label={t('escape.padlock.inputAria', { n: state.codeLength })}
        />
        <button
          className="er-btn er-btn--primary"
          onClick={submit}
          disabled={disabled || value.length !== state.codeLength}
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
