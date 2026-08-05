/** A soft wave transition between two sections, instead of a hard rectangular edge. */
export default function OrganicDivider({ fill, flip = false }: { fill: string; flip?: boolean }) {
  return (
    <div className={`relative w-full overflow-hidden leading-none ${flip ? 'rotate-180' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 1440 60" className="w-full h-[36px] md:h-[52px] block" preserveAspectRatio="none">
        <path
          d="M0,28 C220,55 380,0 620,18 C860,36 1000,4 1220,22 C1320,31 1400,26 1440,20 L1440,60 L0,60 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}
