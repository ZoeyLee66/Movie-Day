import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getHomeMovies } from '../../db/database';
import {
  useFonts,
  JockeyOne_400Regular,
} from '@expo-google-fonts/jockey-one';
import { Ionicons } from '@expo/vector-icons';

let cachedHomeScrollOffset = 0;

const defaultAll = require('../../assets/images/icons/defaultAll.png');
const defaultGenre = require('../../assets/images/icons/defaultGenre.png');
const defaultSort = require('../../assets/images/icons/defaultSort.png');
const defaultStar = require('../../assets/images/icons/defaultStar.png');
const defaultUser = require('../../assets/images/icons/defaultUser.png');

const disneyGenre = require('../../assets/images/icons/disneyGenre.png');
const disneySort = require('../../assets/images/icons/disneySort.png');
const disneyStar = require('../../assets/images/icons/disneyStar.png');
const disneyUser = require('../../assets/images/icons/disneyUser.png');

const netflixGenre = require('../../assets/images/icons/netflixGenre.png');
const netflixSort = require('../../assets/images/icons/netflixSort.png');
const netflixStar = require('../../assets/images/icons/netflixStar.png');
const netflixUser = require('../../assets/images/icons/netflixUser.png');

const selectedDisneyLogo = require('../../assets/images/icons/selectedDisneyLogo.png');
const selectedNetflixLogo = require('../../assets/images/icons/selectedNetflixLogo.png');
const selectedDefaultAll = require('../../assets/images/icons/selectedDefaultAll.png');

type Provider = 'defaultAll' | 'Disney+' | 'Netflix';
type SortOption = 'random' | 'predicted' | 'average';

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
  defaultAll: '#FFFFFF',
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

function getUserIcon(provider: Provider) {
  if (provider === 'Disney+') return disneyUser;
  if (provider === 'Netflix') return netflixUser;
  return defaultUser;
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

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    JockeyOne_400Regular,
  });

  const params = useLocalSearchParams();
  const providerParam = params.provider;

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('defaultAll');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedSort, setSelectedSort] = useState<SortOption>('random');

  const [genreModalVisible, setGenreModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [providerMenuVisible, setProviderMenuVisible] = useState(false);

  const flatListRef = useRef<FlatList<Movie>>(null);
  const currentScrollOffsetRef = useRef(0);
  const shouldResetScrollRef = useRef(false);

  const updateScrollOffset = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    currentScrollOffsetRef.current = offsetY;
    cachedHomeScrollOffset = offsetY;
  };

  useEffect(() => {
    if (
      providerParam === 'defaultAll' ||
      providerParam === 'Disney+' ||
      providerParam === 'Netflix'
    ) {
      setSelectedProvider(providerParam);
      setProviderMenuVisible(false);
    }
  }, [providerParam]);

  const providerColor = getProviderColor(selectedProvider);

  const providerOptions: {
    key: Provider;
    label: string;
    icon: any;
  }[] = [
      { key: 'Netflix', label: 'Netflix', icon: selectedNetflixLogo },
      { key: 'Disney+', label: 'Disney+', icon: selectedDisneyLogo },
      { key: 'defaultAll', label: 'ALL', icon: selectedDefaultAll },
    ];

  const loadMovies = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getHomeMovies();
      const safeRows = rows ?? [];
      setMovies(safeRows);
      return safeRows;
    } catch (error) {
      console.error('Failed to load home movies:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const restoreAfterLoad = async () => {
        setProviderMenuVisible(false);
        await loadMovies();

        if (cancelled) return;

        const timer = setTimeout(() => {
          if (!flatListRef.current) return;

          if (shouldResetScrollRef.current) {
            flatListRef.current.scrollToOffset({
              offset: 0,
              animated: false,
            });
            currentScrollOffsetRef.current = 0;
            cachedHomeScrollOffset = 0;
            shouldResetScrollRef.current = false;
            return;
          }

          if (cachedHomeScrollOffset > 0) {
            flatListRef.current.scrollToOffset({
              offset: cachedHomeScrollOffset,
              animated: false,
            });
            currentScrollOffsetRef.current = cachedHomeScrollOffset;
          }
        }, 0);

        return () => clearTimeout(timer);
      };

      restoreAfterLoad();

      return () => {
        cancelled = true;
        cachedHomeScrollOffset = currentScrollOffsetRef.current;
      };
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
    setProviderMenuVisible(false);
    router.push({
      pathname: '/movie/[id]',
      params: {
        id: String(movieId),
        source: 'home',
        provider: selectedProvider,
      },
    });
  };

  const renderRatingRow = (movie: Movie) => {
    const userRating = normalizeNumber(movie.user_rating);
    const predictedRating = normalizeNumber(movie.predicted_rating);
    const avgRating = normalizeNumber(movie.avg_rating);

    const ratedColor = selectedProvider === 'defaultAll' ? '#FFD54A' : providerColor;
    const isRated = userRating !== null;

    if (isRated) {
      return (
        <View style={styles.ratingRow}>
          <Text style={[styles.ratingPrefix, { color: ratedColor }]}>rated</Text>
          <Image source={getStarIcon(selectedProvider)} style={styles.ratingStar} />
          <Text style={[styles.ratingValue, { color: ratedColor }]}>
            {userRating.toFixed(1)}
          </Text>
          <Text style={[styles.avgText, { color: ratedColor }]}>
            (avg. {avgRating !== null ? avgRating.toFixed(1) : '-'})
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

  if (!fontsLoaded) return null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const otherProviderOptions = providerOptions.filter(
    (option) => option.key !== selectedProvider
  );

  return (
    <View style={styles.container}>
      {providerMenuVisible && (
        <Pressable
          style={styles.providerMenuOverlay}
          onPress={() => setProviderMenuVisible(false)}
        />
      )}

      <Text
        style={[
          styles.logo,
          { color: providerColor, fontFamily: 'JockeyOne_400Regular' },
        ]}
      >
        MOVIE DAY
      </Text>

      <View style={styles.searchWrapper}>
        <TextInput
          value={searchText}
          onChangeText={(text) => {
            setProviderMenuVisible(false);
            setSearchText(text);
          }}
          placeholder="Search for movie title"
          placeholderTextColor="#9A9A9A"
          style={styles.searchInput}
          onFocus={() => setProviderMenuVisible(false)}
        />

        {searchText.trim().length > 0 && (
          <Pressable onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={16} style={[{color: providerColor}]} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={styles.filterItem}
          onPress={() => {
            setProviderMenuVisible(false);
            setGenreModalVisible(true);
          }}
        >
          <Image source={getGenreIcon(selectedProvider)} style={styles.filterIcon} />
          <Text style={styles.filterText}>select genre</Text>
        </Pressable>

        <Pressable
          style={styles.filterItem}
          onPress={() => {
            setProviderMenuVisible(false);
            setSortModalVisible(true);
          }}
        >
          <Image source={getSortIcon(selectedProvider)} style={styles.filterIcon} />
          <Text style={styles.filterText}>sorting option</Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredMovies}
        keyExtractor={(item) => String(item.movie_id)}
        renderItem={renderMovieCard}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={updateScrollOffset}
        onScrollEndDrag={updateScrollOffset}
        onMomentumScrollEnd={updateScrollOffset}
        scrollEventThrottle={16}
      />

      <View pointerEvents="box-none" style={styles.bottomFloatingArea}>
        <View style={styles.leftControlSlot}>
          <Pressable
            style={[
              styles.providerPill,
              providerMenuVisible && styles.providerPillExpanded,
            ]}
            onPress={() => setProviderMenuVisible((prev) => !prev)}
          >
            {providerMenuVisible && (
              <View style={styles.providerOptionsContainer}>
                {otherProviderOptions.map((option, index) => {
                  const isFirstOption = index === 0;
                  const isLastOption = index === otherProviderOptions.length - 1;

                  return (
                    <Pressable
                      key={option.key}
                      style={[
                        styles.providerOptionSlot,
                        isFirstOption && styles.providerOptionSlotFirst,
                        isLastOption && styles.providerOptionSlotLast,
                      ]}
                      onPress={() => {
                        shouldResetScrollRef.current = true;
                        setSelectedProvider(option.key);
                        setProviderMenuVisible(false);
                      }}
                    >
                      <Image
                        source={option.icon}
                        style={styles.providerOptionIcon}
                        resizeMode="contain"
                      />
                      <Text style={styles.providerOptionText}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.providerOptionSlotSelected}>
              <Image
                source={getSelectedProviderLogo(selectedProvider)}
                style={styles.providerCircleLogo}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/user-page',
              params: {
                provider: selectedProvider,
              },
            })
          }
          style={({ pressed }) => [
            styles.profileCircle,
            pressed && styles.profileCirclePressed,
          ]}
        >
          <Image
            source={getUserIcon(selectedProvider)}
            style={styles.profileIcon}
            resizeMode="contain"
          />
        </Pressable>
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
            <Pressable
              style={styles.dragArea}
              onPress={() => setGenreModalVisible(false)}
            >
              <View style={styles.dragHandle} />
            </Pressable>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
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
            </ScrollView>
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
            <Pressable
              style={styles.dragArea}
              onPress={() => setSortModalVisible(false)}
            >
              <View style={styles.dragHandle} />
            </Pressable>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {[
                {
                  label: 'Random',
                  value: 'random' as SortOption,
                },
                {
                  label: 'Predicted rating: High to low',
                  value: 'predicted' as SortOption,
                },
                {
                  label: 'Average rating: High to low',
                  value: 'average' as SortOption,
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
            </ScrollView>
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
    color: '#FFFFFF',
    fontSize: 55,
    textAlign: 'center',
    lineHeight: 55,
    marginBottom: 10,
    marginTop: 55,
  },
  searchWrapper: {
    height: 45,
    width: '88%',
    alignSelf: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
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
    marginBottom: 40,
    paddingHorizontal: 38,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterIcon: {
    width: 15,
    height: 15,
    resizeMode: 'contain',
    marginRight: 4,
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 140,
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
  providerMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  bottomFloatingArea: {
    position: 'absolute',
    left: 25,
    right: 25,
    bottom: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  leftControlSlot: {
    width: 64,
    height: 220,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  providerPill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerPillExpanded: {
    position: 'absolute',
    bottom: 0,
    width: 64,
    height: 220,
    borderRadius: 32,
    backgroundColor: '#1F1F1F',
    borderWidth: 2,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
    alignItems: 'center',
  },
  providerOptionsContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  providerOptionSlot: {
    width: 64,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  providerOptionSlotFirst: {
    marginBottom: 16,
  },
  providerOptionSlotLast: {
    marginBottom: 2,
  },
  providerOptionSlotSelected: {
    position: 'absolute',
    bottom: 0,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerOptionIcon: {
    width: 38,
    height: 38,
    marginBottom: 4,
  },
  providerOptionText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  providerCircleLogo: {
    width: 38,
    height: 38,
  },
  profileCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#050505',
    borderWidth: 2,
    borderColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCirclePressed: {
    backgroundColor: '#1F1F1F',
  },
  profileIcon: {
    width: 38,
    height: 38,
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
    paddingHorizontal: 24,
    paddingBottom: 24,
    maxHeight: '68%',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingBottom: 8,
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