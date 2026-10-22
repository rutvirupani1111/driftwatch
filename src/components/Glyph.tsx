import { useId } from 'react';
import { CONDITION_META, type Condition } from '../lib/weather';

/**
 * Hand-drawn weather glyphs. Paints come from CSS variables so every glyph
 * follows the night / day theme; motion is CSS-only and switched off for
 * prefers-reduced-motion (see app.css).
 */

interface GlyphProps {
  condition: Condition;
  size?: number;
  /** subtle motion (default true) */
  animated?: boolean;
  className?: string;
  /** accessible name; `false` hides the glyph from assistive tech */
  title?: string | false;
}

const CLOUD = 'M18 48h28a9 9 0 0 0 1-17.95a13 13 0 0 0-24.6-3.6A10 10 0 0 0 18 48z';

function stop(offset: string, color: string, opacity?: number) {
  return <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity ?? 1 }} />;
}

function Rays({ cx, cy, inner, outer, count = 12, small = false }: { cx: number; cy: number; inner: number; outer: number; count?: number; small?: boolean }) {
  return (
    <g className={`rays${small ? ' small' : ''}`}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i * (360 / count) * Math.PI) / 180;
        const r2 = i % 2 ? outer - 3 : outer;
        return (
          <line
            key={i}
            x1={cx + inner * Math.cos(a)}
            y1={cy + inner * Math.sin(a)}
            x2={cx + r2 * Math.cos(a)}
            y2={cy + r2 * Math.sin(a)}
            style={{ stroke: 'var(--g-ray)' }}
            strokeWidth={i % 2 ? 1.8 : 2.4}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

export function Glyph({ condition, size = 48, animated = true, className = '', title }: GlyphProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const label = title === false ? undefined : (title ?? CONDITION_META[condition].label);
  const g = (name: string) => `${uid}-${name}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`glyph shrink-0 ${animated ? '' : 'still'} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={g('sun')} cx="40%" cy="35%" r="70%">
          {stop('0', 'var(--g-sun-a)')}
          {stop('1', 'var(--g-sun-b)')}
        </radialGradient>
        <radialGradient id={g('halo')}>
          {stop('0', 'var(--g-sun-a)', 0.5)}
          {stop('1', 'var(--g-sun-b)', 0)}
        </radialGradient>
        <linearGradient id={g('cloud')} x1="0" y1="0" x2="0" y2="1">
          {stop('0', 'var(--g-cloud-a)')}
          {stop('1', 'var(--g-cloud-b)')}
        </linearGradient>
        <linearGradient id={g('storm')} x1="0" y1="0" x2="0" y2="1">
          {stop('0', 'var(--g-storm-a)')}
          {stop('1', 'var(--g-storm-b)')}
        </linearGradient>
      </defs>

      {condition === 'sunny' && (
        <g>
          <circle className="halo" cx="32" cy="32" r="24" fill={`url(#${g('halo')})`} />
          <Rays cx={32} cy={32} inner={17.5} outer={25} />
          <circle cx="32" cy="32" r="12.5" fill={`url(#${g('sun')})`} />
        </g>
      )}

      {condition === 'partly-cloudy' && (
        <g>
          <circle className="halo" cx="23" cy="22" r="16" fill={`url(#${g('halo')})`} />
          <Rays cx={23} cy={22} inner={12} outer={17.5} small />
          <circle cx="23" cy="22" r="8.5" fill={`url(#${g('sun')})`} />
          <g className="cloud-drift">
            <path d={CLOUD} transform="translate(3 5)" fill={`url(#${g('cloud')})`} />
          </g>
        </g>
      )}

      {condition === 'storm' && (
        <g>
          <g className="cloud-drift">
            <path d={CLOUD} transform="translate(0 -9)" fill={`url(#${g('storm')})`} />
          </g>
          <path className="bolt" d="M34 37l-8 11h6.5l-3.5 10 11-14h-6.5l4.5-7z" style={{ fill: 'var(--g-bolt)' }} />
          <g style={{ stroke: 'var(--g-rain)' }} strokeWidth="2" strokeLinecap="round">
            <line className="drop" x1="20" y1="43" x2="18.5" y2="48" />
            <line className="drop" x1="43" y1="43" x2="41.5" y2="48" />
            <line className="drop" x1="49" y1="41" x2="47.5" y2="46" />
          </g>
        </g>
      )}

      {condition === 'fog' && (
        <g>
          <circle cx="40" cy="22" r="9" fill={`url(#${g('sun')})`} opacity="0.28" />
          <g style={{ stroke: 'var(--g-fog)' }} strokeLinecap="round">
            <line className="fog-line" x1="12" y1="27" x2="44" y2="27" strokeWidth="3.4" opacity="0.95" />
            <line className="fog-line" x1="19" y1="35" x2="53" y2="35" strokeWidth="3.4" opacity="0.8" />
            <line className="fog-line" x1="10" y1="43" x2="42" y2="43" strokeWidth="3.4" opacity="0.65" />
            <line className="fog-line" x1="22" y1="51" x2="50" y2="51" strokeWidth="3.4" opacity="0.45" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** The Driftwatch mark: a crescent over two drifting lines. */
export function LogoMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path d="M39 12a18 18 0 1 0 13 26.5 13.5 13.5 0 1 1-13-26.5z" style={{ fill: 'var(--sun)' }} />
      <path d="M8 46c6-3.2 10 3.2 16 0s10 3.2 16 0 10 3.2 16 0" fill="none" style={{ stroke: 'var(--cloud)' }} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M8 55c6-3.2 10 3.2 16 0s10 3.2 16 0 10 3.2 16 0" fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="3.4" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}
