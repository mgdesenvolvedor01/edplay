import React, { memo } from 'react';
import { FlatList, Text } from 'react-native';
import { Focusable } from './ui';
import { useTheme } from '../theme';

export type Cat = { id: string; name: string; adult?: boolean };

/** Lista de categorias: vertical (TV/tela larga) ou em "chips" horizontais (celular) */
export const CategoryList = memo(function CategoryList({
  cats,
  selected,
  onSelect,
  vertical,
  lock,
}: {
  cats: Cat[];
  selected: string;
  onSelect: (id: string) => void;
  vertical: boolean;
  /** true = categorias adultas aparecem com cadeado */
  lock?: boolean;
}) {
  const t = useTheme();
  return (
    <FlatList
      data={cats}
      horizontal={!vertical}
      keyExtractor={(c) => c.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={vertical ? { gap: 4, paddingBottom: 20 } : { gap: 8, paddingBottom: 10 }}
      style={vertical ? { width: 250, flexGrow: 0 } : { flexGrow: 0 }}
      initialNumToRender={20}
      extraData={lock}
      renderItem={({ item }) => {
        const on = item.id === selected;
        return (
          <Focusable
            onPress={() => onSelect(item.id)}
            onFocus={vertical && !(item.adult && lock) ? () => onSelect(item.id) : undefined}
            hasTVPreferredFocus={vertical && on}
            style={{
              backgroundColor: on ? t.primary + '33' : vertical ? 'transparent' : t.surface,
              borderRadius: vertical ? 10 : 99,
              paddingVertical: vertical ? 11 : 8,
              paddingHorizontal: 14,
            }}
          >
            <Text numberOfLines={1} style={{ color: on ? '#fff' : t.text, fontWeight: on ? '700' : '500', fontSize: 14 }}>
              {item.adult && lock ? '🔒 ' : ''}
              {item.name}
            </Text>
          </Focusable>
        );
      }}
    />
  );
});
