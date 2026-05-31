// logic/types.ts
export interface Table1Row {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'EndEvent' | 'Task' | 'UserTask'
    | 'ExclusiveGateway' | 'ParallelGateway' | 'InclusiveGateway';
    département: string;
    acteur: string;
    typeActeur: 'interne' | 'externe' | '';
    condition: string;
    outputs: { targetId: string; label: string }[];
    outil: string;
}

export interface NodePosition {
    x: number;
    y: number;
    layer: number;
    laneIndex: number;
    acteur: string;
}