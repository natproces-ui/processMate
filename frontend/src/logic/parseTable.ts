// src/app/logic/parseTable.ts
import { ProcessRow } from "@/components/ProcessTable";

export function parseTableToJson(data: ProcessRow[]) {
    return data.map((row) => ({
        id: row.step.trim(),
        service: row.service.trim(),
        step: row.step.trim(),
        task: row.task.trim(),
        type: row.type,
        condition: row.condition.trim() || null,
        yes: row.yes.trim() || null,
        no: row.no.trim() || null,
    }));
}