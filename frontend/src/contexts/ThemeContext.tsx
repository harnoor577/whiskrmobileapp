import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme color definitions
export const lightTheme = {
  // Background colors
  background: '#fafbfc',
  foreground: '#101235',
  
  // Card colors
  card: '#ffffff',
  cardForeground: '#101235',
  
  // Primary (whiskr green)
  primary: '#1ce881',
  primaryForeground: '#101235',
  primaryHover: '#18c76e',
  
  // Secondary
  secondary: '#f1f5f9',
  secondaryForeground: '#101235',
  
  // Muted
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  
  // Accent (whiskr green)
  accent: '#1ce881',
  accentForeground: '#101235',
  
  // Destructive
  destructive: '#ef4444',
  destructiveForeground: '#ffffff',
  
  // Border
  border: '#e2e8f0',
  input: '#e2e8f0',
  ring: '#1ce881',
  
  // Status colors
  success: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Dashboard specific
  dashboardDarkest: '#fafbfc',
  dashboardDark: '#ffffff',
  dashboardElevated: '#f8fafc',
  
  // Sidebar
  sidebarBackground: '#ffffff',
  sidebarForeground: '#101235',
  sidebarBorder: '#e2e8f0',
  
  // Bottom bar
  bottomBarBackground: '#ffffff',
  bottomBarBorder: '#e2e8f0',
  
  // Text colors
  textPrimary: '#101235',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  
  // SOAP section colors
  soapSubjective: '#3b82f6',
  soapObjective: '#22c55e',
  soapAssessment: '#f59e0b',
  soapPlan: '#8b5cf6',
};

export const darkTheme = {
  // Background colors - Deep Navy (#0a0c1a)
  background: '#0a0c1a',
  foreground: '#f8fafc',
  
  // Card colors - Navy (#101235)
  card: '#101235',
  cardForeground: '#f8fafc',
  
  // Primary (whiskr green - brighter for dark mode)
  primary: '#1ce881',
  primaryForeground: '#101235',
  primaryHover: '#24ffc9',
  
  // Secondary - Dark navy variant
  secondary: '#1a1d3d',
  secondaryForeground: '#f8fafc',
  
  // Muted
  muted: '#1a1d3d',
  mutedForeground: '#94a3b8',
  
  // Accent (whiskr green)
  accent: '#1ce881',
  accentForeground: '#101235',
  
  // Destructive
  destructive: '#ef4444',
  destructiveForeground: '#ffffff',
  
  // Border - subtle navy
  border: '#2a2d4d',
  input: '#1a1d3d',
  ring: '#1ce881',
  
  // Status colors
  success: '#1ce881',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Dashboard specific
  dashboardDarkest: '#0a0c1a',
  dashboardDark: '#101235',
  dashboardElevated: '#1a1d3d',
  
  // Sidebar
  sidebarBackground: '#101235',
  sidebarForeground: '#f8fafc',
  sidebarBorder: '#2a2d4d',
  
  // Bottom bar
  bottomBarBackground: '#0f172a',
  bottomBarBorder: '#1e293b',
  
  // Text colors
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  
  // SOAP section colors (slightly brighter for dark mode)
  soapSubjective: '#60a5fa',
  soapObjective: '#4ade80',
  soapAssessment: '#fbbf24',
  soapPlan: '#a78bfa',
};

export type Theme = typeof lightTheme;
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@whiskr_theme_mode';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark'); // Default to dark
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system')) {
          setThemeModeState(savedMode as ThemeMode);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Save theme preference when it changes
  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  // Determine if we should use dark theme
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');
  
  // Get the appropriate theme
  const theme = isDark ? darkTheme : lightTheme;

  // Toggle between light and dark
  const toggleTheme = () => {
    setThemeMode(isDark ? 'light' : 'dark');
  };

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, themeMode, isDark, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
