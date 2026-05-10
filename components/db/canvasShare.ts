import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system/next";
import * as Sharing from "expo-sharing";
import { Note, TextLabel, WallNode, WallSegment } from "../canvas/types";
import { loadCanvas, saveCanvas } from "./canvasDB";

export async function exportCanvas(id: number, name: string): Promise<boolean> {
    const canvas = loadCanvas(id);
    if (!canvas) return false;

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return false;

    const safeName = name
        .replace(/[/\\:*?"<>|]/g, "-")
        .replace(/\0/g, "")
        .replace(/^\.+/, "")
        .replace(/[\s.]+$/, "")
        .slice(0, 100)
        || "Untitled";

    const tempFile = new File(
        Paths.join(Paths.cache, `${safeName}.canvas.json`)
    );
    await tempFile.write(JSON.stringify(canvas, null, 2));

    await Sharing.shareAsync(tempFile.uri, {
        mimeType: "application/json",
        dialogTitle: `Export "${name}"`,
        UTI: "public.json"
    });

    return true;
}

export async function importCanvas(): Promise<number | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
    });

    if (result.canceled) return null;

    const file = new File(result.assets[0].uri);
    const content = await file.text();

    let parsed: {nodes: WallNode[]; segments: WallSegment[]; notes: Note[]; textLabels?: TextLabel[]};
    parsed = JSON.parse(content);

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.segments) || !Array.isArray(parsed.notes)) {
        return null;
    }

    const name = (result.assets[0].name ?? "Imported Canvas").replace(/\.canvas\.json$/, "");
    const newId = saveCanvas(name, parsed.nodes, parsed.segments, parsed.notes, parsed.textLabels ?? []);

    return newId
}