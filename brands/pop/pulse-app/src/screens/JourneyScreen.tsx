import React, { useState } from 'react';
import { ScrollView, View, Pressable, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from '../components/ui';
import { framework, byNo } from '../data';
import { colors, radius, space } from '../theme';
import { api } from '../lib/api';
import { sendLocal } from '../lib/notifications';

const FEATURE_ICON: Record<string, any> = {
  volunteer: 'users',
  stay_updated: 'bell',
  share_voice: 'mic',
  join_events: 'calendar',
  location: 'map-pin',
};
const SLOTS = ['Today 6:00 PM', 'Today 7:30 PM', 'Tomorrow 11:00 AM', 'Tomorrow 5:00 PM'];

type Step = 'landing' | 'voice' | 'schedule' | 'done';

export default function JourneyScreen({ activeNo }: { activeNo: number | null }) {
  const c = byNo[activeNo ?? 17] || byNo[1];
  const [step, setStep] = useState<Step>('landing');
  const [slot, setSlot] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState({ title: '', body: '' });

  async function finish(title: string, body: string) {
    setDoneMsg({ title, body });
    setStep('done');
    await sendLocal(title, body);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <View style={styles.tag}>
        <Txt size={9.5} weight="bold" faint style={{ letterSpacing: 0.8 }}>
          DEMO · BACKEND VIA API LAYER
        </Txt>
      </View>

      {step === 'landing' && (
        <>
          <View style={styles.banner}>
            <Txt size={17} weight="display" color={colors.white}>
              Pulse of Punjab
            </Txt>
            <Txt size={12.5} color="rgba(255,255,255,0.92)" style={{ marginTop: 4 }}>
              You scanned in {c.name}. Pick how you want to take part.
            </Txt>
          </View>
          <View style={styles.grid}>
            {framework.engagement.features.map((f: any) => (
              <Pressable
                key={f.id}
                style={styles.feat}
                onPress={() =>
                  f.id === 'share_voice'
                    ? setStep('voice')
                    : finish(`${f.label} ✓`, f.desc)
                }
              >
                <Feather name={FEATURE_ICON[f.id] || 'circle'} size={22} color={colors.accent} />
                <Txt size={13} weight="semibold" style={{ marginTop: 8 }}>
                  {f.label}
                </Txt>
                <Txt size={10.5} faint style={{ marginTop: 2, textAlign: 'center' }}>
                  {f.desc}
                </Txt>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {step === 'voice' && (
        <>
          <Header icon="mic" label="Share Voice · raise a grievance" />
          <Field label="Category">
            <Txt size={13}>Water · Jobs · Roads · Power · Drugs</Txt>
          </Field>
          <Field label="Describe it">
            <TextInput
              placeholder="Tell us what's wrong…"
              placeholderTextColor={colors.faint}
              multiline
              style={[styles.fieldInput, { height: 70 }]}
            />
          </Field>
          <Field label="Phone">
            <TextInput placeholder="+91…" placeholderTextColor={colors.faint} style={styles.fieldInput} keyboardType="phone-pad" />
          </Field>
          <Cta label="Continue to schedule a call" onPress={() => setStep('schedule')} />
          <Back onPress={() => setStep('landing')} />
        </>
      )}

      {step === 'schedule' && (
        <>
          <Header icon="clock" label="Raise at your convenience" />
          <Cta
            label="Call me now"
            icon="phone"
            onPress={() =>
              api.submitGrievance({ no: c.no, category: 'Water', description: '', name: '', phone: '' }).then(() =>
                finish('Auto-call connecting…', `A volunteer is dialing you for ${c.name}.`),
              )
            }
          />
          <Txt size={11} faint style={{ marginTop: 16, marginBottom: 8, letterSpacing: 0.4 }}>
            OR PICK A SLOT
          </Txt>
          <View style={styles.slotGrid}>
            {SLOTS.map((s) => (
              <Pressable key={s} style={[styles.slot, slot === s && styles.slotSel]} onPress={() => setSlot(s)}>
                <Txt size={12.5} weight={slot === s ? 'semibold' : 'regular'} color={slot === s ? colors.accent : colors.text}>
                  {s}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Cta
            label="Confirm slot"
            disabled={!slot}
            onPress={() =>
              api
                .submitGrievance({ no: c.no, category: 'Water', description: '', name: '', phone: '', slot: slot! })
                .then(() => finish('Call scheduled ✓', `Auto-call will dial you at ${slot}.`))
            }
          />
          <Back onPress={() => setStep('voice')} />
        </>
      )}

      {step === 'done' && (
        <View style={{ alignItems: 'center', paddingTop: 30 }}>
          <View style={styles.okIc}>
            <Feather name="check" size={34} color={colors.green} />
          </View>
          <Txt size={19} weight="display" style={{ marginTop: 16 }}>
            {doneMsg.title}
          </Txt>
          <Txt size={13} dim style={{ marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            {doneMsg.body}
          </Txt>
          <Txt size={11.5} faint style={{ marginTop: 10 }}>
            A push notification was just sent to this device.
          </Txt>
          <Cta label="Restart demo" icon="rotate-ccw" onPress={() => { setSlot(null); setStep('landing'); }} />
        </View>
      )}
    </ScrollView>
  );
}

function Header({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Feather name={icon} size={15} color={colors.accent} />
      <Txt size={13} dim>
        {label}
      </Txt>
    </View>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Txt size={11.5} faint style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      {children}
    </View>
  );
}
function Cta({ label, icon, onPress, disabled }: { label: string; icon?: any; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.cta, disabled && { opacity: 0.4 }]} onPress={disabled ? undefined : onPress}>
      {icon && <Feather name={icon} size={16} color={colors.bg} />}
      <Txt size={14.5} weight="bold" color={colors.bg}>
        {label}
      </Txt>
    </Pressable>
  );
}
function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.back} onPress={onPress}>
      <Feather name="chevron-left" size={15} color={colors.faint} />
      <Txt size={13} faint>
        back
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 14, borderStyle: 'dashed' },
  banner: { backgroundColor: colors.azure, borderRadius: radius.lg, padding: 16, marginBottom: 14, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  feat: {
    width: '47.5%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  fieldInput: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 11,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '47.5%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  slotSel: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: space(4),
  },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14 },
  okIc: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center' },
});
