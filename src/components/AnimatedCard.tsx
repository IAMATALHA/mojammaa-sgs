import React from 'react';
import { StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

interface AnimatedCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  delay?: number; // Delay for staggered entrance
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedCard({ children, onPress, style, delay = 0 }: AnimatedCardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (onPress) scale.value = withSpring(0.95, { damping: 20, stiffness: 250 });
  };

  const handlePressOut = () => {
    if (onPress) scale.value = withSpring(1, { damping: 20, stiffness: 250 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      entering={FadeInDown.delay(delay).springify().damping(20).stiffness(250)}
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.geminiBorder,
          shadowColor: theme.geminiBlue,
        },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
});
