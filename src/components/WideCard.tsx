import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Focusable } from './ui';
import { useTheme } from '../theme';

/** Card deitado (16:9) com imagem, título, linha de detalhes e barra de progresso */
export const WideCard = memo(function WideCard({
  title,
  image,
  subtitle,
  rating,
  progress,
  width,
  onPress,
  hasTVPreferredFocus,
}: {
  title: string;
  image?: string;
  subtitle?: string;
  rating?: number;
  progress?: number;
  width: number;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <Focusable
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={{ width, aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: t.surface2 }}
      focusStyle={{ borderColor: t.primary, borderWidth: 3 }}
    >
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" recyclingKey={image} cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 30 }}>🎬</Text>
        </View>
      )}
      <LinearGradient colors={['transparent', '#000000E6']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingTop: 30, paddingBottom: progress ? 12 : 8 }}>
        <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
          {title}
        </Text>
        {subtitle || rating ? (
          <Text numberOfLines={1} style={{ color: '#ddd', fontSize: 10.5, marginTop: 1 }}>
            {rating ? <Text style={{ color: '#FACC15' }}>★ </Text> : null}
            {[rating ? rating.toFixed(1) : null, subtitle].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </LinearGradient>
      {progress != null && progress > 0 ? (
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: 5, height: 4, borderRadius: 2, backgroundColor: '#ffffff33' }}>
          <View style={{ width: `${Math.min(100, progress * 100)}%`, height: 4, borderRadius: 2, backgroundColor: t.primary }} />
        </View>
      ) : null}
    </Focusable>
  );
});
