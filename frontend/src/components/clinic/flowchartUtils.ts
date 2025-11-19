// src/components/clinic/flowchartUtils.ts

export interface VizInstance {
    renderSVGElement: (dotSource: string) => Promise<SVGSVGElement>;
    renderString: (dotSource: string) => Promise<string>;
}

/**
 * Instance globale de Viz.js (initialisée une seule fois)
 */
let vizInstance: VizInstance | null = null;

/**
 * Initialise Viz.js dynamiquement (seulement côté client)
 */
export const initializeViz = async (): Promise<VizInstance | null> => {
    if (typeof window === 'undefined') return null;

    try {
        // Charger Viz.js dynamiquement
        const Viz = (await import('viz.js')).default;
        const { Module, render } = await import('viz.js/full.render.js');

        vizInstance = new Viz({ Module, render }) as unknown as VizInstance;
        console.log('Viz.js initialisé avec succès');
        return vizInstance;
    } catch (error) {
        console.error('Échec de l’initialisation de Viz.js :', error);
        return null;
    }
};

/**
 * Rend du DOT en SVG (string) — utilisé pour le live preview
 */
export const renderDotToSvg = async (dotSource: string): Promise<string> => {
    if (!vizInstance) {
        throw new Error('Viz.js non initialisé. Appelez initializeViz() d’abord.');
    }

    try {
        const svgString = await vizInstance.renderString(dotSource);
        return svgString;
    } catch (error) {
        console.error('Erreur lors du rendu DOT → SVG :', error);
        throw new Error(`Rendu échoué : ${(error as Error).message}`);
    }
};

/**
 * Rend du DOT en élément SVG DOM — utilisé par EditorView
 */
export const renderDotToSvgElement = async (
    dotSource: string
): Promise<SVGSVGElement | null> => {
    if (!vizInstance) {
        console.error('Viz.js non initialisé');
        return null;
    }

    try {
        const svg = await vizInstance.renderSVGElement(dotSource);
        return svg;
    } catch (error) {
        console.error('Erreur renderSVGElement :', error);
        return null;
    }
};

/**
 * Télécharge un fichier texte (DOT, SVG, etc.)
 */
export const downloadTextFile = (
    content: string,
    filename: string,
    mimeType: string = 'text/plain'
) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Télécharge le SVG à partir du DOT
 */
export const downloadSvgFromDot = async (
    dotSource: string,
    filename: string = 'flowchart.svg'
) => {
    try {
        const svgString = await renderDotToSvg(dotSource);
        downloadTextFile(svgString, filename, 'image/svg+xml');
    } catch (error) {
        console.error('Échec du téléchargement SVG :', error);
    }
};

/**
 * Télécharge le DOT source
 */
export const downloadDotFile = (dotSource: string, filename: string = 'flowchart.dot') => {
    downloadTextFile(dotSource, filename, 'text/plain');
};

/**
 * Calcule le zoom pour adapter l’image au conteneur
 */
export const calculateFitZoom = (
    imageWidth: number,
    imageHeight: number,
    containerWidth: number,
    containerHeight: number,
    padding: number = 40
): number => {
    if (imageWidth <= 0 || imageHeight <= 0) return 1;
    const scaleX = (containerWidth - padding) / imageWidth;
    const scaleY = (containerHeight - padding) / imageHeight;
    return Math.max(0.1, Math.min(scaleX, scaleY, 2)); // zoom entre 10% et 200%
};

/**
 * Nettoie et valide un DOT source
 */
export const sanitizeDotSource = (dot: string): string => {
    return dot
        .replace(/^\s*graphviz\s*/i, '') // supprime "graphviz" en début
        .replace(/```[\s\S]*?```/g, '') // supprime blocs markdown
        .trim();
};