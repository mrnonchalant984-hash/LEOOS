/**
 * Creates a requirements-driven React Native workspace. This deliberately does
 * not ship the Expo demo counter template: screens, navigation labels, design
 * tokens and feature priorities are derived from the saved project brief.
 */
export function createExpoMobileStarter(name: string, brief: Record<string, unknown>) {
  const title = name.trim().slice(0, 100) || 'LeonardX Mobile App';
  const titleLiteral = JSON.stringify(title);
  const slug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'leonardx-mobile-app';
  const jsonBrief = JSON.stringify(brief, null, 2).slice(0, 12_000);
  const textValues = Object.values(brief).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const briefEntry = (pattern: RegExp) => Object.entries(brief).find(([key, value]) => pattern.test(key) && typeof value === 'string' && value.trim())?.[1];
  const palette = String(brief.color_palette || brief.colors || brief.primary_color || briefEntry(/color|palette/i) || '#17324D').trim().slice(0, 32);
  const secondary = String(brief.secondary_color || '#2A9D8F').trim().slice(0, 32);
  const designStyle = String(brief.design_style || brief.visual_style || brief.style || briefEntry(/visual style|design system|design style|typography|reference app/i) || 'Modern, clear, premium and accessible').slice(0, 180);
  const rawScreens = Array.isArray(brief.screens) ? brief.screens : Array.isArray(brief.navigation) ? brief.navigation : String(briefEntry(/screen|navigation|user journey|pages/i) || '').split(/[,\n;]+/).map(value => value.trim()).filter(Boolean);
  const requestedScreens = rawScreens.map(item => typeof item === 'string' ? item : (item && typeof item === 'object' && 'name' in item ? String((item as {name: unknown}).name) : '')).filter(Boolean);
  const screenNames = [...new Set(['Home', ...requestedScreens, 'Activity', 'Profile'].map(s => s.trim().slice(0, 32)).filter(Boolean))].slice(0, 6);
  const featureEntry = briefEntry(/features|capabilities|functionality|core workflow/i);
  const featureText = typeof featureEntry === 'string' ? featureEntry : '';
  const features = Array.isArray(brief.features) ? brief.features.map(String).slice(0, 10) : featureText ? featureText.split(/[,\n;]+/).map((value: string) => value.trim()).filter(Boolean).slice(0, 10) : ['Core workflow', 'Account and preferences'];
  const androidPackage = String(brief.android_package || briefEntry(/android package|application id/i) || '').trim();
  const iosBundle = String(brief.ios_bundle_identifier || briefEntry(/ios bundle|bundle identifier/i) || '').trim();
  const wantsDraftIdentifiers = /generate draft identifiers|generate a draft identifier/i.test(JSON.stringify(brief));
  const validPackage = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){1,}$/;
  const androidId = validPackage.test(androidPackage) ? androidPackage : wantsDraftIdentifiers ? `com.leonardx.${slug.replace(/-/g, '')}` : '';
  const iosId = validPackage.test(iosBundle) ? iosBundle : wantsDraftIdentifiers ? `com.leonardx.${slug.replace(/-/g, '')}` : '';
  const safeScreenNames = JSON.stringify(screenNames);
  const safeFeatures = JSON.stringify(features.length ? features : ['Core workflow', 'Account and preferences']);
  const appConfig = {
    expo: {
      name: title,
      slug,
      version: '1.0.0',
      orientation: 'portrait',
      userInterfaceStyle: 'automatic',
      ...(androidId ? { android: { package: androidId } } : {}),
      ...(iosId ? { ios: { bundleIdentifier: iosId } } : {}),
    },
  };
  const packageConfig = {
    name: slug,
    version: '1.0.0',
    private: true,
    main: 'expo/AppEntry',
    scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', web: 'expo start --web', typecheck: 'tsc --noEmit' },
    dependencies: { expo: '~57.0.0', react: '19.2.3', 'react-native': '0.86.0' },
    devDependencies: { typescript: '~5.9.2', '@types/react': '~19.2.2' },
  };
  const easConfig = {
    cli: { version: '>= 25.2.0', appVersionSource: 'remote' },
    build: { preview: { distribution: 'internal', android: { buildType: 'apk' } }, production: { autoIncrement: true, android: { buildType: 'app-bundle' } } },
  };

  return {
    'package.json': JSON.stringify(packageConfig, null, 2) + '\n',
    'app.json': JSON.stringify(appConfig, null, 2) + '\n',
    'eas.json': JSON.stringify(easConfig, null, 2) + '\n',
    'App.tsx': `import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

const APP_NAME = ${titleLiteral};
const SCREENS: string[] = ${safeScreenNames};
const FEATURES: string[] = ${safeFeatures};
const PRIMARY = ${JSON.stringify(palette)};
const SECONDARY = ${JSON.stringify(secondary)};
const DESIGN_DIRECTION = ${JSON.stringify(designStyle)};

export default function App() {
  const [activeScreen, setActiveScreen] = useState(SCREENS[0] || 'Home');
  const [completed, setCompleted] = useState<string[]>([]);
  const activeIndex = Math.max(0, SCREENS.indexOf(activeScreen));
  const screenCopy = useMemo(() => activeScreen === 'Home'
    ? 'Your main overview, key actions and latest activity belong here.'
    : activeScreen === 'Profile'
      ? 'Account details, preferences, privacy and support.'
      : activeScreen === 'Activity'
        ? 'A clear timeline of recent actions and important updates.'
        : 'Purpose-built content for ' + activeScreen + '.', [activeScreen]);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>{APP_NAME.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.brandCopy}><Text style={styles.eyebrow}>YOUR WORKSPACE</Text><Text style={styles.brand}>{APP_NAME}</Text></View>
        <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>Preview</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>DESIGNED AROUND YOUR BRIEF</Text>
          <Text style={styles.title}>{activeScreen === 'Home' ? 'Everything in one place.' : activeScreen}</Text><Text style={styles.title} accessibilityLabel="Application name">{${titleLiteral}}</Text>
          <Text style={styles.body}>{screenCopy}</Text>
          <View style={styles.heroFooter}><Text style={styles.heroCaption}>{DESIGN_DIRECTION}</Text><View style={styles.heroOrb} /></View>
        </View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{activeScreen === 'Home' ? 'Your key features' : 'Explore ' + activeScreen}</Text><Text style={styles.sectionMeta}>{completed.length} of {FEATURES.length} reviewed</Text></View>
        {FEATURES.map((feature, index) => {
          const done = completed.includes(feature);
          return <Pressable key={feature} accessibilityRole="button" onPress={() => setCompleted(old => done ? old.filter(item => item !== feature) : [...old, feature])} style={[styles.feature, done && styles.featureDone]}>
            <View style={[styles.featureIcon, { backgroundColor: index % 2 ? SECONDARY : PRIMARY }]}><Text style={styles.featureIconText}>{String(index + 1).padStart(2, '0')}</Text></View>
            <View style={styles.featureCopy}><Text style={styles.featureTitle}>{feature}</Text><Text style={styles.featureBody}>{done ? 'Marked for review' : 'Open this feature to continue the workflow.'}</Text></View>
            <Text style={styles.chevron}>{done ? '✓' : '›'}</Text>
          </Pressable>;
        })}
        <View style={styles.note}><Text style={styles.noteTitle}>Next build step</Text><Text style={styles.noteBody}>Connect the real data source, authentication, integrations and platform credentials required by your brief before publishing. This preview does not pretend those services are already configured.</Text></View>
      </ScrollView>
      <View style={styles.tabBar}>{SCREENS.map(screen => <Pressable key={screen} onPress={() => setActiveScreen(screen)} style={styles.tab}><View style={[styles.tabIndicator, activeScreen === screen && styles.tabIndicatorActive]} /><Text numberOfLines={1} style={[styles.tabText, activeScreen === screen && styles.tabTextActive]}>{screen}</Text></Pressable>)}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#101C2B', gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: SECONDARY },
  brandMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  brandCopy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: SECONDARY },
  brand: { marginTop: 3, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#223246' },
  statusDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#8BD4B2' }, statusText: { color: '#D7E0EB', fontSize: 11, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 28 },
  hero: { position: 'relative', overflow: 'hidden', minHeight: 220, padding: 24, borderRadius: 26, backgroundColor: PRIMARY },
  title: { marginTop: 16, maxWidth: 280, color: '#FFFFFF', fontSize: 31, lineHeight: 36, fontWeight: '900' },
  body: { maxWidth: 300, marginTop: 10, color: '#E2EAF2', fontSize: 14, lineHeight: 21 },
  heroFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22 },
  heroCaption: { maxWidth: '78%', color: '#D4E2ED', fontSize: 11, lineHeight: 16 }, heroOrb: { width: 34, height: 34, borderRadius: 17, backgroundColor: SECONDARY, opacity: 0.9 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: '#172333', fontSize: 18, fontWeight: '900' }, sectionMeta: { color: '#68788A', fontSize: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 9, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4EAF0' },
  featureDone: { borderColor: SECONDARY }, featureIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, featureIconText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  featureCopy: { flex: 1 }, featureTitle: { color: '#172333', fontSize: 14, fontWeight: '800' }, featureBody: { marginTop: 4, color: '#718094', fontSize: 11, lineHeight: 16 }, chevron: { color: SECONDARY, fontSize: 24, fontWeight: '700' },
  note: { padding: 16, marginTop: 8, borderRadius: 18, backgroundColor: '#E9EFF5' }, noteTitle: { color: '#172333', fontSize: 13, fontWeight: '800' }, noteBody: { marginTop: 6, color: '#536477', fontSize: 12, lineHeight: 18 },
  tabBar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E4EAF0' },
  tab: { flex: 1, alignItems: 'center', gap: 5 }, tabIndicator: { width: 18, height: 3, borderRadius: 3, backgroundColor: 'transparent' }, tabIndicatorActive: { backgroundColor: SECONDARY }, tabText: { maxWidth: 64, color: '#8A96A5', fontSize: 10, fontWeight: '700' }, tabTextActive: { color: PRIMARY },
});
`,
    'README.md': `# ${title}\n\nA requirements-driven React Native starter generated by LeonardX. This is not the stock Expo counter screen: it uses your requested design direction, palette, navigation/screen names and feature brief as the starting point.\n\n## Before production\n\n1. Install dependencies with Node.js 22.13 or later, then run npm start.\n2. Link this app to the real Expo project by adding its existing UUID as expo.extra.eas.projectId in app.json.\n3. Set real iOS bundle identifier and Android package name in app.json. These are deliberately omitted because LeonardX cannot assign identifiers for your Apple or Google accounts.\n4. Connect actual data services, auth, permissions, payment providers and integrations specified in the brief; validate accessibility and device layouts.\n5. Verify Expo account access and signing credentials, then save the project files in LeonardX.\n\nThe preview EAS profile creates an Android APK. The production profile creates an Android app bundle; configure iOS signing in EAS before an iOS build. No project UUID, platform identifier, account token or signing key was invented.\n\n## Design brief used\n\n- Design direction: ${designStyle}\n- Primary palette: ${palette}\n- Secondary palette: ${secondary}\n\n\`\`\`json\n${jsonBrief}\n\`\`\`\n\nThe generated UI is a starting implementation. Backend workflows and integrations are only complete when connected and tested against the real services.\n`,
  };
}
