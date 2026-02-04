import { AtlasEye } from "./AtlasEye";

export interface EyeConfig {
  id: string;
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  position: { top?: string; bottom?: string; left?: string; right?: string };
  look: 'center' | 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'random';
  wander?: boolean;
  blinkInterval?: number;
  glowIntensity?: 'low' | 'medium' | 'high';
  zIndex?: number;
  hideOnMobile?: boolean;
  floatClass?: string;
}

interface ScatteredEyesProps {
  eyes: EyeConfig[];
}

export const ScatteredEyes = ({ eyes }: ScatteredEyesProps) => {
  return (
    <>
      {eyes.map((eye) => (
        <div
          key={eye.id}
          className={`absolute pointer-events-none ${eye.hideOnMobile ? 'hidden md:block' : ''} ${eye.floatClass || ''}`}
          style={{
            ...eye.position,
            zIndex: eye.zIndex || 1,
          }}
        >
          <AtlasEye
            size={eye.size}
            look={eye.look}
            wander={eye.wander}
            blinkInterval={eye.blinkInterval}
            glowIntensity={eye.glowIntensity}
          />
        </div>
      ))}
    </>
  );
};

// Pre-configured eye layouts for different sections
export const heroEyes: EyeConfig[] = [
  {
    id: 'hero-left',
    size: 'lg',
    position: { top: '15%', left: '8%' },
    look: 'down-right',
    wander: true,
    glowIntensity: 'high',
    hideOnMobile: true,
    floatClass: 'eye-float-1',
  },
  {
    id: 'hero-right',
    size: 'md',
    position: { top: '20%', right: '10%' },
    look: 'down-left',
    wander: true,
    glowIntensity: 'medium',
    hideOnMobile: true,
    floatClass: 'eye-float-2',
  },
  {
    id: 'hero-small',
    size: 'sm',
    position: { top: '35%', right: '18%' },
    look: 'left',
    blinkInterval: 2500,
    glowIntensity: 'low',
    hideOnMobile: true,
  },
];

export const featuresEyes: EyeConfig[] = [
  {
    id: 'features-right',
    size: 'md',
    position: { top: '30%', right: '3%' },
    look: 'up-left',
    wander: true,
    glowIntensity: 'medium',
    hideOnMobile: true,
    floatClass: 'eye-float-2',
  },
];

export const pricingEyes: EyeConfig[] = [
  {
    id: 'pricing-right',
    size: 'lg',
    position: { top: '10%', right: '5%' },
    look: 'down-left',
    wander: true,
    glowIntensity: 'high',
    hideOnMobile: true,
    floatClass: 'eye-float-1',
  },
  {
    id: 'float-1',
    size: 'xs',
    position: { top: '45%', left: '12%' },
    look: 'random',
    wander: true,
    glowIntensity: 'low',
    hideOnMobile: true,
  },
  {
    id: 'float-2',
    size: 'xs',
    position: { top: '60%', right: '15%' },
    look: 'random',
    wander: true,
    glowIntensity: 'low',
    hideOnMobile: true,
  },
];
