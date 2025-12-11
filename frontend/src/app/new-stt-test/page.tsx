"use client";

import { useState, useRef } from "react";

export default function Page() {
    const [rows, setRows] = useState<any[]>([]);
    const [recording, setRecording] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // 🎙️ Démarrer l'enregistrement
    const startRecording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);

        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
            audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            audioChunksRef.current = [];
            await sendAudio(audioBlob);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setRecording(true);
    };

    // ⏹️ Stop l'enregistrement
    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    // 📤 Envoi de l'audio à FastAPI
    const sendAudio = async (blob: Blob) => {
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        try {
            const res = await fetch("http://localhost:8005/transcribe", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            // Ajouter la transcription au tableau
            setRows((prev) => [
                ...prev,
                {
                    id: prev.length + 1,
                    service: "Vocal",
                    etape: "",
                    tache: data.transcription,
                    type: "",
                    condition: "",
                    siOui: "",
                    siNon: "",
                },
            ]);
        } catch (error) {
            console.error("Erreur transcription :", error);
        }
    };

    return (
        <div style={{ padding: 40 }}>
            <h1>🎤 Enregistreur Vocal – Gemini 2.5 Flash</h1>

            {!recording ? (
                <button onClick={startRecording} style={{ marginRight: 10, padding: 10 }}>
                    ▶️ Start Recording
                </button>
            ) : (
                <button onClick={stopRecording} style={{ marginRight: 10, padding: 10 }}>
                    ⏹️ Stop Recording
                </button>
            )}

            <h2 style={{ marginTop: 30 }}>📄 Tableau des tâches :</h2>

            <table border={1} cellPadding={10} style={{ marginTop: 10, borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Service</th>
                        <th>Étape</th>
                        <th>Tâche</th>
                        <th>Type</th>
                        <th>Condition</th>
                        <th>Si Oui</th>
                        <th>Si Non</th>
                    </tr>
                </thead>

                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>{row.id}</td>
                            <td>{row.service}</td>
                            <td>{row.etape}</td>
                            <td>{row.tache}</td>
                            <td>{row.type}</td>
                            <td>{row.condition}</td>
                            <td>{row.siOui}</td>
                            <td>{row.siNon}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
