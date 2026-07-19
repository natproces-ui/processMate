import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import BlueProteinHome from '@/components/BlueProteinHome';
import { getPublishedProducts } from '@/lib/products';
import { getPublishedSections } from '@/lib/sections';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [products, sections] = await Promise.all([
    getPublishedProducts(),
    getPublishedSections(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <BlueProteinHome products={products} sections={sections} />
      <SiteFooter products={products} />
    </div>
  );
}
