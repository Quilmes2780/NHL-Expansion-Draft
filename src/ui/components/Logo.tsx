import type { LogoSpec } from '../../engine';

const SHAPES: Record<LogoSpec['shape'], string> = {
  shield: 'M50 4 L92 18 L88 58 C84 80 68 92 50 98 C32 92 16 80 12 58 L8 18 Z',
  circle: 'M50 4 A46 46 0 1 1 49.9 4 Z',
  hexagon: 'M50 3 L92 27 L92 73 L50 97 L8 73 L8 27 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  square: 'M14 6 H86 Q94 6 94 14 V86 Q94 94 86 94 H14 Q6 94 6 86 V14 Q6 6 14 6 Z',
};

/** Icons drawn in a 0–100 box, centred around (50, 50). */
const ICONS: Record<string, string> = {
  star: 'M50 18 L58 40 L82 40 L63 54 L70 78 L50 64 L30 78 L37 54 L18 40 L42 40 Z',
  bolt: 'M56 14 L28 56 L46 56 L40 86 L72 40 L54 40 Z',
  mountain: 'M14 74 L38 36 L50 52 L62 30 L86 74 Z M56 40 L62 30 L68 40 L62 37 Z',
  wave: 'M14 58 C24 40 36 40 44 54 C52 68 64 66 70 52 C74 42 82 40 86 46 L86 72 L14 72 Z',
  crown: 'M18 72 L18 34 L34 52 L50 26 L66 52 L82 34 L82 72 Z',
  flame: 'M50 14 C62 32 74 40 70 60 C68 74 58 84 50 84 C40 84 30 76 30 62 C30 50 40 44 42 32 C48 40 50 46 50 52 C56 44 56 30 50 14 Z',
  snowflake:
    'M47 14 H53 V40 L72 22 L76 26 L56 46 H86 V54 H56 L76 74 L72 78 L53 60 V86 H47 V60 L28 78 L24 74 L44 54 H14 V46 H44 L24 26 L28 22 L47 40 Z',
  anchor:
    'M46 16 H54 V24 H62 V31 H54 V72 C64 70 72 64 74 56 L66 56 L78 44 L86 56 L80 56 C78 72 66 82 50 82 C34 82 22 72 20 56 L14 56 L22 44 L34 56 L26 56 C28 64 36 70 46 72 V31 H38 V24 H46 Z',
  pine: 'M50 12 L70 40 L60 40 L76 62 L56 62 L56 86 L44 86 L44 62 L24 62 L40 40 L30 40 Z',
  sticks:
    'M22 18 L30 14 L62 70 L78 74 L76 82 L56 78 Z M78 18 L70 14 L38 70 L22 74 L24 82 L44 78 Z',
  puck: 'M18 44 C18 34 82 34 82 44 V58 C82 68 18 68 18 58 Z M18 44 C18 54 82 54 82 44',
  arrow: 'M50 12 L80 46 L62 46 L62 86 L38 86 L38 46 L20 46 Z',
};

export function Logo({ spec, size = 40, title }: { spec: LogoSpec; size?: number; title?: string }) {
  const { primary, secondary, accent } = spec.colors;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title ?? 'Logo'} className="shrink-0">
      <path d={SHAPES[spec.shape]} fill={primary} stroke={secondary} strokeWidth={5} strokeLinejoin="round" />
      {ICONS[spec.icon] && (
        <g transform={spec.text ? 'translate(50 44) scale(0.72) translate(-50 -50)' : undefined}>
          <path d={ICONS[spec.icon]} fill={accent} stroke={secondary} strokeWidth={2.5} strokeLinejoin="round" fillRule="evenodd" />
        </g>
      )}
      {spec.text && (
        <text x="50" y="86" textAnchor="middle" fontSize="16" fontWeight="800" fill={accent} stroke={secondary} strokeWidth={0.6} fontFamily="system-ui, sans-serif" letterSpacing="1">
          {spec.text}
        </text>
      )}
    </svg>
  );
}
