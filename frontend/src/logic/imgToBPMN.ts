const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

export interface WorkflowStep {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent';
    département: string;
    acteur: string;
    condition: string;
    outputOui: string;
    outputNon: string;
    outil: string;
}

export interface ImgToBPMNResponse {
    success: boolean;
    bpmn_xml?: string;
    workflow?: WorkflowStep[];
    steps_count: number;
    metadata?: {
        image_size: string;
        format: string;
        total_steps: number;
    };
    error?: string;
}

class ImgToBPMNService {
    private async uploadFile(endpoint: string, file: File): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Erreur HTTP: ${response.status}`);
        }

        return response.json();
    }

    async analyzeworkflow(file: File): Promise<ImgToBPMNResponse> {
        try {
            const result = await this.uploadFile('/api/img-to-bpmn/analyze', file);
            return result;
        } catch (error: any) {
            throw new Error(error.message || "Erreur lors de l'analyse de l'image");
        }
    }

    async generateBPMN(file: File): Promise<ImgToBPMNResponse> {
        try {
            const result = await this.uploadFile('/api/img-to-bpmn/generate-bpmn', file);
            return result;
        } catch (error: any) {
            throw new Error(error.message || "Erreur lors de la génération du BPMN");
        }
    }

    async downloadBPMN(file: File): Promise<Blob> {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE_URL}/api/img-to-bpmn/download-bpmn`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            return response.blob();
        } catch (error: any) {
            throw new Error(error.message || "Erreur lors du téléchargement");
        }
    }

    async batchAnalyze(files: File[]): Promise<any> {
        try {
            if (files.length > 5) {
                throw new Error("Maximum 5 images par requête");
            }

            const formData = new FormData();
            files.forEach((file) => {
                formData.append('files', file);
            });

            const response = await fetch(`${API_BASE_URL}/api/img-to-bpmn/batch-analyze`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            return response.json();
        } catch (error: any) {
            throw new Error(error.message || "Erreur lors de l'analyse en batch");
        }
    }
}

export const imgToBPMN = new ImgToBPMNService();