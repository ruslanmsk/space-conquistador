import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { Screen } from "../src/components/Screen";
import { loadLevel, markRulesSeen } from "../src/storage/settings";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";

const SECTIONS = [
  {
    icon: "🪐",
    title: "Цель",
    body: "Вы — синяя Земля, бот — красный Нептун. Наберите больше очков к концу битв или разрушьте вражескую столицу.",
  },
  {
    icon: "⚡",
    title: "1. Раздел системы",
    body: "Оба отвечают на один вопрос. Самый быстрый верный ответ — 2 планеты, второй верный — 1. В числовых вопросах побеждает тот, кто ближе к ответу. Захватывать можно свободные планеты рядом со своими.",
  },
  {
    icon: "⚔️",
    title: "2. Битва",
    body: "Ходы по очереди: выберите вражескую соседнюю планету. Верно ответили только вы — планета ваша. Оба верно — решающий числовой вопрос. Защитник, отбивший атаку, получает +100.",
  },
  {
    icon: "🛡️",
    title: "Столица",
    body: "У столицы 3 щита. Каждая успешная атака сбивает один. Последний удар — и вся система переходит к победителю.",
  },
  {
    icon: "⭐",
    title: "Очки",
    body: "Планета из раздела — 200, отвоёванная в бою — 300, столица — 1000. На ответ 15 секунд, на числовой вопрос — 20.",
  },
];

export default function RulesScreen() {
  const insets = useSafeAreaInsets();
  const { then } = useLocalSearchParams<{ then?: string }>();

  const done = async () => {
    await markRulesSeen();
    if (then === "match") {
      useMatchStore.getState().newMatch(await loadLevel());
      router.replace("/match");
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>Как играть</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.card}>
            <Text style={styles.icon}>{s.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          </View>
        ))}
        <Button title={then === "match" ? "Понятно, в бой!" : "Понятно"} onPress={() => void done()} style={{ marginTop: 8 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", marginBottom: 6 },
  card: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  icon: { fontSize: 26 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 4 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});
