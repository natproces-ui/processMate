// bpmnStyles.ts
// Configuration des couleurs et styles pour les diagrammes BPMN

export interface ColorScheme {
  fill: string;
  stroke: string;
  strokeWidth?: string;
}

export const laneColors: ColorScheme[] = [
  { fill: '#E3F2FD', stroke: '#c3ccd4ff', strokeWidth: '4' },
  { fill: '#FFF3E0', stroke: '#F57C00', strokeWidth: '4' },
  { fill: '#F3E5F5', stroke: '#7B1FA2', strokeWidth: '4' },
  { fill: '#E8F5E9', stroke: '#388E3C', strokeWidth: '4' },
  { fill: '#FCE4EC', stroke: '#C2185B', strokeWidth: '4' },
  { fill: '#FFFDE7', stroke: '#F9A825', strokeWidth: '4' },
];

export const taskColors: Record<string, ColorScheme> = {
  default: { fill: '#EFF6FF', stroke: '#2563EB' },
  automatic: { fill: '#FEF9C3', stroke: '#CA8A04' },
  notification: { fill: '#FCE7F3', stroke: '#DB2777' },
  receive: { fill: '#E0E7FF', stroke: '#4F46E5' },
  manual: { fill: '#FED7AA', stroke: '#EA580C' },
  decision: { fill: '#F3E8FF', stroke: '#9333EA' },
  script: { fill: '#D1FAE5', stroke: '#059669' },
};

export const bpmnGlobalStyles = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .djs-container .djs-element[data-element-id^="Lane_"] rect:first-child {
    stroke-width: 4px !important;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.1));
  }
  
  /* ✨ OPTIMISATION MAXIMALE DU TEXTE POUR LISIBILITÉ */
  .djs-container .djs-element .djs-label text {
    font-size: 14px !important;
    font-weight: 600 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    fill: #111827 !important;
    white-space: normal !important;
    word-wrap: break-word !important;
  }
  
  /* Retours à la ligne automatiques dans les tâches */
  .djs-container .djs-element[data-element-id^="Task_"] .djs-label {
    white-space: normal !important;
  }
  
  .djs-container .djs-element[data-element-id^="Task_"] .djs-label text {
    font-size: 13px !important;
    line-height: 1.4 !important;
  }
  
  /* Texte des tâches avec retour à la ligne */
  .djs-container .djs-element[data-element-id^="Task_"] text tspan {
    text-anchor: middle !important;
  }
  
  .djs-container .djs-connection .djs-label text {
    font-size: 12px !important;
    font-weight: 600 !important;
    fill: #2563eb !important;
    text-shadow: 0 0 3px rgba(255, 255, 255, 0.9);
  }
  
  .djs-container .djs-element[data-element-id^="Lane_"] text {
    font-size: 16px !important;
    font-weight: 700 !important;
    fill: #000000 !important;
    letter-spacing: 0.5px !important;
  }
  
  .djs-container .djs-element[data-element-id^="Gateway_"] + .djs-label text {
    font-size: 12px !important;
    font-weight: 700 !important;
    fill: #374151 !important;
  }
  
  .djs-container .djs-element[data-element-id^="Task_"] rect {
    stroke-width: 3px !important;
    filter: drop-shadow(0 3px 6px rgba(37, 99, 235, 0.2));
    rx: 6 !important;
  }
  
  .djs-container .djs-element[data-element-id^="Task_"] .djs-label text {
    fill: #111827 !important;
    font-weight: 600 !important;
    font-size: 13px !important;
  }
  
  .djs-container .djs-element[data-element-id^="Gateway_"] path {
    stroke: #f59e0b !important;
    stroke-width: 3px !important;
    fill: #fffbeb !important;
    filter: drop-shadow(0 3px 6px rgba(245, 158, 11, 0.25));
  }
  
  .djs-container .djs-element[data-element-id^="Start_"] circle {
    stroke: #10b981 !important;
    stroke-width: 3px !important;
    fill: #d1fae5 !important;
    filter: drop-shadow(0 3px 6px rgba(16, 185, 129, 0.3));
  }
  
  .djs-container .djs-element[data-element-id^="End_"] circle {
    stroke: #ef4444 !important;
    stroke-width: 4px !important;
    fill: #fee2e2 !important;
    filter: drop-shadow(0 3px 6px rgba(239, 68, 68, 0.3));
  }
  
  .djs-container .djs-connection path {
    stroke: #6b7280 !important;
    stroke-width: 2.5px !important;
  }
  
  .djs-container .djs-connection.selected path {
    stroke: #2563eb !important;
    stroke-width: 4px !important;
  }
  
  .djs-container .selected .djs-outline {
    stroke: #2563eb !important;
    stroke-width: 4px !important;
    stroke-dasharray: 10, 5 !important;
  }
  
  .djs-container .djs-element:hover rect,
  .djs-container .djs-element:hover circle,
  .djs-container .djs-element:hover path {
    filter: brightness(1.05) drop-shadow(0 5px 10px rgba(0, 0, 0, 0.2));
  }
  
  .spinner {
    animation: spin 1s linear infinite;
  }
`;

/**
 * Détermine la couleur d'une tâche en fonction de son nom
 */
export function getTaskColorByName(taskName: string): ColorScheme {
  const name = taskName.toLowerCase();

  if (name.includes('automatique') || name.includes('service') || name.includes('système')) {
    return taskColors.automatic;
  } else if (name.includes('envoyer') || name.includes('notifier') || name.includes('email')) {
    return taskColors.notification;
  } else if (name.includes('recevoir') || name.includes('attendre')) {
    return taskColors.receive;
  } else if (name.includes('manuel') || name.includes('papier')) {
    return taskColors.manual;
  } else if (name.includes('règle') || name.includes('décision') || name.includes('calcul')) {
    return taskColors.decision;
  } else if (name.includes('script') || name.includes('code')) {
    return taskColors.script;
  }

  return taskColors.default;
}

/**
 * Applique les couleurs aux lanes d'un diagramme BPMN
 */
export function applyLaneColors(elementRegistry: any): void {
  try {
    const allElements = elementRegistry.getAll();
    const lanes = allElements.filter((e: any) => e.type === 'bpmn:Lane');

    lanes.forEach((element: any, index: number) => {
      const gfx = elementRegistry.getGraphics(element);
      if (gfx) {
        const rect = gfx.querySelector('rect');
        if (rect) {
          const colorScheme = laneColors[index % laneColors.length];
          rect.style.fill = colorScheme.fill;
          rect.style.fillOpacity = '0.9';
          rect.style.stroke = colorScheme.stroke;
          rect.style.strokeWidth = colorScheme.strokeWidth;
        }
      }
    });
  } catch (error) {
    console.log('Erreur application des couleurs aux lanes:', error);
  }
}

/**
 * Applique les couleurs aux tâches d'un diagramme BPMN
 */
export function applyTaskColors(elementRegistry: any): void {
  try {
    const allElements = elementRegistry.getAll();
    const tasks = allElements.filter((e: any) =>
      e.type === 'bpmn:Task' || e.type === 'bpmn:UserTask'
    );

    tasks.forEach((element: any) => {
      const gfx = elementRegistry.getGraphics(element);
      if (gfx) {
        const rect = gfx.querySelector('rect');
        if (rect) {
          const taskName = element.businessObject?.name || '';
          const color = getTaskColorByName(taskName);

          rect.style.fill = color.fill;
          rect.style.stroke = color.stroke;
          rect.style.strokeWidth = '4px';
        }
      }
    });
  } catch (error) {
    console.log('Erreur application des couleurs aux tâches:', error);
  }
}

/**
 * Applique tous les styles de couleur au diagramme BPMN
 */
export function applyAllBpmnColors(elementRegistry: any): void {
  applyLaneColors(elementRegistry);
  applyTaskColors(elementRegistry);
}