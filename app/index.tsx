import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { getUserRatingsCount } from '../db/database';

export default function IndexScreen() {
    useEffect(() => {
        const checkUserRatings = async () => {
            try {
                const count = await getUserRatingsCount();

                if (count <= 0) {
                    router.replace('/rate-movies');
                } else {
                    router.replace('/(tabs)');
                }
            } catch (error) {
                console.error('Failed to check user ratings:', error);
            }
        };

        checkUserRatings();
    }, []);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
});