import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/ui/Button';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';

export default function WelcomeScreen() {
  const router = useRouter();
  const { user, loading, initialized } = useAuthStore();
  const { theme } = useTheme();

  useEffect(() => {
    if (initialized && !loading && user) {
      router.replace('/(tabs)');
    }
  }, [user, loading, initialized]);

  if (loading || !initialized) {
    return null;
  }

  if (user) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={[styles.logoContainer, { backgroundColor: theme.card }]}>
            <Ionicons name="medical" size={48} color={theme.primary} />
          </View>
          <Text style={[styles.appName, { color: theme.textPrimary }]}>whiskr</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Your Veterinary Clinical Copilot</Text>
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <FeatureItem
            icon="mic-outline"
            title="Voice-Powered Notes"
            description="Record consultations and let AI transcribe them"
            theme={theme}
          />
          <FeatureItem
            icon="document-text-outline"
            title="SOAP Notes"
            description="Generate comprehensive clinical documentation"
            theme={theme}
          />
          <FeatureItem
            icon="time-outline"
            title="Save Time"
            description="Reduce documentation time by up to 50%"
            theme={theme}
          />
        </View>

        {/* Action Button - Only Sign In */}
        <View style={styles.buttonsSection}>
          <Button
            title="Sign In"
            onPress={() => router.push('/(auth)/login')}
            variant="primary"
            size="lg"
            style={styles.button}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function FeatureItem({
  icon,
  title,
  description,
  theme,
}: {
  icon: string;
  title: string;
  description: string;
  theme: any;
}) {
  return (
    <View style={[styles.featureItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: `${theme.primary}15` }]}>
        <Ionicons name={icon as any} size={24} color={theme.primary} />
      </View>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.featureDescription, { color: theme.textSecondary }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: '#101235',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 42,
    fontWeight: '700',
    color: '#101235',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 8,
  },
  featuresSection: {
    gap: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#64748b',
  },
  buttonsSection: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    width: '100%',
  },
});
