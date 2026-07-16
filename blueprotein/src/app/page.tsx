import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import BlueProteinHome from '@/components/BlueProteinHome';
import { getPublishedProducts } from '@/lib/products';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const products = await getPublishedProducts();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <BlueProteinHome products={products} />
      <SiteFooter products={products} />
    </div>
  );
}
