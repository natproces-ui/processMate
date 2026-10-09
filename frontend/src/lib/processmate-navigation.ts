export type MainModule = 'orchestration' | 'stt';
export type StudioTool = 'documents' | 'assistant' | 'code';

type Query = Pick<URLSearchParams, 'get'>;

export const LEGACY_TAB_REDIRECTS: Record<string, string> = {
    campaigns: 'campagnes', dashboard: 'tableau-de-bord', portfolio: 'tableau-de-bord',
};

export function resolveProcessMateNavigation(query: Query) {
    const requested = query.get('module');
    const rawTab = query.get('tab') || 'procedures';
    const tab = requested === 'sfd' ? 'specifications' : LEGACY_TAB_REDIRECTS[rawTab] || rawTab;
    const module: MainModule = requested === 'stt' || requested === 'clinic' ? 'stt' : 'orchestration';
    const rawTool = requested === 'clinic' ? 'code' : query.get('tool');
    const tool: StudioTool | undefined = rawTool === 'code' || rawTool === 'documents' || rawTool === 'assistant' ? rawTool : undefined;
    return { module, tab, tool, procedureId: query.get('studio') || undefined };
}

export function processMateHref(query: string, target: {
    module: MainModule;
    tab?: string;
    procedureId?: string;
    tool?: StudioTool;
    returnTab?: string;
    returnProcedureId?: string;
}) {
    const params = new URLSearchParams(query);
    const previousTab = params.get('tab');
    for (const key of ['module', 'studio', 'tool', 'from', 'returnTab', 'returnProcedure']) params.delete(key);
    if (target.tab && target.tab !== previousTab) params.delete('subtab');
    params.set('tab', target.tab || 'procedures');
    if (target.module === 'stt') {
        params.set('module', 'stt');
        if (target.procedureId) params.set('studio', target.procedureId);
        if (target.tool) params.set('tool', target.tool);
        if (target.returnTab) params.set('returnTab', target.returnTab);
        if (target.returnProcedureId) params.set('returnProcedure', target.returnProcedureId);
    }
    return '/orchestration?' + params.toString();
}
