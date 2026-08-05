import type { ProductFamily } from '@/types/product';

const HERO_IMG = '/hero-farmer.png';
const PRODUCT_PLACEHOLDER_IMG = '/product-placeholder.jpg';
const PRODUCT_PLACEHOLDER_BY_FAMILY: Record<ProductFamily, string> = {
  liquide: '/produit_bouteille.png',
  solide: '/produit_sachet.png',
};

export function HeroImage({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden bg-emerald-950 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO_IMG} alt="Agriculteur dans un champ de cultures" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-transparent to-transparent" />
    </div>
  );
}

export function ProductImage({
  src,
  family,
  className = '',
}: {
  src?: string | null;
  family?: ProductFamily;
  className?: string;
}) {
  const fallback = family ? PRODUCT_PLACEHOLDER_BY_FAMILY[family] : PRODUCT_PLACEHOLDER_IMG;
  return (
    <div className={`overflow-hidden bg-emerald-950 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || fallback} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/70 via-emerald-950/10 to-transparent" />
    </div>
  );
}
