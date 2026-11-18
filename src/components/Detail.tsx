import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Muted, Screen, TopBar, useLayout } from './ui';
import { useTheme } from '../theme';

/** Moldura das telas de detalhes (filme / série): fundo, capa e textos */
export function DetailLayout({
  title,
  poster,
  backdrop,
  meta,
  plot,
  extra,
  actions,
  children,
  onBack,
}: {
  title: string;
  poster?: string;
  backdrop?: string;
  meta: (string | undefined | null)[];
  plot?: string;
  extra?: (string | undefined | null)[];
  actions: React.ReactNode;
  children?: React.ReactNode;
  onBack: () => void;
}) {
  const t = useTheme();
  const { wide } = useLayout();
  const bg = backdrop || poster;
  return (
    <Screen padded={false}>
      {bg ? <Image source={{ uri: bg }} style={[StyleSheet.absoluteFillObject, { opacity: 0.22 }]} contentFit="cover" /> : null}
      <LinearGradient colors={['transparent', t.bg]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ padding: wide ? 32 : 16, gap: 20 }}>
        <TopBar title="" onBack={onBack} />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: wide ? 'flex-start' : 'center' }}>
          <View style={{ width: wide ? 230 : 170, aspectRatio: 2 / 3, borderRadius: 14, overflow: 'hidden', backgroundColor: t.surface2 }}>
            {poster ? <Image source={{ uri: poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
          </View>
          <View style={{ flex: wide ? 1 : undefined, gap: 10, width: wide ? undefined : '100%' }}>
            <Text style={{ color: t.text, fontSize: wide ? 34 : 24, fontWeight: '800' }}>{title}</Text>
            <Muted>{meta.filter(Boolean).join('  ·  ')}</Muted>
            {plot ? <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, maxWidth: 820 }}>{plot}</Text> : null}
            {extra?.filter(Boolean).map((e, i) => (
              <Muted key={i} numberOfLines={2}>
                {e}
              </Muted>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>{actions}</View>
          </View>
        </View>
        {children}
      </ScrollView>
    </Screen>
  );
}
