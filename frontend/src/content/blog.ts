/**
 * Articles du blog (lot 4). Un article = une entrée ; le corps est en Markdown simple
 * (titres ##, listes -, gras **), rendu par MiniMarkdown. Ajouter un article = ajouter
 * une entrée ici : les pages sont générées au build (export statique).
 */
export interface BlogPost {
    slug: string;
    title: string;
    date: string; // AAAA-MM-JJ
    summary: string;
    body: string;
}

export const BLOG_POSTS: BlogPost[] = [
    {
        slug: 'formaliser-une-procedure-depuis-un-document',
        title: 'Formaliser une procédure à partir d’un document',
        date: '2026-11-18',
        summary: 'Joindre un document, choisir les procédures à formaliser, relire le logigramme : le parcours pas à pas.',
        body: `## Ce dont vous avez besoin

Un document qui décrit votre façon de travailler : une présentation, une note, un mode opératoire, une capture d’écran. Il n’a pas besoin d’être parfait : l’assistant signale ce qui manque.

## Les étapes

- **Joignez le document** dans le chat, ou décrivez la procédure avec vos mots.
- **Choisissez les procédures** : si le document en contient plusieurs, l’assistant vous les propose ; cochez celles à formaliser, ou demandez de les fusionner.
- **Relisez le résultat** : chaque procédure arrive sous forme de tableau et de logigramme BPMN, avec une relecture qui pointe les acteurs, outils ou règles à confirmer.
- **Ajustez par la conversation** : « l’étape 4 est faite par l’agence », « ajoute une relance si le dossier est incomplet ».

## Rapide, Normale ou Approfondie ?

Ce réglage choisit le temps que l’assistant consacre à l’analyse. Rapide convient à un document court et clair ; Approfondie, à un document long ou à une procédure avec beaucoup de cas particuliers.

## Sans compte

Vous pouvez essayer sans compte, avec un document de taille limitée. Rien n’est enregistré : créez un compte gratuit pour conserver vos conversations et vos procédures.`,
    },
];

export function getPost(slug: string): BlogPost | undefined {
    return BLOG_POSTS.find(p => p.slug === slug);
}
