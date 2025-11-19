import BPMNViewer from "./BPMNViewer";

interface WorkflowViewerProps {
    xml: string;
    height?: string;
    onError?: (error: string) => void;
    onUpdate?: (updatedXml: string) => void;
}

export default function WorkflowViewer({
    xml,
    height = '600px',
    onError,
    onUpdate
}: WorkflowViewerProps) {
    return (
        <BPMNViewer
            xml={xml}
            height={height}
            onError={onError}
            onUpdate={onUpdate}
        />
    );
}