import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSession } from '../session';
import { useTheme } from '../theme';

const LOGO = require('../../assets/logo.png');

/** Logo do app EDPLAY (ou a imagem cadastrada no painel) */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const t = useTheme();
  const { panel } = useSession();
  const name = 'EDPLAY';
  const box = size === 'lg' ? 64 : 40;

  if (panel?.app.logo_url) {
    return (
      <Image source={{ uri: panel.app.logo_url }} style={{ height: box, width: box * 3.2 }} contentFit="contain" accessibilityLabel={name} />
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Image source={LOGO} style={{ width: box, height: box, borderRadius: box * 0.22 }} contentFit="cover" accessibilityLabel={name} />
      <Text style={{ color: t.text, fontSize: size === 'lg' ? 32 : 20, fontWeight: '800', letterSpacing: 1 }}>{name}</Text>
    </View>
  );
}
