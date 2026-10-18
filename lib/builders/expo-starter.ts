export function createExpoMobileStarter(name: string, brief: Record<string, unknown>) {
  const title = name.trim().slice(0, 100) || 'LeonardX Mobile App';
  const titleLiteral = JSON.stringify(title);
  const slug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'leonardx-mobile-app';
  const jsonBrief = JSON.stringify(brief, null, 2).slice(0, 12_000);
  const appConfig = {
    expo: {
      name: title,
      slug,
      version: '1.0.0',
      orientation: 'portrait',
      userInterfaceStyle: 'automatic',
    },
  };
  const packageConfig = {
    name: slug,
    version: '1.0.0',
    private: true,
    main: 'expo/AppEntry',
    scripts: {
      start: 'expo start',
      android: 'expo start --android',
      ios: 'expo start --ios',
      web: 'expo start --web',
    },
    dependencies: {
      expo: '~57.0.0',
      react: '19.2.3',
      'react-native': '0.86.0',
    },
  };
  const easConfig = {
    cli: { version: '>= 25.2.0', appVersionSource: 'remote' },
    build: {
      preview: { distribution: 'internal', android: { buildType: 'apk' } },
      production: { autoIncrement: true, android: { buildType: 'app-bundle' } },
    },
  };

  return {
    'package.json': JSON.stringify(packageConfig, null, 2) + '\n',
    'app.json': JSON.stringify(appConfig, null, 2) + '\n',
    'eas.json': JSON.stringify(easConfig, null, 2) + '\n',
    'App.tsx': `import { useState } from 'react';\nimport { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <SafeAreaView style={styles.safe}>\n      <View style={styles.container}>\n        <Text style={styles.eyebrow}>LEONARDX MOBILE STARTER</Text>\n        <Text style={styles.title}>{${titleLiteral}}</Text>\n        <Text style={styles.body}>Your Expo workspace is ready for screens, navigation, and app-specific features.</Text>\n        <Pressable accessibilityRole="button" onPress={() => setCount(value => value + 1)} style={styles.button}>\n          <Text style={styles.buttonText}>Starter action - {count}</Text>\n        </Pressable>\n      </View>\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  safe: { flex: 1, backgroundColor: '#10131b' },\n  container: { flex: 1, justifyContent: 'center', padding: 28 },\n  eyebrow: { color: '#d7aa70', fontSize: 12, fontWeight: '700', letterSpacing: 2 },\n  title: { color: '#f5f5f5', fontSize: 34, fontWeight: '800', marginTop: 14 },\n  body: { color: '#b5bbc8', fontSize: 16, lineHeight: 24, marginTop: 12 },\n  button: { alignSelf: 'flex-start', backgroundColor: '#d7aa70', borderRadius: 14, marginTop: 24, paddingHorizontal: 18, paddingVertical: 13 },\n  buttonText: { color: '#111318', fontSize: 15, fontWeight: '700' },\n});\n`,
    'README.md': `# ${title}\n\nExpo React Native starter created for the LeonardX project brief. It has a small interactive screen and pinned Expo SDK 57, React, and React Native dependencies.\n\n## Complete setup before a cloud build\n\n1. Install dependencies with Node.js 22.13 or later, then run npm start.\n2. Link this app to the real Expo project by adding its existing UUID as expo.extra.eas.projectId in app.json.\n3. Set the real iOS bundle identifier and Android package name in app.json. These are deliberately omitted because LeonardX cannot assign identifiers for your Apple or Google accounts.\n4. Verify Expo account access and signing credentials, then save the project files in LeonardX.\n\nThe preview EAS profile creates an Android APK. The production profile creates an Android app bundle; configure iOS signing in EAS before an iOS build. No Expo project UUID, platform identifier, account token, or signing key was invented.\n\n## Requested brief\n\n\`\`\`json\n${jsonBrief}\n\`\`\`\n`,
  };
}
