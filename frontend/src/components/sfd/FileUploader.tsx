'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';

interface FileUploaderProps {
    onFileSelect: (file: File) => void;
    onTextInput: (text: string) => void;
    disabled?: boolean;
}

type InputMode = 'file' | 'text';

export default function FileUploader({
    onFileSelect,
    onTextInput,
    disabled = false
}: FileUploaderProps) {
    const [mode, setMode] = useState<InputMode>('file');
    const [textInput, setTextInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState<string>('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Formats acceptés
    const ACCEPTED_FORMATS = [
        '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt',
        '.jpg', '.jpeg', '.png', '.gif', '.webp'
    ];

    const ACCEPTED_MIME_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ];

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const validateFile = (file: File): boolean => {
        setError('');

        // Vérifier le type MIME
        if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
            setError('Format de fichier non supporté');
            return false;
        }

        // Vérifier la taille (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            setError('Fichier trop volumineux (max 10MB)');
            return false;
        }

        return true;
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (disabled) return;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (validateFile(file)) {
                setSelectedFile(file);
                onFileSelect(file);
            }
        }
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (disabled) return;

        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (validateFile(file)) {
                setSelectedFile(file);
                onFileSelect(file);
            }
        }
    };

    const handleTextSubmit = () => {
        if (textInput.trim() && !disabled) {
            onTextInput(textInput.trim());
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
        setError('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const clearText = () => {
        setTextInput('');
        setError('');
    };

    return (
        <div className="space-y-4">
            {/* Mode Selector */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                    onClick={() => {
                        setMode('file');
                        clearText();
                    }}
                    disabled={disabled}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'file'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <span>Fichier</span>
                    </div>
                </button>
                <button
                    onClick={() => {
                        setMode('text');
                        clearFile();
                    }}
                    disabled={disabled}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'text'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>Texte</span>
                    </div>
                </button>
            </div>

            {/* File Upload Mode */}
            {mode === 'file' && (
                <div className="space-y-3">
                    {/* Drop Zone */}
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => !disabled && fileInputRef.current?.click()}
                        className={`
              relative border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer
              ${dragActive
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-slate-300 hover:border-slate-400 bg-white'
                            }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              ${selectedFile ? 'border-green-500 bg-green-50' : ''}
            `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_FORMATS.join(',')}
                            onChange={handleFileChange}
                            disabled={disabled}
                            className="hidden"
                        />

                        <div className="flex flex-col items-center gap-3 text-center">
                            {selectedFile ? (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">{selectedFile.name}</p>
                                        <p className="text-sm text-slate-500">
                                            {(selectedFile.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            clearFile();
                                        }}
                                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            <X className="w-4 h-4" />
                                            <span>Retirer</span>
                                        </div>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-slate-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">
                                            Glissez un fichier ou cliquez pour sélectionner
                                        </p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            PDF, Word, PowerPoint, TXT ou Image (max 10MB)
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Formats acceptés */}
                    <div className="flex flex-wrap gap-2">
                        {['PDF', 'DOCX', 'PPTX', 'TXT', 'JPG', 'PNG'].map((format) => (
                            <span
                                key={format}
                                className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded"
                            >
                                {format}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Text Input Mode */}
            {mode === 'text' && (
                <div className="space-y-3">
                    <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        disabled={disabled}
                        placeholder="Collez votre cahier des charges ici..."
                        className={`
              w-full h-64 px-4 py-3 border border-slate-300 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              resize-none font-mono text-sm
              ${disabled ? 'bg-slate-50 cursor-not-allowed' : 'bg-white'}
            `}
                    />
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                            {textInput.length} caractères
                        </p>
                        {textInput.trim() && (
                            <button
                                onClick={clearText}
                                disabled={disabled}
                                className="px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                            >
                                Effacer
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}
        </div>
    );
}