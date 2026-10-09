# Spec : Scraper BIAN v14 Business Scenarios avec Playwright

## Contexte

Le portail BIAN (Banking Industry Architecture Network) publie un référentiel de 362 Business Scenarios bancaires sous forme de diagrammes de séquence UML sur un site web rendu en JavaScript (BiZZdesign HoriZZon / InSite).

URL du portail v14 : `https://bian.org/servicelandscape-14-0-0/`

Ces scénarios sont organisés en 14 catégories :
- Bank Relations
- Business Development
- Card Products
- Channels
- Corporate Banking Products
- Corporate Finance
- Lending
- Payments
- Product and Price
- Retail Banking and Consumer
- Wealth
- Generally Usable Scenario Snippets
- Coreless
- Payment (New)

Chaque scénario est un diagramme de séquence UML accessible via une URL du type :
`https://bian.org/servicelandscape-14-0-0/views/view_XXXXX.html`

## Objectif

Écrire un script Python qui utilise Playwright pour :

1. Naviguer dans le portail BIAN v14
2. Découvrir automatiquement tous les Business Scenarios (les 362)
3. Pour chaque scénario, extraire le contenu structuré
4. Sauvegarder le tout dans un fichier JSON

## Ce qu'il faut extraire par scénario

```json
{
  "view_id": "view_54912",
  "url": "https://bian.org/servicelandscape-14-0-0/views/view_54912.html",
  "title": "Customer Relationship Case Initiation",
  "category": "Retail Banking and Consumer",
  "version": "14.0",
  "participants": [
    "Point of Service",
    "Session Dialogue",
    "Servicing Order",
    "Current Account",
    "Customer Case"
  ],
  "steps": [
    {
      "order": 1,
      "from": "Point of Service",
      "to": "Session Dialogue",
      "action": "Handle Customer Contact"
    },
    {
      "order": 2,
      "from": "Session Dialogue",
      "to": "Servicing Order",
      "action": "Handle Customer Complaint"
    }
  ],
  "fragments": [
    {
      "type": "loop",
      "label": "For Each Loan in Package",
      "step_range": [3, 7]
    }
  ]
}
```

## Stratégie de crawl

### Étape 1 : Accéder au portail

Le portail v14 peut nécessiter un formulaire d'inscription (nom, email, entreprise, pays) sur la page `https://bian.org/deliverables/service-landscape/`. Mais les pages individuelles des vues semblent accessibles directement sans authentification. Tester d'abord l'accès direct.

Si le formulaire est requis, le remplir avec Playwright :
- Nom : à paramétrer
- Email : à paramétrer
- Entreprise : à paramétrer
- Pays : à paramétrer

### Étape 2 : Découvrir les view_IDs des scénarios

Point d'entrée : la page d'accueil du portail `https://bian.org/servicelandscape-14-0-0/`

Cette page contient les liens vers les 14 catégories de Business Scenarios. Chaque catégorie mène à une page listant les scénarios de cette catégorie, chacun avec un lien `view_XXXXX.html`.

Stratégie :
1. Ouvrir la page d'accueil
2. Attendre le rendu JS complet
3. Collecter les liens vers les catégories de Business Scenarios
4. Pour chaque catégorie, ouvrir la page et collecter les liens vers les scénarios individuels
5. On obtient la liste complète des view_IDs

### Étape 3 : Extraire le contenu de chaque scénario

Pour chaque view_ID :
1. Ouvrir `https://bian.org/servicelandscape-14-0-0/views/view_XXXXX.html`
2. Attendre le rendu JS complet (le contenu est chargé dynamiquement)
3. Extraire :
   - Le titre du scénario (balise h1 ou premier heading)
   - Les participants (les boîtes jaunes en haut du diagramme de séquence — ce sont les noms des Service Domains)
   - Les messages/étapes (les flèches entre les participants avec leur label texte)
   - Les fragments UML (boucles `loop`, alternatives `alt`, références `ref`)

Note importante : le contenu textuel EST présent dans le HTML rendu (pas uniquement dans un canvas ou SVG). Les tests de fetch ont confirmé que les titres, participants et messages sont en texte dans le DOM après rendu JS.

### Étape 4 : Sauvegarder

Sauvegarder dans un fichier `bian_v14_scenarios.json` contenant un tableau de tous les scénarios extraits.

## Stack technique

- Python 3.11+
- `playwright` (SDK Python) — `pip install playwright && playwright install chromium`
- Le script doit être dans le backend FastAPI du projet ProcessMate
- Emplacement suggéré : `backend/scripts/bian_scraper.py`

## Gestion des erreurs

- Timeout de 15 secondes par page (certaines pages peuvent être lentes)
- Si une page ne charge pas, la logger et continuer
- Retry 1 fois en cas d'échec
- À la fin, afficher un résumé : X scénarios extraits / Y tentés

## Configuration

Le script doit accepter des paramètres :
- `--version` : version BIAN (défaut : "14-0-0")
- `--output` : chemin du fichier JSON de sortie
- `--category` : optionnel, pour ne scraper qu'une seule catégorie (utile pour tester)

## Exemple d'utilisation

```bash
# Scraper tout
python backend/scripts/bian_scraper.py --output data/bian_v14_scenarios.json

# Scraper une seule catégorie pour tester
python backend/scripts/bian_scraper.py --category "Lending" --output data/bian_v14_lending.json
```

## Points d'attention

1. Le site utilise BiZZdesign HoriZZon — le contenu est rendu en JS. Il FAUT un navigateur headless (Playwright), un simple HTTP GET ne suffit pas pour les diagrammes détaillés.

2. Les pages peuvent contenir des SVG interactifs. Le contenu textuel des diagrammes de séquence (participants, messages) est dans le DOM après rendu, pas dans un canvas.

3. Respecter un délai de 2 secondes entre chaque requête pour ne pas surcharger le serveur BIAN.

4. Le script sera relancé environ 1 à 2 fois par an quand BIAN publie une nouvelle version. Il suffit de changer le paramètre `--version`.