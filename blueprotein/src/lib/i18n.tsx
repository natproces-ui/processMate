'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'fr' | 'dar';

const STORAGE_KEY = 'blueprotein-lang';

interface Translations {
  nav: { produits: string; pourquoi: string; commander: string; contact: string; espaceClient: string; commanderCta: string };
  hero: { badge: string; title: string; titleHighlight: string; subtitle: string; ctaProducts: string; ctaDistrib: string; trust: string[]; statValue: string; statLabel: string };
  values: { id: string; title: string; desc: string }[];
  products: { title: string; subtitle: string; all: string; empty: string; viewSheet: string; familyLiquide: string; familySolide: string };
  needs: {
    eyebrow: string; title: string; subtitle: string;
    items: { id: string; text: string }[];
  };
  stats: { id: string; value: string; label: string }[];
  audience: {
    tabAgri: string; tabFourn: string;
    agriculteurs: { title: string; desc: string; bullets: string[]; cta: string };
    fournisseurs: { title: string; desc: string; bullets: string[]; cta: string };
  };
  testimonials: { title: string };
  ctaBanner: { title: string; subtitle: string; ctaProducts: string; ctaContact: string };
  contact: {
    title: string; subtitle: string; hours: string;
    form: {
      name: string; namePlaceholder: string; company: string; companyPlaceholder: string;
      email: string; audienceLabel: string; audienceFarmer: string; audienceSupplier: string; audienceOther: string;
      message: string; messagePlaceholder: string; send: string; sending: string; sentMessage: string; errorMessage: string;
    };
  };
  footer: {
    tagline: string; productsTitle: string; companyTitle: string; contactTitle: string;
    companyLinks: { pourquoi: string; commander: string; distributeur: string };
    rights: string;
  };
  productDetail: {
    back: string; requestQuote: string; seeOthers: string; advantages: string; dosage: string;
    conditioning: string; precautions: string; composition: string; certified: string; reference: string;
    familyLiquide: string; familySolide: string;
  };
}

export const translations: Record<Lang, Translations> = {
  fr: {
    nav: {
      produits: 'Produits',
      pourquoi: 'Pourquoi Blue Protein',
      commander: 'Comment commander',
      contact: 'Contact',
      espaceClient: 'Espace client',
      commanderCta: 'Commander',
    },
    hero: {
      badge: "Biostimulants pour le Maroc & l'Afrique",
      title: 'Améliorer le sol. Nourrir vos cultures.',
      titleHighlight: 'À moindre coût.',
      subtitle: "Blue Protein conçoit des biostimulants durables et des engrais adaptés aux besoins réels des agriculteurs marocains et africains — testés sur le terrain, validés avant commercialisation.",
      ctaProducts: 'Découvrir les produits',
      ctaDistrib: 'Devenir distributeur',
      trust: ['Testé sur le terrain', 'Prix producteur', 'Adapté au climat local'],
      statValue: '-30 %',
      statLabel: 'coût moyen de nutrition',
    },
    values: [
      { id: 'sol', title: 'Nous améliorons le sol', desc: 'Des biostimulants qui régénèrent la structure et la vie du sol, pour une fertilité qui dure.' },
      { id: 'prix', title: 'Nourrir vos plantes, moins cher', desc: "Une nutrition efficace à prix producteur, sans marge d'intermédiaire ni de distributeur." },
      { id: 'afrique', title: "Pensé pour l'Afrique", desc: 'Formulations testées et validées sur les cultures et climats marocains et africains.' },
    ],
    products: {
      title: 'Notre gamme de produits',
      subtitle: 'Des solutions professionnelles pour la nutrition, la structure du sol et la vitalité des cultures.',
      all: 'Tous',
      empty: "Aucun produit publié pour cette catégorie pour l'instant.",
      viewSheet: 'Voir la fiche produit',
      familyLiquide: 'Liquide',
      familySolide: 'Solide',
    },
    needs: {
      eyebrow: 'On comprend vos besoins',
      title: 'Vos contraintes, pas une fiche produit générique',
      subtitle: "Trop de solutions agricoles sont pensées ailleurs, puis vendues telles quelles au Maroc et en Afrique. Blue Protein part de vos contraintes réelles, pas l'inverse.",
      items: [
        { id: 'cout', text: "Des coûts d'intrants imprévisibles qui rongent la rentabilité" },
        { id: 'sol', text: 'Des sols fatigués et des rendements qui stagnent' },
        { id: 'climat', text: 'Un climat de plus en plus sec et instable' },
        { id: 'produits', text: 'Des produits pensés ailleurs, mal adaptés au terrain local' },
      ],
    },
    stats: [
      { id: 'produits', value: '13', label: 'produits au catalogue' },
      { id: 'organique', value: '100 %', label: 'formulations à base organique' },
      { id: 'ccpb', value: '3', label: 'certifiées CCPB bio' },
      { id: 'gammes', value: '2', label: 'gammes : liquide & solide' },
    ],
    audience: {
      tabAgri: 'Agriculteurs',
      tabFourn: 'Fournisseurs & distributeurs',
      agriculteurs: {
        title: 'Pour les agriculteurs marocains et africains',
        desc: 'Commandez directement vos intrants en ligne, sans passer par un revendeur, et suivez vos livraisons en temps réel.',
        bullets: ['Catalogue complet accessible 24/7', 'Conseils agronomiques personnalisés', 'Prix producteur, sans marge intermédiaire', 'Réassort simplifié en un clic'],
        cta: 'Créer mon compte agriculteur',
      },
      fournisseurs: {
        title: 'Pour les fournisseurs & distributeurs',
        desc: 'Approvisionnez votre réseau avec des formulations en volume et des conditions commerciales dédiées aux professionnels.',
        bullets: ['Tarifs dégressifs par palier de volume', 'Conditionnements et marque blanche possibles', 'Interlocuteur commercial dédié', 'Support logistique et export'],
        cta: 'Devenir partenaire distributeur',
      },
    },
    testimonials: { title: 'Ils utilisent Blue Protein' },
    ctaBanner: {
      title: 'Prêt à améliorer votre sol et réduire vos coûts ?',
      subtitle: 'Rejoignez les exploitations et distributeurs qui font confiance à Blue Protein pour leurs intrants.',
      ctaProducts: 'Voir les produits',
      ctaContact: 'Parler à un conseiller',
    },
    contact: {
      title: 'Contactez-nous',
      subtitle: 'Une question sur un produit, une commande en volume ou un partenariat distributeur ? Notre équipe vous répond sous 24h.',
      hours: 'Lun–Ven, 8h–18h',
      form: {
        name: 'Nom complet',
        namePlaceholder: 'Votre nom',
        company: 'Société / Exploitation',
        companyPlaceholder: 'Optionnel',
        email: 'Email',
        audienceLabel: 'Vous êtes',
        audienceFarmer: 'Agriculteur',
        audienceSupplier: 'Fournisseur / distributeur',
        audienceOther: 'Autre',
        message: 'Message',
        messagePlaceholder: 'Décrivez votre besoin...',
        send: 'Envoyer le message',
        sending: 'Envoi...',
        sentMessage: 'Merci, votre message a bien été enregistré. Un conseiller vous recontacte sous 24h.',
        errorMessage: 'Une erreur est survenue, merci de réessayer.',
      },
    },
    footer: {
      tagline: 'Biostimulants et engrais durables, adaptés aux besoins des agriculteurs marocains et africains.',
      productsTitle: 'Produits',
      companyTitle: 'Entreprise',
      contactTitle: 'Contact',
      companyLinks: { pourquoi: 'Pourquoi Blue Protein', commander: 'Comment commander', distributeur: 'Devenir distributeur' },
      rights: 'Tous droits réservés.',
    },
    productDetail: {
      back: 'Retour aux produits',
      requestQuote: 'Demander un devis',
      seeOthers: "Voir d'autres produits",
      advantages: 'Avantages',
      dosage: 'Dosage et application',
      conditioning: 'Conditionnement',
      precautions: "Précautions d'emploi",
      composition: 'Composition',
      certified: 'Certifié CCPB — agriculture biologique',
      reference: 'Référence',
      familyLiquide: 'Fertilisant liquide',
      familySolide: 'Fertilisant solide',
    },
  },
  dar: {
    nav: {
      produits: 'Les produits',
      pourquoi: '3lash Blue Protein',
      commander: 'Kifach tcommandi',
      contact: 'Contact',
      espaceClient: 'Espace dyalek',
      commanderCta: 'Commandi daba',
    },
    hero: {
      badge: 'Bio-stimulants dyal Lmeghrib w Afriqya',
      title: 'Kanhassnou lard. Kant3amou zra3atkoum.',
      titleHighlight: 'B taman rkhas.',
      subtitle: "Blue Protein kaydir smad w bio-stimulants mzyanin, mesnou3in bach yjawbou l'ihtiyajat lwaqi3iya dyal lfellah lmeghribi w lafriqi — mjarrbin fl'ard qbel ma ybi3hom.",
      ctaProducts: 'Chouf les produits',
      ctaDistrib: 'Bghit nkoun distributeur',
      trust: ['Mjarreb fl’ard', 'Taman dyal producteur', 'Monasib l’klima dyal blad'],
      statValue: '-30 %',
      statLabel: 'taman dyal tay3ir li kayenqes',
    },
    values: [
      { id: 'sol', title: 'Kanhassnou lard', desc: 'Bio-stimulants li kayrej3ou l7ayat l lard, bach l fertilité dyalha tdoum.' },
      { id: 'prix', title: 'Nt3amou zra3atkoum, b taman rkhas', desc: 'Taghdiya mzyana b taman dyal producteur, bla marge dyal wassit wla distributeur.' },
      { id: 'afrique', title: 'Mesnou3 l Afriqya', desc: 'Formulations mjarrbin w muwafa9 3lihom 3la zra3at w klima dyal Lmeghrib w Afriqya.' },
    ],
    products: {
      title: 'Gamme dyalna dyal les produits',
      subtitle: 'Halloul professionnels l taghdiya, structure dyal lard, w sa7a dyal zra3atkoum.',
      all: 'Kolchi',
      empty: 'Mazal makayn produit manshour f had la catégorie.',
      viewSheet: 'Chouf la fiche dyal produit',
      familyLiquide: 'Siyal',
      familySolide: 'Yabsa',
    },
    needs: {
      eyebrow: 'Kanfhmou l7ajat dyalkom',
      title: 'La contrainte dyalkom, machi fiche produit 3amma',
      subtitle: 'Bzzaf dyal les solutions f la agriculture mesnou3in f blad okhra, mgoulin kifkif fLmeghrib w Afriqya. Blue Protein kaybda mn la contrainte lwaqi3iya dyalkom, machi l3aks.',
      items: [
        { id: 'cout', text: 'Taman dyal les intrants li matban wach ghadi ykhess, kayakol lrentabilité' },
        { id: 'sol', text: 'Lard 3eyya w rendement wa9ef' },
        { id: 'climat', text: 'Klima ghadi ynqes lma w maytabe3ch' },
        { id: 'produits', text: 'Produits mesnou3in f blad okhra, machi monasibin l’l’ard dyalna' },
      ],
    },
    stats: [
      { id: 'produits', value: '13', label: 'produit f catalogue' },
      { id: 'organique', value: '100 %', label: 'formulations organique' },
      { id: 'ccpb', value: '3', label: 'certifiin CCPB bio' },
      { id: 'gammes', value: '2', label: 'gammes: siyal w yabsa' },
    ],
    audience: {
      tabAgri: 'Fellaha',
      tabFourn: 'Fournisseurs & distributeurs',
      agriculteurs: {
        title: 'L’lfellah lmeghribi w lafriqi',
        desc: 'Commandi les intrants dyalek online, bla wassit, w tabe3 livraison dyalek fl’wa9t 7a9i9i.',
        bullets: ['Catalogue kamel mawjoud 24/7', 'Nasa2i7 agronomiques 3la 9addek', 'Taman dyal producteur, bla marge', 'Réassort sahel bghi click wa7ed'],
        cta: 'Dir compte dyal fellah',
      },
      fournisseurs: {
        title: 'L fournisseurs w distributeurs',
        desc: 'Jib l réseau dyalek b formulations bkmiyya kbira w chrout commerciales khassa bl professionnels.',
        bullets: ['Tarifs kaynaqsou 3la 7sab lkmiya', 'Conditionnements w marque blanche mumkinin', 'Chi wa7ed commercial khass bik', 'Support logistique w export'],
        cta: 'Bghit nkoun partenaire distributeur',
      },
    },
    testimonials: { title: 'Kaykhedmou b Blue Protein' },
    ctaBanner: {
      title: 'Wajed thassen lard dyalek w tnqes tka lif dyalek?',
      subtitle: 'Ndm m3a lfellaha w distributeurs li kaythiqou f Blue Protein l les intrants dyalhoum.',
      ctaProducts: 'Chouf les produits',
      ctaContact: 'Hdar m3a conseiller',
    },
    contact: {
      title: 'Twasel m3ana',
      subtitle: 'Chi so2al 3la produit, commande bkmiya kbira, wla partenariat distributeur? Equipe dyalna kaytjaweb 3lik f 24 sa3a.',
      hours: 'Ltnin–Jjm3a, 8ا12',
      form: {
        name: 'Smiya kamla',
        namePlaceholder: 'Smiytek',
        company: 'Chirka / Dar’a',
        companyPlaceholder: 'Ikhtiyari',
        email: 'Email',
        audienceLabel: 'Nta/Nti',
        audienceFarmer: 'Fellah',
        audienceSupplier: 'Fournisseur / distributeur',
        audienceOther: 'Chi 7aja okhra',
        message: 'Message',
        messagePlaceholder: 'Goul lina 7tiyajek...',
        send: 'Sifet message',
        sending: 'Kaytsifet...',
        sentMessage: 'Choukran, message dyalek twssel. Conseiller ghadi ytwasel m3ak f 24 sa3a.',
        errorMessage: 'Kayn chi mochkil, 3awd m3ana men fdlek.',
      },
    },
    footer: {
      tagline: 'Bio-stimulants w smad durables, monasibin l7ajat dyal lfellah lmeghribi w lafriqi.',
      productsTitle: 'Les produits',
      companyTitle: 'Chirka',
      contactTitle: 'Contact',
      companyLinks: { pourquoi: '3lash Blue Protein', commander: 'Kifach tcommandi', distributeur: 'Bghit nkoun distributeur' },
      rights: 'Kola l7oqouq mahfouda.',
    },
    productDetail: {
      back: 'Rj3 l les produits',
      requestQuote: 'Talab devis',
      seeOthers: 'Chouf produits okhrin',
      advantages: 'Avantages',
      dosage: 'Dosage w kifach tsta3milou',
      conditioning: 'Conditionnement',
      precautions: 'Ihtiyatat dyal listi3mal',
      composition: 'Composition',
      certified: 'Certifié CCPB — agriculture biologique',
      reference: 'Référence',
      familyLiquide: 'Smad siyal',
      familySolide: 'Smad yabes',
    },
  },
};

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'dar') setLangState(stored);
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

/** Picks the Darija field when active and non-empty, otherwise falls back to French. */
export function localizedField(lang: Lang, fr: string | null, dar: string | null | undefined): string | null {
  if (lang === 'dar' && dar && dar.trim()) return dar;
  return fr;
}
