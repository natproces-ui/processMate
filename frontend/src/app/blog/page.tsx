import Link from 'next/link';
import PublicShell from '@/components/home/PublicShell';
import { BLOG_POSTS } from '@/content/blog';

export default function BlogPage() {
    const posts = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));
    return (
        <PublicShell>
            <div className="mx-auto max-w-3xl px-4 py-10">
                <h1 className="text-2xl font-bold text-slate-900">Blog</h1>
                <p className="mt-1 text-sm text-slate-500">Méthodes et usages pour formaliser vos procédures.</p>
                <ul className="mt-8 space-y-6">
                    {posts.map(p => (
                        <li key={p.slug}>
                            <Link href={`/blog/${p.slug}`} className="group block rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-sm">
                                <p className="text-xs text-slate-400">{new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                <h2 className="mt-1 text-lg font-semibold text-slate-900 group-hover:text-blue-700">{p.title}</h2>
                                <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </PublicShell>
    );
}
