declare module 'bpmn-moddle' {
    export class BpmnModdle {
        constructor(options?: any);
        create(type: string, attrs?: any): any;
        toXML(element: any, options?: any): Promise<{ xml: string }>;
    }
}