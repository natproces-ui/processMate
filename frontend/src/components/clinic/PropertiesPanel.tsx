// src/components/clinic/PropertiesPanel.tsx

'use client';

import React from 'react';
import { Node, Edge } from 'reactflow';

interface PropertiesPanelProps {
    selectedNode: Node | null;
    selectedEdge: Edge | null;
    onNodeUpdate: (nodeId: string, updates: any) => void;
    onEdgeUpdate: (edgeId: string, updates: any) => void;
}

export default function PropertiesPanel({
    selectedNode,
    selectedEdge,
    onNodeUpdate,
    onEdgeUpdate,
}: PropertiesPanelProps) {
    if (!selectedNode && !selectedEdge) {
        return (
            <div style={styles.panel}>
                <div style={styles.emptyState}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎨</div>
                    <div style={{ color: '#6b7280', fontSize: '14px' }}>
                        Sélectionnez un nœud ou une connexion<br />pour modifier ses propriétés
                    </div>
                </div>
            </div>
        );
    }

    if (selectedNode) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>📦 Propriétés du nœud</span>
                    <span style={styles.nodeId}>{selectedNode.id}</span>
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Libellé</label>
                    <input
                        type="text"
                        value={selectedNode.data.label || selectedNode.id}
                        onChange={(e) => onNodeUpdate(selectedNode.id, { label: e.target.value })}
                        style={styles.input}
                        placeholder="Entrez le libellé"
                    />
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Forme</label>
                    <select
                        value={selectedNode.data.shape || 'box'}
                        onChange={(e) => onNodeUpdate(selectedNode.id, { shape: e.target.value })}
                        style={styles.select}
                    >
                        <option value="box">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="circle">Cercle</option>
                        <option value="diamond">Diamant</option>
                        <option value="hexagon">Hexagone</option>
                    </select>
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Couleur de fond</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="color"
                            value={selectedNode.data.color || '#ffffff'}
                            onChange={(e) => onNodeUpdate(selectedNode.id, { color: e.target.value })}
                            style={{ width: '50px', height: '35px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        />
                        <input
                            type="text"
                            value={selectedNode.data.color || '#ffffff'}
                            onChange={(e) => onNodeUpdate(selectedNode.id, { color: e.target.value })}
                            style={{ ...styles.input, flex: 1 }}
                            placeholder="#ffffff"
                        />
                    </div>
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Position</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={styles.sublabel}>X</label>
                            <input
                                type="number"
                                value={Math.round(selectedNode.position.x)}
                                readOnly
                                style={{ ...styles.input, background: '#f3f4f6' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={styles.sublabel}>Y</label>
                            <input
                                type="number"
                                value={Math.round(selectedNode.position.y)}
                                readOnly
                                style={{ ...styles.input, background: '#f3f4f6' }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (selectedEdge) {
        return (
            <div style={styles.panel}>
                <div style={styles.header}>
                    <span style={styles.title}>🔗 Propriétés de la connexion</span>
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>De → Vers</label>
                    <div style={styles.edgeInfo}>
                        {selectedEdge.source} → {selectedEdge.target}
                    </div>
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Libellé</label>
                    <input
                        type="text"
                        value={selectedEdge.label as string || ''}
                        onChange={(e) => onEdgeUpdate(selectedEdge.id, { label: e.target.value })}
                        style={styles.input}
                        placeholder="Entrez le libellé (optionnel)"
                    />
                </div>

                <div style={styles.section}>
                    <label style={styles.label}>Type</label>
                    <select
                        value={selectedEdge.type || 'smoothstep'}
                        onChange={(e) => onEdgeUpdate(selectedEdge.id, { type: e.target.value })}
                        style={styles.select}
                    >
                        <option value="smoothstep">Courbe douce</option>
                        <option value="default">Ligne droite</option>
                        <option value="step">Escalier</option>
                        <option value="straight">Ligne directe</option>
                    </select>
                </div>

                <div style={styles.section}>
                    <label style={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={selectedEdge.animated || false}
                            onChange={(e) => onEdgeUpdate(selectedEdge.id, { animated: e.target.checked })}
                        />
                        <span style={{ marginLeft: '8px' }}>Animation</span>
                    </label>
                </div>
            </div>
        );
    }

    return null;
}

const styles: Record<string, React.CSSProperties> = {
    panel: {
        width: '280px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '20px',
        maxHeight: '600px',
        overflowY: 'auto',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        textAlign: 'center',
    },
    header: {
        marginBottom: '20px',
        paddingBottom: '15px',
        borderBottom: '2px solid #e5e7eb',
    },
    title: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#1f2937',
        display: 'block',
        marginBottom: '5px',
    },
    nodeId: {
        fontSize: '12px',
        color: '#6b7280',
        fontFamily: 'monospace',
        background: '#f3f4f6',
        padding: '2px 8px',
        borderRadius: '4px',
        display: 'inline-block',
    },
    section: {
        marginBottom: '20px',
    },
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px',
    },
    sublabel: {
        display: 'block',
        fontSize: '11px',
        color: '#6b7280',
        marginBottom: '4px',
    },
    input: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
    },
    select: {
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '14px',
        background: '#ffffff',
        cursor: 'pointer',
        outline: 'none',
    },
    edgeInfo: {
        padding: '10px',
        background: '#f3f4f6',
        borderRadius: '6px',
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#1f2937',
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        color: '#374151',
        cursor: 'pointer',
    },
};