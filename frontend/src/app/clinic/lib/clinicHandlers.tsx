// ✅ Import depuis la config centralisée
import { API_CONFIG } from '@/lib/api-config';
import { GenerateFlowchartParams, GenerateBPMNParams, ParsedData } from './clinicTypes';

// ❌ SUPPRIMER cette ligne
// const API_URL = 'http://localhost:8002';

/**
 * Génère un flowchart à partir d'un fichier WinDev
 */
export async function generateFlowchart(params: GenerateFlowchartParams) {
    const {
        file,
        setCurrentStep,
        setParsedData,
        setFlowchartImageUrl,
        setDotSource,
        setCurrentFileName,
        setSuccess,
        setError
    } = params;

    try {
        // Step 1: Parse le code WinDev
        setCurrentStep('parsing');
        const formData = new FormData();
        formData.append('file', file);

        // ✅ Utiliser API_CONFIG
        const parseResponse = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.parseDownload),
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!parseResponse.ok) {
            const errData = await parseResponse.json();
            throw new Error(errData.detail || 'Erreur lors du parsing');
        }

        const jsonBlob = await parseResponse.blob();

        // Récupère les données parsées pour les statistiques
        const formData2 = new FormData();
        formData2.append('file', file);

        const parseDataResponse = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.parse),
            {
                method: 'POST',
                body: formData2,
            }
        );

        if (parseDataResponse.ok) {
            const parseData: ParsedData = await parseDataResponse.json();
            setParsedData(parseData);
        }

        setCurrentFileName(file.name.replace(/\.(swift|wl|txt|windev)$/, ''));

        // Step 2: Génère le flowchart
        setCurrentStep('generating');

        const jsonFile = new File([jsonBlob], `${file.name}.json`, { type: 'application/json' });

        const formDataFlowchart = new FormData();
        formDataFlowchart.append('file', jsonFile);
        formDataFlowchart.append('output_format', 'png');

        const flowchartResponse = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.generateFlowchart),
            {
                method: 'POST',
                body: formDataFlowchart,
            }
        );

        if (!flowchartResponse.ok) {
            const err = await flowchartResponse.json();
            throw new Error(err.detail || 'Erreur lors de la génération du flowchart');
        }

        const flowchartBlob = await flowchartResponse.blob();
        const flowchartUrl = URL.createObjectURL(flowchartBlob);
        setFlowchartImageUrl(flowchartUrl);

        // Récupère le source DOT pour l'éditeur
        const formDataDot = new FormData();
        formDataDot.append('file', jsonFile);

        const dotResponse = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.generateDotOnly),
            {
                method: 'POST',
                body: formDataDot,
            }
        );

        if (dotResponse.ok) {
            const dotText = await dotResponse.text();
            setDotSource(dotText);
        }

        setCurrentStep('completed');
        setSuccess('✓ Flowchart généré avec succès!');
    } catch (err: any) {
        setError('✗ ' + err.message);
        setCurrentStep('idle');
    }
}

/**
 * Génère des processus BPMN à partir de documents
 */
export async function generateBPMN(params: GenerateBPMNParams) {
    const {
        files,
        setCurrentStep,
        setBpmnData,
        setBpmnXml,
        setSuccess,
        setError
    } = params;

    try {
        setCurrentStep('analyzing_docs');

        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });
        formData.append('output_format', 'both');

        const response = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.generateBPMN),
            {
                method: 'POST',
                body: formData,
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Erreur lors de la génération BPMN');
        }

        if (data.success && data.bpmn_json) {
            setBpmnData(data.bpmn_json);
            if (data.bpmn_xml) {
                setBpmnXml(data.bpmn_xml);
            }
        }

        setCurrentStep('completed');
        setSuccess(`✓ ${data.statistics?.total_processes || 0} processus BPMN identifiés!`);
    } catch (err: any) {
        setError('✗ ' + err.message);
        setCurrentStep('idle');
    }
}

/**
 * Télécharge le fichier JSON AST
 */
export async function downloadJson(file: File, setError: (message: string) => void) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
            API_CONFIG.getFullUrl(API_CONFIG.endpoints.parseDownload),
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) {
            throw new Error('Erreur lors du téléchargement');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name.split('.')[0]}_ast.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err: any) {
        setError('✗ ' + err.message);
    }
}

/**
 * Télécharge le fichier BPMN XML
 */
export function downloadBPMN(bpmnXml: string) {
    const blob = new Blob([bpmnXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `process_${Date.now()}.bpmn`;
    a.click();
    URL.revokeObjectURL(url);
}