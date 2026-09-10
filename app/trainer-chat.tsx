// app/trainer-chat.tsx
// Phase 7.3: the Personal Trainer Bot chat screen.
//
// Pushed stack screen (outside the tab group). Streams answers from `runTrainerQuery`,
// which is grounded in on-device SQLite. Optional `exerciseId`/`exerciseName` params let
// the progression card deep-link here with a "Why this weight?" question pre-asked.

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTrainerBotAvailable, runTrainerQuery } from '@/lib/ai/llm';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'How recovered am I?',
  'What should I train today?',
  'Why am I stalling?',
  'Should I deload?',
];

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}_${Date.now()}`;
}

export default function TrainerChat() {
  const params = useLocalSearchParams<{ exerciseId?: string; exerciseName?: string }>();
  const exerciseId = typeof params.exerciseId === 'string' ? params.exerciseId : undefined;
  const exerciseName = typeof params.exerciseName === 'string' ? params.exerciseName : undefined;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const available = isTrainerBotAvailable();

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (text: string, opts: { exerciseId?: string } = {}) => {
      const question = text.trim();
      if (!question || busy) return;

      setInput('');
      setBusy(true);

      const userMsg: Message = { id: nextId(), role: 'user', content: question };
      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);
      scrollToEnd();

      try {
        for await (const chunk of runTrainerQuery(question, opts)) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
          scrollToEnd();
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
        );
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  content:
                    'Sorry — I couldn\'t answer that right now. ' +
                    (e instanceof Error ? e.message : ''),
                }
              : m,
          ),
        );
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [busy, scrollToEnd],
  );

  // Deep-linked from a progression card: auto-ask "Why this weight?" for the exercise.
  useEffect(() => {
    if (exerciseId) {
      const label = exerciseName ? ` for ${exerciseName}` : '';
      void send(`Why this weight${label}?`, { exerciseId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setInput('');
  }, []);

  const showSuggestions = messages.length === 0 && !busy;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Ask Your Trainer',
          headerRight: () =>
            messages.length > 0 ? (
              <TouchableOpacity onPress={clearChat} hitSlop={8}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.intro}>
              <Ionicons name="barbell-outline" size={32} color="#007AFF" />
              <Text style={styles.introTitle}>Ask Your Trainer</Text>
              <Text style={styles.introBody}>
                I answer from your actual training history, recovery, and the app&apos;s
                recommendations — not generic advice.
              </Text>
            </View>
          )}

          {messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text style={m.role === 'user' ? styles.userText : styles.assistantText}>
                {m.content}
                {m.streaming && m.content.length === 0 ? '…' : ''}
              </Text>
              {m.streaming && m.content.length > 0 && (
                <ActivityIndicator size="small" color="#999" style={styles.streamSpinner} />
              )}
            </View>
          ))}
        </ScrollView>

        {showSuggestions && (
          <View style={styles.chipsRow}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <TouchableOpacity key={q} style={styles.chip} onPress={() => send(q)}>
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={available ? 'Ask about your training…' : 'Trainer unavailable'}
            placeholderTextColor="#999"
            editable={available && !busy}
            multiline
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || busy) && styles.sendButtonDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
          >
            <Ionicons name="arrow-up" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  flex: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },
  clearText: { color: '#007AFF', fontSize: 16 },
  intro: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 8 },
  introTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  introBody: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  userText: { color: 'white', fontSize: 15, lineHeight: 21 },
  assistantText: { color: '#222', fontSize: 15, lineHeight: 21 },
  streamSpinner: { alignSelf: 'flex-start', marginTop: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    backgroundColor: 'white',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  chipText: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#222',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#bcd6f5' },
});
