import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
}

export function Toast({ message, visible, onHide }: ToastProps) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 22, stiffness: 300 });
      opacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withDelay(1600, withTiming(0, { duration: 250 }, () => runOnJS(onHide)()))
      );
      translateY.value = withSequence(
        withSpring(0, { damping: 22, stiffness: 300 }),
        withDelay(1600, withTiming(12, { duration: 250 }))
      );
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(141, 163, 193, 0.15)',
  },
  text: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
});
