/** Login gate for the leader app.
 *  In mock mode (no EXPO_PUBLIC_API_URL) it's transparent — renders children.
 *  When a PROXe origin is configured, it requires a passcode which is exchanged
 *  server-side for a short-lived token (no secret in the bundle). */
import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Txt } from './ui';
import PulseDot from './PulseDot';
import { api } from '../lib/api';
import { colors, radius } from '../theme';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(() => !api.needsLogin());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  if (authed) return <>{children}</>;

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(false);
    // Normalise: the passcode is upper-case, but autoCapitalize does nothing on
    // desktop web, so accept it typed in any case.
    const ok = await api.authenticate(code.trim().toUpperCase());
    setBusy(false);
    if (ok) setAuthed(true);
    else setErr(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Txt size={22} weight="display">Pulse of Punjab</Txt>
          <PulseDot size={9} />
        </View>
        <Txt size={13} color={colors.accent} weight="semibold" style={{ marginBottom: 20 }}>
          Leadership intelligence · secure access
        </Txt>
        <Txt size={11} faint style={{ marginBottom: 8, letterSpacing: 0.3 }}>ACCESS PASSCODE</Txt>
        <TextInput
          value={code}
          onChangeText={(t) => { setCode(t); setErr(false); }}
          onSubmitEditing={submit}
          placeholder="Enter passcode"
          placeholderTextColor={colors.faint}
          secureTextEntry
          autoCapitalize="characters"
          style={[styles.input, err && { borderColor: '#ef4444' }]}
        />
        {err && <Txt size={11} color="#ef4444" style={{ marginTop: 8 }}>Incorrect passcode. Try again.</Txt>}
        <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Txt size={14} weight="bold" color="#fff">Enter</Txt>}
        </Pressable>
        <Txt size={10} faint style={{ marginTop: 16, textAlign: 'center' }}>
          Authorized campaign leadership only.
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 24,
  },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 16, letterSpacing: 1,
  },
  btn: {
    marginTop: 16, backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
});
