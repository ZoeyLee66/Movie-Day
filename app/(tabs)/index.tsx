import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Modal,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { getHomeMovies } from '../../db/database';

const defaultAll = require('../../assets/images/icons/defaultAll.png');
const defaultGenre = require('../../assets/images/icons/defaultGenre.png');
const defaultSort = require('../../assets/images/icons/defaultSort.png');
const defaultStar = require('../../assets/images/icons/defaultStar.png');

const disneyGenre = require('../../assets/images/icons/disneyGenre.png');
const disneySort = require('../../assets/images/icons/disneySort.png');
const disneyStar = require('../../assets/images/icons/disneyStar.png');

const netflixGenre = require('../../assets/images/icons/netflixGenre.png');
const netflixSort = require('../../assets/images/icons/netflixSort.png');
const netflixStar = require('../../assets/images/icons/netflixStar.png');

const selectedDisneyLogo = require('../../assets/images/icons/selectedDisneyLogo.png');
const selectedNetflixLogo = require('../../assets/images/icons/selectedNetflixLogo.png');
const selectedDefaultAll = require('../../assets/images/icons/selectedDefaultAll.png');

type Provider = 'defaultAll' | 'Disney+' | 'Netflix';
type SortOption = 'predicted' | 'average' | 'random';

type Movie = {
  movie_id: number;
  tmdb_id: number;
  title: string;
  release_year: number;
  genres: string;
  overview: string;
  keywords: string;
  cast: string;
  director: string;
  avg_rating: number | null;
  rating_count: number;
  poster_url: string;
  ca_netflix: number;
  ca_disney_plus: number;
  user_rating?: number | null;
  predicted_rating?: number | null;
};

const PROVIDER_COLOR = {
  defaultAll: '#FFCB2B',
  'Disney+': '#006E99',
  Netflix: '#BA0C0C',
};

const randomOrderMap = new Map<number, number>();

function getRandomValue(movieId: number) {
  if (!randomOrderMap.has(movieId)) {
    randomOrderMap.set(movieId, Math.random());
  }
  return randomOrderMap.get(movieId)!;
}

function getProviderColor(provider: Provider) {
  return PROVIDER_COLOR[provider];
}

function getGenreIcon(provider: Provider) {
  if (provider === 'Disney+') return disneyGenre;
  if (provider === 'Netflix') return netflixGenre;
  return defaultGenre;
}

function getSortIcon(provider: Provider) {
  if (provider === 'Disney+') return disneySort;
  if (provider === 'Netflix') return netflixSort;
  return defaultSort;
}

function getStarIcon(provider: Provider) {
  if (provider === 'Disney+') return disneyStar;
  if (provider === 'Netflix') return netflixStar;
  return defaultStar;
}

function getSelectedProviderLogo(provider: Provider) {
  if (provider === 'Disney+') return selectedDisneyLogo;
  if (provider === 'Netflix') return selectedNetflixLogo;
  return selectedDefaultAll;
}

function splitGenres(genres: string) {
  if (!genres) return [];
  return genres
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean);
}

function normalizeNumber(value: any) {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function hasSelectedProvider(movie: Movie, provider: Provider) {
  if (provider === 'defaultAll') return true;
  if (provider === 'Disney+') return Number(movie.ca_disney_plus) === 1;
  if (provider === 'Netflix') return Number(movie.ca_netflix) === 1;
  return true;
}

function sortMovies(movies: Movie[], sortOption: SortOption) {
  const copied = [...movies];

  if (sortOption === 'predicted') {
    copied.sort((a, b) => {
      const aValue = normalizeNumber(a.predicted_rating) ?? -1;
      const bValue = normalizeNumber(b.predicted_rating) ?? -1;
      return bValue - aValue;
    });
    return copied;
  }

  if (sortOption === 'average') {
    copied.sort((a, b) => {
      const aValue = normalizeNumber(a.avg_rating) ?? -1;
      const bValue = normalizeNumber(b.avg_rating) ?? -1;
      return bValue - aValue;
    });
    return copied;
  }

  copied.sort((a, b) => getRandomValue(a.movie_id) - getRandomValue(b.movie_id));
  return copied;
}

function DragHandle({ onClose }: { onClose: () => void }) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dy) > 8;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 60) {
            onClose();
          }
        },
      }),
    [onClose]
  );

  return (
    <View {...panResponder.panHandlers} style={styles.dragArea}>
      <View style={styles.dragHandle} />
    </View>
  );
}

export default function HomeScreen() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('defaultAll');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedSort, setSelectedSort] = useState<SortOption>('random');

  const [genreModalVisible, setGenreModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  const providerColor = getProviderColor(selectedProvider);

  const loadMovies = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getHomeMovies();
      setMovies(rows ?? []);
    } catch (error) {
      console.error('Failed to load home movies:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  useFocusEffect(
    useCallback(() => {
      loadMovies();
    }, [loadMovies])
  );

  const genreOptions = useMemo(() => {
    const genreSet = new Set<string>();

    movies
      .filter((movie) => hasSelectedProvider(movie, selectedProvider))
      .forEach((movie) => {
        splitGenres(movie.genres).forEach((genre) => genreSet.add(genre));
      });

    return ['ALL', ...Array.from(genreSet).sort((a, b) => a.localeCompare(b))];
  }, [movies, selectedProvider]);

  useEffect(() => {
    if (!genreOptions.includes(selectedGenre)) {
      setSelectedGenre('ALL');
    }
  }, [genreOptions, selectedGenre]);

  const filteredMovies = useMemo(() => {
    const trimmedSearch = searchText.trim().toLowerCase();
    const isSearching = trimmedSearch.length > 0;

    let result = [...movies];

    result = result.filter((movie) => hasSelectedProvider(movie, selectedProvider));

    if (selectedGenre !== 'ALL') {
      result = result.filter((movie) =>
        splitGenres(movie.genres).includes(selectedGenre)
      );
    }

    if (isSearching) {
      result = result.filter((movie) =>
        movie.title.toLowerCase().includes(trimmedSearch)
      );
    } else {
      result = result.filter((movie) => movie.user_rating == null);
    }

    return sortMovies(result, selectedSort);
  }, [movies, searchText, selectedProvider, selectedGenre, selectedSort]);

  const handlePressMovie = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  const renderRatingRow = (movie: Movie) => {
    const userRating = normalizeNumber(movie.user_rating);
    const predictedRating = normalizeNumber(movie.predicted_rating);
    const avgRating = normalizeNumber(movie.avg_rating);

    const isRated = userRating !== null;

    if (isRated) {
      return (
        <View style={styles.ratingRow}>
          <Text style={[styles.ratingPrefix, { color: providerColor }]}>rated</Text>
          <Image source={getStarIcon(selectedProvider)} style={styles.ratingStar} />
          <Text style={[styles.ratingValue, { color: providerColor }]}>
            {userRating.toFixed(1)}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingPrefix}>expected</Text>
        <Image source={getStarIcon(selectedProvider)} style={styles.ratingStar} />
        <Text style={styles.ratingValue}>
          {predictedRating !== null ? predictedRating.toFixed(1) : '-'}
        </Text>
        <Text style={styles.avgText}>
          (avg. {avgRating !== null ? avgRating.toFixed(1) : '-'})
        </Text>
      </View>
    );
  };

  const renderMovieCard = ({ item }: { item: Movie }) => (
    <Pressable style={styles.card} onPress={() => handlePressMovie(item.movie_id)}>
      <Image
        source={{ uri: item.poster_url }}
        resizeMode="cover"
        style={styles.poster}
      />
      <Text style={styles.movieTitle} numberOfLines={1}>
        {item.title}
      </Text>
      {renderRatingRow(item)}
    </Pressable>
  );

  const sortLabel =
    selectedSort === 'predicted'
      ? 'Predicted rating: High to low'
      : selectedSort === 'average'
        ? 'Average rating: High to low'
        : 'Random';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.logo, { color: providerColor }]}>MOVIE DAY</Text>

      <View style={styles.searchWrapper}>
        <Ionicons
          name="search"
          size={14}
          color="#8E8E93"
          style={styles.searchIcon}
        />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search for movie title"
          placeholderTextColor="#9A9A9A"
          style={styles.searchInput}
        />
        {searchText.trim().length > 0 && (
          <Pressable onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={16} color="#8E8E93" />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={styles.filterItem}
          onPress={() => setGenreModalVisible(true)}
        >
          <Image source={getGenreIcon(selectedProvider)} style={styles.filterIcon} />
          <Text style={styles.filterText}>select genre</Text>
        </Pressable>

        <Pressable
          style={styles.filterItem}
          onPress={() => setSortModalVisible(true)}
        >
          <Image source={getSortIcon(selectedProvider)} style={styles.filterIcon} />
          <Text style={styles.filterText}>sorting option</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredMovies}
        keyExtractor={(item) => String(item.movie_id)}
        renderItem={renderMovieCard}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.bottomFloatingArea}>
        <Pressable
          style={styles.providerCircle}
          onPress={() => {
            if (selectedProvider === 'defaultAll') {
              setSelectedProvider('Disney+');
            } else if (selectedProvider === 'Disney+') {
              setSelectedProvider('Netflix');
            } else {
              setSelectedProvider('defaultAll');
            }
          }}
        >
          <Image
            source={getSelectedProviderLogo(selectedProvider)}
            style={styles.providerCircleLogo}
            resizeMode="contain"
          />
        </Pressable>

        <View style={styles.profileCircle}>
          <Ionicons name="person-outline" size={28} color={providerColor} />
        </View>
      </View>

      <Modal
        visible={genreModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGenreModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalTopArea}
            onPress={() => setGenreModalVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <DragHandle onClose={() => setGenreModalVisible(false)} />

            {genreOptions.map((genre, index) => {
              const isSelected = genre === selectedGenre;
              const isLast = index === genreOptions.length - 1;

              return (
                <Pressable
                  key={genre}
                  style={[
                    styles.sheetOption,
                    !isLast && styles.sheetOptionBorder,
                  ]}
                  onPress={() => {
                    setSelectedGenre(genre);
                    setGenreModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      isSelected && {
                        color: providerColor,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {genre}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal
        visible={sortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalTopArea}
            onPress={() => setSortModalVisible(false)}
          />
          <View style={styles.bottomSheet}>
            <DragHandle onClose={() => setSortModalVisible(false)} />

            {[
              {
                label: 'Predicted rating: High to low',
                value: 'predicted' as SortOption,
              },
              {
                label: 'Average rating: High to low',
                value: 'average' as SortOption,
              },
              {
                label: 'Random',
                value: 'random' as SortOption,
              },
            ].map((option, index, array) => {
              const isSelected = option.value === selectedSort;
              const isLast = index === array.length - 1;

              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.sheetOption,
                    !isLast && styles.sheetOptionBorder,
                  ]}
                  onPress={() => {
                    setSelectedSort(option.value);
                    setSortModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      isSelected && {
                        color: providerColor,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 42,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 38,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 18,
  },
  searchWrapper: {
    height: 36,
    backgroundColor: '#EAEAEA',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: '#1F1F1F',
    fontSize: 12,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 18,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterIcon: {
    width: 13,
    height: 13,
    resizeMode: 'contain',
    marginRight: 4,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  card: {
    width: '30.5%',
  },
  poster: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
  },
  movieTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  ratingPrefix: {
    color: '#C6C6C6',
    fontSize: 7,
  },
  ratingStar: {
    width: 9,
    height: 9,
    resizeMode: 'contain',
    marginHorizontal: 1,
  },
  ratingValue: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
  },
  avgText: {
    color: '#A5A5A5',
    fontSize: 7,
  },
  bottomFloatingArea: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  providerCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerCircleLogo: {
    width: 38,
    height: 38,
  },
  profileCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'flex-end',
  },
  modalTopArea: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#1F1F21',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 14,
  },
  dragHandle: {
    width: 58,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#F1F1F1',
  },
  sheetOption: {
    minHeight: 68,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#676767',
  },
  sheetOptionText: {
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
  },
});