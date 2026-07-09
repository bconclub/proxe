/** Feed — the leader's live activity stream. Everything pushed to the team (his
 *  own "Act on this" / mobilise directives + AI suggestions) with its current
 *  status as the war-room team works it: awaiting → acked → done. Polls every
 *  15s so updates land without a manual refresh. Replaces the old Journey tab. */
import React from 'react';
import { ScrollView, View, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Txt } from '../components/ui';
import { colors, radius } from '../theme';
import { api, actionOf, type FeedItem } from '../lib/api';

const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

const STATUS: Record<FeedItem['status'], { label: string; color: string; icon: any }> = {
  new: { label: 'Awaiting team', color: '#F5A623', icon: 'send' },
  acked: { label: 'Team acked', color: '#2E8DE6', icon: 'eye' },
  actioned: { label: 'Done', color: '#2FD08A', icon: 'check-circle' },
};

export default function FeedScreen() {
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    const data = await api.getFeed();
    setItems(data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 15000); // live — surface status changes as the team works
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const awaiting = items.filter((i) => i.status === 'new').length;
  const done = items.filter((i) => i.status === 'actioned').length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt size={24} weight="display">Feed</Txt>
        <View style={styles.live}>
          <View style={styles.dot} />
          <Txt size={10} weight="bold" color="#2FD08A">LIVE</Txt>
        </View>
      </View>
      <Txt size={12.5} dim style={{ marginTop: 6, lineHeight: 18 }}>
        What you have pushed to the team, and what is happening with it. Updates as they work.
      </Txt>

      {!loading && items.length > 0 && (
        <View style={styles.summary}>
          <Summary n={items.length} label="pushed" color={colors.text} />
          <Summary n={awaiting} label="awaiting" color="#F5A623" />
          <Summary n={done} label="done" color="#2FD08A" />
        </View>
      )}

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="send" size={22} color={colors.faint} />
          <Txt size={13} weight="semibold" dim style={{ marginTop: 10 }}>Nothing pushed yet</Txt>
          <Txt size={11.5} faint style={{ marginTop: 4, textAlign: 'center', lineHeight: 17 }}>
            Tap a grievance to act on it, or push the frontline to mobilise — it will show up here with live status.
          </Txt>
        </View>
      ) : (
        <View style={{ marginTop: 14, gap: 10 }}>
          {items.map((it) => {
            const st = STATUS[it.status] || STATUS.new;
            const isAi = it.source === 'ai';
            // The action kind rides in the title verb ("Escalate: …"); pull it out
            // for a coloured badge and show the title without the verb prefix.
            const act = actionOf(it.title);
            const title = act ? it.title.slice(act.verb.length + 1).trim() : it.title;
            return (
              <View key={it.id} style={[styles.card, { borderLeftColor: act ? act.color : st.color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={[styles.srcTag, { backgroundColor: (isAi ? '#8B5CF6' : colors.accent) + '22' }]}>
                    <Feather name={isAi ? 'zap' : 'user'} size={10} color={isAi ? '#8B5CF6' : colors.accent} />
                    <Txt size={9} weight="bold" color={isAi ? '#8B5CF6' : colors.accent}>{isAi ? 'AI' : 'YOU'}</Txt>
                  </View>
                  {act ? (
                    <View style={[styles.srcTag, { backgroundColor: act.color + '22' }]}>
                      <Feather name={act.icon as any} size={10} color={act.color} />
                      <Txt size={9} weight="bold" color={act.color}>{act.label.toUpperCase()}</Txt>
                    </View>
                  ) : null}
                  {it.constituency ? <Txt size={11} faint>{it.constituency}</Txt> : null}
                  <View style={{ flex: 1 }} />
                  <Txt size={10.5} faint>{ago(it.created_at)}</Txt>
                </View>
                <Txt size={14} weight="semibold" style={{ lineHeight: 19 }}>{title}</Txt>
                {it.body ? <Txt size={12} dim style={{ marginTop: 4, lineHeight: 17 }}>{it.body}</Txt> : null}
                <View style={[styles.statusRow, { backgroundColor: st.color + '18', borderColor: st.color + '44' }]}>
                  <Feather name={st.icon} size={12} color={st.color} />
                  <Txt size={11} weight="bold" color={st.color}>{st.label}</Txt>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Summary({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Txt size={20} weight="bold" color={color}>{n}</Txt>
      <Txt size={10} faint style={{ marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2FD08A18', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#2FD08A' },
  summary: { flexDirection: 'row', marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, padding: 13 },
  srcTag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
});
