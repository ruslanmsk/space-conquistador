import { MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH, normalizeRoomCode } from "@space-conquistador/protocol";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { NicknameForm } from "../src/components/NicknameForm";
import { Screen } from "../src/components/Screen";
import { useOnlineStore } from "../src/online/onlineStore";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";
import { haptics } from "../src/utils/haptics";

/** A typed code, or a pasted invite link (`…/room/ABCD`). */
const codeFromInput = (t: string) => normalizeRoomCode(t.includes("/room/") ? t.slice(t.lastIndexOf("/room/") + 6) : t);

const SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

/** "Играть с друзьями": nickname, then create a room or join one by code. */
export default function OnlineScreen() {
  const insets = useSafeAreaInsets();
  const session = useOnlineStore((s) => s.session);
  const sessionLoaded = useOnlineStore((s) => s.sessionLoaded);
  const room = useOnlineStore((s) => s.room);
  const { init, register, rename, createRoom } = useOnlineStore.getState();
  const [size, setSize] = useState(MIN_PLAYERS);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);
  // A fresh nickname makes the "session expired" note stale.
  useEffect(() => setError(null), [session?.token]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await createRoom(size);
      router.push(`/room/${c}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось создать комнату.");
    } finally {
      setBusy(false);
    }
  };

  const join = () => {
    const c = normalizeRoomCode(code);
    if (c.length === ROOM_CODE_LENGTH) router.push(`/room/${c}`);
  };

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
      >
        <Button title="← Назад" variant="ghost" onPress={() => router.replace("/")} style={{ alignSelf: "flex-start" }} />
        <Text style={styles.title}>С друзьями</Text>
        <Text style={styles.lead}>Создайте комнату и отправьте ссылку — или введите код, который прислал друг. От 2 до 4 игроков.</Text>

        {!sessionLoaded ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 24 }} />
        ) : !session ? (
          <>
            <Text style={styles.section}>Как вас называть?</Text>
            <NicknameForm submitTitle="Дальше" onSubmit={register} autoFocus />
          </>
        ) : (
          <>
            <View style={styles.me}>
              <Text style={styles.meText} numberOfLines={1}>
                Ваш ник: <Text style={{ color: colors.text }}>{session.player.nickname}</Text>
              </Text>
              <Pressable hitSlop={8} onPress={() => setEditing((v) => !v)}>
                <Text style={styles.link}>{editing ? "отмена" : "изменить"}</Text>
              </Pressable>
            </View>
            {editing && (
              <NicknameForm
                initial={session.player.nickname}
                submitTitle="Сохранить"
                onSubmit={async (n) => {
                  await rename(n);
                  setEditing(false);
                }}
              />
            )}

            {room && (
              <Button
                title={`Вернуться в комнату ${room.code}`}
                caption={room.status === "playing" ? "Матч идёт" : "Комната ожидания"}
                onPress={() => router.push(`/room/${room.code}`)}
                style={{ marginTop: 16 }}
              />
            )}

            <Text style={styles.section}>Новая комната</Text>
            <View style={styles.sizes}>
              {SIZES.map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  onPress={() => {
                    haptics.tap();
                    setSize(n);
                  }}
                  style={[styles.size, size === n && styles.sizeOn]}
                >
                  <Text style={[styles.sizeNum, size === n && { color: colors.ink }]}>{n}</Text>
                  <Text style={[styles.sizeLabel, size === n && { color: colors.ink }]}>игрока</Text>
                </Pressable>
              ))}
            </View>
            <Button title={busy ? "Создаём…" : "Создать комнату"} disabled={busy} onPress={() => void create()} />

            <Text style={styles.section}>Войти по коду</Text>
            <View style={styles.joinRow}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(codeFromInput(t))}
                placeholder="ABCD"
                placeholderTextColor={colors.line}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={join}
                style={styles.code}
              />
              <Button
                title="Войти"
                variant="secondary"
                disabled={code.length !== ROOM_CODE_LENGTH}
                onPress={join}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: 22,
    marginBottom: 4,
  },
  me: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  meText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.muted },
  link: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.gold },
  sizes: { flexDirection: "row", gap: 8, marginBottom: 8 },
  size: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 6, borderWidth: 2, borderColor: colors.lineHi },
  sizeOn: { backgroundColor: colors.gold, borderColor: colors.ink },
  sizeNum: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  sizeLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted },
  joinRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  code: {
    width: 150,
    height: 58,
    backgroundColor: colors.sunken,
    borderWidth: 2,
    borderColor: colors.lineHi,
    borderRadius: 6,
    textAlign: "center",
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 6,
    color: colors.text,
  },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.human, marginTop: 12 },
});
