import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    Pressable,
    Image,
    ActivityIndicator,
    StyleSheet,
    NativeScrollEvent,
    NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { getUserRatingsCount, getAllMovies } from '../db/database';
import {
    useFonts,
    JockeyOne_400Regular,
} from '@expo-google-fonts/jockey-one';

let cachedMovieOrder: number[] = [];
let cachedScrollOffset = 0;

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
    avg_rating: number;
    rating_count: number;
    poster_url: string;
    ca_netflix: number;
    ca_disney_plus: number;
};

function orderMoviesOnce(allMovies: Movie[]): Movie[] {
    if (cachedMovieOrder.length === 0) {
        const shuffled = [...allMovies];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        cachedMovieOrder = shuffled.map((movie) => movie.movie_id);
        return shuffled;
    }

    const movieMap = new Map(allMovies.map((movie) => [movie.movie_id, movie]));
    const orderedMovies: Movie[] = [];

    for (const movieId of cachedMovieOrder) {
        const movie = movieMap.get(movieId);
        if (movie) {
            orderedMovies.push(movie);
            movieMap.delete(movieId);
        }
    }

    const newMovies = Array.from(movieMap.values());

    if (newMovies.length > 0) {
        cachedMovieOrder = [
            ...cachedMovieOrder,
            ...newMovies.map((movie) => movie.movie_id),
        ];
        orderedMovies.push(...newMovies);
    }

    return orderedMovies;
}

export default function RateMoviesScreen() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [searchText, setSearchText] = useState('');
    const [ratingsCount, setRatingsCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const flatListRef = useRef<FlatList<Movie>>(null);
    const currentScrollOffsetRef = useRef(0);

    const [fontsLoaded] = useFonts({
        JockeyOne_400Regular,
    });

    const canGoNext = ratingsCount >= 5;

    const loadInitialData = async () => {
        try {
            setLoading(true);

            const [allMovies, count] = await Promise.all([
                getAllMovies(),
                getUserRatingsCount(),
            ]);

            const orderedMovies = orderMoviesOnce(allMovies ?? []);

            setMovies(orderedMovies);
            setRatingsCount(count ?? 0);
        } catch (error) {
            console.error('Failed to load initial rate-movies data:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshRatingsCount = async () => {
        try {
            const count = await getUserRatingsCount();
            setRatingsCount(count ?? 0);
        } catch (error) {
            console.error('Failed to refresh ratings count:', error);
        }
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    useFocusEffect(
        useCallback(() => {
            refreshRatingsCount();

            const timer = setTimeout(() => {
                if (flatListRef.current && currentScrollOffsetRef.current > 0) {
                    flatListRef.current.scrollToOffset({
                        offset: currentScrollOffsetRef.current,
                        animated: false,
                    });
                }
            }, 0);

            return () => {
                clearTimeout(timer);
                cachedScrollOffset = currentScrollOffsetRef.current;
            };
        }, [])
    );

    const filteredMovies = useMemo(() => {
        const trimmed = searchText.trim().toLowerCase();

        if (!trimmed) return movies;

        return movies.filter((movie) =>
            movie.title.toLowerCase().includes(trimmed)
        );
    }, [movies, searchText]);

    useEffect(() => {
        if (searchText.trim().length === 0) {
            const timer = setTimeout(() => {
                if (flatListRef.current && cachedScrollOffset > 0) {
                    flatListRef.current.scrollToOffset({
                        offset: cachedScrollOffset,
                        animated: false,
                    });
                    currentScrollOffsetRef.current = cachedScrollOffset;
                }
            }, 0);

            return () => clearTimeout(timer);
        }
    }, [searchText]);

    const handlePressMovie = (movieId: number) => {
        router.push(`/movie/${movieId}`);
    };

    const handleNext = () => {
        if (!canGoNext) return;
        router.replace('/(tabs)');
    };

    const updateScrollOffset = (
        event: NativeSyntheticEvent<NativeScrollEvent>
    ) => {
        if (searchText.trim().length > 0) return;

        const offsetY = event.nativeEvent.contentOffset.y;
        currentScrollOffsetRef.current = offsetY;
        cachedScrollOffset = offsetY;
    };

    const renderMovieCard = ({ item }: { item: Movie }) => {
        return (
            <Pressable
                style={styles.card}
                onPress={() => handlePressMovie(item.movie_id)}
            >
                <Image
                    source={{ uri: item.poster_url }}
                    resizeMode="cover"
                    style={styles.poster}
                />
                <Text style={styles.movieTitle} numberOfLines={1}>
                    {item.title}
                </Text>
            </Pressable>
        );
    };

    if (!fontsLoaded || loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={[styles.logo, { fontFamily: 'JockeyOne_400Regular' }]}>
                MOVIE DAY
            </Text>

            <Text style={styles.subtitle}>
                Rate at least 5 movies you&apos;ve watched!
            </Text>

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

            <Pressable
                onPress={handleNext}
                disabled={!canGoNext}
                style={[
                    styles.nextButton,
                    canGoNext ? styles.nextButtonEnabled : styles.nextButtonDisabled,
                ]}
            >
                <Text
                    style={[
                        styles.nextButtonText,
                        canGoNext
                            ? styles.nextButtonTextEnabled
                            : styles.nextButtonTextDisabled,
                    ]}
                >
                    NEXT
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        paddingTop: 48,
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
        fontSize: 34,
        textAlign: 'center',
        lineHeight: 38,
    },
    subtitle: {
        color: '#FFFFFF',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 2,
        marginBottom: 20,
    },
    searchWrapper: {
        height: 40,
        backgroundColor: '#F2F2F2',
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        marginBottom: 22,
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
    listContent: {
        paddingBottom: 150,
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
        borderRadius: 14,
        backgroundColor: '#1A1A1A',
    },
    movieTitle: {
        color: '#FFFFFF',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
    nextButton: {
        position: 'absolute',
        bottom: 30,
        alignSelf: 'center',
        width: 170,
        height: 52,
        borderRadius: 999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonDisabled: {
        backgroundColor: '#2B2B2B',
    },
    nextButtonEnabled: {
        backgroundColor: '#FFFFFF',
    },
    nextButtonText: {
        fontSize: 18,
        fontWeight: '700',
    },
    nextButtonTextDisabled: {
        color: '#FFFFFF',
    },
    nextButtonTextEnabled: {
        color: '#1F1F1F',
    },
});