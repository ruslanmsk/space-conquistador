import { CATEGORIES } from "@space-conquistador/game-core";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { CategoryGlyph } from "../src/components/CategoryGlyph";
import { Screen } from "../src/components/Screen";
import { useProgressData } from "../src/hooks/useProgressData";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";
import { loadPrefs, setPref, type Prefs } from "../src/utils/prefs";

/** Per-category accuracy (feeds the sector strategy) plus sound/haptics toggles. */
export default function Stats() {
  const insets = useSafeAreaInsets();
  const p = useProgressData();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    void loadPrefs().then(setPrefs);
  }, []);

  const rows = CATEGORIES.map((c) => {
    const s = p?.categories[c];
    return { c, asked: s?.asked ?? 0, rate: s && s.asked ? s.correct / s.asked : null };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  const total = p?.questions ?? 0;
  const acc = total ? Math.round(((p?.correct ?? 0) / total) * 100) : 0;

  const toggle = (k: keyof Prefs) => (v: boolean) => {
    void setPref(k, v);
    setPrefs((cur) => (cur ? { ...cur, [k]: v } : cur));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <Button title="← Назад" variant="ghost" onPress={() => router.back()} style={{ alignSelf: "flex-start" }} />
        <Text style={styles.title}>Статистика</Text>

        <View style={styles.tiles}>
          {[
            { v: `${p?.wins ?? 0}`, l: "побед" },
            { v: `${p?.losses ?? 0}`, l: "поражений" },
            { v: total ? `${acc}%` : "—", l: "верных" },
            { v: `${p?.bestStreak ?? 0}`, l: "лучшая серия" },
          ].map((t) => (
            <View key={t.l} style={styles.tile}>
              <Text style={styles.tileV}>{t.v}</Text>
              <Text style={styles.tileL}>{t.l}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>По темам</Text>
        {total === 0 && <Text style={styles.empty}>Сыграйте матч — здесь появится, в каких темах вы сильны.</Text>}
        {rows.map((r) => (
          <View key={r.c} style={styles.row}>
            <CategoryGlyph category={r.c} size={20} color={colors.text} />
            <Text style={styles.cat}>{r.c}</Text>
            <View style={styles.bar}>
              {r.rate !== null && <View style={[styles.fill, { width: `${Math.round(r.rate * 100)}%`, backgroundColor: r.rate >= 0.6 ? colors.gold : colors.lineHi }]} />}
            </View>
            <Text style={styles.pct}>{r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`}</Text>
          </View>
        ))}

        <Text style={styles.section}>Настройки</Text>
        {prefs && (
          <>
            <View style={styles.pref}>
              <Text style={styles.prefText}>Звук</Text>
              <Switch value={prefs.sound} onValueChange={toggle("sound")} trackColor={{ true: colors.human, false: colors.line }} />
            </View>
            <View style={styles.pref}>
              <Text style={styles.prefText}>Вибрация</Text>
              <Switch value={prefs.haptics} onValueChange={toggle("haptics")} trackColor={{ true: colors.human, false: colors.line }} />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text, marginBottom: 6 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderWidth: 2, borderColor: colors.line, borderRadius: 6, padding: 10, backgroundColor: colors.raised },
  tileV: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  tileL: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  section: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: colors.muted, marginTop: 20, marginBottom: 4 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.dim },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  cat: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, width: 104 },
  bar: { flex: 1, height: 8, backgroundColor: colors.sunken, borderRadius: 2, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  fill: { height: "100%" },
  pct: { fontFamily: fonts.displayBold, fontSize: 12, color: colors.muted, width: 38, textAlign: "right" },
  pref: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  prefText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
