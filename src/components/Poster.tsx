import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Focusable } from './ui';
import { useTheme } from '../theme';

/** Capa de filme/série (proporção 2:3) */
export const Poster = memo(function Poster({
  title,
  image,
  width,
  subtitle,
  progress,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
}: {
  title: string;
  image?: string;
  width: number;
  subtitle?: string;
  progress?: number; // 0..1
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={{ width, borderRadius: 12, overflow: 'hidden', backgroundColor: t.surface }}
    >
      <View style={{ width: '100%', aspectRatio: 2 / 3, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} recyclingKey={image} />
        ) : (
          <Text style={{ color: t.muted, fontSize: 28 }}>🎬</Text>
        )}
        {progress != null && progress > 0 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: '#0008' }}>
            <View style={{ width: `${Math.min(100, progress * 100)}%`, height: 4, backgroundColor: t.primary }} />
          </View>
        ) : null}
      </View>
      <View style={{ padding: 8 }}>
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 13, fontWeight: '600', minHeight: 34 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Focusable>
  );
});
