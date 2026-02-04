import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };
    
    let score = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    
    // Calculate score
    if (checks.length) score++;
    if (checks.uppercase) score++;
    if (checks.lowercase) score++;
    if (checks.number) score++;
    if (checks.special) score++;
    
    // Determine strength label and color
    let label = '';
    let color = '';
    
    if (score <= 2) {
      label = 'Weak';
      color = 'bg-destructive';
    } else if (score === 3 || score === 4) {
      label = 'Medium';
      color = 'bg-amber-500';
    } else {
      label = 'Strong';
      color = 'bg-green-500';
    }
    
    return { score, label, color, checks };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              strength.color
            )}
            style={{ width: `${(strength.score / 5) * 100}%` }}
          />
        </div>
        <span className={cn(
          'text-xs font-medium transition-colors',
          strength.score <= 2 && 'text-destructive',
          (strength.score === 3 || strength.score === 4) && 'text-amber-500',
          strength.score === 5 && 'text-green-500'
        )}>
          {strength.label}
        </span>
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1 text-xs">
        <RequirementItem met={strength.checks.length} label="At least 8 characters" />
        <RequirementItem met={strength.checks.uppercase} label="Contains uppercase letter" />
        <RequirementItem met={strength.checks.lowercase} label="Contains lowercase letter" />
        <RequirementItem met={strength.checks.number} label="Contains number" />
        <RequirementItem met={strength.checks.special} label="Contains special character (optional)" />
      </div>
    </div>
  );
}

function RequirementItem({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 transition-colors',
      met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
    )}>
      {met ? (
        <Check className="h-3 w-3" />
      ) : (
        <X className="h-3 w-3" />
      )}
      <span>{label}</span>
    </div>
  );
}
