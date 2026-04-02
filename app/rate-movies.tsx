import { useEffect, useMemo, useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    Pressable,
    Image,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { getUnratedMovies, getUserRatingsCount } from '../db/database';
import {
    useFonts,
    JockeyOne_400Regular,
} from '@expo-google-fonts/jockey-one';

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

function shuffleMovies<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export default function RateMoviesScreen() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [searchText, setSearchText] = useState('');
    const [ratingsCount, setRatingsCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const [fontsLoaded] = useFonts({
        JockeyOne_400Regular,
    });

    const canGoNext = ratingsCount >= 5;

    const loadData = async () => {
        try {
            setLoading(true);

            const [allMovies, count] = await Promise.all([
                getUnratedMovies(),
                getUserRatingsCount(),
            ]);

            setMovies(shuffleMovies(allMovies ?? []));
            setRatingsCount(count ?? 0);
        } catch (error) {
            console.error('Failed to load rate-movies screen data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const filteredMovies = useMemo(() => {
        const trimmed = searchText.trim().toLowerCase();

        if (!trimmed) return movies;

        return movies.filter((movie) =>
            movie.title.toLowerCase().includes(trimmed)
        );
    }, [movies, searchText]);

    const handlePressMovie = (movieId: number) => {
        router.push(`/movie/${movieId}`);
    };

    const handleNext = () => {
        if (!canGoNext) return;
        router.replace('/(tabs)');
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
                data={filteredMovies}
                keyExtractor={(item) => String(item.movie_id)}
                renderItem={renderMovieCard}
                numColumns={3}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
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