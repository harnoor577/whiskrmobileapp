import { cn } from "@/lib/utils";

type AtlasState = 'idle' | 'listening' | 'recording' | 'processing' | 'ready' | 'error';
type AtlasSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AtlasAvatarProps {
  state?: AtlasState;
  size?: AtlasSize;
  className?: string;
  showRings?: boolean;
}

const sizeClasses: Record<AtlasSize, { container: string; pupil: string; glow: string }> = {
  xs: { container: 'w-8 h-8', pupil: 'w-[6px] h-[10px]', glow: 'inset-[-10px]' },
  sm: { container: 'w-12 h-12', pupil: 'w-[10px] h-[14px]', glow: 'inset-[-15px]' },
  md: { container: 'w-20 h-20', pupil: 'w-[16px] h-[22px]', glow: 'inset-[-25px]' },
  lg: { container: 'w-[120px] h-[120px]', pupil: 'w-[24px] h-[32px]', glow: 'inset-[-35px]' },
  xl: { container: 'w-[140px] h-[140px]', pupil: 'w-[28px] h-[36px]', glow: 'inset-[-40px]' },
};

export const AtlasAvatar = ({ 
  state = 'idle', 
  size = 'md', 
  className,
  showRings = true 
}: AtlasAvatarProps) => {
  const sizes = sizeClasses[size];
  
  const getGlowColor = () => {
    switch (state) {
      case 'recording': return 'rgba(197, 48, 48, 0.35)';
      case 'error': return 'rgba(251, 146, 60, 0.4)';
      case 'ready': return 'rgba(28, 232, 129, 0.5)';
      case 'listening': return 'rgba(28, 232, 129, 0.4)';
      case 'processing': return 'rgba(28, 232, 129, 0.35)';
      default: return 'rgba(28, 232, 129, 0.25)';
    }
  };

  const getOrbGradient = () => {
    switch (state) {
      case 'recording': return 'linear-gradient(135deg, #c53030 0%, #9b2c2c 50%, #822727 100%)';
      case 'error': return 'linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)';
      default: return 'linear-gradient(135deg, #1ce881 0%, #24ffc9 50%, #1ce881 100%)';
    }
  };

  const getOrbAnimation = () => {
    switch (state) {
      case 'listening': return 'animate-atlas-pulse';
      case 'recording': return 'animate-atlas-pulse-fast';
      case 'processing': return 'animate-atlas-breath';
      case 'error': return 'animate-atlas-shake';
      case 'ready': return 'animate-atlas-pulse-slow';
      default: return 'animate-atlas-breath';
    }
  };

  const getPupilAnimation = () => {
    switch (state) {
      case 'listening': return 'animate-atlas-pupil';
      case 'recording': return 'animate-atlas-pupil-fast';
      case 'processing': return 'animate-atlas-pupil-process';
      default: return '';
    }
  };

  return (
    <div className={cn("relative flex items-center justify-center", sizes.container, className)}>
      
      {/* Glow effect */}
      <div 
        className={cn(
          "absolute rounded-full blur-xl transition-all duration-500",
          sizes.glow,
          state === 'idle' ? 'animate-atlas-glow' : 'animate-atlas-glow-fast'
        )}
        style={{ background: getGlowColor() }}
      />
      
      {/* Rings for listening/ready states */}
      {showRings && (state === 'listening' || state === 'ready') && (
        <>
          <div 
            className="absolute inset-[-8px] rounded-full border-2 border-[#1ce881]/40 animate-atlas-ring"
            style={{ animationDelay: '0s' }}
          />
          <div 
            className="absolute inset-[-8px] rounded-full border-2 border-[#1ce881]/30 animate-atlas-ring"
            style={{ animationDelay: '0.5s' }}
          />
          <div 
            className="absolute inset-[-8px] rounded-full border-2 border-[#1ce881]/20 animate-atlas-ring"
            style={{ animationDelay: '1s' }}
          />
        </>
      )}
      
      {/* Recording ring */}
      {showRings && state === 'recording' && (
        <div 
          className="absolute inset-[-6px] rounded-full border-2 border-red-500/50 animate-atlas-ring"
        />
      )}
      
      {/* Processing spinner */}
      {state === 'processing' && (
        <div 
          className="absolute inset-[-12px] rounded-full border-2 border-transparent border-t-[#1ce881]/60 animate-spin-slow"
        />
      )}
      
      {/* Main orb */}
      <div 
        className={cn(
          "relative w-full h-full rounded-full shadow-lg transition-all duration-300",
          getOrbAnimation()
        )}
        style={{ 
          background: getOrbGradient(),
          boxShadow: `0 4px 20px ${getGlowColor()}, inset 0 2px 10px rgba(255,255,255,0.3)`
        }}
      >
        {/* Highlight */}
        <div 
          className="absolute top-[15%] left-[20%] w-[30%] h-[20%] rounded-full opacity-60"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.8), transparent)' }}
        />
        
        {/* Inner orb for processing state */}
        {state === 'processing' && (
          <div 
            className="absolute inset-[15%] rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent)' }}
          />
        )}
      </div>
      
      {/* Pupil */}
      {state !== 'error' && state !== 'ready' && (
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300",
            sizes.pupil,
            getPupilAnimation(),
            state === 'recording' ? 'bg-white/90' : 'bg-[#101235]'
          )}
          style={{ 
            boxShadow: state === 'recording' 
              ? '0 2px 8px rgba(255,255,255,0.5)' 
              : '0 2px 8px rgba(16,18,53,0.3)'
          }}
        />
      )}
      
      {/* Ready checkmark */}
      {state === 'ready' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-atlas-checkmark">
          <svg 
            viewBox="0 0 24 24" 
            className={cn(
              "text-[#101235]",
              size === 'xs' ? 'w-4 h-4' : size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-8 h-8' : 'w-12 h-12'
            )}
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L19 7" className="animate-atlas-checkmark-draw" />
          </svg>
        </div>
      )}
      
      {/* Error exclamation */}
      {state === 'error' && (
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-white animate-atlas-exclamation",
            size === 'xs' ? 'text-sm' : size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-4xl'
          )}
        >
          !
        </div>
      )}
      
      {/* Recording indicator dot */}
      {state === 'recording' && (
        <div className="absolute -top-1 -right-1 animate-atlas-recording-dot">
          <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-lg" />
        </div>
      )}
      
      {/* Processing dots */}
      {state === 'processing' && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#1ce881] animate-atlas-dot" style={{ animationDelay: '0s' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#1ce881] animate-atlas-dot" style={{ animationDelay: '0.2s' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#1ce881] animate-atlas-dot" style={{ animationDelay: '0.4s' }} />
        </div>
      )}
    </div>
  );
};
