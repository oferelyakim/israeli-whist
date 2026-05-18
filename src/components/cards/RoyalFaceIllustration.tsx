import { Rank } from '../../types/card';

interface RoyalFaceIllustrationProps {
  rank: Rank;
  isRed: boolean;
}

const GOLD = '#d4a843';
const GOLD_LIGHT = '#f0d68a';
const GOLD_DARK = '#b8922e';
const BLUE = '#2255a4';
const BLUE_LIGHT = '#4477cc';

/**
 * Single (non-mirrored) playing card face illustrations.
 * Full figure drawn top to bottom.
 */
export function RoyalFaceIllustration({ rank, isRed }: RoyalFaceIllustrationProps) {
  const suit = isRed ? '#cc0000' : '#1a1a1a';
  const robe = isRed ? '#cc2233' : BLUE;
  const robeDark = isRed ? '#991122' : '#1a3d7a';

  if (rank === Rank.JACK) {
    return (
      <svg viewBox="0 0 100 140" className="royal-illustration">
        {/* Hat with feather */}
        <ellipse cx="50" cy="18" rx="18" ry="10" fill={robe} />
        <path d="M35 18 Q50 4 65 18" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
        <rect x="34" y="16" width="32" height="4" rx="1" fill={GOLD_DARK} />
        <path d="M62 10 Q72 2 68 14" stroke={suit} strokeWidth="1.2" fill="none" />

        {/* Face */}
        <ellipse cx="50" cy="28" rx="11" ry="10" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.8" />
        {/* Hair */}
        <path d="M39 24 Q39 18 44 18" stroke={GOLD_DARK} strokeWidth="2" fill="none" />
        <path d="M61 24 Q61 18 56 18" stroke={GOLD_DARK} strokeWidth="2" fill="none" />
        {/* Eyes */}
        <ellipse cx="46" cy="26" rx="1.8" ry="1.2" fill="#333" />
        <ellipse cx="54" cy="26" rx="1.8" ry="1.2" fill="#333" />
        <circle cx="46.5" cy="25.8" r="0.5" fill="#fff" />
        <circle cx="54.5" cy="25.8" r="0.5" fill="#fff" />
        {/* Nose & mouth */}
        <path d="M50 28 L49 30.5 L51 30.5" stroke="#c89070" strokeWidth="0.6" fill="none" />
        <path d="M47 33 Q50 35 53 33" stroke="#c06060" strokeWidth="0.7" fill="none" />

        {/* Collar */}
        <path d="M39 38 L50 43 L61 38" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />

        {/* Tunic body */}
        <path d="M36 38 L34 90 L66 90 L64 38 Q50 44 36 38 Z" fill={robe} stroke={robeDark} strokeWidth="0.8" />
        {/* Vest detail */}
        <path d="M44 43 L43 90" stroke={GOLD} strokeWidth="1.5" />
        <path d="M56 43 L57 90" stroke={GOLD} strokeWidth="1.5" />
        <path d="M44 48 L56 48" stroke={GOLD} strokeWidth="0.8" />
        <path d="M44 58 L56 58" stroke={GOLD} strokeWidth="0.8" />
        <path d="M43 68 L57 68" stroke={GOLD} strokeWidth="0.8" />

        {/* Left arm + axe */}
        <path d="M36 40 L22 55" stroke={robe} strokeWidth="4" strokeLinecap="round" />
        <line x1="22" y1="55" x2="18" y2="12" stroke={GOLD_DARK} strokeWidth="2" />
        <path d="M14 14 Q18 8 22 14 L18 20 Z" fill="#888" stroke="#666" strokeWidth="0.8" />

        {/* Right arm */}
        <path d="M64 40 L76 53" stroke={robe} strokeWidth="4" strokeLinecap="round" />
        <circle cx="76" cy="53" r="3" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.6" />

        {/* Legs */}
        <path d="M42 90 L40 120" stroke={robeDark} strokeWidth="5" strokeLinecap="round" />
        <path d="M58 90 L60 120" stroke={robeDark} strokeWidth="5" strokeLinecap="round" />
        {/* Boots */}
        <path d="M36 118 L44 118 L44 124 L36 124 Z" rx="2" fill="#4a3520" />
        <path d="M56 118 L64 118 L64 124 L56 124 Z" rx="2" fill="#4a3520" />

        {/* Suit symbol on chest */}
        <text x="50" y="55" textAnchor="middle" fontSize="9" fill={GOLD_LIGHT} fontFamily="serif">{isRed ? '♥' : '♠'}</text>
      </svg>
    );
  }

  if (rank === Rank.QUEEN) {
    return (
      <svg viewBox="0 0 100 140" className="royal-illustration">
        {/* Crown */}
        <path d="M34 14 L38 4 L43 11 L47 2 L50 10 L53 2 L57 11 L62 4 L66 14 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
        <rect x="34" y="13" width="32" height="4" rx="1" fill={GOLD_DARK} />
        {/* Jewels */}
        <circle cx="42" cy="7" r="1.5" fill={isRed ? '#cc0000' : BLUE_LIGHT} />
        <circle cx="50" cy="5" r="1.8" fill={isRed ? '#cc0000' : BLUE_LIGHT} />
        <circle cx="58" cy="7" r="1.5" fill={isRed ? '#cc0000' : BLUE_LIGHT} />

        {/* Hair */}
        <path d="M38 17 Q36 28 38 36" stroke={GOLD_DARK} strokeWidth="3" fill="none" />
        <path d="M62 17 Q64 28 62 36" stroke={GOLD_DARK} strokeWidth="3" fill="none" />

        {/* Face */}
        <ellipse cx="50" cy="27" rx="11" ry="10" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.8" />
        {/* Eyes with lashes */}
        <ellipse cx="46" cy="25" rx="2" ry="1.3" fill="#333" />
        <ellipse cx="54" cy="25" rx="2" ry="1.3" fill="#333" />
        <circle cx="46.5" cy="24.8" r="0.5" fill="#fff" />
        <circle cx="54.5" cy="24.8" r="0.5" fill="#fff" />
        <path d="M44 23.5 L46 23" stroke="#333" strokeWidth="0.5" />
        <path d="M56 23.5 L54 23" stroke="#333" strokeWidth="0.5" />
        {/* Nose & mouth */}
        <path d="M50 27 L49 29.5 L51 29.5" stroke="#c89070" strokeWidth="0.6" fill="none" />
        <path d="M47 32 Q50 34 53 32" stroke="#cc5555" strokeWidth="0.8" fill="none" />

        {/* Necklace */}
        <path d="M40 37 Q50 41 60 37" stroke={GOLD} strokeWidth="1" fill="none" />
        <circle cx="50" cy="40" r="2" fill={isRed ? '#cc0000' : BLUE_LIGHT} stroke={GOLD_DARK} strokeWidth="0.6" />

        {/* Dress body - flowing full length */}
        <path d="M34 37 L24 125 L76 125 L66 37 Q50 44 34 37 Z" fill={robe} stroke={robeDark} strokeWidth="0.8" />
        {/* Dress pattern */}
        <path d="M48 44 L44 125" stroke={GOLD} strokeWidth="1.2" />
        <path d="M52 44 L56 125" stroke={GOLD} strokeWidth="1.2" />
        {/* Waist sash */}
        <path d="M30 55 L70 55" stroke={GOLD} strokeWidth="2" />
        <path d="M46 55 Q50 59 54 55" stroke={GOLD_DARK} strokeWidth="1" fill={GOLD_LIGHT} />
        {/* Dress hem detail */}
        <path d="M26 120 L74 120" stroke={GOLD} strokeWidth="1.5" />

        {/* Left arm holding flower */}
        <path d="M34 42 L24 54" stroke={robe} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="22" cy="52" r="3" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.5" />
        {/* Flower */}
        <circle cx="20" cy="48" r="2.5" fill={isRed ? '#ff6688' : '#88aadd'} opacity="0.8" />
        <circle cx="20" cy="48" r="1" fill={GOLD} />

        {/* Right arm */}
        <path d="M66 42 L74 52" stroke={robe} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="74" cy="52" r="3" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.5" />

        {/* Shoes peeking */}
        <ellipse cx="40" cy="126" rx="5" ry="2" fill={robeDark} />
        <ellipse cx="60" cy="126" rx="5" ry="2" fill={robeDark} />

        {/* Suit symbol */}
        <text x="50" y="70" textAnchor="middle" fontSize="8" fill={GOLD_LIGHT} fontFamily="serif">{isRed ? '♥' : '♠'}</text>
      </svg>
    );
  }

  if (rank === Rank.KING) {
    return (
      <svg viewBox="0 0 100 140" className="royal-illustration">
        {/* Large crown */}
        <path d="M30 15 L34 3 L40 11 L44 1 L48 9 L50 0 L52 9 L56 1 L60 11 L66 3 L70 15 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
        <rect x="30" y="14" width="40" height="5" rx="1" fill={GOLD_DARK} />
        {/* Jewels in crown */}
        <circle cx="40" cy="6" r="1.5" fill={isRed ? '#cc0000' : BLUE_LIGHT} />
        <circle cx="50" cy="3" r="2" fill={isRed ? '#ee2244' : '#5588dd'} stroke={GOLD_DARK} strokeWidth="0.5" />
        <circle cx="60" cy="6" r="1.5" fill={isRed ? '#cc0000' : BLUE_LIGHT} />
        {/* Crown band jewels */}
        <circle cx="42" cy="16" r="1.3" fill={isRed ? '#cc0000' : BLUE_LIGHT} />
        <circle cx="50" cy="16" r="1.3" fill={GOLD_LIGHT} />
        <circle cx="58" cy="16" r="1.3" fill={isRed ? '#cc0000' : BLUE_LIGHT} />

        {/* Face */}
        <ellipse cx="50" cy="28" rx="12" ry="10" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.8" />
        {/* Eyes */}
        <ellipse cx="46" cy="26" rx="1.8" ry="1.3" fill="#333" />
        <ellipse cx="54" cy="26" rx="1.8" ry="1.3" fill="#333" />
        <circle cx="46.5" cy="25.8" r="0.5" fill="#fff" />
        <circle cx="54.5" cy="25.8" r="0.5" fill="#fff" />
        {/* Eyebrows */}
        <path d="M43 24 L48 23.5" stroke="#6a5030" strokeWidth="0.8" />
        <path d="M52 23.5 L57 24" stroke="#6a5030" strokeWidth="0.8" />
        {/* Nose & mouth */}
        <path d="M50 28 L48.5 31 L51.5 31" stroke="#c89070" strokeWidth="0.7" fill="none" />
        <path d="M47 33 Q50 34.5 53 33" stroke="#c06060" strokeWidth="0.7" fill="none" />
        {/* Beard */}
        <path d="M40 32 Q42 38 50 40 Q58 38 60 32" fill="#a08050" opacity="0.4" stroke="#8a6a3a" strokeWidth="0.6" />
        <path d="M44 34 Q50 42 56 34" stroke="#8a6a3a" strokeWidth="0.6" fill="none" />
        {/* Mustache */}
        <path d="M46 32 Q48 31 50 32 Q52 31 54 32" stroke="#8a6a3a" strokeWidth="0.8" fill="none" />

        {/* Royal robe - full length */}
        <path d="M32 38 L28 110 L72 110 L68 38 Q50 46 32 38 Z" fill={robe} stroke={robeDark} strokeWidth="0.8" />
        {/* Ermine collar */}
        <path d="M32 38 Q50 46 68 38" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.8" />
        {/* Robe details */}
        <line x1="50" y1="46" x2="50" y2="110" stroke={GOLD} strokeWidth="2" />
        <line x1="38" y1="60" x2="62" y2="60" stroke={GOLD} strokeWidth="1.5" />
        <line x1="36" y1="80" x2="64" y2="80" stroke={GOLD} strokeWidth="1.2" />
        {/* Ermine hem */}
        <path d="M28 106 L72 106" stroke={GOLD} strokeWidth="2" />
        {/* Epaulettes */}
        <ellipse cx="34" cy="40" rx="4" ry="3" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.6" />
        <ellipse cx="66" cy="40" rx="4" ry="3" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.6" />

        {/* Left arm */}
        <path d="M32 42 L20 56" stroke={robe} strokeWidth="4" strokeLinecap="round" />
        <circle cx="20" cy="56" r="3" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.5" />

        {/* Right arm holding sword */}
        <path d="M68 42 L80 54" stroke={robe} strokeWidth="4" strokeLinecap="round" />
        <circle cx="80" cy="54" r="3" fill="#fae0c8" stroke="#d4a078" strokeWidth="0.5" />
        {/* Sword */}
        <line x1="80" y1="54" x2="82" y2="10" stroke="#aaa" strokeWidth="2" />
        <line x1="78" y1="50" x2="84" y2="50" stroke={GOLD_DARK} strokeWidth="2.5" />
        <rect x="81" y="8" width="3" height="5" rx="1" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.5" />

        {/* Legs */}
        <path d="M42 110 L40 125" stroke={robeDark} strokeWidth="5" strokeLinecap="round" />
        <path d="M58 110 L60 125" stroke={robeDark} strokeWidth="5" strokeLinecap="round" />
        {/* Boots */}
        <path d="M36 123 L44 123 L44 129 L36 129 Z" rx="2" fill="#4a3520" />
        <path d="M56 123 L64 123 L64 129 L56 129 Z" rx="2" fill="#4a3520" />

        {/* Suit symbol on chest */}
        <text x="50" y="73" textAnchor="middle" fontSize="8" fill={GOLD_LIGHT} fontFamily="serif">{isRed ? '♥' : '♠'}</text>
      </svg>
    );
  }

  return null;
}
