import React from 'react';
import FlowchartViewer from '@/components/clinic/FlowchartViewer';
import EditorView from '@/components/clinic/EditorView';
import TableComponent from '@/components/clinic/Table';
import { VizInstance } from '@/components/clinic/flowchartUtils';

interface Statistics {
    total_lines: number;
    statement_count: number;
    root_type: string;
    filename: string;
    procedures_count: number;
    global_variables_count: number;
    functions_called_count: number;
    file_size?: number;
    parsed_at: string;
}

interface BusinessInfo {
    global_variables: string[];
    functions_called: string[];
    procedures: Array<{
        name: string;
        parameters: string[];
        body_statements: number;
    }>;
    api_calls: string[];
    business_functions: string[];
    data_structures: Array<{
        name: string;
        type: string;
    }>;
}

interface ParsedData {
    ast: any;
    statistics: Statistics;
    business_info: BusinessInfo;
}

interface FlowchartResultsProps {
    parsedData: ParsedData;
    flowchartImageUrl: string;
    dotSource: string;
    currentFileName: string;
    vizInstance: VizInstance | null;
    activeTab: 'simple' | 'editor' | 'table' | 'business';
    onTabChange: (tab: 'simple' | 'editor' | 'table' | 'business') => void;
    onDotSourceChange: (source: string) => void;
    onDownloadJson: () => void;
}

export default function FlowchartResults({
    parsedData,
    flowchartImageUrl,
    dotSource,
    currentFileName,
    vizInstance,
    activeTab,
    onTabChange,
    onDotSourceChange,
    onDownloadJson,
}: FlowchartResultsProps) {
    return (
        <div className="result-section show">
            {/* Statistics */}
            <div className="stats-container">
                <div className="stats-title">Statistiques d'analyse</div>
                <div className="stats">
                    <div className="stat-item">
                        <div className="stat-label">Lignes</div>
                        <div className="stat-value">{parsedData.statistics.total_lines}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Instructions</div>
                        <div className="stat-value">{parsedData.statistics.statement_count}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Procédures</div>
                        <div className="stat-value">{parsedData.statistics.procedures_count}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Variables globales</div>
                        <div className="stat-value">{parsedData.statistics.global_variables_count}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Fonctions appelées</div>
                        <div className="stat-value">{parsedData.statistics.functions_called_count}</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">Type</div>
                        <div className="stat-value">{parsedData.statistics.root_type}</div>
                    </div>
                </div>
            </div>

            <button className="download-json-btn" onClick={onDownloadJson}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Télécharger l'AST JSON
            </button>

            {/* Flowchart Viewer */}
            <div className="flowchart-container">
                <div className="flowchart-title">Visualisation du flowchart</div>

                <div className="view-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'simple' ? 'active' : ''}`}
                        onClick={() => onTabChange('simple')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="9" y1="9" x2="15" y2="9"></line>
                            <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                        Vue simple
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
                        onClick={() => onTabChange('editor')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Mode édition
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
                        onClick={() => onTabChange('table')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 3h18v18H3z"></path>
                            <path d="M3 9h18"></path>
                            <path d="M3 15h18"></path>
                            <path d="M9 3v18"></path>
                        </svg>
                        Tableau métier
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'business' ? 'active' : ''}`}
                        onClick={() => onTabChange('business')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                        </svg>
                        Infos métier
                    </button>
                </div>

                <div className={`tab-content ${activeTab === 'simple' ? 'active' : ''}`}>
                    {activeTab === 'simple' && (
                        <FlowchartViewer imageUrl={flowchartImageUrl} />
                    )}
                </div>

                <div className={`tab-content ${activeTab === 'editor' ? 'active' : ''}`}>
                    {activeTab === 'editor' && (
                        <EditorView
                            dotSource={dotSource}
                            onDotSourceChange={onDotSourceChange}
                            vizInstance={vizInstance}
                            currentFileName={currentFileName}
                        />
                    )}
                </div>

                <div className={`tab-content ${activeTab === 'table' ? 'active' : ''}`}>
                    {activeTab === 'table' && dotSource && (
                        <TableComponent dotSource={dotSource} />
                    )}
                </div>

                <div className={`tab-content ${activeTab === 'business' ? 'active' : ''}`}>
                    {activeTab === 'business' && parsedData.business_info && (
                        <div className="business-info-section">
                            {/* Procedures Section */}
                            {parsedData.business_info.procedures.length > 0 && (
                                <div className="business-section">
                                    <h3 className="business-section-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="16 18 22 12 16 6"></polyline>
                                            <polyline points="8 6 2 12 8 18"></polyline>
                                        </svg>
                                        Procédures ({parsedData.business_info.procedures.length})
                                    </h3>
                                    <div className="business-items">
                                        {parsedData.business_info.procedures.map((proc, i) => (
                                            <div key={i} className="business-card">
                                                <div className="business-card-header">
                                                    <span className="business-card-name">{proc.name}</span>
                                                    <span className="business-badge">{proc.body_statements} instructions</span>
                                                </div>
                                                {proc.parameters.length > 0 && (
                                                    <div className="business-card-detail">
                                                        <strong>Paramètres:</strong> {proc.parameters.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* API Calls Section */}
                            {parsedData.business_info.api_calls.length > 0 && (
                                <div className="business-section">
                                    <h3 className="business-section-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="2" y1="12" x2="22" y2="12"></line>
                                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                                        </svg>
                                        Appels API ({parsedData.business_info.api_calls.length})
                                    </h3>
                                    <div className="business-tags">
                                        {parsedData.business_info.api_calls.map((call, i) => (
                                            <span key={i} className="business-tag api-tag">{call}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Business Functions Section */}
                            {parsedData.business_info.business_functions.length > 0 && (
                                <div className="business-section">
                                    <h3 className="business-section-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                            <line x1="12" y1="18" x2="12" y2="12"></line>
                                            <line x1="9" y1="15" x2="15" y2="15"></line>
                                        </svg>
                                        Fonctions métier ({parsedData.business_info.business_functions.length})
                                    </h3>
                                    <div className="business-tags">
                                        {parsedData.business_info.business_functions.map((func, i) => (
                                            <span key={i} className="business-tag function-tag">{func}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Data Structures Section */}
                            {parsedData.business_info.data_structures.length > 0 && (
                                <div className="business-section">
                                    <h3 className="business-section-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="14" width="7" height="7"></rect>
                                            <rect x="3" y="14" width="7" height="7"></rect>
                                        </svg>
                                        Structures de données ({parsedData.business_info.data_structures.length})
                                    </h3>
                                    <div className="business-items">
                                        {parsedData.business_info.data_structures.map((struct, i) => (
                                            <div key={i} className="business-card">
                                                <div className="business-card-header">
                                                    <span className="business-card-name">{struct.name}</span>
                                                    <span className="business-badge structure-badge">{struct.type}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Global Variables Section */}
                            {parsedData.business_info.global_variables.length > 0 && (
                                <div className="business-section">
                                    <h3 className="business-section-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="3"></circle>
                                            <path d="M12 1v6m0 6v6m8.66-15.66l-4.24 4.24M9.17 14.83l-4.24 4.24m12.73 0l-4.24-4.24M9.17 9.17L4.93 4.93"></path>
                                        </svg>
                                        Variables globales ({parsedData.business_info.global_variables.length})
                                    </h3>
                                    <div className="business-tags">
                                        {parsedData.business_info.global_variables.map((varName, i) => (
                                            <span key={i} className="business-tag variable-tag">{varName}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}