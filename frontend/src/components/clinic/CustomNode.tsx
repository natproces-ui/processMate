// src/components/clinic/CustomNode.tsx

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export default function CustomNode({ data, id, selected }: NodeProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [label, setLabel] = useState(data.label || id);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (data.onLabelChange && label !== data.label) {
            data.onLabelChange(id, label);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            if (data.onLabelChange && label !== data.label) {
                data.onLabelChange(id, label);
            }
        } else if (e.key === 'Escape') {
            setLabel(data.label || id);
            setIsEditing(false);
        }
    };

    const shape = data.shape || 'box';
    const color = data.color || '#ffffff';
    const borderColor = selected ? '#3b82f6' : '#94a3b8';

    const getShapeStyle = () => {
        const baseStyle: React.CSSProperties = {
            background: color,
            border: `2px solid ${borderColor}`,
            padding: '12px 20px',
            fontSize: '14px',
            minWidth: '120px',
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: selected ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : 'none',
        };

        switch (shape) {
            case 'ellipse':
            case 'circle':
                return { ...baseStyle, borderRadius: '50%', minWidth: '100px', minHeight: '100px' };
            case 'diamond':
                return {
                    ...baseStyle,
                    transform: 'rotate(45deg)',
                    minWidth: '80px',
                    minHeight: '80px',
                };
            case 'hexagon':
                return { ...baseStyle, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
            default:
                return { ...baseStyle, borderRadius: '8px' };
        }
    };

    const shapeStyle = getShapeStyle();
    const isDiamond = shape === 'diamond';

    return (
        <div style={{ position: 'relative' }}>
            <Handle type="target" position={Position.Top} style={{ background: '#94a3b8' }} />

            <div
                style={shapeStyle}
                onDoubleClick={handleDoubleClick}
                title="Double-cliquez pour éditer"
            >
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: '14px',
                            textAlign: 'center',
                            width: '100%',
                            transform: isDiamond ? 'rotate(-45deg)' : 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div style={{
                        fontWeight: 500,
                        transform: isDiamond ? 'rotate(-45deg)' : 'none',
                        userSelect: 'none',
                    }}>
                        {label}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} style={{ background: '#94a3b8' }} />
        </div>
    );
}