'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LogOut, Plus, Pencil, Trash2, Mail, Package, CheckCircle2, Circle, ExternalLink,
} from 'lucide-react';
import { getCurrentAdminEmail, signOut } from '@/lib/auth';
import {
  getAllProductsAdmin, deleteProduct,
  getContactMessagesAdmin, markMessageHandled, deleteContactMessage,
} from '@/lib/products';
import ProductForm from '@/components/admin/ProductForm';
import Modal from '@/components/admin/Modal';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import type { ContactMessage, Product } from '@/types/product';

type Tab = 'produits' | 'messages';

export default function AdminPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('produits');

  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);

  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [deleteProductTarget, setDeleteProductTarget] = useState<Product | null>(null);
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ContactMessage | null>(null);

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

  async function confirmDeleteProduct() {
    if (!deleteProductTarget) return;
    const { error } = await deleteProduct(deleteProductTarget.id);
    setDeleteProductTarget(null);
    if (error) {
      alert(`Erreur : ${error.message}`);
      return;
    }
    await loadProducts();
  }

  async function confirmDeleteMessage() {
    if (!deleteMessageTarget) return;
    await deleteContactMessage(deleteMessageTarget.id);
    setDeleteMessageTarget(null);
    await loadMessages();
  }

  async function handleToggleHandled(message: ContactMessage) {
    await markMessageHandled(message.id, !message.handled);
    await loadMessages();
  }

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Vérification de l&apos;accès...</div>;
  }

  const unhandledCount = messages.filter((m) => !m.handled).length;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-slate-200">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Blue Protein" className="h-7 w-auto" />
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <button
            onClick={() => setTab('produits')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'produits' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4" /> Produits
            <span className="ml-auto text-xs text-slate-400">{products.length}</span>
          </button>
          <button
            onClick={() => setTab('messages')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'messages' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Mail className="w-4 h-4" /> Messages
            {unhandledCount > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                {unhandledCount}
              </span>
            )}
          </button>
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <Link href="/" target="_blank" className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <ExternalLink className="w-4 h-4" /> Voir le site
          </Link>
          <div className="px-3 text-xs text-slate-400 truncate">{adminEmail}</div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-8 py-8">
        {tab === 'produits' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold">Catalogue</h2>
              <button
                onClick={() => setProductModal({ open: true })}
                className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                <Plus className="w-4 h-4" /> Nouveau produit
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4" />
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
                      <td className="py-2 pr-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200" />
                      </td>
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
                          <button onClick={() => setProductModal({ open: true, product: p })} className="text-slate-500 hover:text-emerald-700" title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteProductTarget(p)} className="text-slate-500 hover:text-red-600" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-slate-400">Aucun produit pour l&apos;instant.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
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
                      <button onClick={() => setDeleteMessageTarget(m)} className="text-slate-500 hover:text-red-600" title="Supprimer">
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
      </main>

      <Modal
        open={productModal.open}
        onClose={() => setProductModal({ open: false })}
        title={productModal.product ? 'Modifier le produit' : 'Nouveau produit'}
        wide
      >
        <ProductForm
          product={productModal.product}
          onCancel={() => setProductModal({ open: false })}
          onSaved={async () => { setProductModal({ open: false }); await loadProducts(); }}
        />
      </Modal>

      <ConfirmDialog
        open={deleteProductTarget !== null}
        title="Supprimer ce produit ?"
        message={deleteProductTarget ? `"${deleteProductTarget.name}" sera définitivement supprimé du catalogue.` : ''}
        confirmLabel="Supprimer"
        danger
        onConfirm={confirmDeleteProduct}
        onCancel={() => setDeleteProductTarget(null)}
      />

      <ConfirmDialog
        open={deleteMessageTarget !== null}
        title="Supprimer ce message ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
        onConfirm={confirmDeleteMessage}
        onCancel={() => setDeleteMessageTarget(null)}
      />
    </div>
  );
}
