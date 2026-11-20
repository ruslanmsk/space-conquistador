import { MIN_PLAYERS, normalizeRoomCode, type RoomMember, type RoomView } from "@space-conquistador/protocol";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { MatchView } from "../../src/components/MatchView";
import { NicknameForm } from "../../src/components/NicknameForm";
import { ResultPanel } from "../../src/components/ResultPanel";
import { Screen } from "../../src/components/Screen";
import { Slab } from "../../src/components/Slab";
import { slotColor } from "../../src/game/seats";
import { inviteLink } from "../../src/online/config";
import { useOnlineStore } from "../../src/online/onlineStore";
import { useOnlineMatch } from "../../src/online/useOnlineMatch";
import { colors } from "../../src/theme/colors";
import { fonts } from "../../src/theme/type";

/**
 * `/room/CODE` — the invite link. Asks for a nickname if needed, joins the room, shows the waiting
 * room, and the match itself once it starts (so reloading the page rejoins the match).
 */
export default function RoomScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = normalizeRoomCode(String(params.code ?? ""));
  const session = useOnlineStore((s) => s.session);
  const sessionLoaded = useOnlineStore((s) => s.sessionLoaded);
  const room = useOnlineStore((s) => s.room);
  const { init, register, joinRoom } = useOnlineStore.getState();
  const [joinError, setJoinError] = useState<string | null>(null);
  const ctl = useOnlineMatch();

  useEffect(() => {
    void init();
  }, [init]);

  const token = session?.token;
  useEffect(() => {
    if (!token || !code) return;
    setJoinError(null);
    joinRoom(code).catch((e: unknown) => setJoinError(e instanceof Error ? e.message : "Не удалось войти в комнату."));
  }, [token, code, joinRoom]);

  const here = room?.code === code ? room : null;

  if (!sessionLoaded) return <Loading />;
  if (!session) {
    return (
      <Shell>
        <Text style={styles.kicker}>Приглашение</Text>
        <Text style={styles.title}>Комната {code}</Text>
        <Text style={styles.lead}>Представьтесь, чтобы войти. Пароль не нужен — ник запомнится на этом устройстве.</Text>
        <View style={{ marginTop: 16 }}>
          <NicknameForm submitTitle="Войти в комнату" onSubmit={register} autoFocus />
        </View>
      </Shell>
    );
  }
  if (joinError && !here) {
    return (
      <Shell>
        <Text style={styles.kicker}>Комната {code}</Text>
        <Text style={styles.title}>Не получилось войти</Text>
        <Text style={styles.lead}>{joinError}</Text>
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button title="Попробовать ещё раз" onPress={() => joinRoom(code).then(() => setJoinError(null), (e: Error) => setJoinError(e.message))} />
          <Button title="Другая комната" variant="ghost" onPress={() => router.replace("/online")} />
        </View>
      </Shell>
    );
  }
  if (!here) return <Loading text="Подключаемся к комнате…" />;

  if (here.status !== "lobby") {
    if (!ctl) return <Loading text="Загружаем матч…" />;
    const isHost = here.hostId === session.player.id;
    return (
      <Screen>
        <MatchView
          ctl={ctl}
          onBack={() => router.replace("/")}
          result={
            <ResultPanel
              state={ctl.state}
              campaign={false}
              onNext={null}
              onRematch={isHost ? () => void useOnlineStore.getState().reset().catch(() => undefined) : null}
              rematchNote="Реванш начнёт хозяин комнаты"
              onMenu={() => {
                void useOnlineStore.getState().leaveRoom();
                router.replace("/");
              }}
            />
          }
        />
      </Screen>
    );
  }

  return <Lobby room={here} meId={session.player.id} />;
}

function Shell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <Button title="← Назад" variant="ghost" onPress={() => router.replace("/")} style={{ alignSelf: "flex-start" }} />
        {children}
      </ScrollView>
    </Screen>
  );
}

function Loading({ text }: { text?: string }) {
  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
        {text ? <Text style={styles.loading}>{text}</Text> : null}
      </View>
    </Screen>
  );
}

async function shareInvite(code: string): Promise<string | null> {
  const link = inviteLink(code);
  if (Platform.OS === "web") {
    try {
      await navigator.clipboard.writeText(link);
      return "Ссылка скопирована — отправьте её другу";
    } catch {
      return link;
    }
  }
  await Share.share({ message: `Space Conquistador — сыграем? Комната ${code}: ${link}` });
  return null;
}

function Lobby({ room, meId }: { room: RoomView; meId: string }) {
  const insets = useSafeAreaInsets();
  const status = useOnlineStore((s) => s.status);
  const storeError = useOnlineStore((s) => s.error);
  const { setReady, start, leaveRoom } = useOnlineStore.getState();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const members = room.members;
  const me = members.find((m) => m.playerId === meId);
  const myIndex = Math.max(0, members.findIndex((m) => m.playerId === meId));
  const isHost = room.hostId === meId;
  const enough = members.length >= MIN_PLAYERS;
  const allReady = members.every((m) => m.ready);
  const canStart = isHost && enough && allReady;
  const startHint = !enough ? "Ждём хотя бы одного друга" : !allReady ? "Начать можно, когда все готовы" : "Все готовы";

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось.");
    } finally {
      setBusy(false);
    }
  };

  const row = (m: RoomMember, i: number) => {
    const mine = m.playerId === meId;
    const slot = (i - myIndex + members.length) % members.length;
    const color = slotColor(slot);
    return (
      <Animated.View key={m.playerId} entering={FadeInDown.duration(220)}>
        <Slab color={colors.raised} border={mine ? color : colors.ink} depth={3}>
          <View style={styles.member}>
            <Avatar id={mine ? "you" : (m.seat ?? `p${i + 1}`)} size={40} ring={color} uid={`lobby-${m.playerId}`} />
            <View style={{ flex: 1 }}>
              <Text style={styles.nick} numberOfLines={1}>
                {m.nickname}
                {mine ? <Text style={styles.nickMeta}> · вы</Text> : null}
              </Text>
              <Text style={styles.memberMeta}>
                {room.hostId === m.playerId ? "хозяин комнаты" : "игрок"}
                {!m.connected ? " · не в сети" : ""}
              </Text>
            </View>
            <View style={[styles.badge, m.ready ? styles.badgeOn : null]}>
              <Text style={[styles.badgeText, m.ready && { color: colors.ink }]}>{m.ready ? "✓ готов" : "не готов"}</Text>
            </View>
          </View>
        </Slab>
      </Animated.View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.topRow}>
          <Button
            title="← Выйти"
            variant="ghost"
            onPress={() => {
              void leaveRoom();
              router.replace("/online");
            }}
          />
          <Text style={[styles.conn, status !== "online" && { color: colors.human }]}>
            {status === "online" ? "онлайн" : "переподключение…"}
          </Text>
        </View>

        <Text style={styles.kicker}>Комната · до {room.maxPlayers} игроков</Text>
        <Slab color={colors.paper} shadow={colors.bgDeep} depth={5}>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Код комнаты</Text>
            <Text style={styles.code} selectable>
              {room.code}
            </Text>
          </View>
        </Slab>
        <Button
          title={Platform.OS === "web" ? "Скопировать ссылку" : "Пригласить"}
          variant="secondary"
          size="md"
          onPress={() => void shareInvite(room.code).then(setNote)}
          style={{ marginTop: 6 }}
        />
        <Text style={styles.note} selectable>
          {note ?? inviteLink(room.code)}
        </Text>

        <Text style={styles.section}>
          Игроки {members.length} из {room.maxPlayers}
        </Text>
        <View style={{ gap: 8 }}>
          {members.map(row)}
          {Array.from({ length: Math.max(0, room.maxPlayers - members.length) }, (_, i) => (
            <View key={`free-${i}`} style={styles.free}>
              <Text style={styles.freeText}>Свободное место</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {/* The host is always ready (server rule); everyone else toggles. */}
          {!isHost && (
            <Button
              title={me?.ready ? "Не готов" : "Готов"}
              variant={me?.ready ? "secondary" : "primary"}
              disabled={busy}
              onPress={() => void run(() => setReady(!me?.ready))}
            />
          )}
          {isHost ? (
            <Button
              title="Начать"
              caption={startHint}
              disabled={!canStart || busy}
              onPress={() => void run(start)}
            />
          ) : (
            <Text style={styles.wait}>{allReady && enough ? "Ждём, когда хозяин начнёт матч" : "Матч начнёт хозяин, когда все будут готовы"}</Text>
          )}
          {(error || storeError) && <Text style={styles.error}>{error ?? storeError}</Text>}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  conn: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.muted },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.gold, marginTop: 6 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
  lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted },
  codeBox: { alignItems: "center", paddingVertical: 14 },
  codeLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.inkMuted },
  code: { fontFamily: fonts.display, fontSize: 52, lineHeight: 62, letterSpacing: 10, color: colors.ink, paddingLeft: 10 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center" },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: 16,
    marginBottom: 2,
  },
  member: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10 },
  nick: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.text },
  nickMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  memberMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3, borderWidth: 1.5, borderColor: colors.lineHi },
  badgeOn: { backgroundColor: colors.gold, borderColor: colors.ink },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  free: {
    minHeight: 60,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  freeText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.dim },
  actions: { gap: 10, marginTop: 18 },
  wait: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: 8 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.human, textAlign: "center" },
});
