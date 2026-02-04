import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const getButtonStyle = (): ViewStyle[] => {
    const baseStyles: ViewStyle[] = [styles.button, styles[`button_${size}`]];

    switch (variant) {
      case 'primary':
        baseStyles.push(styles.buttonPrimary);
        break;
      case 'secondary':
        baseStyles.push(styles.buttonSecondary);
        break;
      case 'outline':
        baseStyles.push(styles.buttonOutline);
        break;
      case 'ghost':
        baseStyles.push(styles.buttonGhost);
        break;
    }

    if (disabled || loading) {
      baseStyles.push(styles.buttonDisabled);
    }

    return baseStyles;
  };

  const getTextStyle = (): TextStyle[] => {
    const baseStyles: TextStyle[] = [styles.buttonText, styles[`buttonText_${size}`]];

    switch (variant) {
      case 'primary':
        baseStyles.push(styles.buttonTextPrimary);
        break;
      case 'secondary':
        baseStyles.push(styles.buttonTextSecondary);
        break;
      case 'outline':
        baseStyles.push(styles.buttonTextOutline);
        break;
      case 'ghost':
        baseStyles.push(styles.buttonTextGhost);
        break;
    }

    return baseStyles;
  };

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#101235' : '#1ce881'}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={[...getTextStyle(), textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 8,
  },
  button_sm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  button_md: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  button_lg: {
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  buttonPrimary: {
    backgroundColor: '#1ce881',
  },
  buttonSecondary: {
    backgroundColor: '#101235',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#1ce881',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '600',
  },
  buttonText_sm: {
    fontSize: 14,
  },
  buttonText_md: {
    fontSize: 16,
  },
  buttonText_lg: {
    fontSize: 18,
  },
  buttonTextPrimary: {
    color: '#101235',
  },
  buttonTextSecondary: {
    color: '#ffffff',
  },
  buttonTextOutline: {
    color: '#1ce881',
  },
  buttonTextGhost: {
    color: '#1ce881',
  },
});
