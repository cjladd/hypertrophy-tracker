// components/ErrorBoundary.tsx
// Root error boundary. Without this, a render throw anywhere in the tree unmounts the whole
// app to a blank screen with no diagnostic — the worst possible outcome mid-workout, because
// the user can't tell whether their logged sets survived (they did: every set is written to
// SQLite as it's logged, which is what the recovery copy says).
//
// Catches the error, persists it to error_log for later reading, and offers a retry that
// remounts the subtree rather than forcing an app restart.

import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '@/lib/theme';
import { reportError } from '@/lib/error-log';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Label recorded with the error, e.g. 'root'. */
  context?: string;
}

interface State {
  error: Error | null;
  /** Bumped on retry to force a fresh subtree instead of re-rendering the broken one. */
  resetKey: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Fire-and-forget: reportError never rejects.
    void reportError(error, this.props.context ?? 'render', info.componentStack ?? undefined);
  }

  handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>

          <Text style={styles.reassurance}>
            Your workout data is safe. Every set is saved as you log it, so nothing you&apos;ve
            already entered was lost.
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={this.handleRetry}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            If this keeps happening, the details below are saved under Settings &rarr; Dev tools
            &rarr; Error log.
          </Text>

          <View style={styles.detailBox}>
            <Text style={styles.detailText} selectable>
              {error.message}
            </Text>
            {!!error.stack && (
              <Text style={styles.stackText} selectable>
                {error.stack.split('\n').slice(0, 8).join('\n')}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundLight },
  content: {
    padding: SPACING.xl,
    paddingTop: SPACING.xxxl * 2,
    gap: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  reassurance: {
    fontSize: FONT_SIZES.bodyLarge,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.textInverse,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  hint: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textTertiary,
    lineHeight: 19,
  },
  detailBox: {
    backgroundColor: COLORS.backgroundWhite,
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.destructive,
    fontWeight: FONT_WEIGHTS.medium,
  },
  stackText: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textTertiary,
    fontFamily: 'Courier',
  },
});
