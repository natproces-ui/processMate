'use client';

// components/orchestration/ScreenFrame.tsx
//
// Affiche la page HTML d'un écran du référentiel (ToolScreen.html) avec la charte de son
// applicatif (Tool.design_css), à l'échelle de la place disponible. La page est conçue en
// 1280 px de large. Iframe isolé sans `allow-scripts` : le HTML enregistré ne peut rien
// exécuter ; `allow-same-origin` sert seulement à mesurer la hauteur de la page.
// Écran sans page HTML : sa capture si elle existe, sinon un cadre neutre avec ses champs (ScreenMockup).

import { useEffect, useRef, useState } from 'react';
import { toolsApi, type ToolScreen } from '@/lib/toolsApi';
import ScreenMockup from '@/components/orchestration/ScreenMockup';

export const DESIGN_WIDTH = 1280;

interface Props {
    screen: ToolScreen;
    css?: string | null;
    toolName: string;
    /** Hauteur affichée maximale, en pixels de conception (ex. 800 = cadrage 16:10) ; absente = page entière. */
    cropHeight?: number;
    className?: string;
}

export default function ScreenFrame({ screen, css, toolName, cropHeight, className = '' }: Props) {
    const boxRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [width, setWidth] = useState(0);
    const [pageHeight, setPageHeight] = useState(800);

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (!screen.html) {
        return (
            <div className={className}>
                {screen.screenshot_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={toolsApi.screenshotUrl(screen.id)} alt={screen.name} className="block w-full object-cover object-top"
                        style={cropHeight ? { aspectRatio: `${DESIGN_WIDTH} / ${cropHeight}` } : undefined} />
                    : <ScreenMockup screen={screen} toolName={toolName} />}
            </div>
        );
    }

    const scale = width / DESIGN_WIDTH;
    const shown = cropHeight ? Math.min(cropHeight, pageHeight) : pageHeight;
    const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>${css || ''}</style>`
        + `<style>html,body{overflow:hidden}</style></head><body>${screen.html}</body></html>`;

    const measure = () => {
        const doc = frameRef.current?.contentDocument;
        if (doc?.body) setPageHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 400));
    };

    return (
        <div ref={boxRef} className={`overflow-hidden ${className}`} style={{ position: 'relative', height: width ? shown * scale : undefined }}>
            {width > 0 && (
                <iframe
                    ref={frameRef}
                    title={screen.name}
                    srcDoc={srcDoc}
                    sandbox="allow-same-origin"
                    onLoad={() => { measure(); setTimeout(measure, 400); /* polices chargées */ }}
                    tabIndex={-1}
                    className="absolute top-0 left-0 border-0 origin-top-left pointer-events-none"
                    style={{ width: DESIGN_WIDTH, height: pageHeight, transform: `scale(${scale})` }}
                />
            )}
        </div>
    );
}
