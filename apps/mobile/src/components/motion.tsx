import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

/** True when the phone's Reduce Motion setting is on: animations should settle at once instead of moving. */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * A block that rises and fades in twice over: once when the screen opens (staggered by `index`), and again as it scrolls up
 * into view, so sections further down arrive as the shopper reaches them.
 */
export function Reveal({ scrollY, index = 0, children, style }: { scrollY: Animated.Value; index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const { height } = useWindowDimensions();
  const [y, setY] = useState(0);
  const [mount] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduce) return mount.setValue(1);
    Animated.timing(mount, { toValue: 1, duration: 520, delay: Math.min(index, 6) * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [mount, index, reduce]);

  if (reduce) return <Animated.View style={style}>{children}</Animated.View>;

  // Fully shown once its top edge is ~140px above the bottom of the screen.
  const enter = y - height + 40;
  const scrollOpacity = scrollY.interpolate({ inputRange: [enter, enter + 100], outputRange: [0, 1], extrapolate: 'clamp' });
  const scrollShift = scrollY.interpolate({ inputRange: [enter, enter + 100], outputRange: [28, 0], extrapolate: 'clamp' });
  const mountShift = mount.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });

  return (
    <Animated.View
      onLayout={(e) => setY(e.nativeEvent.layout.y)}
      style={[style, { opacity: Animated.multiply(mount, scrollOpacity), transform: [{ translateY: Animated.add(mountShift, scrollShift) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** A soft ring that swells and fades forever, to show "this is happening now". Put it behind the thing it surrounds. */
export function usePulse(active: boolean) {
  const reduce = useReduceMotion();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduce) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, value]);
  return {
    opacity: active && !reduce ? value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }) : 0,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
  };
}
