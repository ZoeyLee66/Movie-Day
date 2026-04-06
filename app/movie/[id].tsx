import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MovieDetail from '../../components/movie-detail';
import { getMovieById } from '../../db/database';

type DetailMovie = {
    movie_id: number;
    tmdb_id: number;
    title: string;
    release_year: number;
    genres: string;
    overview: string;
    keywords?: string;
    cast?: string;
    director: string;
    avg_rating?: number | null;
    predicted_rating?: number | null;
    rating_count?: number | null;
    poster_url: string;
    user_rating?: number | null;
    is_saved?: number;
};

export default function MovieDetailPage() {
    const { id, source, provider } = useLocalSearchParams<{
        id: string;
        source?: string;
        provider?: string;
    }>();

    const [movie, setMovie] = useState<DetailMovie | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMovie = async () => {
            try {
                setLoading(true);
                const data = await getMovieById(Number(id));
                setMovie(data ?? null);
            } catch (error) {
                console.error('Failed to load movie detail:', error);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            loadMovie();
        }
    }, [id]);

    if (loading || !movie) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
        );
    }

    return (
        <MovieDetail
            movie={movie}
            source={
                source === 'rate-movies' || source === 'user-page' || source === 'home'
                    ? source
                    : 'home'
            }
            provider={
                provider === 'Netflix' || provider === 'Disney+' || provider === 'defaultAll'
                    ? provider
                    : 'defaultAll'
            }
        />
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
});