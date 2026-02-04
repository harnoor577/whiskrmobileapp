import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

type EyeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LookDirection = 'center' | 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'random';

interface AtlasEyeProps {
  size?: EyeSize;
  look?: LookDirection;
  blink?: boolean;
  blinkInterval?: number;
  wander?: boolean;
  wanderSpeed?: number;
  glowIntensity?: 'low' | 'medium' | 'high';
}

const sizeConfig: Record<EyeSize, { container: number; pupil: { w: number; h: number }; offset: number }> = {
  xs: { container: 32, pupil: { w: 6, h: 10 }, offset: 3 },
  sm: { container: 48, pupil: { w: 8, h: 12 }, offset: 4 },
  md: { container: 64, pupil: { w: 12, h: 16 }, offset: 6 },
  lg: { container: 88, pupil: { w: 16, h: 22 }, offset: 8 },
  xl: { container: 112, pupil: { w: 20, h: 28 }, offset: 10 },
};

const lookOffsets: Record<Exclude<LookDirection, 'random'>, { x: number; y: number }> = {
  center: { x: 0, y: 0 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 0.5 },
  'up-left': { x: -0.7, y: -0.7 },
  'up-right': { x: 0.7, y: -0.7 },
  'down-left': { x: -0.7, y: 0.5 },
  'down-right': { x: 0.7, y: 0.5 },
};

export const AtlasEye: React.FC<AtlasEyeProps> = ({
  size = 'md',
  look = 'center',
  blink = true,
  blinkInterval = 3000,
  wander = false,
  wanderSpeed = 2000,
  glowIntensity = 'medium',
}) => {
  const [currentLook, setCurrentLook] = useState<Exclude<LookDirection, 'random'>>(
    look === 'random' ? 'center' : look
  );
  
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const pupilX = useRef(new Animated.Value(0)).current;
  const pupilY = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  const config = sizeConfig[size];

  // Glow animation
  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, []);

  // Blinking effect
  useEffect(() => {
    if (!blink) return;

    const doBlink = () => {
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const interval = setInterval(() => {
      doBlink();
    }, blinkInterval + Math.random() * 2000);

    return () => clearInterval(interval);
  }, [blink, blinkInterval]);

  // Wandering effect
  useEffect(() => {
    if (!wander) return;

    const directions: Exclude<LookDirection, 'random'>[] = [
      'center', 'left', 'right', 'up', 'down',
      'up-left', 'up-right', 'down-left', 'down-right'
    ];

    const interval = setInterval(() => {
      const randomDir = directions[Math.floor(Math.random() * directions.length)];
      setCurrentLook(randomDir);
    }, wanderSpeed + Math.random() * 1000);

    return () => clearInterval(interval);
  }, [wander, wanderSpeed]);

  // Update pupil position
  useEffect(() => {
    const offset = lookOffsets[currentLook];
    Animated.parallel([
      Animated.spring(pupilX, {
        toValue: offset.x * config.offset,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
      Animated.spring(pupilY, {
        toValue: offset.y * config.offset,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
    ]).start();
  }, [currentLook, config.offset]);

  // Update look direction if prop changes
  useEffect(() => {
    if (look !== 'random') {
      setCurrentLook(look);
    }
  }, [look]);

  const glowShadow = {
    low: { shadowOpacity: 0.3, shadowRadius: 10 },
    medium: { shadowOpacity: 0.5, shadowRadius: 20 },
    high: { shadowOpacity: 0.7, shadowRadius: 30 },
  };

  return (
    <View style={[styles.container, { width: config.container, height: config.container }]}>
      {/* Glow */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: config.container + 20,
            height: config.container + 20,
            borderRadius: (config.container + 20) / 2,
            opacity: glowAnim,
            ...glowShadow[glowIntensity],
          },
        ]}
      />

      {/* Outer orb */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: config.container,
            height: config.container,
            borderRadius: config.container / 2,
            transform: [{ scaleY: blinkAnim }],
          },
        ]}
      >
        {/* Highlight */}
        <View
          style={[
            styles.highlight,
            {
              width: config.container * 0.15,
              height: config.container * 0.1,
              top: config.container * 0.15,
              left: config.container * 0.2,
            },
          ]}
        />
      </Animated.View>

      {/* Pupil */}
      <Animated.View
        style={[
          styles.pupil,
          {
            width: config.pupil.w,
            height: config.pupil.h,
            borderRadius: config.pupil.w / 2,
            transform: [
              { translateX: pupilX },
              { translateY: pupilY },
            ],
            opacity: blinkAnim,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(28, 232, 129, 0.3)',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 0 },
  },
  orb: {
    backgroundColor: '#1ce881',
    overflow: 'hidden',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  highlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 10,
  },
  pupil: {
    position: 'absolute',
    backgroundColor: '#101235',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export default AtlasEye;
