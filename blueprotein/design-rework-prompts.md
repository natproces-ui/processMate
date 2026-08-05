# Blue Protein — refonte design, inspirée des sites d'engrais néerlandais

## Contexte de l'analyse

Analyse directe de captures d'écran de 5 sites du secteur (Culterra, Fertitrade, Van Iperen,
Aptus Plant Tech, Mivena), complétée par une recherche sur Van Iperen / Mivena. Ce qui revient
systématiquement chez eux, et que Blue Protein n'a pas encore :

- **Header utilitaire** : barre de contact (tél/email) au-dessus du header principal (Aptus,
  Fertitrade), recherche produit (Plantopia, Fertitrade, Mivena), méga-menu déroulant par
  catégorie plutôt qu'un simple lien "Produits" (Van Iperen "Notre expertise", Mivena "Produits",
  Fertitrade "Engrais > Minéraux/Organiques/Liquides/Spécifiques").
- **Sélecteur d'audience/culture par icônes** dans le hero (Mivena : gazon, horticulture, arbres,
  fraise, terrain de foot, golf — l'utilisateur clique son usage et va directement au bon rayon).
- **Fiche produit organisée en onglets**, pas en liste verticale (Mivena : Fiches techniques /
  Taux d'application / Brochures / Emballage Infos) et en encarts pliables 2x2 (Aptus : Comment
  utiliser / Comment agit / Composition / Astuces).
- **Fiche technique PDF téléchargeable** par produit (Van Iperen, Mivena) — Blue Protein n'a que
  du texte, pas de document.
- **Calculateur de dosage interactif** (Mivena : produit + durée + unité + région + niveau
  d'alimentation → dose en g/m² avec barres colorées) — fonctionnalité avancée, en option.
- **Photos texture produit en gros plan** (Culterra : pellets/prills/granulés en très gros plan,
  Fertitrade : même logique) — bien plus parlant qu'une photo générique unique.
- **Palette** : jamais un seul vert plat. Toujours vert (parfois deux verts, clair + foncé) +
  une touche jaune/orange/kaki, sur fond blanc/noir bien affirmé (logos et titres en noir, pas
  seulement en vert). Blue Protein est aujourd'hui un peu trop mono-vert.
- **Process visuel en flèches connectées** (Culterra : Organic products → Structure → Packaging
  → Labelling) — plus vivant qu'une simple liste de cartes.
- **Galerie de cultures filtrable** (Mivena : Tous / Fruitée / Ornementales, avec vraies photos
  de champs).

## Assets disponibles

Déjà dans `blueprotein/public/` :

| Fichier | Contenu | Usage prévu |
|---|---|---|
| `produit_bouteille.png` | Bidon/bouteille produit liquide | Image par défaut pour tout produit `family = 'liquide'` |
| `produit_sachet.png` | Sachet/sac produit poudre | Image par défaut pour tout produit `family = 'solide'` |
| `sol.png` | Texture de sol/terre | Fond décoratif de sections (remplace la texture CSS feuilles retirée) |
| `plante1.png` | Plante/culture | Imagerie décorative (besoins, catégories, galerie cultures) |
| `plante2.png` | Plante/culture | Idem, pour varier |
| `hero-farmer.png` | Agriculteur dans un champ (déjà utilisé) | Reste le hero principal |
| `product-placeholder.jpg` | Main épandant de l'engrais (déjà utilisé) | Réutilisable en illustration "besoins"/méthode |

Principe : ne pas laisser une seule image générique couvrir tous les produits sans distinction —
au minimum différencier liquide/solide avec `produit_bouteille.png` / `produit_sachet.png`.

---

## Prompt 1 — Header : barre utilitaire, recherche, méga-menu produits

```
Dans le projet blueprotein (c:\processMate\blueprotein), retravaille SiteHeader.tsx :

1. Ajoute une fine barre utilitaire au-dessus du header principal (fond emerald-950, texte
   blanc/emerald-200, texte petit) affichant le téléphone (+212 5 26 11 22 77) et l'email
   (contact@blueprotein.ma), visible dès le chargement, cachée sur mobile si besoin de place.

2. Remplace le lien "Produits" du nav par un méga-menu déroulant au survol/clic, listant les
   vraies catégories issues de la base (Biostimulants organiques, Amendements organiques,
   Correcteurs de carences) avec une icône Lucide par catégorie, chacune renvoyant vers
   /#produits avec la catégorie pré-sélectionnée (il faudra un moyen de transmettre la catégorie
   choisie à BlueProteinHome — un query param ?categorie=... lu au montage, ou un événement/state
   partagé, à toi de choisir la solution la plus simple compte tenu de l'architecture actuelle
   avec ALL_CATEGORIES dans BlueProteinHome.tsx).

3. Ajoute une recherche produit dans le header : une icône loupe qui déplie un champ texte,
   filtrant les produits par nom/tagline (récupère la liste des produits publiés côté client,
   ou passe-la en prop depuis page.tsx comme pour BlueProteinHome), affichant un dropdown de
   résultats cliquables menant à /produits/[slug].

Respecte les conventions existantes (Tailwind, useLanguage/i18n pour les libellés fixes,
lucide-react pour les icônes). Vérifie lint + type-check + build avant de considérer terminé.
```

---

## Prompt 2 — Hero : sélecteur d'audience/culture par icônes

```
Dans blueprotein, inspiré du sélecteur circulaire de mivena.nl (icônes gazon/horticulture/
arbres/fraise/golf permettant de choisir son usage), ajoute sous le sous-titre du hero dans
BlueProteinHome.tsx une rangée de 4-5 boutons ronds avec icône Lucide + petit libellé
(ex. Maraîchage, Céréales, Arboriculture, Gazon & espaces verts — adapte les libellés aux
catégories réellement disponibles dans la base plutôt que d'inventer des cultures non couvertes
par le catalogue actuel).

Chaque bouton, au clic, doit faire défiler la page jusqu'à #produits et présélectionner la
catégorie la plus pertinente (même mécanisme de filtre que pour le méga-menu du Prompt 1 —
factorise si les deux prompts sont faits dans la même session pour éviter deux implémentations
différentes du même filtre).

Utilise /plante1.png ou /plante2.png en petite illustration décorative à proximité de cette
rangée de boutons (pas en pleine largeur, en accent visuel).

Vérifie lint + type-check + build.
```

---

## Prompt 3 — Catalogue produits : images par format, pas une image unique

```
Dans blueprotein, corrige la stratégie d'image des produits : actuellement tous les produits
utilisent la même image par défaut (/product-placeholder.jpg). Change la logique pour que
l'image par défaut dépende de la gamme (family) du produit :

- family = 'liquide' → /produit_bouteille.png
- family = 'solide' → /produit_sachet.png

Ça doit s'appliquer :
1. Comme fallback dans le composant ProductImage (src/components/media.tsx) quand le produit
   n'a pas d'image_url personnalisée uploadée — actuellement il n'y a qu'un seul fallback fixe,
   il doit maintenant dépendre de product.family.
2. Dans le SQL de seed existant (supabase/create_products.sql ou équivalent) : mets à jour
   image_url des produits qui utilisent encore le placeholder générique pour qu'ils pointent
   vers la bonne image par défaut selon leur family (écris une migration SQL séparée,
   supabase/update_product_images_by_family.sql, avec des UPDATE conditionnels sur family,
   plutôt que de modifier le script déjà exécuté).
3. Dans le formulaire admin (ProductForm.tsx), affiche l'image par défaut correspondant à la
   gamme sélectionnée tant que l'admin n'a pas chargé sa propre photo, pour que l'aperçu soit
   cohérent avec ce qui s'affichera réellement sur le site.

Ajoute aussi /sol.png comme fond décoratif (faible opacité, en accent, pas plein écran) sur la
section "Vos besoins" de BlueProteinHome.tsx, à la place ou en complément du visuel actuel.

Vérifie lint + type-check + build, et vérifie visuellement qu'un produit liquide (ex. Blue
Stimulant) affiche bien la bouteille et un produit solide (ex. Blue Frass BSF) affiche bien le
sachet.
```

---

## Prompt 4 — Fiche produit : onglets + fiche technique PDF téléchargeable

```
Dans blueprotein, retravaille ProductDetailView.tsx (src/components/ProductDetailView.tsx) pour
organiser le contenu en onglets plutôt qu'en sections empilées verticalement, sur le modèle de
mivena.nl/products/field-cote (onglets "Fiches techniques / Taux d'application / Brochures /
Emballage Infos") :

- Onglet "Présentation" : description, avantages (déjà existants)
- Onglet "Dosage & application" : le champ dosage
- Onglet "Composition" : composition_summary ou le tableau de variants existant
- Onglet "Conditionnement & précautions" : conditioning + precautions

Garde un design d'onglets simple (boutons horizontaux, style actif/inactif cohérent avec le
reste du site — inspire-toi du style déjà utilisé pour les onglets Agriculteurs/Fournisseurs
dans BlueProteinHome.tsx).

Ajoute ensuite la possibilité d'attacher une fiche technique PDF à un produit :
1. Migration SQL (supabase/add_product_spec_sheet.sql) : ajoute une colonne
   spec_sheet_url text nullable à la table products.
2. Dans ProductForm.tsx (admin) : ajoute un champ d'upload de fichier PDF (réutilise le bucket
   Supabase Storage "images" existant, ou crée un bucket "documents" dédié avec les mêmes
   règles RLS que celles de create_images_bucket.sql si tu préfères séparer images et documents
   — documente ton choix).
3. Sur ProductDetailView.tsx : si spec_sheet_url est renseigné, affiche un bouton "Télécharger
   la fiche technique" avec une icône (style inspiré du bouton vert de Van Iperen/Mivena), qui
   ouvre/télécharge le PDF dans un nouvel onglet.

Vérifie lint + type-check + build.
```

---

## Prompt 5 — Palette et intégration des textures/images

```
Dans blueprotein, la palette actuelle est trop mono-verte comparée aux références du secteur
(Culterra, Fertitrade, Aptus, Van Iperen, Mivena) qui mélangent systématiquement vert + une
touche kaki/jaune/orange, sur fond blanc/noir bien affirmé :

1. Introduis un ton kaki/olive secondaire (ex. #6b7c3f ou proche) utilisé ponctuellement en
   alternative à l'emerald actuel — par exemple sur un des badges de catégorie, ou en fond d'une
   des sections (pas partout, en accent, pour casser la monotonie verte).
2. Renforce le noir/quasi-noir dans les titres de produits et le logo/header (actuellement tout
   est en teintes de vert ou de gris slate) — vérifie que les titres de fiches produits (h1 sur
   ProductDetailView.tsx) et les noms de produits sur les cartes utilisent un noir/gris très
   foncé plutôt qu'un vert, pour un rendu plus "sérieux/professionnel" à la Aptus/Culterra.
3. Utilise /sol.png en fond de section à faible opacité pour au moins une section supplémentaire
   (en plus de "Vos besoins" fait au Prompt 3) — par exemple le bandeau stats ou la section
   témoignages, à toi de choisir ce qui rend le mieux visuellement, en gardant à l'esprit que le
   motif CSS feuilles (LeafPattern) est désormais réservé uniquement à la bannière CTA "Prêt à
   améliorer votre sol" et ne doit pas être remis ailleurs.
4. Utilise /plante1.png et /plante2.png quelque part dans la section "Pourquoi Blue Protein" ou
   dans une des cartes de section dynamique existantes (via le champ image_url déjà disponible
   sur section_cards — pas besoin de modifier le schéma, juste de mettre à jour le contenu d'une
   ou deux cartes existantes avec ces images via SQL UPDATE).

Documente les choix de couleur (valeurs hex retenues) dans un commentaire en tête de
globals.css. Vérifie lint + type-check + build, et fais une vérification visuelle du rendu.
```

---

## Prompt 6 — Process en flèches connectées + galerie cultures filtrable

```
Dans blueprotein, deux ajouts inspirés de Culterra et Mivena :

1. Process en flèches connectées (culterra.com/com/services.html : "Organic products >
   Structure > Packaging > Labelling") : ajoute un style d'affichage alternatif pour la section
   dynamique "Notre méthodologie" (celle avec show_numbers = true et des cartes cliquables) —
   soit un nouveau champ display_style sur la table sections ('cards' | 'flow', migration SQL
   dédiée), soit directement une version repensée du composant DynamicSection.tsx quand
   show_numbers est actif, avec des chevrons/flèches connectant visuellement les étapes plutôt
   que des cartes indépendantes en grille. Attention à rester responsive (empiler verticalement
   sur mobile).

2. Galerie de cultures filtrable (mivena.nl/products/field-cote : onglets Tous/Fruitée/
   Ornementales avec vraies photos de champs) : ajoute une nouvelle section sur la page d'accueil
   (avant ou après les témoignages, à toi de juger la meilleure position) présentant quelques
   photos de cultures avec des onglets de filtre simples (client-side, pas besoin de base de
   données pour ça — un tableau local avec catégorie + image + légende suffit pour une première
   version). Utilise /plante1.png et /plante2.png comme photos, plus /product-placeholder.jpg si
   une troisième image est nécessaire pour que la galerie ne soit pas trop pauvre.

Vérifie lint + type-check + build après chaque partie.
```

---

## Ordre d'exécution suggéré

Les prompts 1 et 2 partagent un mécanisme de filtre de catégorie déclenché depuis l'extérieur de
`BlueProteinHome` — les faire dans la même session pour éviter deux implémentations
différentes. Le prompt 3 est le plus prioritaire visuellement (corrige un vrai défaut : toutes
les fiches produits se ressemblent). Le prompt 4 est le plus gros chantier (onglets + upload
PDF). Les prompts 5 et 6 sont des finitions, à faire en dernier une fois la structure en place.
