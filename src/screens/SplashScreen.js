import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const scaleX = width / 431;
const scaleY = height / 917;

// Note: Auth-based routing is handled by AppNavigator.
// SplashScreen only shows during the initial 2.5s before GetStarted.

const PAW_PRINTS = [
  { src: require('../assets/images/elionasSilhouette131446812801.png'),  top: 23,  left: 19,  size: 29 },
  { src: require('../assets/images/elionasSilhouette131446712801.png'),  top: 272, left: 44,  size: 38 },
  { src: require('../assets/images/elionasSilhouette131446712805.png'),  top: 144, left: 60,  size: 38 },
  { src: require('../assets/images/elionasSilhouette131446812804.png'),  top: 243, left: 208, size: 29 },
  { src: require('../assets/images/elionasSilhouette131446712804.png'),  top: 106, left: 338, size: 38 },
  { src: require('../assets/images/elionasSilhouette131446812802.png'),  top: 23,  left: 376, size: 29 },
  { src: require('../assets/images/elionasSilhouette131446712802.png'),  top: 11,  left: 189, size: 38 },
  { src: require('../assets/images/elionasSilhouette131446712803.png'),  top: 291, left: 334, size: 38 },
  { src: require('../assets/images/elionasSilhouette131446712806.png'),  top: 587, left: 349, size: 38 },
  { src: require('../assets/images/elionasSilhouette131446812807.png'),  top: 558, left: 38,  size: 29 },
  { src: require('../assets/images/elionasSilhouette131446712807.png'),  top: 742, left: 191, size: 38 },
  { src: require('../assets/images/elionasSilhouette131446712808.png'),  top: 410, left: 33,  size: 38 },
  { src: require('../assets/images/elionasSilhouette131446812809.png'),  top: 439, left: 372, size: 29 },
  { src: require('../assets/images/elionasSilhouette1314468128010.png'), top: 615, left: 229, size: 29 },
  { src: require('../assets/images/elionasSilhouette1314468128011.png'), top: 664, left: 79,  size: 29 },
  { src: require('../assets/images/elionasSilhouette1314467128011.png'), top: 855, left: 148, size: 38 },
  { src: require('../assets/images/elionasSilhouette1314468128012.png'), top: 806, left: 28,  size: 29 },
  { src: require('../assets/images/elionasSilhouette1314468128013.png'), top: 126, left: 198, size: 29 },
  { src: require('../assets/images/elionasSilhouette1314468128014.png'), top: 724, left: 364, size: 29 },
  { src: require('../assets/images/elionasSilhouette1314467128014.png'), top: 847, left: 322, size: 38 },
];

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => navigation.replace('GetStarted'), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient
      colors={['rgba(255,242,242,1)', 'rgba(247,141,167,1)']}
      style={styles.container}
    >
      {PAW_PRINTS.map((paw, index) => (
        <Image
          key={index}
          source={paw.src}
          style={{
            position: 'absolute',
            top: paw.top * scaleY,
            left: paw.left * scaleX,
            width: paw.size * scaleX,
            height: paw.size * scaleY,
            resizeMode: 'contain',
          }}
        />
      ))}

      {/* White frosted card behind logo */}
      <View style={styles.card} />

      {/* Logo */}
      <Image
        source={require('../assets/images/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  card: {
    position: 'absolute',
    top: 355 * scaleY,
    left: 98 * scaleX,
    width: 231 * scaleX,
    height: 226 * scaleY,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 43,
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  logo: {
    position: 'absolute',
    top: 329 * scaleY,
    left: 74 * scaleX,
    width: 285 * scaleX,
    height: 285 * scaleY,
  },
});
