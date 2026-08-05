import { Sprout, Leaf, ShieldCheck, Package, type LucideIcon } from 'lucide-react';

/** Best-effort icon for a category name, matched by keyword rather than an exact lookup table
 * so it still degrades gracefully if the admin adds a new category later. */
export function categoryIcon(category: string): LucideIcon {
  const c = category.toLowerCase();
  if (c.includes('biostimulant')) return Sprout;
  if (c.includes('amendement')) return Leaf;
  if (c.includes('correcteur')) return ShieldCheck;
  return Package;
}
