import React from 'react';

interface BPMNProcess {
    id: string;
    name: string;
    description: string;
    category: string;
    actors: Array<{
        id: string;
        name: string;
        type: string;
    }>;
    activities: Array<{
        id: string;
        name: string;
        type: string;
        actor: string;
        description: string;
    }>;
    flows: Array<{
        id: string;
        source: string;
        target: string;
        condition?: string;
    }>;
}

interface BPMNData {
    processes: BPMNProcess[];
    insights: {
        total_processes: number;
        complexity: string;
        recommendations: string[];
    };
}

interface BPMNResultsProps {
    bpmnData: BPMNData;
    bpmnXml: string;
    filesCount: number;
    onDownloadBPMN: () => void;
}

export default function BPMNResults({
    bpmnData,
    bpmnXml,
    filesCount,
    onDownloadBPMN,
}: BPMNResultsProps) {
    return (
        <div className="result-section show">
            {/* BPMN Statistics */}
            <div className="stats-container">
                <div className="stats-title">Résultats de l'analyse BPMN</div>
                <div className="stats">
                    <div className="stat-item">
                        <div className="stat-label">Processus identifiés</div>
                        <div className="stat-value">{bpmnData.insights.total_processes}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Complexité</div>
                        <div className="stat-value">{bpmnData.insights.complexity}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Documents analysés</div>
                        <div className="stat-value">{filesCount}</div>
                    </div>
                </div>
            </div>

            {bpmnXml && (
                <button className="download-json-btn" onClick={onDownloadBPMN}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Télécharger BPMN XML
                </button>
            )}

            {/* BPMN Processes Display */}
            <div className="flowchart-container">
                <div className="flowchart-title">Processus BPMN identifiés</div>

                <div className="business-info-section">
                    {bpmnData.processes.map((process, idx) => (
                        <div key={idx} className="business-section">
                            <h3 className="business-section-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="9" y1="9" x2="15" y2="9"></line>
                                    <line x1="9" y1="15" x2="15" y2="15"></line>
                                </svg>
                                {process.name}
                            </h3>

                            <div className="business-card">
                                <div className="business-card-detail">
                                    <strong>Description:</strong> {process.description}
                                </div>
                                <div className="business-card-detail">
                                    <strong>Catégorie:</strong> <span className="business-badge">{process.category}</span>
                                </div>
                            </div>

                            {/* Actors */}
                            {process.actors.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                                        Acteurs ({process.actors.length})
                                    </h4>
                                    <div className="business-tags">
                                        {process.actors.map((actor, i) => (
                                            <span key={i} className="business-tag" title={actor.type}>
                                                {actor.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Activities */}
                            {process.activities.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                                        Activités ({process.activities.length})
                                    </h4>
                                    <div className="business-items">
                                        {process.activities.map((activity, i) => (
                                            <div key={i} className="business-card">
                                                <div className="business-card-header">
                                                    <span className="business-card-name">{activity.name}</span>
                                                    <span className="business-badge">{activity.type}</span>
                                                </div>
                                                <div className="business-card-detail">
                                                    {activity.description}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Flows */}
                            {process.flows.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                                        Flux ({process.flows.length})
                                    </h4>
                                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                        Le processus contient {process.flows.length} connexions entre les activités
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Recommendations */}
                    {bpmnData.insights.recommendations.length > 0 && (
                        <div className="business-section">
                            <h3 className="business-section-title">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M12 16v-4"></path>
                                    <path d="M12 8h.01"></path>
                                </svg>
                                Recommandations
                            </h3>
                            <div className="business-items">
                                {bpmnData.insights.recommendations.map((rec, i) => (
                                    <div key={i} className="business-card">
                                        <div className="business-card-detail">
                                            {rec}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}