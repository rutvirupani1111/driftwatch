import { memo } from 'react';

/** Deterministic PRNG so the star field is identical on every visit (no layout jitter). */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rand = mulberry32(2310);
  return Array.from({ length: 140 }, (_, i) => ({
    x: rand() * 100,
    y: Math.pow(rand(), 1.6) * 70,
    r: rand() < 0.08 ? 1.3 : rand() < 0.35 ? 0.9 : 0.55,
    o: 0.35 + rand() * 0.6,
    twinkle: i % 9 === 0,
    delay: rand() * 5,
  }));
})();

const CLOUD = 'M18 48h28a9 9 0 0 0 1-17.95a13 13 0 0 0-24.6-3.6A10 10 0 0 0 18 48z';

/** Fixed, decorative backdrop: a night sky with stars, or a soft daylight sky. */
export const Sky = memo(function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <svg className="sky-stars" width="100%" height="100%" preserveAspectRatio="none">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="#dfe6ff"
            opacity={s.o}
            className={s.twinkle ? 'twinkle' : undefined}
            style={s.twinkle ? { animationDelay: `${s.delay}s` } : undefined}
          />
        ))}
      </svg>
      <div className="sky-horizon" />
      <div className="sky-day">
        <svg className="sky-cloud" width="340" height="140" viewBox="0 6 64 44" style={{ position: 'absolute', top: '9%', left: 0, opacity: 0.38, animationDelay: '-35s' }}>
          <path d={CLOUD} fill="#fff" />
        </svg>
        <svg className="sky-cloud slow" width="520" height="210" viewBox="0 6 64 44" style={{ position: 'absolute', top: '22%', left: '-30%', opacity: 0.3, animationDelay: '-95s' }}>
          <path d={CLOUD} fill="#fff" />
        </svg>
      </div>
    </div>
  );
});
