import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import defaultAll from '../../assets/images/icons/defaultAll.png';
import apple from '../../assets/images/icons/apple.png';
import appleGenre from '../../assets/images/icons/appleGenre.png';
import appleSort from '../../assets/images/icons/appleSort.png';
import appleStar from '../../assets/images/icons/appleStar.png';
import defaultUser from '../../assets/images/icons/default.png';
import defaultFullStar from '../../assets/images/icons/defaultFullStar.png';
import defaultStar from '../../assets/images/icons/defaultStar.png';
import defaultGenre from '../../assets/images/icons/defaultGenre.png';
import defaultSort from '../../assets/images/icons/defaultSort.png';
import disney from '../../assets/images/icons/disney.png';
import disneyGenre from '../../assets/images/icons/disneyGenre.png';
import disneySort from '../../assets/images/icons/disneySort.png';
import disneyStar from '../../assets/images/icons/disneyStar.png';
import netflixGenre from '../../assets/images/icons/netflixGenre.png';
import netflix from '../../assets/images/icons/netflix.png';
import netflixSort from '../../assets/images/icons/netflixSort.png';
import netflixStar from '../../assets/images/icons/netflixStar.png';
import selectedAppleLogo from '../../assets/images/icons/selectedAppleLogo.png';
import selectedDisneyLogo from '../../assets/images/icons/selectedDisneyLogo.png';
import selectedNetflixLogo from '../../assets/images/icons/selectedNetflixLogo.png';
import seletedDefaultAll from '../../assets/images/icons/apple.png';


export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <Link href="/modal">
          <Link.Trigger>
            <ThemedText type="subtitle">Step 2: Explore</ThemedText>
          </Link.Trigger>
          <Link.Preview />
          <Link.Menu>
            <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
            <Link.MenuAction
              title="Share"
              icon="square.and.arrow.up"
              onPress={() => alert('Share pressed')}
            />
            <Link.Menu title="More" icon="ellipsis">
              <Link.MenuAction
                title="Delete"
                icon="trash"
                destructive
                onPress={() => alert('Delete pressed')}
              />
            </Link.Menu>
          </Link.Menu>
        </Link>

        <ThemedText>
          {`Tap the Explore tab to learn more about what's included in this starter app.`}
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          {`When you're ready, run `}
          <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
          <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
          <ThemedText type="defaultSemiBold">app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
