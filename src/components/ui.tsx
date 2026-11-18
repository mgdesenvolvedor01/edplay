import React, { forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import * as Device from 'expo-device';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/** Tela larga (TV, tablet, celular deitado) usa layout com barra lateral */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 820 && width > height;
  const cols = wide ? Math.max(4, Math.floor((width - 300) / 170)) : Math.max(3, Math.floor(width / 125));
  // celular de verdade: o Android diz que é PHONE e a tela é pequena. TV, tablet e aparelho
  // desconhecido NUNCA contam como celular (o menu lateral fica sempre visível neles).
  const phone = Device.deviceType === Device.DeviceType.PHONE && Math.min(width, height) < 600;
  return { width, height, wide, cols, phone };
}

type FocusableProps = PressableProps & {
  style?: StyleProp<ViewStyle> | ((s: { focused: boolean; pressed: boolean }) => StyleProp<ViewStyle>);
  focusStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((s: { focused: boolean }) => React.ReactNode);
  hasTVPreferredFocus?: boolean;
};

/**
 * Botão que funciona com toque e com o controle remoto (D-pad).
 * Mostra uma borda colorida quando está em foco.
 */
export const Focusable = forwardRef<View, FocusableProps>(function Focusable(
  { style, focusStyle, children, onFocus, onBlur, ...rest },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      focusable
      android_ripple={{ color: t.primary + '33' }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={({ pressed }) => [
        { borderWidth: 2, borderColor: 'transparent' },
        typeof style === 'function' ? style({ focused, pressed }) : style,
        focused && [{ borderColor: t.primary, borderWidth: 2, transform: [{ scale: 1.03 }] }, focusStyle],
        pressed && { opacity: 0.8 },
      ]}
      {...rest}
    >
      {typeof children === 'function' ? children({ focused }) : children}
    </Pressable>
  );
});

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  hasTVPreferredFocus,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : t.surface2;
  const color = variant === 'danger' ? t.bad : '#fff';
  return (
    <Focusable
      onPress={onPress}
      disabled={disabled || loading}
      hasTVPreferredFocus={hasTVPreferredFocus}
      focusStyle={{ borderColor: variant === 'primary' ? '#fff' : t.primary }}
      style={[s.btn, { backgroundColor: bg, borderColor: variant === 'primary' ? bg : t.line, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[s.btnText, { color }]}>
          {icon ? icon + '  ' : ''}
          {title}
        </Text>
      )}
    </Focusable>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { label?: string }>(function Input({ label, style, onFocus, onBlur, ...rest }, ref) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          s.input,
          { color: t.text, backgroundColor: t.bg, borderColor: focused ? t.primary : t.line },
          style,
        ]}
        {...rest}
      />
    </View>
  );
});

export function Screen({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: t.bg }, padded && { padding: 16 }, style]} edges={['top', 'bottom', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function Loading({ text }: { text?: string }) {
  const t = useTheme();
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={t.primary} />
      {text ? <Text style={{ color: t.muted, marginTop: 12 }}>{text}</Text> : null}
    </View>
  );
}

export function Message({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[s.center, { padding: 24 }]}>
      <Text style={[s.h1, { color: t.text, textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={{ color: t.muted, textAlign: 'center', marginTop: 8, maxWidth: 520, lineHeight: 21 }}>{text}</Text> : null}
      <View style={{ marginTop: 20, gap: 10, width: '100%', maxWidth: 360 }}>{children}</View>
    </View>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[s.h1, { color: t.text }, style]}>{children}</Text>;
}

export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: t.muted, fontSize: 14 }, style]}>
      {children}
    </Text>
  );
}

/** Barra superior com botão de voltar */
export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={s.top}>
      {onBack ? (
        <Focusable onPress={onBack} style={[s.back, { backgroundColor: t.surface2, borderColor: t.line }]}>
          <Text style={{ color: t.text, fontSize: 18 }}>‹</Text>
        </Focusable>
      ) : null}
      <Text numberOfLines={1} style={[s.h1, { color: t.text, flex: 1, fontSize: 20 }]}>
        {title}
      </Text>
      {right}
    </View>
  );
}

export const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 24, fontWeight: '700' },
  btn: { minHeight: 48, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  btnText: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  back: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
