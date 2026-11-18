import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicShell from '@/components/home/PublicShell';
import MiniMarkdown from '@/components/shared/MiniMarkdown';
import { BLOG_POSTS, getPost } from '@/content/blog';

// Export statique : une page par article, générée au build.
export function generateStaticParams() {
    return BLOG_POSTS.map(p => ({ slug: p.slug }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = getPost(slug);
    if (!post) notFound();
    return (
        <PublicShell>
            <article className="mx-auto max-w-3xl px-4 py-10">
                <Link href="/blog" className="text-sm text-blue-600 hover:underline">← Tous les articles</Link>
                <p className="mt-6 text-xs text-slate-400">{new Date(post.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900">{post.title}</h1>
                <p className="mt-2 text-slate-600">{post.summary}</p>
                <div className="mt-8 text-[15px] text-slate-700 leading-relaxed">
                    <MiniMarkdown text={post.body} />
                </div>
            </article>
        </PublicShell>
    );
}
