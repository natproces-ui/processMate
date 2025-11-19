// 📁 lib/bpmnGenerator.ts
import BpmnModdle from "bpmn-moddle";
import { ProcessElement } from "@/logic/processRules";

export async function generateBPMN(process: ProcessElement[]): Promise<string> {
    const moddle = new BpmnModdle();

    const elements: any[] = [];
    const sequenceFlows: any[] = [];

    // Création des tâches
    process.forEach((step) => {
        const taskId = `Task_${step.step.replace(".", "_")}`;
        const task = moddle.create("bpmn:Task", {
            id: taskId,
            name: `${step.service}: ${step.task}`,
        });
        elements.push(task);

        // Conditionnelle → Gateway
        if (step.type === "Conditionnelle") {
            const gatewayId = `Gateway_${step.step.replace(".", "_")}`;
            const gateway = moddle.create("bpmn:ExclusiveGateway", {
                id: gatewayId,
                name: step.condition || "Condition",
            });
            elements.push(gateway);

            if (step.yes)
                sequenceFlows.push({
                    sourceRef: gatewayId,
                    targetRef: `Task_${step.yes.replace(".", "_")}`,
                });
            if (step.no)
                sequenceFlows.push({
                    sourceRef: gatewayId,
                    targetRef: `Task_${step.no.replace(".", "_")}`,
                });

            sequenceFlows.push({
                sourceRef: taskId,
                targetRef: gatewayId,
            });
        } else if (step.yes) {
            sequenceFlows.push({
                sourceRef: taskId,
                targetRef: `Task_${step.yes.replace(".", "_")}`,
            });
        }
    });

    // Process global
    const processDef = moddle.create("bpmn:Process", {
        id: "Process_1",
        isExecutable: true,
        flowElements: [
            ...elements,
            ...sequenceFlows.map((flow) =>
                moddle.create("bpmn:SequenceFlow", flow)
            ),
        ],
    });

    // Définition principale
    const definitions = moddle.create("bpmn:Definitions", {
        id: "Definitions_1",
        targetNamespace: "http://bpmn.io/schema/bpmn",
        rootElements: [processDef],
    });

    // Conversion XML
    const { xml } = await moddle.toXML(definitions, { format: true });
    return xml;
}
