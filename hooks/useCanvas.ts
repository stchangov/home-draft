import { Note, TextLabel, WallNode, WallSegment } from '@/components/canvas/types';
import {
    loadCanvas,
    saveCanvas,
    updateCanvas
} from '@/components/db/canvasDB';
import { useCallback, useState } from 'react';

export function useCanvas() {
    const [canvasId, setCanvasId] = useState<number | null>(null);
    const [nodes, setNodes] = useState<WallNode[]>([]);
    const [segments, setSegments] = useState<WallSegment[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [textLabels, setTextLabels] = useState<TextLabel[]>([]);
    const [name, setName] = useState(generateName());

    const handleSaveNew = useCallback(() => {
            const newId = saveCanvas(name, nodes, segments, notes, textLabels);
            setCanvasId(newId);
        },
        [name, nodes, segments, notes, textLabels]
    );

    const handleUpdate = useCallback(() => {
        if (canvasId === null) return;
        updateCanvas(canvasId, nodes, segments, notes, textLabels);
    }, [canvasId, nodes, segments, notes, textLabels]);

    const handleLoad = useCallback((id : number) => {
        const canvas = loadCanvas(id);
        if (!canvas) return;
        setNodes(canvas.nodes);
        setSegments(canvas.segments);
        setNotes(canvas.notes || []);
        setTextLabels(canvas.textLabels || []);
        setCanvasId(id);
        setName(canvas.name);
    }, []);

    const handleNewBlank = useCallback(() => {
        setNodes([]);
        setSegments([]);
        setNotes([]);
        setTextLabels([]);
        setCanvasId(null);
        setName(generateName());
    }, []);

    return {
        canvasId,
        nodes,
        setNodes,
        segments,
        setSegments,
        notes,
        setNotes,
        textLabels,
        setTextLabels,
        name,
        setName,
        handleSaveNew,
        handleUpdate,
        handleLoad,
        handleNewBlank,
    };
}

const generateName = () => {
      // const now = new Date();
      return 'Untitled';
    }