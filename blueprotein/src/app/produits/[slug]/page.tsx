import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ProductDetailView from '@/components/ProductDetailView';
import { getProductBySlug, getPublishedProducts } from '@/lib/products';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Produit — Blue Protein' };
  return {
    title: `${product.name} — Blue Protein`,
    description: product.summary,
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [product, products] = await Promise.all([
    getProductBySlug(slug),
    getPublishedProducts(),
  ]);

  if (!product) notFound();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />
      <ProductDetailView product={product} />
      <SiteFooter products={products} />
    </div>
  );
}
