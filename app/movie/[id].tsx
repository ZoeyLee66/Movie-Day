import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MovieDetail from '../../components/movie-detail';
import { getMovieById } from '../../db/database';

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
    predicted_rating?: number;
    rating_count: number;
    poster_url: string;
    ca_netflix: number;
    ca_disney_plus: number;
};

export default function MovieDetailPage() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [movie, setMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMovie = async () => {
            try {
                if (!id) return;

                const movieData = await getMovieById(Number(id));
                setMovie(movieData ?? null);
            } catch (error) {
                console.error('Failed to load movie detail:', error);
            } finally {
                setLoading(false);
            }
        };

        loadMovie();
    }, [id]);

    if (loading) {
        return (
            <View className="flex-1 bg-black justify-center items-center">
                <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
        );
    }

    if (!movie) {
        return (
            <View className="flex-1 bg-black justify-center items-center px-6">
                <Text className="text-white text-base text-center">
                    Movie not found.
                </Text>
            </View>
        );
    }

    return <MovieDetail movie={movie} />;
}