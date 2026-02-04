import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type EyeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LookDirection = 'center' | 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'random';

interface AtlasEyeProps {
  size?: EyeSize;
  look?: LookDirection;
  blink?: boolean;
  blinkInterval?: number;
  wander?: boolean;
  wanderSpeed?: number;
  className?: string;
  glowIntensity?: 'low' | 'medium' | 'high';
}

const sizeConfig: Record<EyeSize, { container: number; pupil: { w: number; h: number }; offset: number }> = {
  xs: { container: 40, pupil: { w: 8, h: 12 }, offset: 4 },
  sm: { container: 56, pupil: { w: 10, h: 14 }, offset: 5 },
  md: { container: 80, pupil: { w: 14, h: 20 }, offset: 7 },
  lg: { container: 110, pupil: { w: 18, h: 26 }, offset: 10 },
  xl: { container: 140, pupil: { w: 24, h: 32 }, offset: 12 },
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

export const AtlasEye = ({
  size = 'md',
  look = 'center',
  blink = true,
  blinkInterval = 3000,
  wander = false,
  wanderSpeed = 2000,
  className,
  glowIntensity = 'medium',
}: AtlasEyeProps) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [currentLook, setCurrentLook] = useState<Exclude<LookDirection, 'random'>>(
    look === 'random' ? 'center' : look
  );

  const config = sizeConfig[size];
  
  // Blinking effect
  useEffect(() => {
    if (!blink) return;
    
    const blinkDuration = 150;
    const randomOffset = Math.random() * 2000;
    
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), blinkDuration);
    }, blinkInterval + randomOffset);

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

  // Update look direction if prop changes
  useEffect(() => {
    if (look !== 'random') {
      setCurrentLook(look);
    }
  }, [look]);

  const offset = lookOffsets[currentLook];
  const pupilX = offset.x * config.offset;
  const pupilY = offset.y * config.offset;

  const glowStyles = {
    low: '0 0 20px rgba(28, 232, 129, 0.2)',
    medium: '0 0 40px rgba(28, 232, 129, 0.3), 0 0 60px rgba(28, 232, 129, 0.1)',
    high: '0 0 50px rgba(28, 232, 129, 0.4), 0 0 80px rgba(28, 232, 129, 0.2), 0 0 120px rgba(28, 232, 129, 0.1)',
  };

  return (
    <div 
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: config.container, height: config.container }}
    >
      {/* Glow */}
      <div 
        className="absolute inset-0 rounded-full opacity-60"
        style={{ boxShadow: glowStyles[glowIntensity] }}
      />

      {/* Outer orb */}
      <div 
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(36, 255, 201, 0.4), rgba(28, 232, 129, 0.8) 50%, rgba(16, 18, 53, 1) 100%)',
          boxShadow: 'inset 0 0 20px rgba(28, 232, 129, 0.5)',
          transform: isBlinking ? 'scaleY(0.1)' : 'scaleY(1)',
          transition: 'transform 0.15s ease-in-out',
        }}
      >
        {/* Highlight */}
        <div 
          className="absolute rounded-full bg-white/40"
          style={{
            width: config.container * 0.15,
            height: config.container * 0.1,
            top: '15%',
            left: '20%',
            filter: 'blur(2px)',
          }}
        />
      </div>

      {/* Pupil */}
      <div 
        className="absolute rounded-full bg-[#101235]"
        style={{
          width: config.pupil.w,
          height: config.pupil.h,
          transform: `translate(${pupilX}px, ${pupilY}px)`,
          transition: 'transform 0.3s ease-out',
          opacity: isBlinking ? 0 : 1,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
};
