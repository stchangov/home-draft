import type {
  DrawingTool,
  Note,
  Point,
  TextLabel,
  WallNode,
  WallSegment,
} from "@/components/canvas/types";
import { useCanvas } from "@/hooks/useCanvas";
import { Canvas, Circle, Line } from "@shopify/react-native-skia";
import { useLocalSearchParams } from "expo-router";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { renameCanvas } from "../db/canvasDB";

const WALL_THICKNESS = 4;
const MIN_SEGMENT_LENGTH = 8;
const NODE_RADIUS = 5;
const NODE_COLOR = "#2563EB";
const NODE_SNAP_RADIUS = 18;
const LABEL_OFFSET = 28;
const ERASER_RADIUS = 18;
const NOTE_TRANSPARENCY = 0.8;
const NOTE_BORDER_COLOR = "#b38b28";

// 1 pixel = 1 inch (at default zoom)
const PIXELS_PER_INCH = 1;

type ActiveSegment = {
  id: string;
  startNodeId: string | null;
  endNodeId: string | null;
  start: Point;
  end: Point;
  color: string;
  thickness: number;
};

type ActiveRectangle = {
  start: Point;
  end: Point;
};

type ActiveNote = {
  id: string;
  start: Point;
  end: Point;
  text: string;
  color: string;
  transparency: number;
};

type ActiveTextLabel = {
  id: string;
  start: Point;
  end: Point;
  fontSize: number;
  bold: boolean;
};

type NoteDrag = {
  id: string;
  origin: Point;
  start: Point;
  end: Point;
  moved: boolean;
};

type CanvasSnapshot = {
  nodes: WallNode[];
  segments: WallSegment[];
  notes: Note[];
  textLabels: TextLabel[];
};

function createSnapshot(
  nodes: WallNode[],
  segments: WallSegment[],
  notes: Note[],
  textLabels: TextLabel[],
): CanvasSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      point: { ...node.point },
    })),
    segments: segments.map((segment) => ({ ...segment })),
    notes: notes.map((note) => ({
      ...note,
      start: { ...note.start },
      end: { ...note.end },
    })),
    textLabels: textLabels.map((label) => ({
      ...label,
      start: { ...label.start },
      end: { ...label.end },
    })),
  };
}

function snapToAxis(start: Point, current: Point): Point {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: current.x, y: start.y };
  }

  return { x: start.x, y: current.y };
}

function segmentLength(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function findNearbyNode(point: Point, nodes: WallNode[], radius: number) {
  let nearestNode: WallNode | null = null;
  let bestDistance = radius;

  for (const node of nodes) {
    const candidateDistance = distance(point, node.point);

    if (candidateDistance <= bestDistance) {
      nearestNode = node;
      bestDistance = candidateDistance;
    }
  }

  return nearestNode;
}

function formatLength(pixels: number): string {
  const totalInches = pixels / PIXELS_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);

  if (feet === 0) {
    return `${inches}"`;
  }

  return `${feet}' ${inches}"`;
}

function labelPosition(start: Point, end: Point): { x: number; y: number } {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const isHorizontal = Math.abs(end.y - start.y) < Math.abs(end.x - start.x);

  return {
    x: isHorizontal ? midX : midX + LABEL_OFFSET,
    y: isHorizontal ? midY - LABEL_OFFSET : midY,
  };
}

function noteBounds(note: Pick<Note, "start" | "end">) {
  const minX = Math.min(note.start.x, note.end.x);
  const maxX = Math.max(note.start.x, note.end.x);
  const minY = Math.min(note.start.y, note.end.y);
  const maxY = Math.max(note.start.y, note.end.y);

  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function pointInNote(point: Point, note: Note) {
  const bounds = noteBounds(note);

  return (
    point.x >= bounds.left &&
    point.x <= bounds.left + bounds.width &&
    point.y >= bounds.top &&
    point.y <= bounds.top + bounds.height
  );
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return distance(point, start);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    ),
  );

  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return distance(point, projection);
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DrawingSurfaceRef {
  undo: () => void;
  redo: () => void;
  save: () => void;
  rename: (newName: string) => void;
  adjustSelectedTextLabelFontSize: (delta: number) => void;
  toggleSelectedTextLabelBold: () => void;
  hasPendingChanges: () => boolean;
}

export const DrawingSurface = forwardRef<
  DrawingSurfaceRef,
  {
    currentTool: DrawingTool;
    segmentColor: string;
    noteColor: string;
    onTextLabelSelect: (info: { fontSize: number; bold: boolean } | null) => void;
  }
>(function DrawingSurface({ currentTool, segmentColor, noteColor, onTextLabelSelect }, ref) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    nodes,
    setNodes,
    segments,
    setSegments,
    notes,
    setNotes,
    textLabels,
    setTextLabels,
    setName,
    handleSaveNew,
    handleUpdate,
    handleLoad,
    canvasId,
  } = useCanvas();
  const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(
    null,
  );
  const [activeRectangle, setActiveRectangle] =
    useState<ActiveRectangle | null>(null);
  const [activeNote, setActiveNote] = useState<ActiveNote | null>(null);
  const [activeTextLabel, setActiveTextLabel] = useState<ActiveTextLabel | null>(null);
  const activeTextLabelRef = useRef<ActiveTextLabel | null>(null);
  const [eraserPoint, setEraserPoint] = useState<Point | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedTextLabelId, setSelectedTextLabelId] = useState<string | null>(null);
  const selectedTextLabelIdRef = useRef<string | null>(null);
  const historyRef = useRef<CanvasSnapshot[]>([]);
  const changeCountRef = useRef(0);
  const savedChangeCountRef = useRef(0);
  const erasedIdsInGesture = useRef<Set<string>>(new Set());
  const noteDragRef = useRef<NoteDrag | null>(null);
  const noteDragHistoryRef = useRef<CanvasSnapshot | null>(null);
  const textEditHistoryRef = useRef<string | null>(null);
  const redoRef = useRef<CanvasSnapshot[]>([]);

  const selectTextLabel = (label: TextLabel | null) => {
    const id = label?.id ?? null;
    selectedTextLabelIdRef.current = id;
    setSelectedTextLabelId(id);
    onTextLabelSelect(label ? { fontSize: label.fontSize, bold: label.bold } : null);
  };

  const pushHistorySnapshot = () => {
    changeCountRef.current += 1;
    historyRef.current = [
      ...historyRef.current,
      createSnapshot(nodes, segments, notes, textLabels),
    ];
    redoRef.current = [];
  };

  useImperativeHandle(ref, () => ({
    undo() {
      if (historyRef.current.length === 0) return;
      const prev = historyRef.current[historyRef.current.length - 1];
      historyRef.current = historyRef.current.slice(0, -1);
      redoRef.current = [
        ...redoRef.current,
        createSnapshot(nodes, segments, notes, textLabels),
      ];
      setNodes(prev.nodes);
      setSegments(prev.segments);
      setNotes(prev.notes);
      setTextLabels(prev.textLabels);
    },

    redo() {
      if (redoRef.current.length === 0) return;
      const next = redoRef.current[redoRef.current.length - 1];
      redoRef.current = redoRef.current.slice(0, -1);
      historyRef.current = [
        ...historyRef.current,
        createSnapshot(nodes, segments, notes, textLabels),
      ];
      setNodes(next.nodes);
      setSegments(next.segments);
      setNotes(next.notes);
      setTextLabels(next.textLabels);
    },

    save() {
      if (canvasId !== null) {
        handleUpdate();
      } else {
        handleSaveNew();
      }
      savedChangeCountRef.current = changeCountRef.current;
    },

    hasPendingChanges() {
      return changeCountRef.current !== savedChangeCountRef.current;
    },

    rename(newName: string) {
      setName(newName);
      if (canvasId !== null) {
        renameCanvas(canvasId, newName);
      }
    },

    adjustSelectedTextLabelFontSize(delta: number) {
      const next = textLabels.map((l) =>
        l.id === selectedTextLabelIdRef.current
          ? { ...l, fontSize: Math.max(8, Math.min(l.fontSize + delta, 96)) }
          : l
      );
      setTextLabels(next);
      const selected = next.find((l) => l.id === selectedTextLabelIdRef.current);
      if (selected) onTextLabelSelect({ fontSize: selected.fontSize, bold: selected.bold });
    },

    toggleSelectedTextLabelBold() {
      const next = textLabels.map((l) =>
        l.id === selectedTextLabelIdRef.current ? { ...l, bold: !l.bold } : l
      );
      setTextLabels(next);
      const selected = next.find((l) => l.id === selectedTextLabelIdRef.current);
      if (selected) onTextLabelSelect({ fontSize: selected.fontSize, bold: selected.bold });
    },
  }));

  useEffect(() => {
    if (id) handleLoad(Number(id));
  }, [handleLoad, id]);

  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.point])),
    [nodes],
  );

  const eraseAt = (point: Point) => {
    const targetTextLabel = [...textLabels].reverse().find((label) => {
      if (erasedIdsInGesture.current.has(label.id)) return false;
      const bounds = noteBounds(label);
      return (
        point.x >= bounds.left && point.x <= bounds.left + bounds.width &&
        point.y >= bounds.top && point.y <= bounds.top + bounds.height
      );
    });

    if (targetTextLabel) {
      erasedIdsInGesture.current.add(targetTextLabel.id);
      setTextLabels((existing) => existing.filter((l) => l.id !== targetTextLabel.id));
      if (selectedTextLabelIdRef.current === targetTextLabel.id) selectTextLabel(null);
      return;
    }

    const targetNote = [...notes].reverse().find((note) => {
      if (erasedIdsInGesture.current.has(note.id)) return false;
      return pointInNote(point, note);
    });

    if (targetNote) {
      erasedIdsInGesture.current.add(targetNote.id);
      setNotes((existing) => existing.filter((note) => note.id !== targetNote.id));
      setSelectedNoteId((current) => (current === targetNote.id ? null : current));
      return;
    }

    const targetSegment = [...segments].reverse().find((segment) => {
      if (erasedIdsInGesture.current.has(segment.id)) return false;
      const start = nodeMap.get(segment.startNodeId);
      const end = nodeMap.get(segment.endNodeId);
      if (!start || !end) return false;
      return pointToSegmentDistance(point, start, end) <= ERASER_RADIUS;
    });

    if (!targetSegment) return;

    erasedIdsInGesture.current.add(targetSegment.id);
    setSegments((currentSegments) => {
      const next = currentSegments.filter((s) => s.id !== targetSegment.id);
      const usedNodeIds = new Set(next.flatMap((s) => [s.startNodeId, s.endNodeId]));
      setNodes((currentNodes) => currentNodes.filter((n) => usedNodeIds.has(n.id)));
      return next;
    });
  };

  const drawGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((event) => {
      const origin = { x: event.x, y: event.y };

      if (currentTool === "segment") {
        setSelectedNoteId(null);
        const snappedStartNode = findNearbyNode(
          origin,
          nodes,
          NODE_SNAP_RADIUS,
        );
        const startPoint = snappedStartNode ? snappedStartNode.point : origin;

        setActiveSegment({
          id: buildId("wall"),
          startNodeId: snappedStartNode?.id ?? null,
          endNodeId: snappedStartNode?.id ?? null,
          start: startPoint,
          end: startPoint,
          color: segmentColor,
          thickness: WALL_THICKNESS,
        });
      } else if (currentTool === "rectangle") {
        setSelectedNoteId(null);
        setActiveRectangle({
          start: origin,
          end: origin,
        });
      } else if (currentTool === "note") {
        setSelectedNoteId(null);
        setActiveNote({
          id: buildId("note"),
          start: origin,
          end: origin,
          text: "New Note",
          color: noteColor,
          transparency: NOTE_TRANSPARENCY,
        });
      } else if (currentTool === "text") {
        setSelectedNoteId(null);
        selectTextLabel(null);
        const newActiveTextLabel = {
          id: buildId("text"),
          start: origin,
          end: origin,
          fontSize: 0,
          bold: false,
        };
        activeTextLabelRef.current = newActiveTextLabel;
        setActiveTextLabel(newActiveTextLabel);
      } else if (currentTool === "eraser") {
        setEraserPoint(origin);
        pushHistorySnapshot();
        erasedIdsInGesture.current = new Set();
        eraseAt(origin);
      } else if (currentTool === "select") {
        const targetNote = [...notes]
          .reverse()
          .find((note) => pointInNote(origin, note));

        if (!targetNote) {
          setSelectedNoteId(null);
          selectTextLabel(null);
          noteDragRef.current = null;
          noteDragHistoryRef.current = null;
          return;
        }

        setSelectedNoteId(targetNote.id);
        noteDragRef.current = {
          id: targetNote.id,
          origin,
          start: targetNote.start,
          end: targetNote.end,
          moved: false,
        };
        noteDragHistoryRef.current = createSnapshot(nodes, segments, notes, textLabels);
      }
    })
    .onUpdate((event) => {
      if (currentTool === "segment") {
        setActiveSegment((current) => {
          if (!current) {
            return current;
          }

          const snappedAxisPoint = snapToAxis(current.start, {
            x: event.x,
            y: event.y,
          });
          const snappedEndNode = findNearbyNode(
            snappedAxisPoint,
            nodes,
            NODE_SNAP_RADIUS,
          );

          return {
            ...current,
            endNodeId: snappedEndNode?.id ?? null,
            end: snappedEndNode ? snappedEndNode.point : snappedAxisPoint,
          };
        });
      } else if (currentTool === "rectangle") {
        setActiveRectangle((current) => {
          if (!current) {
            return current;
          }

          const endPoint = { x: event.x, y: event.y };
          const snappedEndNode = findNearbyNode(
            endPoint,
            nodes,
            NODE_SNAP_RADIUS,
          );

          return {
            ...current,
            end: snappedEndNode ? snappedEndNode.point : endPoint,
          };
        });
      } else if (currentTool === "note") {
        setActiveNote((current) => {
          if (!current) {
            return current;
          }

          const endPoint = { x: event.x, y: event.y };
          const snappedEndNode = findNearbyNode(
            endPoint,
            nodes,
            NODE_SNAP_RADIUS,
          );

          return {
            ...current,
            end: snappedEndNode ? snappedEndNode.point : endPoint,
          };
        });
      } else if (currentTool === "eraser") {
        setEraserPoint({ x: event.x, y: event.y });
        eraseAt({ x: event.x, y: event.y });
      } else if (currentTool === "text") {
        const updatedTextLabel = activeTextLabelRef.current
          ? { ...activeTextLabelRef.current, end: { x: event.x, y: event.y } }
          : null;
        activeTextLabelRef.current = updatedTextLabel;
        setActiveTextLabel(updatedTextLabel);
      } else if (currentTool === "select") {
        const drag = noteDragRef.current;
        if (!drag) {
          return;
        }

        const deltaX = event.x - drag.origin.x;
        const deltaY = event.y - drag.origin.y;

        if (!drag.moved && Math.hypot(deltaX, deltaY) >= 2) {
          if (noteDragHistoryRef.current) {
            historyRef.current = [
              ...historyRef.current,
              noteDragHistoryRef.current,
            ];
            redoRef.current = [];
          }
          noteDragRef.current = { ...drag, moved: true };
        }

        setNotes((existing) =>
          existing.map((note) =>
            note.id === drag.id
              ? {
                  ...note,
                  start: {
                    x: drag.start.x + deltaX,
                    y: drag.start.y + deltaY,
                  },
                  end: {
                    x: drag.end.x + deltaX,
                    y: drag.end.y + deltaY,
                  },
                }
              : note,
          ),
        );
      }
    })
    .onEnd(() => {
      if (currentTool === "segment") {
        setActiveSegment((current) => {
          if (!current) {
            return null;
          }

          if (segmentLength(current.start, current.end) < MIN_SEGMENT_LENGTH) {
            return null;
          }

          let startNodeId = current.startNodeId;
          let endNodeId = current.endNodeId;
          const nextNodes: WallNode[] = [];

          if (!startNodeId) {
            startNodeId = buildId("node");
            nextNodes.push({ id: startNodeId, point: current.start });
          }

          if (!endNodeId) {
            endNodeId = buildId("node");
            nextNodes.push({ id: endNodeId, point: current.end });
          }

          if (startNodeId === endNodeId) {
            return null;
          }

          pushHistorySnapshot();

          if (nextNodes.length > 0) {
            setNodes((existing) => [...existing, ...nextNodes]);
          }

          setSegments((existing) => [
            ...existing,
            {
              id: current.id,
              startNodeId,
              endNodeId,
              color: current.color,
              thickness: current.thickness,
            },
          ]);

          return null;
        });
      } else if (currentTool === "rectangle") {
        setActiveRectangle((current) => {
          if (!current) {
            return null;
          }

          const width = Math.abs(current.end.x - current.start.x);
          const height = Math.abs(current.end.y - current.start.y);

          if (width < MIN_SEGMENT_LENGTH || height < MIN_SEGMENT_LENGTH) {
            return null;
          }

          const minX = Math.min(current.start.x, current.end.x);
          const maxX = Math.max(current.start.x, current.end.x);
          const minY = Math.min(current.start.y, current.end.y);
          const maxY = Math.max(current.start.y, current.end.y);

          const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];

          const nodeIds: string[] = [];
          const nextNodes: WallNode[] = [];

          for (const corner of corners) {
            const nodeId = buildId("node");
            nodeIds.push(nodeId);
            nextNodes.push({ id: nodeId, point: corner });
          }

          const nextSegments: WallSegment[] = [];
          for (let i = 0; i < 4; i++) {
            const startId = nodeIds[i];
            const endId = nodeIds[(i + 1) % 4];
            nextSegments.push({
              id: buildId("wall"),
              startNodeId: startId,
              endNodeId: endId,
              color: segmentColor,
              thickness: WALL_THICKNESS,
            });
          }

          pushHistorySnapshot();

          if (nextNodes.length > 0) {
            setNodes((existing) => [...existing, ...nextNodes]);
          }

          setSegments((existing) => [...existing, ...nextSegments]);

          return null;
        });
      } else if (currentTool === "note") {
        setActiveNote((current) => {
          if (!current) {
            return null;
          }

          const width = Math.abs(current.end.x - current.start.x);
          const height = Math.abs(current.end.y - current.start.y);

          if (width < MIN_SEGMENT_LENGTH || height < MIN_SEGMENT_LENGTH) {
            return null;
          }

          pushHistorySnapshot();

          setNotes((existing) => [
            ...existing,
            {
              id: current.id,
              start: {
                x: Math.min(current.start.x, current.end.x),
                y: Math.min(current.start.y, current.end.y),
              },
              end: {
                x: Math.max(current.start.x, current.end.x),
                y: Math.max(current.start.y, current.end.y),
              },
              text: current.text,
              color: current.color,
              transparency: current.transparency,
            },
          ]);
          return null;
        });
      } else if (currentTool === "text") {
        const current = activeTextLabelRef.current;
        activeTextLabelRef.current = null;
        setActiveTextLabel(null);
        if (current) {
          const width = Math.abs(current.end.x - current.start.x);
          const height = Math.abs(current.end.y - current.start.y);
          if (width >= MIN_SEGMENT_LENGTH && height >= MIN_SEGMENT_LENGTH) {
            const autoFontSize = Math.max(10, Math.min(Math.round(height / 3), 72));
            const newLabel: TextLabel = {
              id: current.id,
              start: {
                x: Math.min(current.start.x, current.end.x),
                y: Math.min(current.start.y, current.end.y),
              },
              end: {
                x: Math.max(current.start.x, current.end.x),
                y: Math.max(current.start.y, current.end.y),
              },
              text: "",
              fontSize: autoFontSize,
              bold: false,
            };
            pushHistorySnapshot();
            setTextLabels((existing) => [...existing, newLabel]);
            selectTextLabel(newLabel);
          }
        }
      } else if (currentTool === "eraser") {
        setEraserPoint(null);
      } else if (currentTool === "select") {
        noteDragRef.current = null;
        noteDragHistoryRef.current = null;
      }
    });

  const activeLength =
    activeSegment &&
    segmentLength(activeSegment.start, activeSegment.end) >= MIN_SEGMENT_LENGTH
      ? segmentLength(activeSegment.start, activeSegment.end)
      : null;

  const activeLabel =
    activeSegment && activeLength != null
      ? labelPosition(activeSegment.start, activeSegment.end)
      : null;

  const activeRectangleDimensions = activeRectangle
    ? {
        width: Math.abs(activeRectangle.end.x - activeRectangle.start.x),
        height: Math.abs(activeRectangle.end.y - activeRectangle.start.y),
      }
    : null;

  const activeRectangleLabel =
    activeRectangle &&
    activeRectangleDimensions &&
    activeRectangleDimensions.width >= MIN_SEGMENT_LENGTH &&
    activeRectangleDimensions.height >= MIN_SEGMENT_LENGTH
      ? {
          x: (activeRectangle.start.x + activeRectangle.end.x) / 2,
          y: (activeRectangle.start.y + activeRectangle.end.y) / 2,
        }
      : null;

  const activeNoteDimensions = activeNote
    ? {
        width: Math.abs(activeNote.end.x - activeNote.start.x),
        height: Math.abs(activeNote.end.y - activeNote.start.y),
      }
    : null;

  const activeNoteLabel =
    activeNote &&
    activeNoteDimensions &&
    activeNoteDimensions.width >= MIN_SEGMENT_LENGTH &&
    activeNoteDimensions.height >= MIN_SEGMENT_LENGTH
      ? {
          x: (activeNote.start.x + activeNote.end.x) / 2,
          y: (activeNote.start.y + activeNote.end.y) / 2,
        }
      : null;

  const activeNoteBounds = activeNote ? noteBounds(activeNote) : null;

  const beginNoteTextEdit = (noteId: string) => {
    setSelectedNoteId(noteId);

    if (currentTool !== "select" || textEditHistoryRef.current === noteId) {
      return;
    }

    pushHistorySnapshot();
    textEditHistoryRef.current = noteId;
  };

  const updateNoteText = (noteId: string, text: string) => {
    setNotes((existing) =>
      existing.map((note) => (note.id === noteId ? { ...note, text } : note)),
    );
  };

  return (
    <GestureDetector gesture={drawGesture}>
      <View style={styles.container}>
        <Canvas style={styles.canvas}>
          {segments.map((segment) => {
            const start = nodeMap.get(segment.startNodeId);
            const end = nodeMap.get(segment.endNodeId);

            if (!start || !end) {
              return null;
            }

            return (
              <Line
                key={segment.id}
                p1={start}
                p2={end}
                color={segment.color}
                strokeWidth={segment.thickness}
                strokeCap="square"
              />
            );
          })}
          {activeSegment && activeLength != null ? (
            <Line
              p1={activeSegment.start}
              p2={activeSegment.end}
              color={activeSegment.color}
              strokeWidth={activeSegment.thickness}
              strokeCap="square"
            />
          ) : null}
          {activeRectangle
            ? (() => {
                const minX = Math.min(
                  activeRectangle.start.x,
                  activeRectangle.end.x,
                );
                const maxX = Math.max(
                  activeRectangle.start.x,
                  activeRectangle.end.x,
                );
                const minY = Math.min(
                  activeRectangle.start.y,
                  activeRectangle.end.y,
                );
                const maxY = Math.max(
                  activeRectangle.start.y,
                  activeRectangle.end.y,
                );

                const corners = [
                  { x: minX, y: minY },
                  { x: maxX, y: minY },
                  { x: maxX, y: maxY },
                  { x: minX, y: maxY },
                ];

                return corners.map((corner, i) => (
                  <Line
                    key={`rect-preview-${i}`}
                    p1={corner}
                    p2={corners[(i + 1) % 4]}
                    color={segmentColor}
                    strokeWidth={WALL_THICKNESS}
                    strokeCap="square"
                  />
                ));
              })()
            : null}
          {activeSegment?.startNodeId ? (
            <Circle
              cx={activeSegment.start.x}
              cy={activeSegment.start.y}
              r={NODE_RADIUS}
              color={NODE_COLOR}
            />
          ) : null}
          {activeSegment?.endNodeId &&
          activeSegment.endNodeId !== activeSegment.startNodeId ? (
            <Circle
              cx={activeSegment.end.x}
              cy={activeSegment.end.y}
              r={NODE_RADIUS}
              color={NODE_COLOR}
            />
          ) : null}
        </Canvas>

        {notes.map((note) => {
          const bounds = noteBounds(note);
          const isSelected = selectedNoteId === note.id;
          const editable = currentTool === "select";

          return (
            <View
              key={note.id}
              pointerEvents={currentTool === "select" ? "auto" : "none"}
              style={[
                styles.note,
                {
                  left: bounds.left,
                  top: bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                  backgroundColor: hexToRgba(note.color, note.transparency),
                  borderColor: isSelected ? NODE_COLOR : NOTE_BORDER_COLOR,
                },
              ]}
            >
              <TextInput
                editable={editable}
                multiline
                value={note.text}
                onFocus={() => beginNoteTextEdit(note.id)}
                onBlur={() => {
                  textEditHistoryRef.current = null;
                }}
                onChangeText={(text) => updateNoteText(note.id, text)}
                placeholder="Furniture"
                placeholderTextColor="rgba(15, 23, 42, 0.45)"
                style={styles.noteTextInput}
              />
              <View style={styles.noteMeasurement} pointerEvents="none">
                <Text style={styles.noteMeasurementText}>
                  {formatLength(bounds.width)} × {formatLength(bounds.height)}
                </Text>
              </View>
            </View>
          );
        })}

        {textLabels.map((label) => {
          const bounds = noteBounds(label);
          const isSelected = selectedTextLabelId === label.id;
          const editable = currentTool === "select";
          return (
            <View
              key={label.id}
              pointerEvents={currentTool === "select" ? "auto" : "none"}
              style={[
                styles.textLabel,
                isSelected && styles.textLabelSelected,
                {
                  left: bounds.left,
                  top: bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                },
              ]}
            >
              <TextInput
                editable={editable}
                multiline
                value={label.text}
                onFocus={() => selectTextLabel(label)}
                onBlur={() => selectTextLabel(null)}
                onChangeText={(text) =>
                  setTextLabels((existing) =>
                    existing.map((l) => (l.id === label.id ? { ...l, text } : l))
                  )
                }
                placeholder="Text"
                placeholderTextColor="rgba(15, 23, 42, 0.35)"
                style={[
                  styles.textLabelInput,
                  { fontSize: label.fontSize, fontWeight: label.bold ? "700" : "400" },
                ]}
              />
            </View>
          );
        })}

        {activeTextLabel && (() => {
          const bounds = noteBounds(activeTextLabel);
          const width = Math.abs(activeTextLabel.end.x - activeTextLabel.start.x);
          const height = Math.abs(activeTextLabel.end.y - activeTextLabel.start.y);
          if (width < MIN_SEGMENT_LENGTH || height < MIN_SEGMENT_LENGTH) return null;
          return (
            <View
              pointerEvents="none"
              style={[
                styles.textLabel,
                styles.activeTextLabel,
                { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
              ]}
            />
          );
        })()}

        {activeNoteBounds ? (
          <View
            pointerEvents="none"
            style={[
              styles.note,
              styles.activeNote,
              {
                left: activeNoteBounds.left,
                top: activeNoteBounds.top,
                width: activeNoteBounds.width,
                height: activeNoteBounds.height,
                backgroundColor: hexToRgba(
                  activeNote?.color ?? noteColor,
                  activeNote?.transparency ?? NOTE_TRANSPARENCY,
                ),
              },
            ]}
          />
        ) : null}

        {activeLabel && activeLength != null ? (
          <View
            style={[styles.label, { left: activeLabel.x, top: activeLabel.y }]}
            pointerEvents="none"
          >
            <Text style={styles.labelText}>{formatLength(activeLength)}</Text>
          </View>
        ) : null}

        {activeRectangleLabel && activeRectangleDimensions ? (
          <View
            style={[
              styles.label,
              { left: activeRectangleLabel.x, top: activeRectangleLabel.y },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.labelText}>
              {formatLength(activeRectangleDimensions.width)} ×{" "}
              {formatLength(activeRectangleDimensions.height)}
            </Text>
          </View>
        ) : null}

        {activeNoteLabel && activeNoteDimensions ? (
          <View
            style={[
              styles.label,
              { left: activeNoteLabel.x, top: activeNoteLabel.y },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.labelText}>
              {formatLength(activeNoteDimensions.width)} ×{" "}
              {formatLength(activeNoteDimensions.height)}
            </Text>
          </View>
        ) : null}

        {segments.map((segment) => {
          const start = nodeMap.get(segment.startNodeId);
          const end = nodeMap.get(segment.endNodeId);

          if (!start || !end) {
            return null;
          }

          const pos = labelPosition(start, end);
          const length = segmentLength(start, end);

          return (
            <View
              key={`label-${segment.id}`}
              style={[styles.label, { left: pos.x, top: pos.y }]}
              pointerEvents="none"
            >
              <Text style={styles.committedLabelText}>
                {formatLength(length)}
              </Text>
            </View>
          );
        })}
        {eraserPoint ? (
          <View
            pointerEvents="none"
            style={[
              styles.eraserCursor,
              { left: eraserPoint.x - ERASER_RADIUS, top: eraserPoint.y - ERASER_RADIUS },
            ]}
          />
        ) : null}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  canvas: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  note: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    minWidth: MIN_SEGMENT_LENGTH,
    minHeight: MIN_SEGMENT_LENGTH,
  },
  activeNote: {
    borderColor: NOTE_BORDER_COLOR,
    borderStyle: "dashed",
  },
  noteTextInput: {
    flex: 1,
    padding: 8,
    paddingBottom: 24,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
    textAlignVertical: "top",
  },
  noteMeasurement: {
    position: "absolute",
    right: 6,
    bottom: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  noteMeasurementText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "700",
  },
  textLabel: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  activeTextLabel: {
    borderColor: NODE_COLOR,
    borderStyle: "dashed",
  },
  textLabelSelected: {
    borderColor: NODE_COLOR,
  },
  textLabelInput: {
    flex: 1,
    color: "#0F172A",
    padding: 6,
    textAlignVertical: "top",
  },
  eraserCursor: {
    position: "absolute",
    width: ERASER_RADIUS * 2,
    height: ERASER_RADIUS * 2,
    borderRadius: ERASER_RADIUS,
    borderWidth: 2,
    borderColor: "#EF4444",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  label: {
    position: "absolute",
    transform: [{ translateX: "-50%" }],
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  committedLabelText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
});
