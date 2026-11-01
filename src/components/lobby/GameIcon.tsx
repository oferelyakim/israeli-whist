import { GameType } from '../../types/game-common';

/**
 * A distinct mark for every game in the menu.
 *
 * Drawn as inline SVG rather than emoji on purpose: the repo already learned
 * this the hard way with the Mahjong win confetti, where code points without
 * emoji-font coverage fell back to blank boxes on common platforms. These also
 * inherit `currentColor`, so a tile's selected state recolours the icon with
 * no second asset.
 *
 * Every icon shares the 24x24 viewBox and stroke weight, so they line up at a
 * glance instead of each one setting its own visual size.
 */
function marks(game: GameType) {
  switch (game) {
    case GameType.WHIST:
      return (
        <>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path
            d="M12 8.2c-1.7 1.7-2.9 2.7-2.9 4a1.6 1.6 0 0 0 2.9 1 1.6 1.6 0 0 0 2.9-1c0-1.3-1.2-2.3-2.9-4z"
            fill="currentColor"
            stroke="none"
          />
          <path d="M12 13.6V16.4" />
        </>
      );

    case GameType.YANIV:
      return (
        <>
          <rect x="2.5" y="7" width="8" height="12" rx="1.6" transform="rotate(-15 6.5 13)" />
          <rect x="8" y="5.5" width="8" height="12" rx="1.6" />
          <rect x="13.5" y="7" width="8" height="12" rx="1.6" transform="rotate(15 17.5 13)" />
        </>
      );

    case GameType.QUARTETS:
      return (
        <>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
        </>
      );

    case GameType.SOLITAIRE:
      return (
        <>
          <rect x="2.5" y="4.5" width="5.5" height="15" rx="1.6" />
          <rect x="9.25" y="4.5" width="5.5" height="11" rx="1.6" />
          <rect x="16" y="4.5" width="5.5" height="7" rx="1.6" />
        </>
      );

    case GameType.SHITHEAD:
      return (
        <>
          <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
          <rect x="7" y="5" width="10" height="4.5" rx="1.5" />
          <circle cx="12" cy="14.8" r="2.1" fill="currentColor" stroke="none" />
        </>
      );

    case GameType.ISRAELI_RUMMY:
      return (
        <>
          <rect x="3.5" y="5.5" width="5" height="10.5" rx="1.2" />
          <rect x="9.5" y="5.5" width="5" height="10.5" rx="1.2" />
          <rect x="15.5" y="5.5" width="5" height="10.5" rx="1.2" />
          <path d="M2 18.6h20" />
        </>
      );

    case GameType.BACKGAMMON:
      return (
        <>
          <path d="M4.5 3.5L8 11.5 11.5 3.5" />
          <path d="M12.5 20.5L16 12.5 19.5 20.5" />
          <circle cx="8" cy="16.8" r="2.3" />
          <circle cx="16" cy="7.2" r="2.3" fill="currentColor" stroke="none" />
        </>
      );

    case GameType.CHECKERS:
      return (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 12h18M12 3v18" />
          <circle cx="7.4" cy="16.6" r="2.4" fill="currentColor" stroke="none" />
          <circle cx="16.6" cy="7.4" r="2.4" />
        </>
      );

    case GameType.MAHJONG:
      return (
        <>
          <rect x="2.5" y="7.5" width="8.5" height="13" rx="1.6" />
          <rect x="13" y="3.5" width="8.5" height="13" rx="1.6" />
          <path d="M5 11.5h3.5M5 14.5h3.5M5 17.5h3.5" />
          <circle cx="17.25" cy="10" r="1.8" />
        </>
      );

    case GameType.WORD_WONDERS:
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6.8l5 8.4H7z" />
          <circle cx="12" cy="6.8" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="17" cy="15.2" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="7" cy="15.2" r="1.7" fill="currentColor" stroke="none" />
        </>
      );

    case GameType.GEM_BLOCKS:
      return (
        <>
          <path d="M7.5 3h9l4.5 6-9 12L3 9z" />
          <path d="M3 9h18" />
          <path d="M7.5 3l1.8 6M16.5 3l-1.8 6M9.3 9l2.7 12 2.7-12" />
        </>
      );

    case GameType.PIPS:
      return (
        <>
          <rect x="2.5" y="7" width="19" height="10" rx="2" />
          <path d="M12 7.6v8.8" />
          <circle cx="7.2" cy="10.4" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="7.2" cy="13.6" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="16.8" cy="12" r="1.15" fill="currentColor" stroke="none" />
        </>
      );

    case GameType.STRANDS:
      return (
        <>
          <path d="M6 18.5L6 12 12 5.5 18 12" strokeWidth="3.2" opacity="0.4" />
          <circle cx="6" cy="5.5" r="1.5" />
          <circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="5.5" r="1.5" />
          <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="6" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="18.5" r="1.5" />
          <circle cx="18" cy="18.5" r="1.5" />
        </>
      );

    case GameType.WORDLE:
      return (
        <>
          <rect x="2.5" y="4" width="5.5" height="6" rx="1.2" fill="currentColor" stroke="none" />
          <rect x="9.25" y="4" width="5.5" height="6" rx="1.2" />
          <rect x="16" y="4" width="5.5" height="6" rx="1.2" />
          <rect x="2.5" y="14" width="5.5" height="6" rx="1.2" />
          <rect x="9.25" y="14" width="5.5" height="6" rx="1.2" fill="currentColor" stroke="none" />
          <rect x="16" y="14" width="5.5" height="6" rx="1.2" />
        </>
      );

    default:
      // Any game added to the registry without an icon still gets a tile.
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </>
      );
  }
}

export function GameIcon({ game }: { game: GameType }) {
  return (
    <svg
      className="game-tile-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {marks(game)}
    </svg>
  );
}
