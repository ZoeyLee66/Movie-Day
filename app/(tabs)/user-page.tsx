import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
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
import { getHomeMovies, getWantToWatchMovies } from '../../db/database';
import {
    useFonts,
    JockeyOne_400Regular,
} from '@expo-google-fonts/jockey-one';

let cachedUserWantScrollOffset = 0;
let cachedUserRatedScrollOffset = 0;

const defaultGenre = require('../../assets/images/icons/defaultGenre.png');
const defaultSort = require('../../assets/images/icons/defaultSort.png');
const defaultStar = require('../../assets/images/icons/defaultStar.png');
const selectedDefault = require('../../assets/images/icons/selectedDefault.png');

const disneyGenre = require('../../assets/images/icons/disneyGenre.png');
const disneySort = require('../../assets/images/icons/disneySort.png');
const disneyStar = require('../../assets/images/icons/disneyStar.png');
const selectedDisney = require('../../assets/images/icons/selectedDisney.png');

const netflixGenre = require('../../assets/images/icons/netflixGenre.png');
const netflixSort = require('../../assets/images/icons/netflixSort.png');
const netflixStar = require('../../assets/images/icons/netflixStar.png');
const selectedNetflix = require('../../assets/images/icons/selectedNetflix.png');

const disneyLogo = require('../../assets/images/icons/disneyLogo.png');
const netflixLogo = require('../../assets/images/icons/netflixLogo.png');
const defaultAllLogo = require('../../assets/images/icons/defaultAll.png');

const flatListRef = useRef<FlatList<Movie>>(null);
const currentScrollOffsetRef = useRef(0);

type Provider = 'defaultAll' | 'Disney+' | 'Netflix';
type SortOption = 'predicted' | 'average' | 'random';
type ViewMode = 'want' | 'rated';

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
    is_saved?: number;
};

const UI_COLOR = {
    defaultAll: '#FFFFFF',
    'Disney+': '#006E99',
    Netflix: '#BA0C0C',
};

const RATED_COLOR = {
    defaultAll: '#FFD54A',
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

function getUiColor(provider: Provider) {
    return UI_COLOR[provider];
}

function getRatedColor(provider: Provider) {
    return RATED_COLOR[provider];
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

function getUserIcon(provider: Provider) {
    if (provider === 'Disney+') return selectedDisney;
    if (provider === 'Netflix') return selectedNetflix;
    return selectedDefault;
}

function getSelectedProviderLogo(provider: Provider) {
    if (provider === 'Disney+') return disneyLogo;
    if (provider === 'Netflix') return netflixLogo;
    return defaultAllLogo;
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

export default function UserPageScreen() {
    const [fontsLoaded] = useFonts({
        JockeyOne_400Regular,
    });

    const updateScrollOffset = (
        event: NativeSyntheticEvent<NativeScrollEvent>
    ) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        currentScrollOffsetRef.current = offsetY;

        if (viewMode === 'want') {
            cachedUserWantScrollOffset = offsetY;
        } else {
            cachedUserRatedScrollOffset = offsetY;
        }
    };
    
    const [providerMenuVisible, setProviderMenuVisible] = useState(false);

    const params = useLocalSearchParams();
    const providerParam = params.provider;

    const selectedProvider: Provider =
        providerParam === 'Netflix' || providerParam === 'Disney+'
            ? providerParam
            : 'defaultAll';

    const uiColor = getUiColor(selectedProvider);
    const ratedColor = getRatedColor(selectedProvider);

    const providerOptions: {
        key: Provider;
        label: string;
        icon: any;
    }[] = [
            { key: 'Netflix', label: 'Netflix', icon: netflixLogo },
            { key: 'Disney+', label: 'Disney+', icon: disneyLogo },
            { key: 'defaultAll', label: 'ALL', icon: defaultAllLogo },
        ];

    const otherProviderOptions = providerOptions.filter(
        (option) => option.key !== selectedProvider
    );

    const [viewMode, setViewMode] = useState<ViewMode>('want');
    const [wantMovies, setWantMovies] = useState<Movie[]>([]);
    const [ratedMovies, setRatedMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedGenre, setSelectedGenre] = useState('ALL');
    const [selectedSort, setSelectedSort] = useState<SortOption>('random');

    const [genreModalVisible, setGenreModalVisible] = useState(false);
    const [sortModalVisible, setSortModalVisible] = useState(false);

    const loadMovies = useCallback(async () => {
        try {
            setLoading(true);

            const [wantRows, homeRows] = await Promise.all([
                getWantToWatchMovies(),
                getHomeMovies(),
            ]);

            setWantMovies((wantRows ?? []).filter((movie: Movie) => movie.user_rating == null));
            setRatedMovies((homeRows ?? []).filter((movie: Movie) => movie.user_rating != null));
        } catch (error) {
            console.error('Failed to load user page movies:', error);
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

            const timer = setTimeout(() => {
                const targetOffset =
                    viewMode === 'want'
                        ? cachedUserWantScrollOffset
                        : cachedUserRatedScrollOffset;

                if (flatListRef.current && targetOffset > 0) {
                    flatListRef.current.scrollToOffset({
                        offset: targetOffset,
                        animated: false,
                    });
                    currentScrollOffsetRef.current = targetOffset;
                }
            }, 0);

            return () => {
                clearTimeout(timer);

                if (viewMode === 'want') {
                    cachedUserWantScrollOffset = currentScrollOffsetRef.current;
                } else {
                    cachedUserRatedScrollOffset = currentScrollOffsetRef.current;
                }
            };
        }, [loadMovies, viewMode])
    );

    const baseMovies = viewMode === 'want' ? wantMovies : ratedMovies;

    const genreOptions = useMemo(() => {
        const genreSet = new Set<string>();

        baseMovies.forEach((movie) => {
            splitGenres(movie.genres).forEach((genre) => genreSet.add(genre));
        });

        return ['ALL', ...Array.from(genreSet).sort((a, b) => a.localeCompare(b))];
    }, [baseMovies]);

    useEffect(() => {
        if (!genreOptions.includes(selectedGenre)) {
            setSelectedGenre('ALL');
        }
    }, [genreOptions, selectedGenre]);

    const filteredMovies = useMemo(() => {
        let result = [...baseMovies];

        if (selectedGenre !== 'ALL') {
            result = result.filter((movie) =>
                splitGenres(movie.genres).includes(selectedGenre)
            );
        }

        return sortMovies(result, selectedSort);
    }, [baseMovies, selectedGenre, selectedSort]);

    const handlePressMovie = (movieId: number) => {
        setProviderMenuVisible(false);
        router.push({
            pathname: '/movie/[id]',
            params: {
                id: String(movieId),
                source: 'user-page',
                provider: selectedProvider,
            },
        });
    };

    const renderRatingRow = (movie: Movie) => {
        const userRating = normalizeNumber(movie.user_rating);
        const predictedRating = normalizeNumber(movie.predicted_rating);
        const avgRating = normalizeNumber(movie.avg_rating);

        if (viewMode === 'rated' && userRating !== null) {
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
                <Text style={styles.expectedPrefix}>predicted</Text>
                <Image source={getStarIcon(selectedProvider)} style={styles.ratingStar} />
                <Text style={styles.expectedValue}>
                    {predictedRating !== null ? predictedRating.toFixed(1) : '-'}
                </Text>
                <Text style={styles.expectedAvg}>
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
                <ActivityIndicator size="large" color={uiColor} />
            </View>
        );
    }

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
                    { color: uiColor, fontFamily: 'JockeyOne_400Regular' },
                ]}
            >
                MOVIE DAY
            </Text>

            <View style={[styles.segmentWrapper, { borderColor: uiColor }]}>
                <Pressable
                    style={[
                        styles.segmentButton,
                        viewMode === 'want' && [
                            styles.segmentButtonActive,
                            { backgroundColor: uiColor },
                        ],
                    ]}
                    onPress={() => setViewMode('want')}
                >
                    <Text
                        style={[
                            styles.segmentText,
                            viewMode === 'want'
                                ? styles.segmentTextActive
                                : { color: uiColor },
                        ]}
                    >
                        Want to watch
                    </Text>
                </Pressable>

                <Pressable
                    style={[
                        styles.segmentButton,
                        viewMode === 'rated' && [
                            styles.segmentButtonActive,
                            { backgroundColor: uiColor },
                        ],
                    ]}
                    onPress={() => setViewMode('rated')}
                >
                    <Text
                        style={[
                            styles.segmentText,
                            viewMode === 'rated'
                                ? styles.segmentTextActive
                                : { color: uiColor },
                        ]}
                    >
                        Rated movies
                    </Text>
                </Pressable>
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
                    <Text style={[styles.filterText, { color: uiColor }]}>
                        select genre
                    </Text>
                </Pressable>

                <Pressable
                    style={styles.filterItem}
                    onPress={() => {
                        setProviderMenuVisible(false);
                        setSortModalVisible(true);
                    }}
                >
                    <Image source={getSortIcon(selectedProvider)} style={styles.filterIcon} />
                    <Text style={[styles.filterText, { color: uiColor }]}>
                        sorting option
                    </Text>
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
                    {providerMenuVisible ? (
                        <View style={[styles.providerPill, styles.providerPillExpanded]}>
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
                                                setProviderMenuVisible(false);
                                                router.replace({
                                                    pathname: '/',
                                                    params: {
                                                        provider: option.key,
                                                    },
                                                });
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

                            <Pressable
                                style={styles.providerOptionSlotSelected}
                                onPress={() => {
                                    setProviderMenuVisible(false);
                                    router.replace({
                                        pathname: '/',
                                        params: {
                                            provider: selectedProvider,
                                        },
                                    });
                                }}
                            >
                                <Image
                                    source={getSelectedProviderLogo(selectedProvider)}
                                    style={styles.providerBottomLogo}
                                    resizeMode="contain"
                                />
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable
                            style={styles.providerPill}
                            onPress={() => setProviderMenuVisible(true)}
                        >
                            <View style={styles.providerOptionSlotSelected}>
                                <Image
                                    source={getSelectedProviderLogo(selectedProvider)}
                                    style={styles.providerBottomLogo}
                                    resizeMode="contain"
                                />
                            </View>
                        </Pressable>
                    )}
                </View>

                <Pressable
                    onPress={() => setProviderMenuVisible(false)}
                    style={({ pressed }) => [
                        styles.userButtonShell,
                        pressed && styles.userButtonShellPressed,
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
                                                    color: uiColor,
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
                                                    color: uiColor,
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
        fontSize: 38,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 55,
        marginBottom: 18,
    },
    segmentWrapper: {
        height: 36,
        borderWidth: 2,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 3,
        marginBottom: 12,
        marginHorizontal: 55,
    },
    segmentButton: {
        flex: 1,
        height: '100%',
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    segmentButtonActive: {
        borderRadius: 999,
    },
    segmentText: {
        fontSize: 11,
        fontWeight: '600',
    },
    segmentTextActive: {
        color: '#000000',
        fontSize: 11,
        fontWeight: '600',
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
        fontSize: 11,
    },
    listContent: {
        paddingBottom: 140,
    },
    row: {
        justifyContent: 'flex-start',
        marginBottom: 18,
        gap: 12,
    },
    card: {
        width: '30%',
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
        fontSize: 7,
    },
    ratingStar: {
        width: 9,
        height: 9,
        resizeMode: 'contain',
        marginHorizontal: 1,
    },
    ratingValue: {
        fontSize: 7,
        fontWeight: '700',
    },
    avgText: {
        fontSize: 7,
    },
    expectedPrefix: {
        color: '#C6C6C6',
        fontSize: 7,
    },
    expectedValue: {
        color: '#FFFFFF',
        fontSize: 7,
        fontWeight: '700',
    },
    expectedAvg: {
        color: '#A5A5A5',
        fontSize: 7,
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
    providerMenuOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
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
        backgroundColor: '#050505',
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
    providerBottomLogo: {
        width: 38,
        height: 38,
    },
    userButtonShell: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#050505',
        borderWidth: 2,
        borderColor: '#1F1F1F',
        justifyContent: 'center',
        alignItems: 'center',
    },
    userButtonShellPressed: {
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