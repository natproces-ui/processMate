'use client';

import { useId } from 'react';

/** Subtle repeating leaf-silhouette texture, used as a low-opacity decorative
 * background layer to keep the agri/soil theme present without photography. */
export default function LeafPattern({
  className = '',
  opacity = 0.06,
  color = '#047857',
  size = 90,
}: {
  className?: string;
  opacity?: number;
  color?: string;
  size?: number;
}) {
  const patternId = useId();

  return (
    <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} aria-hidden="true">
      <defs>
        <pattern id={patternId} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <path
            d={`M${size / 2} ${size * 0.18} C ${size * 0.72} ${size * 0.3} ${size * 0.72} ${size * 0.58} ${size / 2} ${size * 0.75} C ${size * 0.28} ${size * 0.58} ${size * 0.28} ${size * 0.3} ${size / 2} ${size * 0.18} Z`}
            fill={color}
            opacity={opacity}
          />
          <path
            d={`M${size / 2} ${size * 0.22} L ${size / 2} ${size * 0.72}`}
            stroke={color}
            strokeWidth="1"
            opacity={opacity * 1.6}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
