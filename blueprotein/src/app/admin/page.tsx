'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Leaf, LogOut, Plus, Pencil, Trash2, Mail, Package, CheckCircle2, Circle,
} from 'lucide-react';
import { getCurrentAdminEmail, signOut } from '@/lib/auth';
import {
  getAllProductsAdmin, deleteProduct,
  getContactMessagesAdmin, markMessageHandled, deleteContactMessage,
} from '@/lib/products';
import ProductForm from '@/components/admin/ProductForm';
import type { ContactMessage, Product } from '@/types/product';

type Tab = 'produits' | 'messages';
type ProductView = { mode: 'list' } | { mode: 'edit'; product?: Product };

export default function AdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('produits');

  const [products, setProducts] = useState<Product[]>([]);
  const [productView, setProductView] = useState<ProductView>({ mode: 'list' });

  const [messages, setMessages] = useState<ContactMessage[]>([]);

  const loadProducts = useCallback(async () => {
    setProducts(await getAllProductsAdmin());
  }, []);

  const loadMessages = useCallback(async () => {
    setMessages(await getContactMessagesAdmin());
  }, []);

  useEffect(() => {
    (async () => {
      const email = await getCurrentAdminEmail();
      if (!email) {
        router.replace('/admin/login');
        return;
      }
      setAdminEmail(email);
      setChecking(false);
      await Promise.all([loadProducts(), loadMessages()]);
    })();
  }, [router, loadProducts, loadMessages]);

  async function handleLogout() {
    await signOut();
    router.replace('/admin/login');
  }

  async function handleDeleteProduct(product: Product) {
    if (!confirm(`Supprimer "${product.name}" ? Cette action est irréversible.`)) return;
    const { error } = await deleteProduct(product.id);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await loadProducts();
  }

  async function handleDeleteMessage(message: ContactMessage) {
    if (!confirm('Supprimer ce message ?')) return;
    await deleteContactMessage(message.id);
    await loadMessages();
  }

  async function handleToggleHandled(message: ContactMessage) {
    await markMessageHandled(message.id, !message.handled);
    await loadMessages();
  }

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Vérification de l&apos;accès...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold"><span className="text-blue-700">Blue</span>Protein <span className="text-slate-400 font-normal">· admin</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 hidden sm:inline">{adminEmail}</span>
            <button onClick={handleLogout} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-red-600">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setTab('produits')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'produits' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            <Package className="w-4 h-4" /> Produits ({products.length})
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'messages' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            <Mail className="w-4 h-4" /> Messages ({messages.filter((m) => !m.handled).length} non traités)
          </button>
        </div>

        {tab === 'produits' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            {productView.mode === 'edit' ? (
              <ProductForm
                product={productView.product}
                onCancel={() => setProductView({ mode: 'list' })}
                onSaved={async () => { setProductView({ mode: 'list' }); await loadProducts(); }}
              />
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-semibold">Catalogue</h2>
                  <button
                    onClick={() => setProductView({ mode: 'edit' })}
                    className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                  >
                    <Plus className="w-4 h-4" /> Nouveau produit
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Nom</th>
                        <th className="py-2 pr-4">Gamme</th>
                        <th className="py-2 pr-4">Catégorie</th>
                        <th className="py-2 pr-4">Statut</th>
                        <th className="py-2 pr-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium text-slate-900">{p.name}</td>
                          <td className="py-3 pr-4 text-slate-600 capitalize">{p.family}</td>
                          <td className="py-3 pr-4 text-slate-600">{p.category}</td>
                          <td className="py-3 pr-4">
                            {p.published ? (
                              <span className="text-emerald-700 text-xs font-semibold">Publié</span>
                            ) : (
                              <span className="text-slate-400 text-xs font-semibold">Brouillon</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <button onClick={() => setProductView({ mode: 'edit', product: p })} className="text-slate-500 hover:text-emerald-700" title="Modifier">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteProduct(p)} className="text-slate-500 hover:text-red-600" title="Supprimer">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {products.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-400">Aucun produit pour l&apos;instant.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'messages' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold mb-5">Demandes de contact</h2>
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`border rounded-lg p-4 ${m.handled ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50/40'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{m.name} {m.company && <span className="font-normal text-slate-500">— {m.company}</span>}</div>
                      <div className="text-xs text-slate-500">{m.email} {m.audience && `· ${m.audience}`} · {new Date(m.created_at).toLocaleString('fr-FR')}</div>
                      <p className="text-sm text-slate-700 mt-2">{m.message}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => handleToggleHandled(m)} className="text-slate-500 hover:text-emerald-700" title={m.handled ? 'Marquer non traité' : 'Marquer traité'}>
                        {m.handled ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <Circle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDeleteMessage(m)} className="text-slate-500 hover:text-red-600" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="text-center text-slate-400 py-6">Aucun message pour l&apos;instant.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
