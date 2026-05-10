import { SpringPressable } from "@/components/ui/spring-pressable";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowsVerticalIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CaretLeftIcon,
  CursorIcon,
  EraserIcon,
  FloppyDiskIcon,
  LineSegmentIcon,
  NoteIcon,
  PencilSimpleIcon,
  RectangleIcon,
  TextboxIcon,
} from "phosphor-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DrawingSurface,
  type DrawingSurfaceRef,
} from "@/components/canvas/drawing-surface";
import type { DrawingTool } from "@/components/canvas/types";
import { Toast } from "@/components/ui/toast";
import { TextInput } from "react-native-gesture-handler";

const COLORS = {
  slateDeep: "#0f172a",
  slateDarker: "#334155",
  slateMetallic: "#334155",
  slate400: "#94a3b8",
  slate500: "#64748b",
  accent: "#8da3c1",
};

const TOOLS: { tool: DrawingTool; Icon: React.ComponentType<any> }[] = [
  { tool: "select", Icon: CursorIcon },
  { tool: "segment", Icon: LineSegmentIcon },
  { tool: "rectangle", Icon: RectangleIcon },
  { tool: "eraser", Icon: EraserIcon },
  { tool: "note", Icon: NoteIcon },
  { tool: "text", Icon: TextboxIcon },
];


const LINE_COLORS = ["#0F172A", "#2563EB", "#059669", "#B91C1C", "#7C3AED"];
const NOTE_COLORS = ["#f4d587", "#f9b4b4", "#bde9a8", "#9ad8f7", "#d1c4ff"];

export default function CanvasScreen() {
  const surfaceRef = useRef<DrawingSurfaceRef>(null);
  const [currentTool, setCurrentTool] = useState<DrawingTool>("segment");
  const [segmentColor, setSegmentColor] = useState(LINE_COLORS[0]);
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [selectedLabelInfo, setSelectedLabelInfo] = useState<{ fontSize: number; bold: boolean } | null>(null);
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [editName, setEditName] = useState(name || "Untitled");
  const [isEditing, setIsEditing] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const showingLabelControls = selectedLabelInfo !== null;
  const hasOptions =
    showingLabelControls ||
    currentTool === "segment" ||
    currentTool === "rectangle" ||
    currentTool === "note";

  type StripContent = "line" | "note" | "label";
  const [frozenContent, setFrozenContent] = useState<StripContent>("line");

  useEffect(() => {
    if (!hasOptions) return;
    if (showingLabelControls) setFrozenContent("label");
    else if (currentTool === "note") setFrozenContent("note");
    else setFrozenContent("line");
  }, [hasOptions, showingLabelControls, currentTool]);

  const stripHeight = useSharedValue(hasOptions ? 52 : 0);
  const stripOpacity = useSharedValue(hasOptions ? 1 : 0);

  useEffect(() => {
    stripHeight.value = withTiming(hasOptions ? 52 : 0, { duration: 200 });
    stripOpacity.value = withTiming(hasOptions ? 1 : 0, { duration: 150 });
  }, [hasOptions]);

  const animatedStripStyle = useAnimatedStyle(() => ({
    height: stripHeight.value,
    opacity: stripOpacity.value,
    overflow: "hidden",
  }));

  const submitName = () => {
    setIsEditing(false);

    const newName = editName.trim() || "Untitled";
    setEditName(newName);

    surfaceRef.current?.rename(newName);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.toolbar}>
        {/* Left: back + project name */}
        <View style={styles.toolbarLeft}>
          <SpringPressable
            onPress={() => {
              if (!surfaceRef.current?.hasPendingChanges()) {
                router.back();
                return;
              }
              Alert.alert(
                "Unsaved Changes",
                "You have unsaved changes. What would you like to do?",
                [
                  { text: "Keep Editing" },
                  {
                    text: "Save & Exit",
                    onPress: () => {
                      surfaceRef.current?.save();
                      router.back();
                    },
                  },
                  { text: "Discard", style: "destructive", onPress: () => router.back() },
                ]
              );
            }}
            style={styles.backButton}
          >
            <CaretLeftIcon size={24} color={COLORS.slate400} weight="bold" />
          </SpringPressable>
          {isEditing ? (
              <TextInput
                value={editName}
                onChangeText={setEditName}
                onBlur={submitName}
                onSubmitEditing={submitName}
                autoFocus
                style={styles.projectName} numberOfLines={1}
              />
            ) : (
              <SpringPressable onPress={() => setIsEditing(true)} haptic={false} style={styles.projectNameRow}>
                <Text style={styles.projectName} numberOfLines={1}>
                  {editName}
                </Text>
                <PencilSimpleIcon size={16} color={COLORS.slate400} />
              </SpringPressable>
            )}
        </View>

        {/* Center: tool palette */}
        <View style={styles.toolbarCenter}>
          {TOOLS.map(({ tool, Icon }) => {
            const active = currentTool === tool;
            return (
              <SpringPressable
                key={tool}
                style={[styles.toolButton, active && styles.toolButtonActive]}
                onPress={() => setCurrentTool(tool)}
              >
                <Icon
                  size={22}
                  color={active ? COLORS.accent : COLORS.slate500}
                  weight={active ? "bold" : "regular"}
                />
              </SpringPressable>
            );
          })}
        </View>

        {/* Right: actions */}
        <View style={styles.toolbarRight}>
          <SpringPressable style={styles.actionButton} onPress={() => surfaceRef.current?.undo()}>
            <ArrowUUpLeftIcon size={22} color={COLORS.slate400} />
          </SpringPressable>
          <SpringPressable style={styles.actionButton} onPress={() => surfaceRef.current?.redo()}>
            <ArrowUUpRightIcon size={22} color={COLORS.slate400} />
          </SpringPressable>
          <SpringPressable style={styles.actionButton} onPress={() => { surfaceRef.current?.save(); setToastVisible(true); }}>
            <FloppyDiskIcon size={22} color={COLORS.slate400} />
          </SpringPressable>
        </View>
      </View>

      <Animated.View style={[styles.colorStrip, animatedStripStyle]}>
        {frozenContent === "label" ? (
          <>
            <ArrowsVerticalIcon size={18} color={COLORS.slate400} />
            <View style={styles.colorSwatches}>
              <SpringPressable
                haptic={false}
                style={styles.textSizeButton}
                onPress={() => surfaceRef.current?.adjustSelectedTextLabelFontSize(-1)}
              >
                <Text style={styles.textSizeLabel}>−</Text>
              </SpringPressable>
              <Text style={styles.textSizeValue}>{selectedLabelInfo?.fontSize ?? 0}pt</Text>
              <SpringPressable
                haptic={false}
                style={styles.textSizeButton}
                onPress={() => surfaceRef.current?.adjustSelectedTextLabelFontSize(1)}
              >
                <Text style={styles.textSizeLabel}>+</Text>
              </SpringPressable>
              <View style={styles.textControlDivider} />
              <SpringPressable
                haptic={false}
                style={[styles.textSizeButton, selectedLabelInfo?.bold && styles.textSizeButtonActive]}
                onPress={() => surfaceRef.current?.toggleSelectedTextLabelBold()}
              >
                <Text style={[styles.textSizeLabel, styles.textSizeBold, selectedLabelInfo?.bold && styles.textSizeLabelActive]}>
                  B
                </Text>
              </SpringPressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.colorSwatches}>
              {(frozenContent === "note" ? NOTE_COLORS : LINE_COLORS).map((color) => {
                const active = frozenContent === "note" ? noteColor === color : segmentColor === color;
                return (
                  <SpringPressable
                    key={color}
                    haptic={false}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      active && styles.colorSwatchActive,
                    ]}
                    onPress={() => {
                      if (frozenContent === "note") {
                        setNoteColor(color);
                      } else {
                        setSegmentColor(color);
                      }
                    }}
                  />
                );
              })}
            </View>
          </>
        )}
      </Animated.View>

      <View style={styles.canvasContainer}>
        <DrawingSurface
          ref={surfaceRef}
          currentTool={currentTool}
          segmentColor={segmentColor}
          noteColor={noteColor}
          onTextLabelSelect={setSelectedLabelInfo}
        />
        {isEditing && (
          <SpringPressable style={StyleSheet.absoluteFill} onPress={submitName} haptic={false} springScale={1} />
        )}
        <Toast message="Saved" visible={toastVisible} onHide={() => setToastVisible(false)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slateDarker,
  },
  toolbar: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    backgroundColor: COLORS.slateDarker,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(71, 85, 105, 0.3)",
  },
  toolbarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toolbarCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  toolbarRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: "monospace",
    flexShrink: 1,
  },
  toolButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  toolButtonActive: {
    backgroundColor: COLORS.slateDeep,
    borderColor: "rgba(141, 163, 193, 0.3)",
  },
  actionButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  canvasContainer: {
    flex: 1,
  },
  colorStrip: {
    height: 52,
    paddingHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(71, 85, 105, 0.2)",
    backgroundColor: COLORS.slateDarker,
  },
  colorLabel: {
    color: COLORS.slate400,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  colorSwatches: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: {
    borderColor: "#FFFFFF",
  },
  textSizeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(30,41,59,0.3)",
  },
  textSizeButtonActive: {
    backgroundColor: COLORS.slateDeep,
    borderColor: "rgba(141, 163, 193, 0.3)",
  },
  textSizeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.slate500,
    fontFamily: "monospace",
  },
  textSizeLabelActive: {
    color: COLORS.accent,
  },
  textSizeBold: {
    fontWeight: "700",
  },
  textControlDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(71, 85, 105, 0.4)",
    marginHorizontal: 8,
  },
  textSizeValue: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.slate400,
    fontFamily: "monospace",
    minWidth: 36,
    textAlign: "center",
  },
});
