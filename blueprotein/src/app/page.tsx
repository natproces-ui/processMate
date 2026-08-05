import { Suspense } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import BlueProteinHome from '@/components/BlueProteinHome';
import { getPublishedProducts } from '@/lib/products';
import { getPublishedSections } from '@/lib/sections';
import { getPublishedTestimonials } from '@/lib/testimonials';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [products, sections, testimonials] = await Promise.all([
    getPublishedProducts(),
    getPublishedSections(),
    getPublishedTestimonials(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader products={products} />
      <Suspense fallback={null}>
        <BlueProteinHome products={products} sections={sections} testimonials={testimonials} />
      </Suspense>
      <SiteFooter products={products} />
    </div>
  );
}
