type NotificationType = 'consult' | 'task' | 'patient' | 'diagnostic' | 'support' | 'system' | 'billing';

export function playNotificationSound(type: NotificationType) {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for different notification types
    const frequencies: Record<NotificationType, number> = {
      consult: 800,     // Higher pitch for consults
      diagnostic: 750,  // Diagnostic alerts
      task: 600,        // Medium pitch for tasks
      patient: 400,     // Lower pitch for patients
      support: 700,     // Support notifications
      system: 550,      // System alerts
      billing: 900      // High urgency for billing
    };
    
    oscillator.frequency.value = frequencies[type];
    oscillator.type = 'sine';
    
    // Louder fade out
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
}
