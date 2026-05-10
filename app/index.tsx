/*
Mobile App Development II -- COMP.4631 Honor Statement
The practice of good ethical behavior is essential for maintaining good
order in the classroom, providing an enriching learning experience for
students, and training as a practicing computing professional upon
graduation. This practice is manifested in the University's Academic
Integrity policy. Students are expected to strictly avoid academic
dishonesty and adhere to the Academic Integrity policy as outlined in the
course catalog. Violations will be dealt with as outlined therein. All
programming assignments in this class are to be done by the student alone
unless otherwise specified. No outside help is permitted except the
instructor and approved tutors.

I certify that the work submitted with this assignment is mine and was
generated in a manner consistent with this document, the course academic
policy on the course website on Blackboard, and the UMass Lowell academic
code.

Date: 5/3/2026

Name: Stephan Tchangov, Daniel Fuller, Sean Tong, Daniel Chaves
*/

import { CanvasMeta, deleteCanvas, listCanvases } from '@/components/db/canvasDB';
import { exportCanvas, importCanvas } from '@/components/db/canvasShare';
import { SpringPressable } from '@/components/ui/spring-pressable';
import { Canvas, Line, vec } from '@shopify/react-native-skia';
import { router, useFocusEffect } from 'expo-router';
import {
  DownloadIcon,
  GearIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
  TrashIcon,
} from 'phosphor-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';

const COLORS = {
  safetyOrange: '#8da3c1',
  slateMetallic: '#334155',
  slateDarker: '#1e293b',
  slateDeep: '#0f172a',
  canvasBase: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatUpdated(dateStr: string): string {
  const updated = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Updated just now';
  if (diffMins < 60) return `Updated ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays}d ago`;
}

function DiagonalLines() {
  const { width, height } = useWindowDimensions();
  const spacing = 10;
  const total = Math.ceil((width + height) / spacing) * 2;
  const lines = [];
  for (let i = 0; i < total; i++) {
    const offset = i * spacing - height;
    lines.push(
      <Line
        key={i}
        p1={vec(offset, 0)}
        p2={vec(offset + height, height)}
        color="black"
        strokeWidth={1}
        opacity={0.05}
      />
    );
  }
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines}
    </Canvas>
  );
}

const ACTION_WIDTH = 56;
const FULL_SWIPE_THRESHOLD = 200;

function RightActions({
  translation,
  onDelete,
  onExport,
  onFullSwipeChange,
}: {
  translation: SharedValue<number>;
  onDelete: () => void;
  onExport: () => void;
  onFullSwipeChange: (active: boolean) => void;
}) {
  useAnimatedReaction(
    () => translation.value < -FULL_SWIPE_THRESHOLD,
    (isFullSwipe, prev) => {
      if (isFullSwipe !== prev) {
        runOnJS(onFullSwipeChange)(isFullSwipe);
      }
    }
  );

  const deleteStyle = useAnimatedStyle(() => ({
    width: translation.value < -FULL_SWIPE_THRESHOLD
      ? Math.abs(translation.value)
      : ACTION_WIDTH,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }));

  const exportStyle = useAnimatedStyle(() => ({
    width: translation.value < -FULL_SWIPE_THRESHOLD ? 0 : ACTION_WIDTH,
    backgroundColor: COLORS.slate600,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }));

  return (
    <View style={{ flexDirection: 'row' }}>
      <Animated.View style={exportStyle}>
        <SpringPressable
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onPress={onExport}
        >
          <DownloadIcon size={18} color="#fff" />
        </SpringPressable>
      </Animated.View>
      <Animated.View style={deleteStyle}>
        <SpringPressable
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onPress={onDelete}
        >
          <TrashIcon size={18} color="#fff" />
        </SpringPressable>
      </Animated.View>
    </View>
  );
}

function ProjectItem({
  canvas,
  isLast,
  onPress,
  onDelete,
  onExport,
  onOpen,
}: {
  canvas: CanvasMeta;
  isLast: boolean;
  onPress: () => void;
  onDelete: () => void;
  onExport: () => void;
  onOpen: (ref: SwipeableMethods | null) => void;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const fullSwipeActive = useRef(false);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      onSwipeableOpen={() => {
        onOpen(swipeableRef.current);
        if (fullSwipeActive.current) {
          fullSwipeActive.current = false;
          swipeableRef.current?.close();
          onDelete();
        }
      }}
      renderRightActions={(_progress, translation) => (
        <RightActions
          translation={translation}
          onDelete={onDelete}
          onExport={onExport}
          onFullSwipeChange={(active) => { fullSwipeActive.current = active; }}
        />
      )}
    >
      <SpringPressable
        style={[styles.projectItem, !isLast && styles.projectItemDivider]}
        onPress={onPress}
        springScale={0.97}
      >
        <View style={styles.projectAvatar}>
          <Text style={styles.projectInitials}>{getInitials(canvas.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.projectName}>{canvas.name}</Text>
          <Text style={styles.projectUpdated}>{formatUpdated(canvas.updated_at)}</Text>
        </View>
      </SpringPressable>
    </ReanimatedSwipeable>
  );
}

export default function HomeScreen() {
  const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
  const swipeableRefs = useRef<Map<number, SwipeableMethods | null>>(new Map());

  const closeAllSwipeables = (exceptId?: number) => {
    swipeableRefs.current.forEach((ref, id) => {
      if (id !== exceptId) ref?.close();
    });
  };

  const refresh = () => setCanvases(listCanvases());

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [])
  );

  const handleDelete = (id: number, name: string) => {
    Alert.alert('Delete', `Delete "${name}"?`, [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCanvas(id);
          refresh();
        },
      },
    ]);
  };

  const handleExport = async (id: number, name: string) => {
    const success = await exportCanvas(id, name);
    if (!success) {
      Alert.alert("Export failed!");
    }
  };

  const handleImport = async () => {
    const newId = await importCanvas();
    if (newId === null) {
      Alert.alert("Import failed!");
      return;
    }
    refresh();
    Alert.alert("Imported!");
  }

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        {/* Header */}
        <View style={styles.sidebarHeader}>
          <View style={styles.appIcon}>
            <HouseIcon size={28} color="#fff" weight="fill" />
          </View>
          <Text style={styles.appTitle}>HomeDraft</Text>
        </View>

        {/* Search */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchIconPos}>
            <MagnifyingGlassIcon size={16} color={COLORS.slate400} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search projects..."
            placeholderTextColor={COLORS.slate400}
          />
        </View>

        {/* Project List */}
        <ScrollView style={styles.projectList} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Recent Projects</Text>
          {canvases.length === 0 ? (
            <Text style={styles.emptyText}>No projects yet. Tap below to start.</Text>
          ) : (
            <View style={styles.projectGroup}>
              {canvases.map((canvas, index) => (
                <ProjectItem
                  key={canvas.id}
                  canvas={canvas}
                  isLast={index === canvases.length - 1}
                  onPress={() => {
                    closeAllSwipeables();
                    router.push({ pathname: '/canvas', params: { id: canvas.id, name: canvas.name } });
                  }}
                  onDelete={() => handleDelete(canvas.id, canvas.name)}
                  onExport={() => handleExport(canvas.id, canvas.name)}
                  onOpen={(ref) => {
                    swipeableRefs.current.set(canvas.id, ref);
                    closeAllSwipeables(canvas.id);
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.sidebarFooter}>
          <SpringPressable style={styles.newProjectButton} onPress={() => router.push('/canvas')} springScale={0.95}>
            <PlusIcon size={20} color="#fff" weight="bold" />
            <Text style={styles.newProjectText}>New Project</Text>
          </SpringPressable>
          <SpringPressable style={styles.settingsButton}>
            <GearIcon size={20} color={COLORS.slate400} />
          </SpringPressable>
        </View>
      </View>

      {/* Main Area */}
      <View style={styles.main}>
        <DiagonalLines />
        <View style={styles.heroContent}>
          {/* Hero Icon */}
          <View style={styles.heroIcon}>
            <HouseIcon size={64} color={COLORS.slateMetallic} weight="fill" />
          </View>

          <Text style={styles.heroTitle}>Draft your vision.</Text>
          <Text style={styles.heroSubtitle}>
            Every great room starts with a single wall.
          </Text>

          {/* Cards */}
          <View style={styles.cardsGrid}>
            <SpringPressable onPress={() => handleImport()} style={styles.card} springScale={0.97}>
              <View style={styles.cardIconWrapper}>
                <StackIcon size={24} color={COLORS.slate600} />
              </View>
              <Text style={styles.cardTitle}>Import Template</Text>
              <Text style={styles.cardDesc}>Start from a pre-defined layout structure.</Text>
            </SpringPressable>
          </View>

          {/* Footer Info */}
          <View style={styles.footerInfo}>
            <SpringPressable springScale={0.95} haptic={false}>
              <Text style={[styles.footerText, { textDecorationLine: 'underline' }]}>Privacy Policy</Text>
            </SpringPressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.slateDeep,
  },
  sidebar: {
    width: '33%',
    backgroundColor: COLORS.slateMetallic,
    borderRightWidth: 1,
    borderRightColor: 'rgba(71,85,105,0.3)',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: 32,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  appIcon: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.safetyOrange,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  searchWrapper: {
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  searchIconPos: {
    position: 'absolute',
    left: 44,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    backgroundColor: 'rgba(30,41,59,0.5)',
    borderWidth: 1,
    borderColor: COLORS.slate600,
    borderRadius: 6,
    paddingVertical: 10,
    paddingLeft: 36,
    paddingRight: 12,
    fontSize: 14,
    color: '#e2e8f0',
  },
  projectList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionLabel: {
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.slate400,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  emptyText: {
    paddingHorizontal: 8,
    fontSize: 14,
    color: COLORS.slate500,
  },
  projectGroup: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.35)',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    marginBottom: 8,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  projectItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.25)',
  },
  projectAvatar: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: 'rgba(30,41,59,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.5)',
  },
  projectInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.slate400,
    fontFamily: 'monospace',
  },
  projectName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  projectUpdated: {
    fontSize: 10,
    color: COLORS.slate500,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  sidebarFooter: {
    padding: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(71,85,105,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.safetyOrange,
    borderRadius: 6,
    gap: 8,
  },
  newProjectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 6,
  },
  main: {
    flex: 1,
    backgroundColor: COLORS.canvasBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  heroContent: {
    maxWidth: 560,
    width: '100%',
    alignItems: 'center',
  },
  heroIcon: {
    padding: 16,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 40,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.slateDeep,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 16,
    color: COLORS.slateMetallic,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500',
    marginBottom: 48,
  },
  cardsGrid: {
    flexDirection: 'row',
    gap: 24,
    width: '100%',
  },
  card: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cardIconWrapper: {
    width: 40,
    height: 40,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: '700',
    color: COLORS.slateDarker,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.slate500,
    fontWeight: '500',
  },
  swipeActions: {
    flexDirection: 'row',
  },
  swipeExport: {
    backgroundColor: COLORS.slate600,
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
  },
  swipeDelete: {
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
  },
  footerInfo: {
    marginTop: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.slate400,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});
