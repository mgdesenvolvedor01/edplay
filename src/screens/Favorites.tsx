import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Poster } from '../components/Poster';
import { Muted, Screen, TopBar, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useXtream } from '../session';
import { Favorite, loadFavorites, toggleFavorite } from '../storage';

export default function FavoritesScreen({ navigation }: ScreenProps<'Favorites'>) {
  const x = useXtream();
  const { width, wide, cols: c } = useLayout();
  const [favs, setFavs] = useState<Favorite[] | null>(null);

  useFocusEffect(useCallback(() => void loadFavorites().then(setFavs), []));

  const cols = wide ? Math.max(5, Math.floor((width - 48) / 165)) : c;
  const gap = 12;
  const w = Math.floor((width - (wide ? 48 : 24) - gap * (cols - 1)) / cols);
  const label = { live: 'Canal', movie: 'Filme', series: 'Série' } as const;

  const open = (f: Favorite) => {
    if (f.kind === 'live') {
      const lives = (favs || []).filter((v) => v.kind === 'live');
      navigation.navigate('Player', { kind: 'live', id: f.id, title: f.name, icon: f.icon, url: x.liveUrl(f.id), channels: lives.map((v) => ({ id: v.id, name: v.name, icon: v.icon })) });
    } else if (f.kind === 'movie') navigation.navigate('MovieDetail', { id: f.id, name: f.name, icon: f.icon });
    else navigation.navigate('SeriesDetail', { id: f.id, name: f.name, cover: f.icon });
  };

  return (
    <Screen padded={false} style={{ padding: wide ? 24 : 12 }}>
      <TopBar title="Favoritos" onBack={() => navigation.goBack()} />
      {favs && !favs.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Muted style={{ textAlign: 'center', maxWidth: 420 }}>Você ainda não tem favoritos. Nas listas, segure o dedo (ou o botão OK do controle) sobre um canal, filme ou série para favoritar.</Muted>
        </View>
      ) : (
        <FlatList
          key={cols}
          data={favs || []}
          numColumns={cols}
          keyExtractor={(f) => f.kind + f.id}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{ gap, paddingBottom: 30 }}
          renderItem={({ item, index }) => (
            <Poster
              width={w}
              title={item.name}
              image={item.icon}
              subtitle={label[item.kind] + ' · segure para remover'}
              hasTVPreferredFocus={index === 0}
              onPress={() => open(item)}
              onLongPress={async () => setFavs(await toggleFavorite(item))}
            />
          )}
        />
      )}
    </Screen>
  );
}
