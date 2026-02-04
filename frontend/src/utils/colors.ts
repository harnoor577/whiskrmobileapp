// Whiskr brand colors
export const colors = {
  // Primary colors
  primary: '#1ce881',
  primaryDark: '#0d9488',
  accent: '#24ffc9',
  
  // Background colors
  background: '#fafbfc',
  card: '#ffffff',
  dark: '#101235',
  
  // Text colors
  text: '#101235',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  
  // Border colors
  border: '#e2e8f0',
  borderFocused: '#1ce881',
  
  // Status colors
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Species colors for patient avatars
  species: {
    dog: '#f97316',
    cat: '#3b82f6',
    bird: '#22c55e',
    fish: '#06b6d4',
    rabbit: '#ec4899',
    reptile: '#10b981',
    rodent: '#f59e0b',
    other: '#8b5cf6',
  },
};

export const getSpeciesColor = (species: string): string => {
  const s = species?.toLowerCase() || '';
  if (s.includes('dog') || s.includes('canine')) return colors.species.dog;
  if (s.includes('cat') || s.includes('feline')) return colors.species.cat;
  if (s.includes('bird') || s.includes('avian') || s.includes('parrot')) return colors.species.bird;
  if (s.includes('fish') || s.includes('aquatic')) return colors.species.fish;
  if (s.includes('rabbit') || s.includes('bunny')) return colors.species.rabbit;
  if (s.includes('turtle') || s.includes('reptile') || s.includes('lizard') || s.includes('snake')) return colors.species.reptile;
  if (s.includes('hamster') || s.includes('guinea') || s.includes('ferret')) return colors.species.rodent;
  return colors.species.other;
};

export const getSpeciesIcon = (species: string): string => {
  const s = species?.toLowerCase() || '';
  if (s.includes('dog') || s.includes('canine')) return 'logo-octocat';
  if (s.includes('cat') || s.includes('feline')) return 'logo-octocat';
  if (s.includes('bird') || s.includes('avian')) return 'logo-twitter';
  if (s.includes('fish')) return 'fish-outline';
  if (s.includes('rabbit') || s.includes('bunny')) return 'paw';
  return 'paw-outline';
};
