// bpmnStyles.ts - Styles BPMN avec hitbox flèches améliorée

export const BPMN_VIEWER_STYLES = `
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* Lanes verticales - SANS FOND */
    .djs-container .djs-element[data-element-id^="Lane_"] rect:first-child {
        fill: transparent !important;
        stroke-width: 4px !important;
        filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.1));
    }
    
    /* Labels des lanes - EN HAUT, GRAS, 26PX */
    .djs-container .djs-element[data-element-id^="Lane_"] .djs-label {
        transform: translateY(0px) !important;
        white-space: pre-wrap !important;
        text-align: center !important;
        line-height: 1.4 !important;
    }
    
    .djs-container .djs-element[data-element-id^="Lane_"] .djs-label text {
        font-size: 16px !important;
        font-weight: 700 !important;
        fill: #ffffff !important;
    }
    
    .djs-container .djs-element[data-element-id^="Lane_"] .djs-label tspan {
        fill: #ffffff !important;
        font-weight: 700 !important;
    }
    
    /* Labels des TÂCHES - AUGMENTÉS À 36PX */
    .djs-container .djs-element[data-element-id^="Task_"] .djs-label text {
        font-size: 50px !important;
        font-weight: 700 !important;
        fill: #111827 !important;
        line-height: 1.2 !important;
    }
    
    /* Labels des GATEWAYS */
    .djs-container .djs-element[data-element-id^="Gateway_"] .djs-label text {
        font-size: 28px !important;
        font-weight: 600 !important;
        fill: #111827 !important;
    }
    
    /* Labels des EVENTS */
    .djs-container .djs-element[data-element-id^="Start_"] .djs-label text,
    .djs-container .djs-element[data-element-id^="End_"] .djs-label text {
        font-size: 26px !important;
        font-weight: 600 !important;
        fill: #111827 !important;
    }
    
    /* Annotations d'outils - RÉDUITS À 18PX */
    .djs-container .djs-element[data-element-id^="Annotation_"] rect {
        fill: transparent !important;
        stroke: none !important;
    }
    
    .djs-container .djs-element[data-element-id^="Annotation_"] text {
        font-size: 18px !important;
        font-weight: 600 !important;
        fill: #F59E0B !important;
        text-shadow: 0 0 3px rgba(255, 255, 255, 0.8);
    }
    
    .djs-container .djs-connection[data-element-id^="Association_"] path {
        stroke: #F59E0B !important;
        stroke-width: 1.5px !important;
        stroke-dasharray: 4,2 !important;
        opacity: 0.5 !important;
    }
    
    /* Tâches */
    .djs-container .djs-element[data-element-id^="Task_"] rect {
        stroke-width: 4px !important;
        filter: drop-shadow(0 4px 8px rgba(37, 99, 235, 0.25));
        rx: 8 !important;
    }
    
    /* Gateways */
    .djs-container .djs-element[data-element-id^="Gateway_"] path {
        stroke: #f59e0b !important;
        stroke-width: 4px !important;
        fill: #fffbeb !important;
    }
    
    /* Events */
    .djs-container .djs-element[data-element-id^="Start_"] circle {
        stroke: #10b981 !important;
        stroke-width: 4px !important;
        fill: #d1fae5 !important;
    }
    
    .djs-container .djs-element[data-element-id^="End_"] circle {
        stroke: #ef4444 !important;
        stroke-width: 5px !important;
        fill: #fee2e2 !important;
    }
    
    /* Connexions - HITBOX ÉLARGIE */
    .djs-container .djs-connection path {
        stroke: #6b7280 !important;
        stroke-width: 3px !important;
    }
    
    /* Ajouter une hitbox invisible plus large pour faciliter la sélection */
    .djs-container .djs-connection {
        pointer-events: visibleStroke !important;
    }
    
    .djs-container .djs-connection path {
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
    }
    
    /* Overlay invisible pour élargir la zone de sélection */
    .djs-container .djs-connection::before {
        content: '' !important;
        position: absolute !important;
        pointer-events: stroke !important;
    }
    
    /* Style des flèches - IMPORTANT */
    .djs-container svg defs marker {
        display: block !important;
        visibility: visible !important;
    }
    
    .djs-container svg defs marker path,
    .djs-container svg defs marker polygon {
        fill: #6b7280 !important;
        stroke: none !important;
    }
    
    /* ============================================
       MODE VISUALISATION SEULE (non-éditable)
       ============================================ */
    
    .bpmn-view-only .djs-container .djs-context-pad,
    .bpmn-view-only .djs-container .djs-waypoint-move-preview,
    .bpmn-view-only .djs-container .djs-waypoint-move-handle,
    .bpmn-view-only .djs-container .djs-segment-dragger,
    .bpmn-view-only .djs-container .djs-bendpoint,
    .bpmn-view-only .djs-container .djs-attach-support,
    .bpmn-view-only .djs-container .djs-connect-handle,
    .bpmn-view-only .djs-container .djs-resize-handle {
        display: none !important;
        visibility: hidden !important;
    }
    
    .bpmn-view-only .djs-container .djs-connection circle:not([class*="marker"]) {
        display: none !important;
    }
    
    /* ============================================
       MODE ÉDITION (éditable)
       ============================================ */
    
    /* Context Pad - visible en mode édition */
    .bpmn-editable .djs-container .djs-context-pad {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-context-pad .entry {
        background: white !important;
        border: 2px solid #3b82f6 !important;
        border-radius: 4px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
    }
    
    .bpmn-editable .djs-container .djs-context-pad .entry:hover {
        background: #eff6ff !important;
        border-color: #2563eb !important;
        transform: scale(1.1);
    }
    
    /* Amélioration hover des connexions - PLUS VISIBLE */
    .bpmn-editable .djs-container .djs-connection path {
        transition: stroke-width 0.2s ease !important;
    }
    
    .bpmn-editable .djs-container .djs-connection:hover path,
    .bpmn-editable .djs-container .djs-connection.hover path {
        stroke-width: 6px !important;
        stroke: #3b82f6 !important;
        cursor: pointer !important;
    }
    
    /* Bendpoints - MASQUÉS par défaut, visibles au hover de la connexion */
    .bpmn-editable .djs-container .djs-bendpoint {
        display: none !important;
        fill: #3b82f6 !important;
        stroke: white !important;
        stroke-width: 2px !important;
        cursor: move !important;
        r: 5 !important;
    }
    
    .bpmn-editable .djs-container .djs-connection:hover .djs-bendpoint,
    .bpmn-editable .djs-container .djs-connection.selected .djs-bendpoint,
    .bpmn-editable .djs-container .djs-connection.hover .djs-bendpoint {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-bendpoint:hover {
        fill: #2563eb !important;
        stroke-width: 3px !important;
        r: 7 !important;
        cursor: grab !important;
    }
    
    .bpmn-editable .djs-container .djs-bendpoint:active {
        cursor: grabbing !important;
        fill: #1e40af !important;
    }
    
    /* Connect handles - visibles seulement au hover */
    .bpmn-editable .djs-container .djs-connect-handle {
        display: none !important;
        fill: #10b981 !important;
        stroke: white !important;
        stroke-width: 2px !important;
        cursor: crosshair !important;
    }
    
    .bpmn-editable .djs-container .djs-element:hover .djs-connect-handle,
    .bpmn-editable .djs-container .djs-element.selected .djs-connect-handle {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-connect-handle:hover {
        fill: #059669 !important;
        stroke-width: 3px !important;
        r: 6 !important;
    }
    
    /* Resize handles - visibles au hover */
    .bpmn-editable .djs-container .djs-resize-handle {
        display: none !important;
        fill: #f59e0b !important;
        stroke: white !important;
        stroke-width: 2px !important;
        cursor: nwse-resize !important;
    }
    
    .bpmn-editable .djs-container .djs-element:hover .djs-resize-handle,
    .bpmn-editable .djs-container .djs-element.selected .djs-resize-handle {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-resize-handle:hover {
        fill: #d97706 !important;
        stroke-width: 3px !important;
    }
    
    /* Waypoint handles - MASQUÉS, visibles au hover de connexion */
    .bpmn-editable .djs-container .djs-waypoint-move-handle {
        display: none !important;
        fill: #8b5cf6 !important;
        stroke: white !important;
        stroke-width: 2px !important;
        cursor: move !important;
        r: 5 !important;
    }
    
    .bpmn-editable .djs-container .djs-connection:hover .djs-waypoint-move-handle,
    .bpmn-editable .djs-container .djs-connection.selected .djs-waypoint-move-handle,
    .bpmn-editable .djs-container .djs-connection.hover .djs-waypoint-move-handle {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-waypoint-move-handle:hover {
        fill: #7c3aed !important;
        stroke-width: 3px !important;
        r: 7 !important;
        cursor: grab !important;
    }
    
    .bpmn-editable .djs-container .djs-waypoint-move-handle:active {
        cursor: grabbing !important;
        fill: #6d28d9 !important;
    }
    
    /* Segment dragger - MASQUÉ, visible au hover */
    .bpmn-editable .djs-container .djs-segment-dragger {
        display: none !important;
        stroke: #3b82f6 !important;
        stroke-dasharray: 5,5 !important;
        stroke-width: 2px !important;
        cursor: move !important;
        opacity: 0.6 !important;
    }
    
    .bpmn-editable .djs-container .djs-connection:hover .djs-segment-dragger,
    .bpmn-editable .djs-container .djs-connection.hover .djs-segment-dragger {
        display: block !important;
        visibility: visible !important;
    }
    
    .bpmn-editable .djs-container .djs-segment-dragger:hover {
        stroke-width: 3px !important;
        opacity: 1 !important;
        cursor: grab !important;
    }
    
    .bpmn-editable .djs-container .djs-segment-dragger:active {
        cursor: grabbing !important;
    }
    
    /* Cercles noirs aux extrémités - TOUJOURS MASQUÉS */
    .bpmn-editable .djs-container .djs-connection circle:not([class*="marker"]) {
        display: none !important;
    }
    
    /* Sélection */
    .bpmn-editable .djs-container .djs-element.selected .djs-outline {
        stroke: #3b82f6 !important;
        stroke-width: 3px !important;
        stroke-dasharray: 5,5 !important;
    }
    
    .bpmn-editable .djs-container .djs-connection.selected path {
        stroke: #3b82f6 !important;
        stroke-width: 5px !important;
    }
    
    /* Hover */
    .bpmn-editable .djs-container .djs-element.hover .djs-outline {
        stroke: #60a5fa !important;
        stroke-width: 2px !important;
    }
    
    /* Drag feedback */
    .bpmn-editable .djs-container .djs-dragging .djs-element,
    .bpmn-editable .djs-container .djs-dragging .djs-connection {
        opacity: 0.7 !important;
    }
    
    /* Connection preview */
    .bpmn-editable .djs-container .djs-connection-preview path {
        stroke: #3b82f6 !important;
        stroke-dasharray: 5,5 !important;
        stroke-width: 2px !important;
    }
    
    .spinner { animation: spin 1s linear infinite; }
`;