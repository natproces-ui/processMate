// src/logic/generateBPMN.ts
import { ProcessStructure } from "@/logic/normalizeTable";

export function generateBPMN(structure: ProcessStructure): string {
    const { start, elements } = structure;

    // Extraire les services uniques pour les lanes
    const services = Array.from(new Set(elements.map((el) => el.service.replace(/\s*\/\s*/g, "_"))));

    let lanesXML = "";
    let taskRefsMap: Record<string, string[]> = {};

    services.forEach((service) => {
        taskRefsMap[service] = [];
    });

    elements.forEach((el) => {
        const elementId = el.type === "startEvent" ? "StartEvent_1" : el.type === "endEvent" ? "EndEvent_1" : `${el.type === "gateway" ? "Gateway" : "Task"}_${el.id}`;
        taskRefsMap[el.service.replace(/\s*\/\s*/g, "_")].push(
            `    <bpmn:flowNodeRef>${elementId}</bpmn:flowNodeRef>`
        );
    });

    services.forEach((service) => {
        const laneId = `Lane_${service}`;
        lanesXML += `
    <bpmn:lane id="${laneId}" name="${service}">
${taskRefsMap[service].join("\n")}
    </bpmn:lane>`;
    });

    let tasksXML = "";
    let flowsXML = "";
    let gatewaysXML = "";
    let shapesXML = "";
    let edgesXML = "";

    let yPos = 80;
    const elementIds = new Set(elements.map(e => e.id));

    elements.forEach((el, idx) => {
        const elementId = el.type === "startEvent" ? "StartEvent_1" : el.type === "endEvent" ? "EndEvent_1" : `${el.type === "gateway" ? "Gateway" : "Task"}_${el.id}`;
        const xPos = 200 + idx * 250;

        if (el.type === "startEvent") {
            tasksXML += `
    <bpmn:startEvent id="${elementId}" name="${el.task}">
      ${el.next && elementIds.has(el.next) ? `<bpmn:outgoing>Flow_${el.id}</bpmn:outgoing>` : ""}
    </bpmn:startEvent>`;
            shapesXML += `
      <bpmndi:BPMNShape id="Shape_${elementId}" bpmnElement="${elementId}">
        <dc:Bounds x="${xPos}" y="${yPos + 22}" width="36" height="36" />
      </bpmndi:BPMNShape>`;
            if (el.next && elementIds.has(el.next)) {
                console.log(`Flux depuis ${el.id} vers ${el.next}`);
                flowsXML += `
    <bpmn:sequenceFlow id="Flow_${el.id}" sourceRef="${elementId}" targetRef="${el.next === "EndEvent_1" ? "EndEvent_1" : `${el.type === "gateway" ? "Gateway" : "Task"}_${el.next}`}"/>`;
                edgesXML += `
      <bpmndi:BPMNEdge id="Edge_Flow_${el.id}" bpmnElement="Flow_${el.id}">
        <di:waypoint x="${xPos + 36}" y="${yPos + 40}" />
        <di:waypoint x="${xPos + 100}" y="${yPos + 40}" />
      </bpmndi:BPMNEdge>`;
            }
        } else if (el.type === "endEvent") {
            tasksXML += `
    <bpmn:endEvent id="${elementId}" name="${el.task}">
      <bpmn:incoming>Flow_to_${el.id}</bpmn:incoming>
    </bpmn:endEvent>`;
            shapesXML += `
      <bpmndi:BPMNShape id="Shape_${elementId}" bpmnElement="${elementId}">
        <dc:Bounds x="${xPos}" y="${yPos + 22}" width="36" height="36" />
      </bpmndi:BPMNShape>`;
        } else if (el.type === "gateway") {
            const gwId = `Gateway_${el.id}`;
            gatewaysXML += `
    <bpmn:exclusiveGateway id="${gwId}" name="${el.condition || ""}">
      <bpmn:incoming>Flow_to_${el.id}</bpmn:incoming>
      ${el.yes && elementIds.has(el.yes) ? `<bpmn:outgoing>Flow_${el.id}_yes</bpmn:outgoing>` : ""}
      ${el.no && elementIds.has(el.no) ? `<bpmn:outgoing>Flow_${el.id}_no</bpmn:outgoing>` : ""}
    </bpmn:exclusiveGateway>`;
            shapesXML += `
      <bpmndi:BPMNShape id="Shape_${gwId}" bpmnElement="${gwId}" isMarkerVisible="true">
        <dc:Bounds x="${xPos}" y="${yPos + 20}" width="50" height="50" />
      </bpmndi:BPMNShape>`;

            if (el.yes && elementIds.has(el.yes)) {
                console.log(`Flux Oui depuis ${el.id} vers ${el.yes}`);
                flowsXML += `
    <bpmn:sequenceFlow id="Flow_${el.id}_yes" name="Oui" sourceRef="${gwId}" targetRef="${el.yes === "EndEvent_1" ? "EndEvent_1" : `${el.yes.startsWith("1.") ? "Task" : "Gateway"}_${el.yes}`}"/>`;
                edgesXML += `
      <bpmndi:BPMNEdge id="Edge_Flow_${el.id}_yes" bpmnElement="Flow_${el.id}_yes">
        <di:waypoint x="${xPos + 50}" y="${yPos + 45}" />
        <di:waypoint x="${xPos + 100}" y="${yPos + 40}" />
      </bpmndi:BPMNEdge>`;
            }

            if (el.no && elementIds.has(el.no)) {
                console.log(`Flux Non depuis ${el.id} vers ${el.no}`);
                flowsXML += `
    <bpmn:sequenceFlow id="Flow_${el.id}_no" name="Non" sourceRef="${gwId}" targetRef="${el.no === "EndEvent_1" ? "EndEvent_1" : `${el.no.startsWith("1.") ? "Task" : "Gateway"}_${el.no}`}"/>`;
                edgesXML += `
      <bpmndi:BPMNEdge id="Edge_Flow_${el.id}_no" bpmnElement="Flow_${el.id}_no">
        <di:waypoint x="${xPos + 25}" y="${yPos + 70}" />
        <di:waypoint x="${xPos + 25}" y="${yPos + 120}" />
        <di:waypoint x="${xPos + 150}" y="${yPos + 120}" />
        <di:waypoint x="${xPos + 150}" y="${yPos + 80}" />
      </bpmndi:BPMNEdge>`;
            }
        } else {
            tasksXML += `
    <bpmn:task id="${elementId}" name="${el.task}">
      <bpmn:incoming>Flow_to_${el.id}</bpmn:incoming>
      ${el.next && elementIds.has(el.next) ? `<bpmn:outgoing>Flow_from_${el.id}</bpmn:outgoing>` : ""}
    </bpmn:task>`;
            shapesXML += `
      <bpmndi:BPMNShape id="Shape_${elementId}" bpmnElement="${elementId}">
        <dc:Bounds x="${xPos}" y="${yPos}" width="100" height="80" />
      </bpmndi:BPMNShape>`;

            if (el.next && elementIds.has(el.next)) {
                console.log(`Flux depuis ${el.id} vers ${el.next}`);
                flowsXML += `
    <bpmn:sequenceFlow id="Flow_from_${el.id}" sourceRef="${elementId}" targetRef="${el.next === "EndEvent_1" ? "EndEvent_1" : `${el.next.startsWith("1.") ? "Task" : "Gateway"}_${el.next}`}"/>`;
                edgesXML += `
      <bpmndi:BPMNEdge id="Edge_Flow_from_${el.id}" bpmnElement="Flow_from_${el.id}">
        <di:waypoint x="${xPos + 100}" y="${yPos + 40}" />
        <di:waypoint x="${xPos + 250}" y="${yPos + 40}" />
      </bpmndi:BPMNEdge>`;
            }
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Processus" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">${lanesXML}
    </bpmn:laneSet>${tasksXML}${gatewaysXML}${flowsXML}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Shape_Participant_1" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="120" y="50" width="${300 + elements.length * 250}" height="${services.length * 200 + 100}" />
      </bpmndi:BPMNShape>${shapesXML}${edgesXML}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}