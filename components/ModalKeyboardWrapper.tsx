// components/ModalKeyboardWrapper.tsx
// Standard overlay for transparent modals that contain text inputs. Fixes two app-wide issues:
//   1. the on-screen keyboard covering the modal's buttons — KeyboardAvoidingView lifts the
//      centered card above the keyboard, and
//   2. tapping outside the inputs not dismissing the keyboard — a full-bleed backdrop behind
//      the card catches those taps and dismisses it.
//
// Usage: replace a modal's `<View style={styles.modalOverlay}>…card…</View>` with
//   `<ModalKeyboardWrapper overlayStyle={styles.modalOverlay}>…card…</ModalKeyboardWrapper>`.
// The card stays the only flow child, so existing centering/sizing styles are untouched.

import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  /** The modal's existing overlay style (dim background + centering). */
  overlayStyle?: StyleProp<ViewStyle>;
  /** Extra action when the backdrop is tapped (e.g. close the modal). Keyboard is always dismissed first. */
  onBackdropPress?: () => void;
}

export default function ModalKeyboardWrapper({ children, overlayStyle, onBackdropPress }: Props) {
  const handleBackdrop = () => {
    Keyboard.dismiss();
    onBackdropPress?.();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.fill, overlayStyle]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Behind the card: absolute-fill so it never affects the card's layout/centering. */}
      <TouchableWithoutFeedback onPress={handleBackdrop} accessible={false}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
