export type DrawingTool =
  | "select"
  | "segment"
  | "rectangle"
  | "eraser"
  | "note"
  | "text";

export type Point = {
  x: number;
  y: number;
};

export type WallNode = {
  id: string;
  point: Point;
};

export type WallSegment = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  color: string;
  thickness: number;
};

export type Note = {
  id: string;
  start: Point;
  end: Point;
  text: string;
  color: string;
  transparency: number;
};

export type TextLabel = {
  id: string;
  start: Point;
  end: Point;
  text: string;
  fontSize: number;
  bold: boolean;
};
