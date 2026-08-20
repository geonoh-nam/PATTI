import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text, TextInput } from './Typography';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { AlphaType, Canvas, ColorType, Group, Image as SkiaImage, Path as SkiaPath, Skia, useImage } from '@shopify/react-native-skia';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Rea, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView, PointerType } from 'react-native-gesture-handler';
import getStroke from 'perfect-freehand';
import PuzzleScreen from './Puzzle';
import { playSound, speak, speakUrl, stopSpeaking } from './sound';
import IntroScreen from './Intro';
import * as ImagePicker from 'expo-image-picker';

const DEMO_VIDEO = require('./1mindemo.mp4');
// Thumbnail frames (from the demo video for now; per-video thumbnails come with the DB).
const THUMBS = [
  require('./assets/thumbs/t1.jpg'),
  require('./assets/thumbs/t2.jpg'),
  require('./assets/thumbs/t3.jpg'),
  require('./assets/thumbs/t4.jpg'),
  require('./assets/thumbs/t5.jpg'),
  require('./assets/thumbs/t6.jpg'),
  require('./assets/thumbs/t7.jpg'),
  require('./assets/thumbs/t8.jpg'),
];
const TRACE_LINEART = require('./assets/trace_lineart_v2.png');

const BG = '#08113D';
const SURFACE = '#122055';
const TEXT_ON_DARK = '#171d31';
const TEXT_MUTED_ON_DARK = '#5b6b8c';

const COLORS = {
  ink: '#171d31',
  muted: '#748198',
  blue: '#00CFE9',
  blueDark: '#00CFE9',
  blueSoft: '#edf4ff',
  sky: '#00CFE9',
  pink: '#ffe4ef',
  pinkHot: '#f45aa2',
  yellow: '#fff0b8',
  purple: '#efe7ff',
  mint: '#dffaf2',
  line: '#dfe8f7',
  card: '#ffffff',
  stage: '#ffffff',
  dark: '#101828',
};

const video = {
  title: '전설의 고래와 용기 이야기',
  duration: '1:30',
  captions: [
    '로미 곁엔 내가 있어 츄!',
    '너무 위험해',
    '한바탕해 볼까',
    '그 마음은 잃지 않았으면 좋겠어',
  ],
};

// Mock video library. Shaped for a later DB swap: replace this array with a fetch
// that returns the same { id, label, videos:[{ id, title, duration, emoji, color }] }.
const LIBRARY = [
  {
    id: 'popular',
    label: '인기',
    videos: [
      // Each series carries its own palette: card colour, the tint its screen washes over, and the
      // accent used for chips and headings, so the mood changes with the character.
      { id: 'pop-teenieping', title: '캐치 티니핑', duration: '4기 베리 하츄핑', color: '#ff5fa2', tint: '#fff0f6', accent: '#e0327c', line: '“같이보자츄~”', thumb: require('./assets/characters/thumbs/thumb1.png') },
      { id: 'pop-tayo', title: '꼬마버스 타요', duration: '용감한 소방차 이야기', color: '#2b7fd7', tint: '#eef5ff', accent: '#1b5fae', line: '“꼬마버스 타요, 출발합니다!”', thumb: require('./assets/characters/thumbs/thumb2.png') },
      { id: 'pop-bread', title: '브레드이발소', duration: '오늘도 손님이 와요', color: '#f2a65a', tint: '#fff6ec', accent: '#a55b1e', line: '“어서 오세요, 브레드이발소!”', artScale: 0.86, thumb: require('./assets/characters/thumbs/thumb6.png') },
      { id: 'pop-shark', title: '핑크퐁 아기상어', duration: '상어 가족과 노래해요', color: '#7c5cff', tint: '#f3f0ff', accent: '#ffb703', line: '“아기 상어 뚜루루 뚜루~”', thumb: require('./assets/characters/thumbs/thumb4.png') },
      { id: 'pop-pororo', title: '뽀롱뽀롱 뽀로로', duration: '뽀로로 인기 에피소드', color: '#e5484d', tint: '#fff1f0', accent: '#1f6fd0', line: '“노는 게 제일 좋아!”', thumb: require('./assets/characters/thumbs/thumb5.png') },
    ],
  },
  {
    id: 'story',
    label: '동화',
    videos: [
      { id: 'story-hachu-whale', title: '사랑의 하츄핑: 고래보석의 전설', duration: '5:00', emoji: '🐳', color: '#dbeafe' },
      { id: 'story-rabbit-moon', title: '달나라로 간 토끼', duration: '4:20', emoji: '🌙', color: '#ede9fe' },
      { id: 'story-three-pigs', title: '아기 돼지 삼형제', duration: '6:10', emoji: '🐷', color: '#ffe4ef' },
      { id: 'story-red-hood', title: '빨간 모자와 늑대', duration: '5:40', emoji: '🧺', color: '#fee2e2' },
      { id: 'story-golden-axe', title: '금도끼 은도끼', duration: '3:50', emoji: '🪓', color: '#fef3c7' },
    ],
  },
  {
    id: 'animal',
    label: '자연·동물',
    videos: [
      { id: 'animal-baby-shark', title: '아기 상어와 바다 친구들', duration: '3:20', emoji: '🦈', color: '#00CFE9' },
      { id: 'animal-zoo-trip', title: '동물원 나들이', duration: '4:00', emoji: '🦁', color: '#fff0b8' },
      { id: 'animal-forest-friends', title: '숲속 친구들의 하루', duration: '5:15', emoji: '🦊', color: '#dcfce7' },
      { id: 'animal-penguin-ice', title: '펭귄의 남극 모험', duration: '4:45', emoji: '🐧', color: '#e0f2fe' },
    ],
  },
  {
    id: 'song',
    label: '노래·율동',
    videos: [
      { id: 'song-rainbow-play', title: '무지개 색깔 놀이', duration: '2:50', emoji: '🌈', color: '#ffe4ef' },
      { id: 'song-clap-hands', title: '손뼉 치며 노래해요', duration: '2:30', emoji: '👏', color: '#fef3c7' },
      { id: 'song-twinkle-star', title: '반짝반짝 작은 별', duration: '3:10', emoji: '⭐', color: '#e0e7ff' },
      { id: 'song-bus-wheels', title: '빙글빙글 버스 바퀴', duration: '2:40', emoji: '🚌', color: '#dbeafe' },
      { id: 'song-dino-dance', title: '아기 공룡 율동 대회', duration: '3:30', emoji: '🦕', color: '#dcfce7' },
    ],
  },
  {
    id: 'learn',
    label: '숫자·한글',
    videos: [
      { id: 'learn-number-quest', title: '숫자 세기 모험', duration: '4:10', emoji: '🔢', color: '#e0f2fe' },
      { id: 'learn-hangul-start', title: '가나다 첫걸음', duration: '5:00', emoji: '🔤', color: '#ede9fe' },
      { id: 'learn-shape-hunt', title: '동그라미 세모 네모', duration: '3:40', emoji: '🔺', color: '#fef3c7' },
      { id: 'learn-color-name', title: '색깔 이름 배우기', duration: '3:00', emoji: '🎨', color: '#ffe4ef' },
    ],
  },
  {
    id: 'play',
    label: '놀이',
    videos: [
      { id: 'play-hide-seek', title: '숨바꼭질 놀이터', duration: '4:30', emoji: '🙈', color: '#fff0b8' },
      { id: 'play-block-castle', title: '블록으로 성 쌓기', duration: '5:20', emoji: '🧱', color: '#dbeafe' },
      { id: 'play-clay-friends', title: '점토로 친구 만들기', duration: '4:00', emoji: '🧸', color: '#ffe4ef' },
      { id: 'play-water-splash', title: '물놀이 첨벙첨벙', duration: '3:50', emoji: '💦', color: '#00CFE9' },
    ],
  },
];

const quiz = {
  title: '우아핑의 색깔은?',
  // audioUrl: filled from the content DB once questions are served from there.
  audioUrl: null,
  options: [
    { label: '노랑색', color: '#f0ae03', bg: '#fffaf0', meaning: '병아리처럼 밝고 환한 색이에요.', example: '노랑색 우산을 쓰고 나갔어요.' },
    { label: '보라색', color: '#9b5de5', bg: '#f6f0ff', meaning: '포도처럼 진하고 신비로운 색이에요.', example: '보라색 꽃이 활짝 폈어요.' },
    { label: '하늘색', color: '#00CFE9', bg: '#f1fdff', meaning: '맑은 날 하늘처럼 시원한 색이에요.', example: '하늘색 크레파스로 바다를 그렸어요.' },
    { label: '핑크색', color: '#e24e9e', bg: '#fff4fa', meaning: '복숭아처럼 부드럽고 달콤한 색이에요.', example: '핑크색 리본을 머리에 달았어요.' },
  ],
  answer: '하늘색',
};

// Button that dips slightly when pressed for tactile feedback.
function TapScale({ style, onPress, children, activeScale = 0.94 }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(s, { toValue: v, friction: 7, tension: 200, useNativeDriver: true }).start();
  return (
    <Pressable onPressIn={() => to(activeScale)} onPressOut={() => to(1)} onPress={onPress}>
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Soft fade+rise on every screen change so navigation never hard-cuts.
function ScreenFade({ screenKey, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [screenKey]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={{ flex: 1, opacity: anim, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

const STORE_KEY = 'patti.profile.v1';
const DEFAULT_PROFILE = { name: '', birth: { y: new Date().getFullYear() - 5, m: 1, d: 1 }, tone: 'blue', species: 'star', level: 1 };
const DEFAULT_SETTINGS = {
  dailyLimit: 30,
  activities: { quiz: true, trace: true, puzzle: true },
  sound: true,
  consent: false,
};

export default function App() {
  // First run walks the grown-up through setup, then the intro animation hands over to the child.
  const [screen, setScreen] = useState('intro');
  const [childProfile, setChildProfile] = useState(DEFAULT_PROFILE);
  const [guardianSettings, setGuardianSettings] = useState(DEFAULT_SETTINGS);
  // Until the saved profile is read back, onboarding must not flash on an returning child's tablet.
  const [restored, setRestored] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [drawStrokes, setDrawStrokes] = useState([]);
  const [savedDrawing, setSavedDrawing] = useState(null);
  const [words, setWords] = useState([]);
  const [drawCanvasSize, setDrawCanvasSize] = useState({ width: 620, height: 380 });
  const [doodleStrokes, setDoodleStrokes] = useState([]);
  const [doodleCanvasSize, setDoodleCanvasSize] = useState({ width: 620, height: 380 });
  const [characterImage, setCharacterImage] = useState(null);
  const [characterStatus, setCharacterStatus] = useState('idle');
  const [characterError, setCharacterError] = useState('');
  const [quizDone, setQuizDone] = useState(false);
  const [log, setLog] = useState({ quiz: 0, drawing: 0, skip: 0 });
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [tab, setTab] = useState('library');
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [evolving, setEvolving] = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.profile) setChildProfile({ ...DEFAULT_PROFILE, ...saved.profile });
        if (saved.settings) setGuardianSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        if (saved.words) setWords(saved.words);
        // Setup already done on this tablet: go straight to the child's screen.
        if (saved.settings?.consent) setScreen('main');
      })
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return; // never write the defaults over a saved profile before it is read
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ profile: childProfile, settings: guardianSettings, words })).catch(() => {});
  }, [restored, childProfile, guardianSettings, words]);

  // The tablet's own back gesture should walk the app back, not drop the child out of it.
  useEffect(() => {
    const back = {
      welcome: 'intro',
      profile: 'welcome',
      guardian: 'profile',
      home: 'main',
      detail: 'home',
      watch: 'detail',
      activities: 'main',
      drawing: 'activities',
      report: 'main',
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const target = back[screen];
      if (!target) return false; // on the main screen, let Android leave the app
      setScreen(target);
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  const runGeneration = async (strokes, canvasSize) => {
    setCharacterError('');
    setCharacterStatus('loading');
    try {
      if (!strokes || !strokes.length) {
        throw new Error('먼저 그림을 그려주세요.');
      }
      // Real device needs the Mac's LAN IP. Take it from the dev server we are already
      // bundling from, so a changed wifi/IP never silently points at a dead host again.
      const hostUri = Constants.expoConfig?.hostUri || '';
      const host = Platform.OS === 'android' ? hostUri.split(':')[0] || 'localhost' : 'localhost';
      // Without this the fetch hangs forever on an unreachable host and the screen looks frozen.
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 90000);
      let response;
      try {
        response = await fetch(`http://${host}:5055/generate-character`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            source: 'drawn-in-app',
            strokes,
            canvasWidth: canvasSize.width,
            canvasHeight: canvasSize.height,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '캐릭터 생성에 실패했어요.');
      }
      setCharacterImage(`data:${payload.mimeType};base64,${payload.imageBase64}`);
      setCharacterStatus('done');
      playSound('fanfare');
      return true;
    } catch (error) {
      const msg = error.message || String(error);
      const friendly = /429|quota|RESOURCE_EXHAUSTED|Too Many Requests/i.test(msg)
        ? 'AI 변환 사용량이 많아요. 잠시 후 다시 시도해줘! (무료 한도 초과)'
        : /402|Insufficient credit/i.test(msg)
        ? '변환 서비스 크레딧이 떨어졌어요. 충전이 필요해요.'
        : /Aborted|aborted|timeout/i.test(msg)
        ? '변환 서버 응답이 없어요. 서버와 같은 wifi인지 확인해줘.'
        : /connect to the server|Network|fetch failed/i.test(msg)
          ? '변환 서버에 연결하지 못했어요. 서버가 켜져 있는지 확인해줘.'
          : msg;
      setCharacterStatus('error');
      setCharacterError(friendly);
      return false;
    }
  };

  const goDrawing = () => {
    setDrawStrokes([]);
    setCharacterStatus('idle');
    setCharacterError('');
    setScreen('drawing');
  };

  const completeDrawing = () => {
    setLog((prev) => ({ ...prev, drawing: Math.max(prev.drawing, 1) }));
    setScreen('report');
  };

  const report = useMemo(
    () => ({
      quiz: log.quiz,
      drawing: log.drawing,
      skip: log.skip,
      watched: selectedVideo?.title || video.title,
      interests: ['고래', '용기', '친구', '색깔'],
    }),
    [log, selectedVideo]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <ExpoStatusBar style="dark" />
        <StatusBar hidden />
        <View style={styles.outer}>
        <View style={styles.tablet}>
          {screen !== 'intro' && screen !== 'welcome' && screen !== 'profile' && screen !== 'guardian' && screen !== 'main' && (
            <TabletHeader
              rightLabel={screen === 'report' ? '오늘 활동 집계' : '더보기'}
              onHome={() => setScreen('main')}
              onReport={() => setScreen('report')}
              // 영상 is the main screen's carousel; the other tabs live on the list screen.
              onTab={(key) => { setSelectedSeries(null); setTab(key); setScreen(key === 'library' ? 'main' : 'home'); }}
            />
          )}
          <ScreenFade screenKey={screen}>
          {screen === 'intro' && <IntroScreen onDone={() => setScreen('welcome')} logo={<StaryLogo size={54} />} />}
          {screen === 'welcome' && <OnboardIntroScreen onNext={() => setScreen('profile')} />}
          {screen === 'profile' && (
            <ChildProfileScreen profile={childProfile} onChange={setChildProfile} onNext={() => setScreen('guardian')} />
          )}
          {screen === 'guardian' && (
            <GuardianSetupScreen
              settings={guardianSettings}
              onChange={setGuardianSettings}
              onBack={() => setScreen('profile')}
              onDone={() => setScreen('main')}
            />
          )}
          {screen === 'main' && (
            <MainScreen
              profile={childProfile}
              onStart={(v) => { setSelectedSeries(v || null); setScreen('home'); }}
              onMenu={(key) => { setSelectedSeries(null); setTab(key); setScreen('home'); }}
              onJump={(key) => { if (key === 'detail' || key === 'watch') setSelectedVideo(LIBRARY[1].videos[0]); setScreen(key); }}
            />
          )}
          {screen === 'home' && selectedSeries && (
            <SeriesScreen
              series={selectedSeries}
              onBack={() => setScreen('main')}
              onStart={(v) => { setSelectedVideo(v || null); setScreen('detail'); }}
            />
          )}
          {screen === 'home' && !selectedSeries && (
            <HomeScreen
              characterImage={characterImage}
              profile={childProfile}
              series={selectedSeries}
              tab={tab}
              onTab={setTab}
              onBack={() => setScreen('main')}
              settings={guardianSettings}
              onSettings={setGuardianSettings}
              words={words}
              onEditProfile={() => setScreen('profile')}
              onStart={(v) => { setSelectedVideo(v || null); setScreen('watch'); }}
            />
          )}
          {screen === 'detail' && selectedVideo && (
            <VideoDetailScreen
              video={selectedVideo}
              series={selectedSeries}
              onClose={() => setScreen('home')}
              onStart={() => setScreen('watch')}
            />
          )}
          {screen === 'watch' && (
            <WatchScreen
              source={selectedVideo?.source || DEMO_VIDEO}
              quizDone={quizDone}
              onQuizCorrect={() => {
                setQuizDone(true);
                setWords((prev) => {
                  const seen = new Set(prev.map((w) => w.word));
                  const fresh = quiz.options
                    .filter((o) => !seen.has(o.label))
                    .map((o) => ({ word: o.label, meaning: o.meaning, example: o.example, color: o.color, answer: o.label === quiz.answer }));
                  return [...fresh, ...prev];
                });
                setLog((prev) => ({ ...prev, quiz: Math.max(prev.quiz, 1) }));
                // Demo growth rule: three correct answers and the star becomes a friend.
                setQuizCorrectCount((n) => {
                  const next = n + 1;
                  if (next >= EVOLVE_AT && childProfile.level < 2) setEvolving(true);
                  return next;
                });
              }}
              onQuizSkip={() => setLog((prev) => ({ ...prev, skip: prev.skip + 1 }))}
              onFinish={() => setScreen('activities')}
              onBack={() => setScreen('home')}
              onHome={() => setScreen('main')}
              onReport={() => setScreen('report')}
            />
          )}
          {screen === 'activities' && (
            <ActivitiesScreen
              characterImage={characterImage}
              onDrawing={goDrawing}
              onFinish={() => setScreen('report')}
            />
          )}
          {screen === 'drawing' && (
            <DrawingScreen
              strokes={drawStrokes}
              status={characterStatus}
              error={characterError}
              characterImage={characterImage}
              onChangeStrokes={setDrawStrokes}
              onCanvasSize={setDrawCanvasSize}
              onConvert={() => runGeneration(drawStrokes, drawCanvasSize)}
              onSave={() => { setSavedDrawing({ strokes: drawStrokes, size: drawCanvasSize }); completeDrawing(); }}
              onDone={completeDrawing}
              onSkip={() => {
                setLog((prev) => ({ ...prev, skip: prev.skip + 1 }));
                setScreen('activities');
              }}
            />
          )}
          {evolving ? (
            <EvolvePopup
              onPick={(species) => {
                setChildProfile((p) => ({ ...p, species, level: 2 }));
                setEvolving(false);
                playSound('fanfare');
              }}
            />
          ) : null}
          {screen === 'report' && (
            <ReportScreen
              report={report}
              characterImage={characterImage}
              savedDrawing={savedDrawing}
              onReplay={() => setScreen('watch')}
              onOtherVideos={() => { setSelectedSeries(null); setTab('library'); setScreen('home'); }}
              onCharacter={() => { setSelectedSeries(null); setTab('character'); setScreen('home'); }}
            />
          )}
          </ScreenFade>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Distance from a Text box's top edge down to the cap line, as a share of font size.
const CAP_TOP_RATIO = -0.11;

// Wordmark: "Stary" with a ringed star riding as a superscript — ring and star share the brand cyan.
function StaryLogo({ size = 26, color = '#609EF5', textColor = TEXT_ON_DARK }) {
  const mark = size * 0.5;
  return (
    <View style={styles.logoRow}>
      <Text style={[styles.logoWord, { fontSize: size, color: textColor }]}>Stary</Text>
      <Text style={[styles.logoWord, { fontSize: size, color, marginLeft: size * 0.16 }]}>Dot</Text>
      <Svg width={mark} height={mark} viewBox="0 0 32 32" // The text box starts above the cap line, so nudge the mark down to sit level with the S.
        style={{ marginLeft: size * 0.06, marginTop: size * CAP_TOP_RATIO }}>
        <Circle cx={16} cy={16} r={16} fill={color} />
        <Polygon
          points="16,5.6 19.1,12.4 26.5,13.2 20.9,18.2 22.5,25.5 16,21.8 9.5,25.5 11.1,18.2 5.5,13.2 12.9,12.4"
          fill="#ffffff"
        />
      </Svg>
    </View>
  );
}

function TabletHeader({ rightLabel, onHome, onReport, onTab }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onHome}>
        <StaryLogo size={30} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerMenu} onPress={() => (onTab ? setOpen((v) => !v) : onReport())} accessibilityLabel={rightLabel}>
        <View style={styles.headerMenuLine} />
        <View style={styles.headerMenuLine} />
        <View style={styles.headerMenuLine} />
      </TouchableOpacity>

      {open ? (
        <>
          <Pressable style={styles.headerSheetBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.headerSheet}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={styles.headerSheetItem}
                onPress={() => { setOpen(false); playSound('pop'); onTab(t.key); }}
              >
                <Text style={styles.headerSheetIcon}>{t.icon}</Text>
                <Text style={styles.headerSheetText}>{t.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.headerSheetDivider} />
            <TouchableOpacity style={styles.headerSheetItem} onPress={() => { setOpen(false); onReport(); }}>
              <Text style={styles.headerSheetIcon}>▤</Text>
              <Text style={styles.headerSheetText}>활동 리포트</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  );
}

const TABS = [
  { key: 'library', label: '영상', icon: '▶' },
  { key: 'character', label: '캐릭터', icon: '★' },
  { key: 'words', label: '단어장', icon: '가' },
  { key: 'settings', label: '설정', icon: '⚙' },
];


// Cards wear a lighter ring of their own colour, like the mockup.
function lighten(hex, amount) {
  const rgb = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return rgbToHex(rgb);
}

const CARD_W = 300;
const CARD_H = 420;
const CARD_GAP = 18;
const CARD_RADIUS = 26;
const CARD_BORDER = 3.5;
const CARD_OVERLAP = 58;

// The cards ride the rim of one big circle whose centre sits far below the screen: they keep
// facing the viewer, the middle one rides highest and largest, the outer ones sink along the arc.
const RING_RADIUS = 1500;
const RING_ANGLE = 9; // degrees between neighbouring cards
const RING_SAMPLES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const ringFacet = () => {
  const rad = (deg) => (deg * Math.PI) / 180;
  return {
    translateY: RING_SAMPLES.map((d) => RING_RADIUS * (1 - Math.cos(rad(d * RING_ANGLE)))),
    scale: RING_SAMPLES.map((d) => Math.max(0.6, Math.cos(rad(d * RING_ANGLE)) ** 3 * 1.06)),
    opacity: RING_SAMPLES.map((d) => (Math.abs(d) > 2.5 ? 0 : 1)),
  };
};

// A light wash over the flat card colour, plus a gradient rim — svg keeps it dependency-free.
// React Native borders take a single colour, so the rim is drawn rather than set as a border.
function CardSheen({ color }) {
  const rim = 'rim-' + color.slice(1);
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sheen" x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <Stop offset="0.55" stopColor="#ffffff" stopOpacity="0.06" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </LinearGradient>
        <LinearGradient id={rim} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={lighten(color, 0.75)} />
          <Stop offset="1" stopColor={lighten(color, 0.15)} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={CARD_RADIUS} fill="url(#sheen)" />
      {/* Drawn on the edge at double width so the outer half clips away: the rim then follows
          whatever size the card is, instead of the main screen's fixed card. */}
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={CARD_RADIUS}
        fill="none"
        stroke={`url(#${rim})`}
        strokeWidth={CARD_BORDER * 2}
      />
    </Svg>
  );
}

const VideoCard = React.memo(function VideoCard({ video, onPress }) {
  return (
    <TapScale style={[styles.card, { backgroundColor: video.color }]} onPress={() => { playSound('pop'); onPress(video); }}>
      <CardSheen color={video.color} />
      <Text style={styles.cardTitle} numberOfLines={2}>{video.title}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{video.duration}</Text>
      <View style={styles.cardBadge}><Text style={styles.cardBadgeText}>!</Text></View>
      {/* Some art fills its PNG edge to edge; artScale pulls those back in line with the rest. */}
      <Image source={video.thumb} style={[styles.cardArt, video.artScale ? { height: 260 * video.artScale } : null]} resizeMode="contain" />
    </TapScale>
  );
});

const STAR_BUDDY = require('./assets/characters/star-buddy.png');

const BUDDY_MENU = [
  { key: 'character', label: '캐릭터', icon: '★' },
  { key: 'words', label: '단어장', icon: '가' },
  { key: 'settings', label: '설정', icon: '⚙' },
];

// The star drifts and twinkles; tapping it opens the menu bubble that the screen owns, so the
// bubble can live in the free space bottom-right instead of being clipped beside the greeting.
function StarBuddy({ onPress }) {
  const float = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const tap = () => {
    playSound('pop');
    Animated.sequence([
      Animated.timing(press, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 14 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable onPress={tap}>
      <Animated.Image
        source={STAR_BUDDY}
        resizeMode="contain"
        style={{
          width: 128,
          height: 128,
          transform: [
            { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
            { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
            { scale: press },
          ],
        }}
      />
    </Pressable>
  );
}

// Landing screen, per the mockup: wordmark, a greeting with the child's name highlighted,
// and the video cards fanned out underneath.
// Dev-only shortcut: every screen is one tap away while the flow is being built.
const DEBUG_SCREENS = [
  ['intro', '인트로'],
  ['welcome', '온보딩 안내'],
  ['profile', '아이 프로필'],
  ['guardian', '보호자 설정'],
  ['main', '메인'],
  ['home', '영상 목록'],
  ['detail', '영상 상세'],
  ['watch', '영상 재생'],
  ['activities', '활동 선택'],
  ['drawing', '그림 그리기'],
  ['report', '활동 리포트'],
];

function DebugJump({ onJump }) {
  const [open, setOpen] = useState(false);
  if (!__DEV__) return null;
  return (
    <View style={styles.debugWrap}>
      <TouchableOpacity style={styles.debugBtn} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.debugBtnText}>{open ? '✕' : '⚙'}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={styles.debugList}>
          {DEBUG_SCREENS.map(([key, label]) => (
            <TouchableOpacity key={key} style={styles.debugItem} onPress={() => { setOpen(false); onJump(key); }}>
              <Text style={styles.debugItemText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MainScreen({ profile, onStart, onMenu, onJump }) {
  const win = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const bubble = useRef(new Animated.Value(0)).current;
  const toggleMenu = (next) => {
    setMenuOpen(next);
    Animated.spring(bubble, { toValue: next ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  };
  const base = LIBRARY[0].videos;
  // Cards overlap, so one step is narrower than a card.
  const step = CARD_W - CARD_OVERLAP;
  const total = base.length * step;
  // Scroll position in pixels, unbounded: the ring wraps it, so there is no end to hit.
  const offset = useSharedValue(0);
  const dragStart = useSharedValue(0);
  // Stacking cannot be animated, so the settled index is tracked to lift the front card.
  const [focus, setFocus] = useState(0);

  const ring = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragStart.value = offset.value;
        })
        .onUpdate((e) => {
          offset.value = dragStart.value - e.translationX;
        })
        .onEnd((e) => {
          // Fling, then settle: one continuous motion on the UI thread, so nothing hitches.
          offset.value = withDecay({ velocity: -e.velocityX, deceleration: 0.9985 }, () => {
            const snapped = Math.round(offset.value / step) * step;
            offset.value = withSpring(snapped, { damping: 18, stiffness: 90, mass: 0.5 });
            runOnJS(setFocus)((((snapped / step) % base.length) + base.length) % base.length);
          });
        }),
    [step, base.length]
  );

  return (
    <View style={styles.mainScreen}>
      <DebugJump onJump={onJump} />
      <StaryLogo size={30} textColor={BG} />

      <View style={styles.mainGreetRow}>
      <View style={styles.buddySpacer} />
      <View style={styles.mainGreetBlock}>
        <View style={styles.mainGreetLine}>
          <Text style={styles.mainGreeting}>안녕! </Text>
          <View>
            <Text style={styles.mainGreeting}>{profile.name || '친구'}!</Text>
            <View style={styles.mainUnderline} />
          </View>
        </View>
        <Text style={styles.mainGreeting}>오늘은 우리 뭐 할까?</Text>
      </View>
      <View style={styles.buddyAnchor} collapsable={false}>
        <StarBuddy onPress={() => toggleMenu(!menuOpen)} />
        {menuOpen ? (
          <Animated.View
            style={[
              styles.buddyBubble,
              {
                opacity: bubble,
                transform: [
                  { translateX: bubble.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
                  { scale: bubble },
                ],
              },
            ]}
          >
            <View style={styles.buddyTail} />
            <Text style={styles.buddyText}>어디로 갈까?</Text>
            <View style={styles.buddyMenu}>
              {BUDDY_MENU.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={styles.buddyMenuItem}
                  onPress={() => { toggleMenu(false); playSound('pop'); onMenu(m.key); }}
                >
                  <Text style={styles.buddyMenuIcon}>{m.icon}</Text>
                  <Text style={styles.buddyMenuText}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        ) : null}
      </View>
      </View>

      <GestureDetector gesture={ring}>
        <View style={styles.carousel} collapsable={false}>
          {base.map((v, i) => (
            <RingCard
              key={v.id}
              video={v}
              index={i}
              offset={offset}
              step={step}
              total={total}
              centerX={(win.width - CARD_W) / 2}
              focused={i === focus}
              onPress={onStart}
            />
          ))}
        </View>
      </GestureDetector>

    </View>
  );
}

function RingCard({ video, index, offset, step, total, centerX, focused, onPress }) {
  const facet = ringFacet();
  const style = useAnimatedStyle(() => {
    const half = total / 2;
    const raw = index * step - offset.value;
    // Wrap into [-half, half): every card is always shown on its nearest side of the ring.
    const d = (((raw + half) % total) + total) % total - half;
    const k = d / step;
    return {
      opacity: interpolate(k, RING_SAMPLES, facet.opacity, Extrapolation.CLAMP),
      transform: [
        { translateX: centerX + d },
        { translateY: interpolate(k, RING_SAMPLES, facet.translateY, Extrapolation.CLAMP) },
        { scale: interpolate(k, RING_SAMPLES, facet.scale, Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Rea.View
      pointerEvents={focused ? 'auto' : 'none'}
      style={[styles.ringCard, { zIndex: focused ? 20 : 1, elevation: focused ? 12 : 0 }, style]}
    >
      <VideoCard video={video} onPress={onPress} />
    </Rea.View>
  );
}

const SERIES_FILTERS = ['전체', '인기순', '최신순'];
const SERIES_HERO_W = 330;

// What the child sees after picking an episode: a big still, one start button, and what waits inside.
function VideoDetailScreen({ video, series, onClose, onStart }) {
  const accent = (series && series.accent) || '#00CFE9';
  return (
    <View style={[styles.detailScreen, { backgroundColor: (series && series.tint) || '#f5f8ff' }]}>
      <TouchableOpacity style={styles.detailClose} onPress={onClose}>
        <Text style={styles.detailCloseText}>✕</Text>
      </TouchableOpacity>

      <View style={styles.detailThumb}>
        {/* Until per-video stills exist, frames pulled from the demo video stand in. */}
        <Image source={video.still || THUMBS[0]} style={styles.detailThumbImg} resizeMode="cover" />
        {/* Absolute overlay, so the button centres on the still instead of being pushed below it. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={styles.detailOverlay}>
            <TapScale style={styles.detailStart} onPress={() => { playSound('pop'); onStart(video); }}>
              <View style={[styles.detailPlay, { backgroundColor: accent }]}>
                <Text style={styles.detailPlayGlyph}>▶</Text>
              </View>
              <Text style={styles.detailStartText}>시작하기</Text>
            </TapScale>
          </View>
        </View>
      </View>

      <Text style={styles.detailTitle}>
        {video.title}
        <Text style={styles.detailMeta}>  {video.duration} · 만 5~6세</Text>
      </Text>
      {/* ponytail: fixed counts until activities are authored per video. */}
      <Text style={styles.detailCounts}>질문 1개 · 퍼즐 1개 · 그림 1개</Text>
    </View>
  );
}

// Any character image, breathing and squashing on tap — the same feel as the mascot.
function BouncyCharacter({ source, size = 200 }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 16 }),
    ]).start();
    playSound('pop');
  };
  return (
    <Pressable onPress={tap}>
      <Animated.Image
        source={source}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          transform: [
            { translateY: breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
            { scale },
          ],
        }}
      />
    </Pressable>
  );
}

// Series screen: the character sits on the left inviting the child, episodes fill the grid.
function SeriesScreen({ series, onBack, onStart }) {
  const [filter, setFilter] = useState('전체');
  // Percentage basis was letting a fourth item squeeze in, so the width is measured.
  const win = useWindowDimensions();
  // 3 per row: screen padding, the hero column, the body gap and the two grid gaps come off first.
  const episodeW = Math.floor((win.width - 48 - SERIES_HERO_W - 24 - 32) / 3);
  const episodes = series.episodes || LIBRARY[1].videos;
  return (
    <View style={[styles.seriesScreen, { backgroundColor: series.tint || '#f5f8ff' }]}>
      <View style={styles.seriesHeader}>
        <TouchableOpacity style={styles.seriesBack} onPress={onBack}>
          <Text style={styles.seriesBackText}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={[styles.seriesTitle, { color: series.accent || BG }]}>{series.title}</Text>
        <Text style={styles.seriesCount}>동영상 {episodes.length}개</Text>
      </View>

      <View style={styles.seriesBody}>
        <View style={[styles.seriesHero, { backgroundColor: series.color }]}>
          <CardSheen color={series.color} />
          {/* Line sits on the floor of the card; the character takes every pixel left above it. */}
          <View style={styles.seriesHeroArt}>
            <BouncyCharacter source={series.thumb} size={SERIES_HERO_W - 40} />
          </View>
          <Text style={styles.seriesHeroLine}>{series.line || '“나랑 같이 놀자”'}</Text>
        </View>

        <View style={styles.seriesRight}>
          <View style={styles.seriesFilters}>
            {SERIES_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.seriesFilter,
                  filter === f && { backgroundColor: series.accent || '#00CFE9', borderColor: series.accent || '#00CFE9' },
                ]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.seriesFilterText, filter === f && { color: '#ffffff' }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.seriesGrid} showsVerticalScrollIndicator={false}>
            {episodes.map((v, i) => (
              <TapScale key={v.id} style={[styles.episode, { width: episodeW }]} onPress={() => { playSound('pop'); onStart(v); }}>
                <View style={[styles.episodeThumb, { backgroundColor: v.color || series.color }]}>
                  <Image source={v.still || THUMBS[i % THUMBS.length]} style={styles.episodeImg} resizeMode="cover" />
                </View>
                <Text style={styles.episodeTitle} numberOfLines={1}>{v.title}</Text>
              </TapScale>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

// Every word the child met in a quiz, kept with its meaning and a sentence to say it in.
function WordsScreen({ words }) {
  if (!words.length) {
    return (
      <View style={styles.tabPlaceholder}>
        <Text style={styles.mainGreetingSub}>퀴즈를 풀면 단어가 모여요</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.wordGrid} showsVerticalScrollIndicator={false}>
      {words.map((w) => (
        <View key={w.word} style={styles.wordCard}>
          <View style={styles.wordHead}>
            <View style={[styles.wordDot, { backgroundColor: w.color || '#00CFE9' }]} />
            <Text style={styles.wordText}>{w.word}</Text>
            {w.answer ? <Text style={styles.wordBadge}>정답</Text> : null}
          </View>
          <Text style={styles.wordMeaning}>{w.meaning}</Text>
          <Text style={styles.wordExample}>“{w.example}”</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// The grown-ups' screen: what the child is allowed to do, and for how long.
function SettingsScreen({ profile, settings, onChange, onEditProfile }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const act = (key) => set({ activities: { ...settings.activities, [key]: !settings.activities[key] } });
  return (
    <ScrollView contentContainerStyle={styles.settingsBody} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsCardTitle}>아이 정보</Text>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>이름</Text>
          <Text style={styles.settingsValue}>{profile.name || '친구'}</Text>
        </View>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>나이</Text>
          <Text style={styles.settingsValue}>{ageLabel(profile.birth) || '-'}</Text>
        </View>
        <TouchableOpacity style={styles.settingsEdit} onPress={onEditProfile}>
          <Text style={styles.settingsEditText}>프로필 수정</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsCardTitle}>하루 사용 시간</Text>
        <DailyLimitPicker value={settings.dailyLimit} onSelect={(dailyLimit) => set({ dailyLimit })} />
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsCardTitle}>활동</Text>
        {[
          ['quiz', '퀴즈', '영상 중간에 질문을 물어봐요'],
          ['trace', '그림', '영상이 끝나면 그림을 그려요'],
          ['puzzle', '퍼즐', '영상 중간에 퍼즐을 맞춰요'],
        ].map(([key, label, hint]) => (
          <TouchableOpacity key={key} style={styles.settingsRow} onPress={() => act(key)}>
            <View style={styles.settingsRowText}>
              <Text style={styles.settingsLabel}>{label}</Text>
              <Text style={styles.settingsHint}>{hint}</Text>
            </View>
            <View style={[styles.toggle, settings.activities[key] && styles.toggleOn]}>
              <View style={[styles.toggleKnob, settings.activities[key] && styles.toggleKnobOn]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsCardTitle}>소리</Text>
        <TouchableOpacity style={styles.settingsRow} onPress={() => set({ sound: !settings.sound })}>
          <View style={styles.settingsRowText}>
            <Text style={styles.settingsLabel}>효과음</Text>
            <Text style={styles.settingsHint}>버튼과 정답 소리를 켜요</Text>
          </View>
          <View style={[styles.toggle, settings.sound && styles.toggleOn]}>
            <View style={[styles.toggleKnob, settings.sound && styles.toggleKnobOn]} />
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function HomeScreen({ characterImage, onStart, profile, tab = 'library', onTab, onBack, series, settings, onSettings, onEditProfile, words = [] }) {
  const [focus, setFocus] = useState(0);
  // A card on the main screen opens that series; without one, fall back to the popular row.
  const category = series ? { videos: series.episodes || LIBRARY[1].videos } : LIBRARY[0];

  return (
    <View style={styles.screen}>
      {tab !== 'library' ? (
        <View style={styles.tabScreen}>
          <View style={styles.tabHead}>
            <TouchableOpacity style={styles.backChip} onPress={onBack}>
              <Text style={styles.backChipText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.tabHeadTitle}>{(TABS.find((t) => t.key === tab) || {}).label}</Text>
          </View>
          {tab === 'words' ? (
            <WordsScreen words={words} />
          ) : tab === 'settings' ? (
            <SettingsScreen profile={profile} settings={settings} onChange={onSettings} onEditProfile={onEditProfile} />
          ) : (
            <View style={styles.tabPlaceholder}>
              <Text style={styles.mainGreetingSub}>{(TABS.find((t) => t.key === tab) || {}).label} 화면은 준비 중이에요</Text>
            </View>
          )}
        </View>
      ) : (
      <>
      <View style={styles.libHeader}>
        {onBack ? (
          <TouchableOpacity style={styles.backChip} onPress={onBack}>
            <Text style={styles.backChipText}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <PattiCharacter species={profile?.species} level={profile?.level} size={0.86} />
        <View style={styles.libGreetText}>
          <Text style={styles.libTitle}>{series ? series.title : '오늘은 뭐 볼까?'}</Text>
          <Text style={styles.libSubtitle}>{series ? series.duration : '보고 싶은 영상을 골라봐'}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + CARD_GAP}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setFocus(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP)))}
        contentContainerStyle={styles.carouselContent}
      >
        {category.videos.map((v, i) => (
          <TapScale
            key={v.id}
            style={[styles.card, { backgroundColor: v.color }, i === focus && styles.cardFocused]}
            onPress={() => { playSound('pop'); onStart(v); }}
          >
            <CardSheen color={v.color} />
            <Text style={styles.cardTitle} numberOfLines={2}>{v.title}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{v.duration}</Text>
            <Image source={v.thumb || THUMBS[i % THUMBS.length]} style={styles.cardArt} resizeMode="contain" />
          </TapScale>
        ))}
      </ScrollView>
      </>
      )}
    </View>
  );
}

// Demo stand-in for the pre-generated content schedule. Later: load per video_id from the
// analysis pipeline's activities.json — same shape { at: seconds, type }.
const ACTIVITIES = [
  { at: 10, type: 'quiz' },
  { at: 20, type: 'trace' },
  { at: 30, type: 'puzzle' },
];

// Announcement shown right before each activity starts.
const ACT_MSG = {
  quiz: { text: '같이 퀴즈 풀어보자!', emoji: '🧠' },
  trace: { text: '같이 그림 그려보자!', emoji: '✏️' },
  puzzle: { text: '퍼즐 맞춰볼까?', emoji: '🧩' },
  color: { text: '이제 색칠하러 가자!', emoji: '🎨' },
};

// Toss-style center popup with a spring pop-in. Self-animates on mount.
// Development differs month to month at this age, so the profile takes a birth date, not a year.
function ageInMonths(birth) {
  if (!birth || !birth.y || !birth.m || !birth.d) return null;
  const now = new Date();
  const months = (now.getFullYear() - birth.y) * 12 + (now.getMonth() + 1 - birth.m);
  return now.getDate() < birth.d ? months - 1 : months;
}

// Tap a field, pick from a scrolling list — the pattern grown-ups expect from a date field.
function BirthDropdown({ values, value, unit, onSelect }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef(null);
  const index = Math.max(0, values.indexOf(value));
  return (
    <>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownValue}>{value != null ? `${value}${unit}` : `-${unit}`}</Text>
        <Text style={styles.dropdownCaret}>▾</Text>
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)} supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.dropdownSheet}>
            <ScrollView
              ref={listRef}
              showsVerticalScrollIndicator={false}
              onLayout={() => listRef.current?.scrollTo({ y: Math.max(0, (index - 2) * 48), animated: false })}
            >
              {values.map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.dropdownOption, v === value && styles.dropdownOptionOn]}
                  onPress={() => { onSelect(v); setOpen(false); }}
                >
                  <Text style={[styles.dropdownOptionText, v === value && styles.dropdownOptionTextOn]}>{v}{unit}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const THIS_YEAR = new Date().getFullYear();

function ageLabel(birth) {
  const months = ageInMonths(birth);
  if (months == null || months < 0 || months > 300) return '';
  return `만 ${Math.floor(months / 12)}세 ${months % 12}개월`;
}
// 10 to 180 minutes. Too many values for a chip row, hence the scrolling picker below.
const DAILY_LIMITS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);
const LIMIT_ITEM_W = 88;
const LIMIT_TRACK_W = 440;
const LIMIT_PAD = (LIMIT_TRACK_W - LIMIT_ITEM_W) / 2;

// Toss-style opener: one promise, one button, nothing to decide yet.
function OnboardIntroScreen({ onNext }) {
  return (
    <View style={styles.welcomeScreen}>
      <View style={styles.welcomeBody}>
        <Text style={styles.welcomeBadge}>시작하기 전에</Text>
        <Text style={styles.welcomeTitle}>아이에 대해 알아봐요!</Text>
        <Text style={styles.welcomeCopy}>
          이름과 나이를 알려주시면 아이에게 맞는 활동을 준비해요.{'\n'}
          사용 시간과 활동은 보호자가 정할 수 있어요.
        </Text>
      </View>
      <TapScale style={styles.welcomeButton} onPress={onNext}>
        <Text style={styles.welcomeButtonText}>시작하기</Text>
      </TapScale>
    </View>
  );
}

// First run, step 1: who is drawing today.
// Tap the circle to shoot a profile photo; the character stands in until there is one.
function ProfilePhotoPicker({ photo, tone, onPick }) {
  const take = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('카메라 권한 필요', '설정에서 카메라 권한을 허용하면 사진을 찍을 수 있어요.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!shot.canceled) onPick(shot.assets[0].uri);
  };

  return (
    <TouchableOpacity
      style={styles.photoCircle}
      onPress={take}
      accessibilityRole="button"
      accessibilityLabel={photo ? '프로필 사진 다시 찍기' : '프로필 사진 찍기'}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photoImage} />
      ) : (
        <PattiCharacter tone={tone} size={0.85} />
      )}
      <View style={styles.photoBadge}>
        <Text style={styles.photoBadgeText}>📷</Text>
      </View>
    </TouchableOpacity>
  );
}

function ChildProfileScreen({ profile, onChange, onNext }) {
  const ready = profile.name.trim().length > 0 && ageInMonths(profile.birth) != null;
  return (
    <View style={styles.onboardScreen}>
      <View style={styles.onboardHeader}>
        <Text style={styles.onboardStep}>1 / 2</Text>
        <Text style={styles.onboardTitle}>아이 프로필</Text>
        <Text style={styles.onboardCopy}>이름과 나이를 알려주면 맞춤 활동을 준비해요.</Text>
      </View>

      <View style={styles.onboardBody}>
        <ProfilePhotoPicker
          photo={profile.photo}
          tone={profile.tone}
          onPick={(photo) => onChange({ ...profile, photo })}
        />
        <View style={styles.onboardFields}>
          <Text style={styles.onboardLabel}>닉네임</Text>
          <TextInput
            style={styles.onboardInput}
            value={profile.name}
            onChangeText={(name) => onChange({ ...profile, name })}
            placeholder="예: 하늘"
            placeholderTextColor="#a8b2c8"
            maxLength={10}
          />

          <Text style={styles.onboardLabel}>생년월일</Text>
          <View style={styles.birthRow}>
            <BirthDropdown
              values={range(THIS_YEAR - 8, THIS_YEAR)}
              value={profile.birth?.y}
              unit="년"
              onSelect={(y) => onChange({ ...profile, birth: { ...profile.birth, y } })}
            />
            <BirthDropdown
              values={range(1, 12)}
              value={profile.birth?.m}
              unit="월"
              onSelect={(m) => onChange({ ...profile, birth: { ...profile.birth, m } })}
            />
            <BirthDropdown
              values={range(1, 31)}
              value={profile.birth?.d}
              unit="일"
              onSelect={(d) => onChange({ ...profile, birth: { ...profile.birth, d } })}
            />
          </View>
          {ageLabel(profile.birth) ? <Text style={styles.birthAge}>{ageLabel(profile.birth)}</Text> : null}

        </View>
      </View>

      <TapScale style={[styles.darkButton, !ready && styles.buttonDisabled]} onPress={() => ready && onNext()}>
        <Text style={styles.darkButtonText}>다음</Text>
      </TapScale>
    </View>
  );
}

// First run, step 2: the grown-up rules for the session.
// Each card is a vertical wheel: the number under the middle of the card is the selection.
const WHEEL_ITEM_H = 62;

function StepperCard({ values, value, label, onChange }) {
  const ref = useRef(null);
  const index = Math.max(0, values.indexOf(value));
  return (
    <View style={styles.stepperCol}>
      <View style={styles.stepperCard}>
        <Text style={styles.stepperArrowText}>⌃</Text>
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_H}
          decelerationRate="fast"
          style={styles.stepperViewport}
          onLayout={() => ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: false })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_H);
            const next = values[Math.min(values.length - 1, Math.max(0, i))];
            if (next !== value) { playSound('pop'); onChange(next); }
          }}
        >
          {values.map((v) => (
            <View key={v} style={styles.stepperItem}>
              <Text style={styles.stepperValue}>{String(v).padStart(2, '0')}</Text>
            </View>
          ))}
        </ScrollView>
        <Text style={[styles.stepperArrowText, styles.stepperArrowDown]}>⌄</Text>
      </View>
      <Text style={styles.stepperLabel}>{label}</Text>
    </View>
  );
}

const HOUR_VALUES = [0, 1, 2, 3, 4, 5, 6];
const MINUTE_VALUES = [0, 10, 20, 30, 40, 50];

function DailyLimitPicker({ value, onSelect }) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return (
    <View style={styles.stepperRow}>
      <StepperCard
        values={HOUR_VALUES}
        value={hours}
        label="시간"
        onChange={(h) => onSelect(Math.max(10, h * 60 + minutes))}
      />
      <Text style={styles.stepperColon}>:</Text>
      <StepperCard
        values={MINUTE_VALUES}
        value={minutes}
        label="분"
        onChange={(m) => onSelect(Math.max(10, hours * 60 + m))}
      />
    </View>
  );
}

function GuardianSetupScreen({ settings, onChange, onBack, onDone }) {
  return (
    <View style={styles.onboardScreen}>
      <View style={styles.onboardHeader}>
        <Text style={styles.onboardStep}>2 / 2</Text>
        <Text style={styles.onboardTitle}>보호자 설정</Text>
        <Text style={styles.onboardCopy}>사용 시간과 활동은 언제든 보호자 설정에서 바꿀 수 있어요.</Text>
      </View>

      <View style={[styles.onboardFields, styles.guardianFields]}>
        <Text style={styles.onboardLabel}>하루 사용 시간</Text>
        <DailyLimitPicker
          value={settings.dailyLimit}
          onSelect={(dailyLimit) => onChange({ ...settings, dailyLimit })}
        />

        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => onChange({ ...settings, consent: !settings.consent })}
        >
          <View style={[styles.checkbox, settings.consent && styles.checkboxOn]}>
            <Text style={styles.checkboxMark}>{settings.consent ? '✓' : ''}</Text>
          </View>
          <View style={styles.consentTextWrap}>
            <Text style={styles.consentText}>
              <Text style={styles.consentRequired}>(필수) </Text>
              아이의 활동 기록·그림 데이터 수집 및 이용
            </Text>
            <Text style={styles.consentSub}>활동 응답과 그림은 보호자 리포트를 만드는 데만 쓰여요.</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.onboardActions}>
        <TouchableOpacity style={styles.lightButton} onPress={onBack}>
          <Text style={styles.lightButtonText}>이전</Text>
        </TouchableOpacity>
        <TapScale style={[styles.darkButton, !settings.consent && styles.buttonDisabled]} onPress={() => settings.consent && onDone()}>
          <Text style={styles.darkButtonText}>시작하기</Text>
        </TapScale>
      </View>
    </View>
  );
}

const EVOLVE_AT = 3;

// The one moment the child picks a species: the star has grown and becomes a friend.
function EvolvePopup({ onPick }) {
  return (
    <Modal transparent visible animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
      <View style={styles.evolveBackdrop}>
        <View style={styles.evolveCard}>
          <Text style={styles.evolveTitle}>별이 자랐어요!</Text>
          <Text style={styles.evolveCopy}>어떤 친구가 될까?</Text>
          <View style={styles.evolveRow}>
            {[{ key: 'rabbit', label: '토끼' }, { key: 'dino', label: '공룡' }].map((c) => (
              <TouchableOpacity key={c.key} style={styles.evolveChoice} onPress={() => onPick(c.key)}>
                <Image source={CHARACTER_IMAGES[c.key]} style={styles.evolveImage} resizeMode="contain" />
                <Text style={styles.chipText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CenterPopup({ text, emoji = '✨' }) {
  const a = useRef(new Animated.Value(0)).current;
  const win = useWindowDimensions();
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent visible animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
      <View style={{ width: win.width, height: win.height, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <View style={styles.praiseScrim} />
        <Animated.View
          style={[styles.praiseCard, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}
        >
          <Text style={styles.praiseText}>{text}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

function WatchScreen({ source = DEMO_VIDEO, quizDone, onQuizCorrect, onQuizSkip, onFinish, onBack, onHome, onReport }) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.play();
  });
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(quizDone);
  const [countdown, setCountdown] = useState(null);
  const [active, setActive] = useState(null); // current activity type: 'quiz' | 'trace' | 'puzzle' | null
  const [announce, setAnnounce] = useState(null); // activity type being announced before it opens
  const [celebrate, setCelebrate] = useState(false); // "잘했어요" popup between an activity and resuming the video
  const firedRef = useRef(new Set());

  // Brief "잘했어요" celebration, then resume the video.
  useEffect(() => {
    if (!celebrate) return undefined;
    playSound('fanfare');
    const id = setTimeout(() => {
      setCelebrate(false);
      player.play();
    }, 1600);
    return () => clearTimeout(id);
  }, [celebrate]);
  const cdAnim = useRef(new Animated.Value(1)).current;

  // Show the "같이 ~ 해보자" popup for a moment, then open the activity.
  useEffect(() => {
    if (!announce) return undefined;
    speak(announce);
    const id = setTimeout(() => {
      setActive(announce);
      setAnnounce(null);
    }, 1600);
    return () => clearTimeout(id);
  }, [announce]);

  // Pop each countdown number so the 3-2-1 feels intentional, not a static flash.
  useEffect(() => {
    if (countdown == null) return;
    cdAnim.setValue(0.5);
    Animated.spring(cdAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [countdown]);

  // Drive triggers off the ACTIVITIES schedule: 3s countdown, then pause + show the activity.
  useEffect(() => {
    const id = setInterval(() => {
      const t = player.currentTime || 0;
      let cd = null;
      for (const a of ACTIVITIES) {
        if (!firedRef.current.has(a.at) && t >= a.at - 3 && t < a.at) { cd = Math.ceil(a.at - t); break; }
      }
      setCountdown((prev) => (prev === cd ? prev : cd));
      for (const a of ACTIVITIES) {
        if (!firedRef.current.has(a.at) && t >= a.at && t < a.at + 10) {
          firedRef.current.add(a.at);
          player.pause();
          if (a.type === 'quiz') setSelected(null);
          setAnnounce(a.type);
          break;
        }
      }
    }, 350);
    return () => clearInterval(id);
  }, [player]);

  // When the video finishes, move to the final activities page.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => onFinish());
    return () => sub.remove();
  }, [player]);

  const resume = () => {
    setActive(null);
    player.play();
  };
  const resumeTrace = resume;
  // Puzzle finished → show "잘했어요" popup, then the effect resumes the video.
  const resumePuzzle = () => {
    setActive(null);
    setCelebrate(true);
  };
  const handleAnswer = (label) => {
    setSelected(label);
    if (label === quiz.answer) {
      setAnswered(true);
      playSound('success');
      speak('correct');
      onQuizCorrect();
    } else {
      playSound('wrong');
      speak('retry');
    }
  };

  if (active === 'trace') {
    return (
      <View style={styles.watchScreen}>
        {onBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>‹ 뒤로</Text>
          </TouchableOpacity>
        ) : null}
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹ 뒤로</Text>
        </TouchableOpacity>
      ) : null}
        <TraceOverlay onDone={resumeTrace} />
      </View>
    );
  }

  return (
    <View style={styles.watchScreen}>
      <View style={styles.videoCard}>
        {active !== 'puzzle' ? (
          <VideoView style={styles.video} player={player} nativeControls={active !== 'quiz'} contentFit="contain" surfaceType="textureView" />
        ) : null}
        {countdown != null && !active && !announce ? (
          <Animated.View style={[styles.countdown, { transform: [{ scale: cdAnim }] }]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="cd" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#BADAFF" />
                  <Stop offset="1" stopColor="#FFFFFF" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" rx={39} fill="url(#cd)" />
            </Svg>
            <Text style={styles.countdownText}>{countdown}</Text>
          </Animated.View>
        ) : null}
        {announce ? <CenterPopup text={ACT_MSG[announce].text} emoji={ACT_MSG[announce].emoji} /> : null}
        {active === 'quiz' ? (
          <QuizOverlay
            selected={selected}
            onAnswer={handleAnswer}
            onRetry={() => setSelected(null)}
            onResume={resume}
            onSkip={() => {
              onQuizSkip();
              resume();
            }}
          />
        ) : null}
      </View>
      {active === 'puzzle' ? (
        <Modal transparent visible animationType="fade" presentationStyle="overFullScreen" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']} onRequestClose={resumePuzzle}>
          <View style={styles.puzzleModal}>
            <TabletHeader rightLabel="보호자 설정" onHome={onHome} onReport={onReport} />
            <PuzzleScreen onDone={resumePuzzle} />
          </View>
        </Modal>
      ) : null}
      {celebrate ? <CenterPopup text="잘했어요! 🎉" emoji="🎉" /> : null}
    </View>
  );
}

const COLOR_SWATCHES = ['#111111', '#e5484d', '#00CFE9', '#f5c518'];

// Recently mixed colours live outside React so every canvas screen shares one list.
const RECENT_COLORS = { list: [] };
function useRecentColors() {
  const [, bump] = useState(0);
  const add = (hex) => {
    if (!RECENT_COLORS.list.includes(hex)) RECENT_COLORS.list = [hex, ...RECENT_COLORS.list].slice(0, 8);
    bump((n) => n + 1);
  };
  return [RECENT_COLORS.list, add];
}

const rgbToHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

// One RGB channel, dragged like the pen-size rail.
function ChannelSlider({ label, value, tint, onChange }) {
  const [trackW, setTrackW] = useState(160);
  const pickRef = useRef(null);
  pickRef.current = (x) => onChange(Math.round(Math.min(1, Math.max(0, x / trackW)) * 255));
  const pan = useMemo(
    () => Gesture.Pan().runOnJS(true).minDistance(0).maxPointers(1)
      .onBegin((e) => pickRef.current(e.x))
      .onUpdate((e) => pickRef.current(e.x)),
    []
  );
  return (
    <View style={styles.channelRow}>
      <Text style={styles.channelLabel}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View style={styles.channelHit} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <View style={styles.channelTrack} />
          <View style={[styles.channelFill, { width: `${(value / 255) * 100}%`, backgroundColor: tint }]} />
          <View style={[styles.channelThumb, { left: `${(value / 255) * 100}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.channelValue}>{value}</Text>
    </View>
  );
}

// Grid of standard colours, mirroring the picker kids already see in Samsung Notes.
const PICKER_HUES = [0, 20, 40, 55, 80, 120, 160, 180, 200, 220, 245, 275, 300, 330];
const PICKER_LEVELS = [0.93, 0.85, 0.75, 0.65, 0.55, 0.45, 0.36, 0.27, 0.18];

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

function ColorPickerModal({ visible, initial, onCancel, onDone }) {
  const [tab, setTab] = useState('standard');
  const [color, setColor] = useState(initial);
  const [recent, addRecent] = useRecentColors();
  useEffect(() => {
    if (visible) setColor(initial);
  }, [visible, initial]);
  const rgb = hexToRgb(color);
  const setChannel = (i, v) => {
    const next = [...rgb];
    next[i] = v;
    setColor(rgbToHex(next));
  };
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel} supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
      {/* Modal renders in its own native hierarchy, so gesture-handler needs a root here too. */}
      <GestureHandlerRootView style={styles.pickerBackdrop}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerTabs}>
            {[{ k: 'standard', t: '표준' }, { k: 'custom', t: '사용자 지정' }].map((x) => (
              <TouchableOpacity key={x.k} style={[styles.pickerTab, tab === x.k && styles.pickerTabOn]} onPress={() => setTab(x.k)}>
                <Text style={styles.pickerTabText}>{x.t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'standard' ? (
            <View style={styles.pickerGrid}>
              <View style={styles.pickerCol}>
                {PICKER_LEVELS.map((l) => {
                  const c = hslToHex(0, 0, l);
                  return <TouchableOpacity key={`g${l}`} style={[styles.pickerCell, { backgroundColor: c }, color === c && styles.pickerCellOn]} onPress={() => setColor(c)} />;
                })}
              </View>
              {PICKER_HUES.map((h) => (
                <View key={h} style={styles.pickerCol}>
                  {PICKER_LEVELS.map((l) => {
                    const c = hslToHex(h, 0.85, l);
                    return <TouchableOpacity key={`${h}-${l}`} style={[styles.pickerCell, { backgroundColor: c }, color === c && styles.pickerCellOn]} onPress={() => setColor(c)} />;
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.pickerCustom}>
              <ChannelSlider label="R" value={rgb[0]} tint="#e5484d" onChange={(v) => setChannel(0, v)} />
              <ChannelSlider label="G" value={rgb[1]} tint="#46a758" onChange={(v) => setChannel(1, v)} />
              <ChannelSlider label="B" value={rgb[2]} tint="#3b82f6" onChange={(v) => setChannel(2, v)} />
            </View>
          )}

          <View style={styles.pickerReadout}>
            <View style={[styles.pickerPreview, { backgroundColor: color }]} />
            {[['색상 코드', color.toUpperCase()], ['빨간색', rgb[0]], ['녹색', rgb[1]], ['파란색', rgb[2]]].map(([label, value]) => (
              <View key={label} style={styles.pickerReadoutItem}>
                <Text style={styles.pickerReadoutLabel}>{label}</Text>
                <Text style={styles.pickerReadoutValue}>{value}</Text>
              </View>
            ))}
          </View>

          {recent.length ? (
            <View style={styles.swatchRow}>
              <Text style={styles.recentLabel}>자주 쓰는 색</Text>
              {recent.map((c) => (
                <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} onPress={() => setColor(c)} />
              ))}
            </View>
          ) : null}

          <View style={styles.pickerFooter}>
            <TouchableOpacity style={styles.pickerFooterBtn} onPress={onCancel}>
              <Text style={styles.pickerFooterText}>취소</Text>
            </TouchableOpacity>
            <View style={styles.toolDivider} />
            <TouchableOpacity style={styles.pickerFooterBtn} onPress={() => { addRecent(color); onDone(color); }}>
              <Text style={[styles.pickerFooterText, { color: '#00CFE9' }]}>완료</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Toolbar palette: a few presets, the colours the child saved, and the full picker.
function ColorControls({ value, onChange, swatches }) {
  const [recent] = useRecentColors();
  const [picking, setPicking] = useState(false);
  return (
    <View style={styles.swatchRow}>
      {swatches.slice(0, 4).map((c) => (
        <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, value === c && styles.swatchOn]} onPress={() => onChange(c)} />
      ))}
      {recent.slice(0, 3).map((c) => (
        <TouchableOpacity key={c} style={[styles.swatchSmall, { backgroundColor: c }, value === c && styles.swatchOn]} onPress={() => onChange(c)} />
      ))}
      <TouchableOpacity style={[styles.swatch, styles.swatchMore, { backgroundColor: value }]} onPress={() => setPicking(true)}>
        <Text style={styles.swatchMoreText}>＋</Text>
      </TouchableOpacity>
      <ColorPickerModal
        visible={picking}
        initial={value}
        onCancel={() => setPicking(false)}
        onDone={(c) => { onChange(c); setPicking(false); }}
      />
    </View>
  );
}

const EMPTY_FILLS = [];

const PEN_MIN = 1;
const PEN_MAX = 100;
// Slider units are 1-100, but a 100px radius is absurd on canvas: map it onto the pen radius
// range the fixed-size buttons used to cover (drawn width is about twice this).
const penPx = (value) => 1 + (value - 1) * 0.25;

// Strokes and bucket fills share one timeline so undo/redo walks them in the order they happened.
function useCanvasHistory() {
  const [strokes, setStrokes] = useState([]);
  const [fills, setFills] = useState([]);
  const [order, setOrder] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const addStroke = (updater) => {
    setStrokes(updater);
    setOrder((o) => [...o, 's']);
    setRedoStack([]);
  };
  const addFill = (op) => {
    setFills((f) => [...f, op]);
    setOrder((o) => [...o, 'f']);
    setRedoStack([]);
  };
  const undo = () => {
    const kind = order[order.length - 1];
    if (!kind) return;
    setOrder((o) => o.slice(0, -1));
    if (kind === 's') {
      setStrokes((prev) => {
        setRedoStack((r) => [...r, { kind, item: prev[prev.length - 1] }]);
        return prev.slice(0, -1);
      });
    } else {
      setFills((prev) => {
        setRedoStack((r) => [...r, { kind, item: prev[prev.length - 1] }]);
        return prev.slice(0, -1);
      });
    }
  };
  const redo = () => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack((r) => r.slice(0, -1));
    setOrder((o) => [...o, last.kind]);
    if (last.kind === 's') setStrokes((prev) => [...prev, last.item]);
    else setFills((prev) => [...prev, last.item]);
  };
  // Stroke eraser: whichever item the pen touched disappears whole, so remove its slot from the
  // timeline too or undo would step onto an item that is no longer there.
  const dropAt = (kind, index) => {
    let seen = -1;
    setOrder((o) => {
      const at = o.findIndex((k) => k === kind && ++seen === index);
      return at < 0 ? o : [...o.slice(0, at), ...o.slice(at + 1)];
    });
    setRedoStack([]);
    if (kind === 's') setStrokes((prev) => prev.filter((_, i) => i !== index));
    else setFills((prev) => prev.filter((_, i) => i !== index));
  };
  const eraseStroke = (index) => dropAt('s', index);
  const eraseFill = (index) => dropAt('f', index);
  const clear = () => {
    setStrokes([]);
    setFills([]);
    setOrder([]);
    setRedoStack([]);
  };
  return { strokes, fills, addStroke, addFill, eraseStroke, eraseFill, undo, redo, clear, canUndo: order.length > 0, canRedo: redoStack.length > 0, setStrokes };
}

// Horizontal thickness control that lives in the toolbar strip, not on the canvas.
function SizeSlider({ value, color, onChange }) {
  const [trackW, setTrackW] = useState(120);
  const pickRef = useRef(null);
  pickRef.current = (x) => onChange(Math.round(PEN_MIN + Math.min(1, Math.max(0, x / trackW)) * (PEN_MAX - PEN_MIN)));
  const pan = useMemo(
    () => Gesture.Pan().runOnJS(true).minDistance(0).maxPointers(1)
      .onBegin((e) => pickRef.current(e.x))
      .onUpdate((e) => pickRef.current(e.x)),
    []
  );
  const ratio = (value - PEN_MIN) / (PEN_MAX - PEN_MIN);
  const dot = Math.max(4, Math.min(26, penPx(value) * 2));
  return (
    <View style={styles.sizeSlider}>
      <View style={styles.sizeDotWrap}>
        <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
      </View>
      <GestureDetector gesture={pan}>
        <View style={styles.channelHitSm} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <View style={styles.channelTrack} />
          <View style={[styles.channelFill, { width: `${ratio * 100}%`, backgroundColor: '#00CFE9' }]} />
          <View style={[styles.channelThumb, { left: `${ratio * 100}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.channelValue}>{value}</Text>
    </View>
  );
}

// One toolbar strip above every canvas: tools, colours, thickness, undo/redo.
function CanvasToolbar({ tool, onTool, tools, color, onColor, swatches, size, onSize, onUndo, onRedo, canUndo, canRedo, onClear, right }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <TouchableOpacity style={styles.toolPeek} onPress={() => setOpen(true)}>
        <Text style={styles.toolChipIcon}>🎨</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.toolStrip}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => setOpen(false)}>
        <Text style={styles.iconBtnText}>▾</Text>
      </TouchableOpacity>
      {tools.map((t) => (
        <TouchableOpacity key={t.key} style={[styles.toolChip, tool === t.key && styles.toolChipOn]} onPress={() => onTool(t.key)}>
          <Text style={styles.toolChipIcon}>{t.icon}</Text>
          <Text style={styles.toolChipText}>{t.label}</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.toolDivider} />
      <ColorControls value={color} onChange={onColor} swatches={swatches} />
      <View style={styles.toolDivider} />
      <SizeSlider value={size} color={color} onChange={onSize} />
      <View style={styles.toolDivider} />
      <TouchableOpacity style={[styles.iconBtn, !canUndo && styles.iconBtnOff]} disabled={!canUndo} onPress={onUndo}>
        <Text style={styles.iconBtnText}>←</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.iconBtn, !canRedo && styles.iconBtnOff]} disabled={!canRedo} onPress={onRedo}>
        <Text style={styles.iconBtnText}>→</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={onClear}>
        <Text style={styles.iconBtnText}>🗑</Text>
      </TouchableOpacity>
      {right}
    </View>
  );
}


function TraceOverlay({ onDone }) {
  const [mode, setMode] = useState('intro');
  const history = useCanvasHistory();
  const { strokes, fills } = history;
  const [color, setColor] = useState('#111111');
  const [penWidth, setPenWidth] = useState(5);
  const [eraserWidth, setEraserWidth] = useState(40);
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'fill'
  const [showTopic, setShowTopic] = useState(false);
  const erasing = tool === 'eraser';
  const win = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;
  const praiseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  // Show a "한번 그려볼까?" intro page first, then reveal the tracing canvas.
  useEffect(() => {
    if (mode !== 'intro') return;
    const id = setTimeout(() => setMode('trace'), 2400);
    return () => clearTimeout(id);
  }, [mode]);

  // The prompt is a greeting, not a label: show it for two seconds when a stage starts.
  useEffect(() => {
    if (mode !== 'trace' && mode !== 'color') return undefined;
    setShowTopic(true);
    const id = setTimeout(() => setShowTopic(false), 2000);
    return () => clearTimeout(id);
  }, [mode]);

  const toColor = () => {
    playSound('success');
    setMode('praise');
  };

  // After tracing: "참 잘했어요" → "이제 색칠하러 가자!" → coloring.
  useEffect(() => {
    if (mode !== 'praise') return undefined;
    praiseAnim.setValue(0);
    Animated.spring(praiseAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    const id = setTimeout(() => setMode('colorIntro'), 1400);
    return () => clearTimeout(id);
  }, [mode]);
  useEffect(() => {
    if (mode !== 'colorIntro') return undefined;
    const id = setTimeout(() => {
      history.clear();
      setMode('color');
    }, 1500);
    return () => clearTimeout(id);
  }, [mode]);

  return (
    <Animated.View style={[styles.traceOverlay, { opacity: enter }]}>
        {mode === 'trace' || mode === 'color' ? (
          <CanvasToolbar
            tool={tool}
            onTool={setTool}
            tools={mode === 'color'
              ? [{ key: 'pen', icon: '✏️', label: '펜' }, { key: 'eraser', icon: '🩹', label: '지우개' }, { key: 'fill', icon: '🪣', label: '채우기' }]
              : [{ key: 'pen', icon: '✏️', label: '펜' }, { key: 'eraser', icon: '🩹', label: '지우개' }]}
            color={erasing ? '#9aa6bf' : color}
            onColor={setColor}
            swatches={COLOR_SWATCHES}
            size={erasing ? eraserWidth : penWidth}
            onSize={erasing ? setEraserWidth : setPenWidth}
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onClear={history.clear}
            right={(
              <TapScale
                style={styles.checkTool}
                onPress={() => {
                  if (mode === 'trace') {
                    playSound('pop');
                    toColor();
                  } else {
                    playSound('fanfare');
                    onDone();
                  }
                }}
              >
                <Text style={styles.checkText}>✓</Text>
              </TapScale>
            )}
          />
        ) : null}

        {mode !== 'intro' ? (
          <View style={styles.padRow}>
          <SketchPad
            strokes={strokes}
            onChange={history.addStroke}
            placeholder=""
            inkColor={mode === 'color' ? color : '#111111'}
            backgroundImage={TRACE_LINEART}
            bgOpacity={mode === 'color' ? 1 : 0.4}
            thickness={penPx(erasing ? eraserWidth : penWidth)}
            eraser={erasing}
            fillMode={mode === 'color' && tool === 'fill'}
            fillColor={color}
            fills={fills}
            onFill={history.addFill}
            onEraseStroke={history.eraseStroke}
            onEraseFill={history.eraseFill}
          />
          </View>
        ) : null}

        {showTopic && (mode === 'trace' || mode === 'color') ? (
          <View style={styles.traceTopic}>
            <Text style={styles.traceTopicText}>{mode === 'trace' ? '선을 따라 그려봐! ✏️' : '원하는 색으로 칠해봐! 🎨'}</Text>
          </View>
        ) : null}

        {mode === 'praise' ? <CenterPopup text="참 잘했어요!" emoji="✓" /> : null}

        {mode === 'colorIntro' ? <CenterPopup text={ACT_MSG.color.text} emoji={ACT_MSG.color.emoji} /> : null}

        {mode === 'intro' ? (
          <TouchableOpacity activeOpacity={0.9} style={[styles.traceIntro, { width: win.width, height: win.height }]} onPress={() => setMode('trace')}>
            <PattiCharacter tone="purple" size={0.95} />
            <View style={styles.quoteBox}>
              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.quoteText}>한번 그려볼까?</Text>
              <Text style={styles.quoteMark}>”</Text>
            </View>
            <Text style={styles.traceIntroHint}>화면을 톡 누르면 시작해요</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
  );
}

function ActivitiesScreen({ characterImage, onDrawing, onFinish }) {
  return (
    <View style={styles.activitiesScreen}>
      <View style={styles.activitiesFriend}>
        {characterImage ? <GeneratedCharacter uri={characterImage} size={170} /> : <PattiCharacter tone="blue" size={0.82} />}
        <View style={styles.quoteBox}>
          <Text style={styles.quoteMark}>“</Text>
          <Text style={styles.quoteText}>다 봤다! 오늘 본 걸 그림으로 그려볼까?</Text>
          <Text style={styles.quoteMark}>”</Text>
        </View>
      </View>
      <View style={styles.wrapupActions}>
        <TouchableOpacity style={styles.drawCta} onPress={onDrawing}>
          <Text style={styles.drawCtaIcon}>✎</Text>
          <Text style={styles.drawCtaText}>그림 그리기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.lightButton} onPress={onFinish}>
          <Text style={styles.lightButtonText}>마무리</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuizOverlay({ selected, onAnswer, onRetry, onResume, onSkip }) {
  const win = useWindowDimensions();
  const correct = selected === quiz.answer;
  const shakeX = useRef(new Animated.Value(0)).current;
  const popScale = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Question audio is authored with the question, so playback is a single URL away.
    if (quiz.audioUrl) speakUrl(quiz.audioUrl);
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, []);
  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  useEffect(() => {
    if (!selected) return;
    if (correct) {
      popScale.setValue(0);
      Animated.spring(popScale, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
    } else {
      shakeX.setValue(0);
      Animated.sequence([
        Animated.timing(shakeX, { toValue: -14, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 14, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -9, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 9, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]).start();
    }
  }, [selected]);

  return (
    <Modal transparent visible animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']} onRequestClose={onResume}>
      <View style={[styles.quizOverlay, { width: win.width, height: win.height }]}>
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
        {/* 정답 시 캐릭터 등장 자리 (popScale 애니메이션 재사용) */}
        <Animated.View style={[styles.quizCard, { opacity: enter, transform: [{ translateX: shakeX }, { scale: enterScale }] }]}>
        <View style={styles.quizPromptRow}>
          <View style={styles.miniStar}>
            <Text style={styles.miniStarText}>✦</Text>
          </View>
          <View style={styles.questionBox}>
            <Text style={styles.quoteMark}>“</Text>
            <Text style={styles.questionText}>{selected && correct ? '맞아 정답이야! 잘했어 :)' : selected ? '앗 다시 생각해보자~!' : quiz.title}</Text>
            <Text style={styles.quoteMark}>”</Text>
          </View>
        </View>
        {selected && correct ? (
          <View style={styles.answerResult}>
            <Text style={styles.answerLabel}>정답 :</Text>
            <Text style={styles.answerValue}>{quiz.answer}</Text>
          </View>
        ) : (
          <View style={styles.quizOptions}>
            {quiz.options.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={[
                  styles.quizOption,
                  { borderColor: option.color, backgroundColor: option.bg },
                  selected === option.label && styles.quizOptionDimmed,
                ]}
                onPress={() => onAnswer(option.label)}
              >
                <Text style={[styles.quizOptionText, { color: option.color }]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.bottomActions}>
          {selected && !correct ? (
            <TouchableOpacity style={styles.lightButton} onPress={onRetry}>
              <Text style={styles.lightButtonText}>다시 고르기</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.lightButton} onPress={onSkip}>
              <Text style={styles.lightButtonText}>건너뛰기</Text>
            </TouchableOpacity>
          )}
          {selected && correct ? (
            <TouchableOpacity style={styles.darkButton} onPress={onResume}>
              <Text style={styles.darkButtonText}>영상 이어보기</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>
      </View>
    </Modal>
  );
}

const DRAW_COLORS = ['#111111', '#e5484d', '#00CFE9', '#f5c518'];

function DrawingScreen({ strokes, status, error, characterImage, onChangeStrokes, onCanvasSize, onConvert, onSave, onDone, onSkip }) {
  const [choosing, setChoosing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 620, height: 380 });
  const converting = status === 'loading' || (status === 'done' && !!characterImage) || status === 'error';
  const [brushColor, setBrushColor] = useState('#111111');
  const [brushSize, setBrushSize] = useState(5);
  const [eraserSize, setEraserSize] = useState(40);
  const [tool, setTool] = useState('brush'); // 'brush' | 'eraser' | 'ruler'
  const [redoStack, setRedoStack] = useState([]);
  const inkColor = tool === 'eraser' ? '#ffffff' : brushColor;
  const thickness = penPx(tool === 'eraser' ? eraserSize : brushSize);
  return (
    <View style={styles.drawingScreen}>
      {!converting && !choosing ? (
      <>
      <View style={styles.padRow}>
      <View style={styles.drawingCanvasCard}>
        <SketchPad
          strokes={strokes}
          onChange={onChangeStrokes}
          onCanvasSize={(size) => { setCanvasSize(size); onCanvasSize(size); }}
          placeholder="여기에 바다를 그려보세요"
          inkColor={inkColor}
          thickness={thickness}
          straightLine={tool === 'ruler'}
          eraser={tool === 'eraser'}
          onEraseStroke={(i) => onChangeStrokes((prev) => prev.filter((_, k) => k !== i))}
        />
        <View style={styles.drawingTopic}>
          <Text style={styles.drawingTopicText}>주제 : 바다</Text>
        </View>
      </View>
      </View>
      <CanvasToolbar
        tool={tool}
        onTool={setTool}
        tools={[{ key: 'brush', icon: '✏️', label: '붓' }, { key: 'eraser', icon: '🩹', label: '지우개' }, { key: 'ruler', icon: '📏', label: '자' }]}
        color={brushColor}
        onColor={(c) => { setBrushColor(c); setTool('brush'); }}
        swatches={DRAW_COLORS}
        size={tool === 'eraser' ? eraserSize : brushSize}
        onSize={tool === 'eraser' ? setEraserSize : setBrushSize}
        onUndo={() => onChangeStrokes((prev) => {
          if (!prev.length) return prev;
          setRedoStack((r) => [...r, prev[prev.length - 1]]);
          return prev.slice(0, -1);
        })}
        onRedo={() => {
          const last = redoStack[redoStack.length - 1];
          if (!last) return;
          setRedoStack((r) => r.slice(0, -1));
          onChangeStrokes((prev) => [...prev, last]);
        }}
        canUndo={strokes.length > 0}
        canRedo={redoStack.length > 0}
        onClear={() => { onChangeStrokes([]); setRedoStack([]); }}
        right={(
          <TouchableOpacity style={styles.checkTool} onPress={() => strokes.length && setChoosing(true)}>
            <Text style={styles.checkText}>✓</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.skipFloat} onPress={onSkip}>
        <Text style={styles.skipFloatText}>건너뛰기</Text>
      </TouchableOpacity>
      </>
      ) : null}
      {choosing ? (
        <View style={styles.reviewScreen}>
          <Text style={styles.reviewTitle}>다 그렸어요!</Text>
          <View style={styles.reviewFrame}>
            <StrokeArt drawing={{ strokes, size: canvasSize }} size={420} />
          </View>
          <View style={styles.creatorActions}>
            <TouchableOpacity style={styles.lightButton} onPress={() => { playSound('pop'); setChoosing(false); onSave(); }}>
              <Text style={styles.lightButtonText}>그림 저장</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.blueButton} onPress={() => { playSound('pop'); setChoosing(false); onConvert(); }}>
              <Text style={styles.blueButtonText}>그림 변환</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setChoosing(false)}>
            <Text style={styles.reviewBack}>더 그릴래요</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {converting ? (
        <View style={styles.convertOverlay}>
          <View style={styles.convertCard}>
            {status === 'loading' ? (
              <>
                <PattiCharacter tone="purple" size={0.9} />
                <Text style={styles.convertTitle}>그림 변환중...</Text>
                <Text style={styles.convertCopy}>그림을 귀여운 그림으로 만들고 있어요.</Text>
              </>
            ) : null}
            {status === 'done' && characterImage ? (
              <>
                <GeneratedCharacter uri={characterImage} size={280} />
                <Text style={styles.convertTitle}>완성! 멋진 그림이 됐어요</Text>
                <TapScale style={styles.darkButton} onPress={() => { playSound('pop'); onDone(); }}>
                  <Text style={styles.darkButtonText}>마무리하기</Text>
                </TapScale>
              </>
            ) : null}
            {status === 'error' ? (
              <>
                <Text style={styles.convertTitle}>앗, 변환에 실패했어요</Text>
                <Text style={styles.errorText}>{error}</Text>
                <View style={styles.creatorActions}>
                  <TouchableOpacity style={styles.lightButton} onPress={onSkip}>
                    <Text style={styles.lightButtonText}>건너뛰기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.blueButton} onPress={onConvert}>
                    <Text style={styles.blueButtonText}>다시 시도</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Replays the child's own strokes, so a saved drawing needs no image capture.
function StrokeArt({ drawing, size = 230 }) {
  const strokes = drawing.strokes || [];
  const pts = strokes.flatMap((st) => st.points || st);
  const pad = 24;
  const box = pts.length
    ? {
        x: Math.min(...pts.map((p) => p.x)) - pad,
        y: Math.min(...pts.map((p) => p.y)) - pad,
        w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)) + pad * 2,
        h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) + pad * 2,
      }
    : { x: 0, y: 0, w: drawing.size?.width || 620, h: drawing.size?.height || 380 };
  const scale = size / Math.max(box.w, box.h);
  return (
    <Svg width={box.w * scale} height={box.h * scale} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
      {strokes.map((stroke, i) => (
        <Path
          key={i}
          d={(stroke.points || stroke).map((p, k) => `${k ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
          stroke={stroke.color || '#171d31'}
          strokeWidth={stroke.thickness || 8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

function ReportScreen({ report, characterImage, savedDrawing, onReplay, onOtherVideos, onCharacter }) {
  const today = new Date();
  const dateLine = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const watched = report.watched || video.title;
  const completed = report.quiz + report.drawing;
  const interests = report.interests || [];
  return (
    <View style={styles.reportScreen}>
      <View style={styles.reportCardWide}>
        <View style={styles.reportHead}>
          <Text style={styles.reportTitle}>활동 리포트</Text>
          <Text style={styles.reportDate}>{dateLine} · {watched}</Text>
        </View>
        <View style={styles.reportBody}>
          <View style={styles.reportArtCol}>
            <Text style={styles.reportColLabel}>오늘의 작품</Text>
            <View style={styles.reportArtBox}>
              {characterImage ? (
                <GeneratedCharacter uri={characterImage} size={230} />
              ) : savedDrawing ? (
                <StrokeArt drawing={savedDrawing} size={230} />
              ) : (
                <>
                  <PattiCharacter tone="blue" size={1.1} />
                  <Text style={styles.reportArtCaption}>그림을 건너뛰었어요</Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.reportSumCol}>
            <View style={styles.reportStatsRow}>
              <ReportStat label="퀴즈 정답" value={report.quiz} tone="#3d5afe" />
              <ReportStat label="그림 완성" value={report.drawing} tone="#7bd88f" />
              <ReportStat label="건너뜀" value={report.skip} tone="#ffb020" />
            </View>
            {interests.length ? (
              <View style={styles.reportChips}>
                {interests.map((t) => (
                  <View key={t} style={styles.reportChip}><Text style={styles.reportChipText}>#{t}</Text></View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.reportActions}>
          <TouchableOpacity style={styles.lightButton} onPress={() => { playSound('pop'); onReplay(); }}>
            <Text style={styles.lightButtonText}>영상 다시보기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.lightButton} onPress={() => { playSound('pop'); onOtherVideos(); }}>
            <Text style={styles.lightButtonText}>다른 영상 보기</Text>
          </TouchableOpacity>
          <TapScale style={styles.darkButton} onPress={() => { playSound('pop'); onCharacter(); }}>
            <Text style={styles.darkButtonText}>캐릭터 보러가기</Text>
          </TapScale>
        </View>
      </View>
    </View>
  );
}

function ReportStat({ label, value, tone }) {
  return (
    <View style={styles.reportStat}>
      <Text style={[styles.reportStatValue, { color: tone }]}>{value}</Text>
      <Text style={styles.reportStatLabel}>{label}</Text>
    </View>
  );
}



// perfect-freehand outline -> SVG path string (filled shape)
function strokeToSvg(points, size) {
  if (!points || points.length === 0) return '';
  const outline = getStroke(points.map((p) => [p.x, p.y]), {
    size: Math.max(4, size * 2), thinning: 0, smoothing: 0.55, streamline: 0.5, simulatePressure: false, last: true,
  });
  if (!outline.length) return '';
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)} Q`;
  for (let i = 0; i < outline.length; i += 1) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  return `${d} Z`;
}

// Bucket fill over the line art. Walls are any pixel that is not near-white; several grown
// copies let a tap pick the strongest gap closing that still leaves its own region reachable,
// which is what stops paint escaping through the hairline breaks in the artwork.
const WALL_LEVELS = 3;

function buildWalls(src, w, h, threshold) {
  const wall = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    if (src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114 < threshold) wall[i] = 1;
  }
  const grown = [];
  let prev = wall;
  for (let level = 0; level < WALL_LEVELS; level += 1) {
    const next = Uint8Array.from(prev);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!prev[i]) continue;
        next[i - 1] = 1;
        next[i + 1] = 1;
        next[i - w] = 1;
        next[i + w] = 1;
      }
    }
    grown.push(next);
    prev = next;
  }
  return { wall, grown };
}

// Paint spreads over the open pixels of the chosen wall map, then creeps back into the walls so
// the anti-aliased edge sits on colour instead of a white halo. It never crosses a wall.
function floodFill(walls, out, w, h, startX, startY, rgb, owner, ownerId) {
  let level = WALL_LEVELS;
  while (level > 0 && walls.grown[level - 1][startY * w + startX]) level -= 1;
  if (level === 0 && walls.wall[startY * w + startX]) return false;
  const open = level === 0 ? walls.wall : walls.grown[level - 1];
  const seen = new Uint8Array(w * h);
  const stack = [startX, startY];
  const edge = [];
  let filled = 0;
  const paint = (i) => {
    const o = i * 4;
    out[o] = rgb[0];
    out[o + 1] = rgb[1];
    out[o + 2] = rgb[2];
    out[o + 3] = 255;
    if (owner) owner[i] = ownerId;
  };
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (seen[y * w + x]) continue;
    let left = x;
    while (left > 0 && !seen[y * w + left - 1] && !open[y * w + left - 1]) left -= 1;
    let right = x;
    while (right < w - 1 && !seen[y * w + right + 1] && !open[y * w + right + 1]) right += 1;
    for (let sx = left; sx <= right; sx += 1) {
      const i = y * w + sx;
      seen[i] = 1;
      paint(i);
      filled += 1;
      if (y > 0 && !seen[i - w] && !open[i - w]) stack.push(sx, y - 1);
      if (y < h - 1 && !seen[i + w] && !open[i + w]) stack.push(sx, y + 1);
      if (sx === left || sx === right || y === 0 || y === h - 1) edge.push(i);
    }
  }
  if (!filled) return false;
  // Creep back exactly as far as the walls were grown, plus the anti-aliased fringe itself.
  let ring = edge;
  for (let step = 0; step < level + 2; step += 1) {
    const next = [];
    for (let k = 0; k < ring.length; k += 1) {
      const i = ring[k];
      const around = [i - 1, i + 1, i - w, i + w];
      for (let n = 0; n < 4; n += 1) {
        const j = around[n];
        if (j < 0 || j >= w * h || seen[j] || !open[j]) continue;
        seen[j] = 1;
        paint(j);
        // Stop at the ink itself: creeping past a printed line would cross into its neighbour.
        if (!walls.wall[j]) next.push(j);
      }
    }
    ring = next;
  }
  return true;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Keeps the zoomed canvas covering its frame: no blank gap, no drifting away at 1x.
function clampPan(value, size, zoom) {
  'worklet';
  const min = size * (1 - zoom);
  return Math.min(0, Math.max(min, value));
}

function SketchPad({ strokes, onChange, onCanvasSize, placeholder, inkColor, transparent, backgroundImage, thickness = 8, overlayStrokes, bgOpacity = 0.4, straightLine = false, eraser = false, fillMode = false, fillColor = '#111111', fills = EMPTY_FILLS, onFill, onEraseStroke, onEraseFill }) {
  const [layout, setLayout] = useState({ width: 620, height: 380 });
  // In-progress stroke lives in local state so only THIS stroke re-renders per move
  // (committed strokes stay memoized) — that's what keeps writing latency GoodNotes-low.
  const activeRef = useRef(null);
  const [active, setActive] = useState(null);
  // Palm rejection: once a stylus touches down, finger touches are ignored for a short
  // window — that window is exactly when a resting palm/knuckle lands next to the pen.
  const rejectRef = useRef(false);
  // Samsung reports a held S-Pen button as MotionEvent TOOL_TYPE_ERASER, which gesture-handler
  // surfaces as pointerType OTHER — so the pen button erases without any native code.
  const penEraseRef = useRef(false);

  // Pinch to zoom, two fingers to move. One finger always stays a pen, so drawing never fights
  // the viewport; stroke coordinates are converted back into canvas space before being stored.
  const scale = useSharedValue(1);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const moveAllowed = useSharedValue(false);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  // Frame size on the UI thread, so panning can be clamped to it.
  const boxW = useSharedValue(620);
  const boxH = useSharedValue(380);
  const viewTransform = useDerivedValue(() => [
    { translateX: originX.value },
    { translateY: originY.value },
    { scale: scale.value },
  ]);
  const toCanvas = (event) => ({
    ...event,
    x: (event.x - originX.value) / scale.value,
    y: (event.y - originY.value) / scale.value,
  });

  // Bucket fill: the line art is read once as raw pixels, and every fill accumulates into one
  // mask buffer that is turned into an SkImage painted between the line art and the strokes.
  const lineArt = useImage(backgroundImage);
  const srcPixelsRef = useRef(null);
  const wallsRef = useRef(null);
  const [fillImage, setFillImage] = useState(null);
  // The line art PNG has an opaque white background, so colour can never go under it. Rebuild it
  // once as ink-on-transparent, which lets the fill sit below the strokes and kills the halo.
  const [inkImage, setInkImage] = useState(null);


  const fillBox = () => {
    if (!lineArt) return null;
    const iw = lineArt.width();
    const ih = lineArt.height();
    const boxW = layout.width;
    const boxH = (boxW * ih) / iw;
    return { iw, ih, boxW, boxH, top: (layout.height - boxH) / 2 };
  };

  const readSource = () => {
    if (!lineArt) return null;
    const info = { width: lineArt.width(), height: lineArt.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
    if (!srcPixelsRef.current) srcPixelsRef.current = lineArt.readPixels(0, 0, info);
    return srcPixelsRef.current ? info : null;
  };

  useEffect(() => {
    if (!lineArt || inkImage) return;
    const info = readSource();
    if (!info) return;
    const src = srcPixelsRef.current;
    const ink = new Uint8Array(src.length);
    for (let i = 0; i < info.width * info.height; i += 1) {
      const o = i * 4;
      const lum = src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114;
      ink[o + 3] = lum >= 250 ? 0 : Math.round(255 - lum);
    }
    setInkImage(Skia.Image.MakeImage(info, Skia.Data.fromBytes(ink), info.width * 4));
  }, [lineArt]);

  // Stroke eraser: delete the item the pen touched — a whole stroke, or a whole bucket fill.
  const eraseAt = (rawEvent) => {
    const event = toCanvas(rawEvent);
    for (let i = (strokes || []).length - 1; i >= 0; i -= 1) {
      const stroke = strokes[i];
      if (!stroke) continue;
      const reach = Math.max(8, (stroke.thickness || thickness) * 1.5);
      const hit = stroke.some((p) => p && Math.hypot(p.x - event.x, p.y - event.y) <= reach);
      if (hit) {
        if (onEraseStroke) onEraseStroke(i);
        return;
      }
    }
    const box = fillBox();
    const owner = appliedRef.current.owner;
    if (!box || !owner) return;
    const px = Math.round((event.x * box.iw) / box.boxW);
    const py = Math.round(((event.y - box.top) * box.ih) / box.boxH);
    if (px < 0 || py < 0 || px >= box.iw || py >= box.ih) return;
    const id = owner[py * box.iw + px];
    if (id && onEraseFill) onEraseFill(id - 1);
  };

  const doFill = (rawEvent) => {
    const event = toCanvas(rawEvent);
    const box = fillBox();
    if (!box) return;
    const info = readSource();
    if (!info) return;
    if (!wallsRef.current) wallsRef.current = buildWalls(srcPixelsRef.current, box.iw, box.ih, 235);
    const px = Math.round((event.x * box.iw) / box.boxW);
    const py = Math.round(((event.y - box.top) * box.ih) / box.boxH);
    if (px < 0 || py < 0 || px >= box.iw || py >= box.ih) return;
    if (onFill) onFill({ x: px, y: py, color: fillColor });
  };

  // Fills are replayed from the parent's list, which is what makes undo/redo of a bucket work.
  // Appending keeps the previous buffer; only an undo has to replay from scratch.
  const appliedRef = useRef({ ops: [], buf: null, owner: null });
  useEffect(() => {
    const box = fillBox();
    if (!box) return;
    const info = readSource();
    if (!info) return;
    if (!fills.length) {
      appliedRef.current = { ops: [], buf: null, owner: null };
      setFillImage(null);
      return;
    }
    if (!wallsRef.current) wallsRef.current = buildWalls(srcPixelsRef.current, box.iw, box.ih, 235);
    const applied = appliedRef.current;
    const isAppend = applied.buf && applied.ops.length < fills.length
      && applied.ops.every((op, i) => op === fills[i]);
    const buf = isAppend ? applied.buf : new Uint8Array(box.iw * box.ih * 4);
    const owner = isAppend ? applied.owner : new Uint16Array(box.iw * box.ih);
    const offset = isAppend ? applied.ops.length : 0;
    const pending = isAppend ? fills.slice(offset) : fills;
    pending.forEach((op, i) => floodFill(wallsRef.current, buf, box.iw, box.ih, op.x, op.y, hexToRgb(op.color), owner, offset + i + 1));
    appliedRef.current = { ops: fills, buf, owner };
    setFillImage(Skia.Image.MakeImage(info, Skia.Data.fromBytes(buf), box.iw * 4));
  }, [fills, lineArt]);

  // Uniform width: kids want a predictable line, so neither stylus pressure nor speed
  // changes the stroke — only the selected pen size does.
  const makePoint = (event) => ({ x: event.x, y: event.y, w: thickness });

  const begin = (event) => {
    // Fingers only pan and pinch the page; painting is the stylus's job alone, so a resting
    // palm can never leave a mark.
    if (event.pointerType === PointerType.TOUCH) {
      rejectRef.current = true;
      return;
    }
    penEraseRef.current = event.pointerType !== PointerType.TOUCH && event.pointerType !== PointerType.STYLUS;
    if (__DEV__) console.log('[pen] pointerType', event.pointerType, 'stylusData', JSON.stringify(event.stylusData));
    if (fillMode || eraser) {
      // Bucket and eraser both act on whole items, so neither starts a stroke.
      rejectRef.current = true;
      if (eraser) eraseAt(event);
      else doFill(event);
      return;
    }
    rejectRef.current = false;
    const stroke = [makePoint(toCanvas(event))];
    activeRef.current = stroke;
    setActive(stroke);
  };
  const extend = (event) => {
    if (rejectRef.current) {
      if (eraser) eraseAt(event); // dragging the eraser keeps rubbing items out
      return;
    }
    const prev = activeRef.current;
    if (!prev) return begin(event);
    // Ruler mode: keep only the start point and the current point → a straight line.
    const point = makePoint(toCanvas(event));
    const stroke = straightLine ? [prev[0], point] : [...prev, point];
    activeRef.current = stroke;
    setActive(stroke);
  };
  const end = () => {
    if (rejectRef.current) {
      rejectRef.current = false;
      return;
    }
    const stroke = activeRef.current;
    activeRef.current = null;
    setActive(null);
    if (stroke && stroke.length) {
      stroke.color = inkColor; // lock each stroke's color so later palette changes don't repaint it
      stroke.thickness = thickness; // lock its width too so later size changes don't repaint it
      stroke.eraser = eraser || penEraseRef.current; // eraser strokes clear ink (blendMode) without touching the background guide
      onChange((prev) => [...prev, stroke]);
    }
  };
  const handlersRef = useRef({ begin, extend, end });
  handlersRef.current = { begin, extend, end };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true) // stroke state lives on the JS thread; no worklet hop needed
        .minDistance(0) // draw from the very first pixel, and allow single-tap dots
        .maxPointers(1)
        .averageTouches(false)
        .onBegin((event) => handlersRef.current.begin(event))
        .onUpdate((event) => handlersRef.current.extend(event))
        .onFinalize(() => handlersRef.current.end()),
    []
  );

  const zoom = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onBegin((e) => {
        startScale.value = scale.value;
        startX.value = originX.value;
        startY.value = originY.value;
        focalX.value = e.focalX;
        focalY.value = e.focalY;
      })
      .onUpdate((e) => {
        const next = Math.min(6, Math.max(1, startScale.value * e.scale));
        const k = next / startScale.value;
        scale.value = next;
        originX.value = clampPan(focalX.value - (focalX.value - startX.value) * k, boxW.value, next);
        originY.value = clampPan(focalY.value - (focalY.value - startY.value) * k, boxH.value, next);
      });
    const move = Gesture.Pan()
      .minPointers(1)
      .averageTouches(true)
      .onBegin((e) => {
        moveAllowed.value = e.pointerType === PointerType.TOUCH;
        startX.value = originX.value;
        startY.value = originY.value;
      })
      .onUpdate((e) => {
        if (!moveAllowed.value) return;
        originX.value = clampPan(startX.value + e.translationX, boxW.value, scale.value);
        originY.value = clampPan(startY.value + e.translationY, boxH.value, scale.value);
      });
    const reset = Gesture.Tap().numberOfTaps(2).onEnd(() => {
      scale.value = 1;
      originX.value = 0;
      originY.value = 0;
    });
    return Gesture.Simultaneous(pinch, move, reset);
  }, []);

  // perfect-freehand outlines as filled SVG path strings; committed + overlay memoized
  // so they are NOT recomputed while an active stroke is being drawn.
  const committedPaths = useMemo(
    () => (strokes || [])
      .map((s, i) => ({ key: `p-${i}`, d: strokeToSvg(s && s.filter(Boolean), (s && s.thickness) || thickness), color: (s && s.color) || inkColor, eraser: !!(s && s.eraser) }))
      .filter((p) => p.d),
    [strokes, thickness, inkColor]
  );
  const overlayPaths = useMemo(
    () => (overlayStrokes || [])
      .map((s, i) => ({ key: `o-${i}`, d: strokeToSvg(s && s.filter(Boolean), thickness) }))
      .filter((p) => p.d),
    [overlayStrokes, thickness]
  );
  const committedLayer = useMemo(
    () => (
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group transform={viewTransform}>
        {fillImage && fillGeom ? (
          <SkiaImage image={fillImage} x={0} y={fillGeom.top} width={fillGeom.boxW} height={fillGeom.boxH} fit="fill" />
        ) : null}
        {committedPaths.map((p) => (
          <SkiaPath key={p.key} path={p.d} color={p.eraser ? '#000' : p.color} blendMode={p.eraser ? 'clear' : undefined} />
        ))}
        {overlayPaths.map((p) => (
          <SkiaPath key={p.key} path={p.d} color="#111111" />
        ))}
        </Group>
      </Canvas>
    ),
    [committedPaths, overlayPaths, fillImage, fillGeom && fillGeom.top, fillGeom && fillGeom.boxW, fillGeom && fillGeom.boxH]
  );
  const fillGeom = fillBox();
  const activePath = active ? strokeToSvg(active.filter(Boolean), thickness) : '';
  const hasInk = committedPaths.length > 0 || overlayPaths.length > 0 || !!activePath;

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, zoom)}>
    <View
      collapsable={false}
      style={[styles.sketchPad, transparent && styles.sketchPadTransparent]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        setLayout(next);
        boxW.value = next.width;
        boxH.value = next.height;
        if (onCanvasSize) {
          onCanvasSize({ width: next.width, height: next.height });
        }
      }}
    >
      {!transparent && !backgroundImage ? <View style={styles.gridLayer} pointerEvents="none" /> : null}
      {!hasInk && placeholder ? <Text style={styles.padPlaceholder}>{placeholder}</Text> : null}
      {committedLayer}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group transform={viewTransform}>
          {activePath ? <SkiaPath path={activePath} color={eraser || penEraseRef.current ? '#00000055' : inkColor} /> : null}
        </Group>
      </Canvas>
      {/* The printed lines stay on top: colouring over them must never bury the drawing. */}
      {inkImage && fillGeom ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Group transform={viewTransform}>
            <SkiaImage image={inkImage} x={0} y={fillGeom.top} width={fillGeom.boxW} height={fillGeom.boxH} fit="fill" opacity={bgOpacity} />
          </Group>
        </Canvas>
      ) : null}
    </View>
    </GestureDetector>
  );
}

function GeneratedCharacter({ uri, size }) {
  return (
    <View style={[styles.generatedWrap, { width: size, height: size }]}>
      <Image source={{ uri }} style={styles.generatedImage} resizeMode="contain" />
    </View>
  );
}

// Growth stages: everyone starts as the star, then becomes the species the child picked.
const CHARACTER_IMAGES = {
  star: require('./assets/characters/star.png'),
  rabbit: require('./assets/characters/rabbit2.png'),
  dino: require('./assets/characters/dino2.png'),
};
const CHARACTER_BASE = 150;

function characterImageFor(species, level) {
  if (level < 2) return CHARACTER_IMAGES.star;
  return CHARACTER_IMAGES[species] || CHARACTER_IMAGES.star;
}

// The mascot: breathes on its own, squashes when tapped, jumps when something good happens.
// ponytail: RN Animated stand-in until the Rive file lands — same props, so the swap is local.
function PattiCharacter({ tone = 'blue', size = 1, onPress, celebrate = 0, species = 'star', level = 1 }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (!celebrate) return;
    Animated.sequence([
      Animated.spring(hop, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 14 }),
      Animated.spring(hop, { toValue: 0, useNativeDriver: true, speed: 12, bounciness: 10 }),
    ]).start();
  }, [celebrate]);

  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 16 }),
    ]).start();
    if (onPress) onPress();
  };

  const px = CHARACTER_BASE * size;
  const translateY = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
    hop.interpolate({ inputRange: [0, 1], outputRange: [0, -px * 0.18] })
  );

  return (
    <Pressable onPress={tap} hitSlop={12}>
      <Animated.Image
        source={characterImageFor(species, level)}
        resizeMode="contain"
        style={{ width: px, height: px, transform: [{ translateY }, { scale }] }}
      />
    </Pressable>
  );
}

const CIRCLE_STYLE = {
  width: 120,
  height: 120,
  borderRadius: 60,
  borderWidth: 3,
  borderColor: 'rgba(255,255,255,0.7)',
  shadowColor: '#91a2c0',
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
};

const styles = StyleSheet.create({
  pattiCircle: CIRCLE_STYLE,
  safe: {
    flex: 1,
    backgroundColor: '#eef5ff',
  },
  outer: {
    flex: 1,
    backgroundColor: '#eef5ff',
  },
  tablet: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: COLORS.card,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoWord: {
    fontFamily: 'BnviitLasik',
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  header: {
    height: 76,
    paddingHorizontal: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f4f7fe',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  screen: {
    flex: 1,
    padding: 40,
    backgroundColor: COLORS.stage,
  },
  lightButton: {
    minHeight: 58,
    paddingHorizontal: 24,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f6ff',
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  lightButtonText: {
    color: COLORS.blueDark,
    fontSize: 18,
    fontWeight: '900',
  },
  blueButton: {
    minHeight: 58,
    paddingHorizontal: 24,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
  },
  blueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  darkButton: {
    minHeight: 58,
    paddingHorizontal: 30,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dark,
    shadowColor: COLORS.dark,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  darkButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  libHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  libGreetText: {
    flex: 1,
  },
  libTitle: {
    fontSize: 46,
    lineHeight: 54,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  libSubtitle: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_MUTED_ON_DARK,
  },
  creatorActions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  errorText: {
    marginTop: 12,
    color: '#c03744',
    fontSize: 15,
    fontWeight: '800',
  },
  puzzleModal: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  watchScreen: {
    flex: 1,
    padding: 36,
    backgroundColor: COLORS.stage,
  },
  videoCard: {
    flex: 1,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#f4f7fe',
    borderWidth: 2,
    borderColor: '#e3e9f7',
    shadowColor: '#91a2c0',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  activitiesScreen: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    backgroundColor: COLORS.stage,
  },
  activitiesFriend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  wrapupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  drawCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 40,
    borderRadius: 26,
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  drawCtaIcon: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
  },
  drawCtaText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.blue,
  },
  quoteMark: {
    color: COLORS.blue,
    fontSize: 21,
    fontWeight: '900',
    marginHorizontal: 8,
  },
  quoteText: {
    color: TEXT_ON_DARK,
    fontSize: 22,
    fontWeight: '900',
  },
  traceOverlay: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  countdown: {
    position: 'absolute',
    right: 26,
    bottom: 26,
    zIndex: 7,
    width: 78,
    height: 78,
    borderRadius: 39,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#609EF5',
  },
  countdownText: {
    color: '#192853',
    fontSize: 40,
    lineHeight: 46,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '900',
  },
  traceIntro: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: '#f4f7fe',
  },
  traceIntroHint: {
    marginTop: 6,
    color: TEXT_MUTED_ON_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  swatchOn: {
    borderColor: COLORS.ink,
    transform: [{ scale: 1.15 }],
  },
  traceTopic: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    zIndex: 5,
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: '#eaf4ff',
    borderWidth: 1.5,
    borderColor: COLORS.blue,
  },
  traceTopicText: {
    color: COLORS.blueDark,
    fontSize: 22,
    fontWeight: '900',
  },
  praiseScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,28,48,0.28)',
  },
  praiseCard: {
    alignItems: 'center',
    gap: 18,
    paddingVertical: 40,
    paddingHorizontal: 64,
    borderRadius: 28,
    backgroundColor: '#f4f7fe',
    shadowColor: '#1b2a4a',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
  },
  praiseText: {
    color: '#1b2a4a',
    fontSize: 34,
    fontWeight: '900',
  },
  quizOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(26, 28, 35, 0.35)',
    zIndex: 50,
  },
  reviewScreen: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 30,
    backgroundColor: '#ffffff',
    zIndex: 10,
  },
  reviewTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#171d31',
  },
  reviewFrame: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 10,
    borderColor: '#d9b382',
    shadowColor: '#171d31',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  reviewBack: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5b6b8c',
  },
  convertOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#f1f5ff',
    zIndex: 10,
  },
  convertCard: {
    minWidth: 420,
    maxWidth: 560,
    padding: 34,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#f4f7fe',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  convertTitle: {
    color: TEXT_ON_DARK,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  convertCopy: {
    color: TEXT_MUTED_ON_DARK,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  quizCard: {
    maxWidth: '90%',
    padding: 30,
    borderRadius: 26,
    backgroundColor: '#f4f7fe',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  quizPromptRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
  },
  miniStar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaf2ff',
  },
  miniStarText: {
    fontSize: 30,
    color: COLORS.blue,
    fontWeight: '900',
  },
  questionBox: {
    minWidth: 570,
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionText: {
    color: TEXT_ON_DARK,
    fontSize: 27,
    fontWeight: '900',
  },
  quizOptions: {
    marginTop: 34,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 38,
  },
  quizOption: {
    minWidth: 144,
    height: 58,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  quizOptionDimmed: {
    opacity: 0.48,
  },
  quizOptionText: {
    fontSize: 21,
    fontWeight: '900',
  },
  answerResult: {
    alignSelf: 'center',
    marginTop: 28,
    minWidth: 260,
    height: 58,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#00CFE9',
    backgroundColor: '#f1fdff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  answerLabel: {
    fontSize: 20,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  answerValue: {
    fontSize: 21,
    fontWeight: '900',
    color: '#00CFE9',
  },
  bottomActions: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  drawingScreen: {
    flex: 1,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  drawingCanvasCard: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#188ddd',
    backgroundColor: '#ffffff',
  },
  drawingTopic: {
    position: 'absolute',
    top: 18,
    right: 22,
  },
  drawingTopicText: {
    color: '#171d31',
    fontSize: 20,
    fontWeight: '900',
  },
  checkTool: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00CFE9',
  },
  checkText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  skipFloat: {
    position: 'absolute',
    right: 20,
    bottom: 18,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#f1f6ff',
  },
  skipFloatText: {
    color: COLORS.blueDark,
    fontSize: 16,
    fontWeight: '900',
  },
  sketchPad: {
    flex: 1,
    minHeight: 360,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e3e9f7',
  },
  sketchPadTransparent: {
    flex: 1,
    position: 'relative',
    minHeight: undefined,
    borderWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.01)',
    zIndex: 3,
  },
  padRow: {
    flex: 1,
  },
  toolPeek: {
    position: 'absolute',
    bottom: 14,
    left: 18,
    zIndex: 50,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  welcomeScreen: {
    flex: 1,
    padding: 40,
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },
  welcomeBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  welcomeBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00CFE9',
  },
  welcomeTitle: {
    fontSize: 40,
    lineHeight: 52,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  welcomeCopy: {
    fontSize: 16,
    lineHeight: 26,
    color: TEXT_MUTED_ON_DARK,
  },
  welcomeButton: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00CFE9',
  },
  welcomeButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  evolveBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,28,60,0.35)',
  },
  evolveCard: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 36,
    paddingVertical: 28,
    borderRadius: 28,
    backgroundColor: '#f4f7fe',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  evolveTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  evolveCopy: {
    fontSize: 14,
    color: TEXT_MUTED_ON_DARK,
  },
  evolveRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 6,
  },
  evolveChoice: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: '#f1f5ff',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  evolveImage: {
    width: 110,
    height: 110,
  },
  debugWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 90,
  },
  debugBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3e9f7',
  },
  debugBtnText: {
    fontSize: 15,
    color: '#5b6b8c',
  },
  debugList: {
    marginTop: 6,
    borderRadius: 14,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  debugItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  debugItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#171d31',
  },
  mainScreen: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    backgroundColor: '#ffffff',
  },
  mainGreetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  // Balances the star so the greeting itself stays screen-centred.
  buddySpacer: {
    width: 128,
  },
  buddyBubble: {
    // Hangs off the star's right side; the anchor keeps it glued there.
    position: 'absolute',
    left: 136,
    top: 6,
    zIndex: 40,
    minWidth: 230,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#00CFE9',
  },
  buddyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  buddyTail: {
    position: 'absolute',
    left: -8,
    top: 26,
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#00CFE9',
    transform: [{ rotate: '45deg' }],
  },
  buddyAnchor: {
    position: 'relative',
  },
  buddyMenu: {
    marginTop: 10,
    gap: 8,
  },
  buddyMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  buddyMenuIcon: {
    fontSize: 16,
    color: '#00CFE9',
  },
  buddyMenuText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#171d31',
  },
  mainGreetBlock: {
    alignItems: 'center',
    marginTop: 44,
  },
  mainGreetLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainUnderline: {
    height: 8,
    borderRadius: 4,
    marginTop: -6,
    backgroundColor: '#609EF5',
  },
  ringCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: CARD_W,
    justifyContent: 'center',
  },
  carousel: {
    // Children are absolutely placed, so the row needs its own size to catch the drag.
    flex: 1,
    alignSelf: 'stretch',
    // Pushed down so the cards run off the bottom edge — the fan should feel like it continues.
    marginTop: 64,
    marginBottom: -70,
  },
  mainGreeting: {
    fontSize: 40,
    lineHeight: 54,
    fontWeight: '900',
    color: BG,
  },
  mainGreetingSub: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_MUTED_ON_DARK,
    marginBottom: 18,
  },
  carouselContent: {
    alignItems: 'center',
    paddingTop: 46,
  },
  card: {
    width: CARD_W,
    // Fills down to the character card's baseline instead of stopping short.
    height: CARD_H + 80,
    borderRadius: CARD_RADIUS,
    paddingTop: 26,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  cardFocused: {
    zIndex: 2,
    marginHorizontal: -14,
    transform: [{ translateY: -26 }, { scale: 1.06 }],
  },
  cardBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  cardBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  cardSub: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  cardArt: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    height: 260,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 60,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(20,28,60,0.35)',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  backChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    backgroundColor: '#f1f5ff',
  },
  backChipText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  headerSheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4000,
    zIndex: 60,
  },
  headerSheet: {
    position: 'absolute',
    top: 68,
    right: 24,
    minWidth: 176,
    borderRadius: 18,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3e9f7',
    shadowColor: '#0b1c4a',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 70,
  },
  headerSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerSheetIcon: {
    fontSize: 15,
    color: '#00CFE9',
  },
  headerSheetText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#171d31',
  },
  headerSheetDivider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: '#eef2fb',
  },
  headerMenu: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  headerMenuLine: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: TEXT_ON_DARK,
  },
  detailScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 32,
  },
  detailClose: {
    position: 'absolute',
    top: 22,
    right: 28,
    padding: 10,
  },
  detailCloseText: {
    fontSize: 26,
    fontWeight: '900',
    color: BG,
  },
  detailThumb: {
    // Real video shape, so the still is not letterboxed or stretched.
    width: '82%',
    aspectRatio: 16 / 9,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    overflow: 'hidden',
  },
  detailThumbImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  detailOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailStart: {
    alignItems: 'center',
    gap: 10,
  },
  detailPlay: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  detailPlayGlyph: {
    fontSize: 34,
    marginLeft: 6,
    color: '#ffffff',
  },
  detailStartText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 6,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BG,
  },
  detailMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b6b8c',
  },
  detailCounts: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b6b8c',
  },
  seriesScreen: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f5f8ff',
  },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  seriesBack: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  seriesBackText: {
    fontSize: 18,
    fontWeight: '800',
    color: BG,
  },
  seriesTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: BG,
  },
  seriesCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b6b8c',
  },
  seriesBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
  },
  seriesHero: {
    width: SERIES_HERO_W,
    // Runs the full column, so its bottom lines up with the last row of videos.
    alignSelf: 'stretch',
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 20,
    // Line rides a little above the floor, halfway between the character and the card edge.
    paddingBottom: 110,
  },
  seriesHeroArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesHeroLine: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  seriesRight: {
    flex: 1,
    gap: 14,
  },
  seriesFilters: {
    flexDirection: 'row',
    gap: 10,
  },
  seriesFilter: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dbe3f5',
  },
  seriesFilterText: {
    fontSize: 14,
    fontWeight: '800',
    color: BG,
  },
  seriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingBottom: 20,
  },
  episode: {
    gap: 8,
  },
  episodeThumb: {
    height: 190,
    borderRadius: 18,
    overflow: 'hidden',
  },
  episodeImg: {
    width: '100%',
    height: '100%',
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BG,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#e3e9f7',
    backgroundColor: '#f4f7fe',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
  },
  tabIcon: {
    fontSize: 18,
    color: TEXT_MUTED_ON_DARK,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: TEXT_MUTED_ON_DARK,
  },
  tabActive: {
    color: '#00CFE9',
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingBottom: 24,
  },
  wordCard: {
    width: 300,
    gap: 8,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#f4f7fe',
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  wordHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  wordText: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  wordBadge: {
    fontSize: 11,
    fontWeight: '900',
    color: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#00CFE9',
  },
  wordMeaning: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5b6b8c',
  },
  wordExample: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a97b1',
  },
  tabScreen: {
    flex: 1,
  },
  tabHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 14,
  },
  tabHeadTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  settingsBody: {
    gap: 14,
    paddingBottom: 24,
  },
  settingsCard: {
    gap: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#f4f7fe',
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  settingsCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#5b6b8c',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingsRowText: {
    flex: 1,
    gap: 2,
  },
  settingsLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  settingsHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a97b1',
  },
  settingsValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#00CFE9',
  },
  settingsEdit: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  settingsEditText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00CFE9',
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    padding: 3,
    backgroundColor: '#dde5f5',
  },
  toggleOn: {
    backgroundColor: '#00CFE9',
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  toggleKnobOn: {
    marginLeft: 24,
  },
  tabPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardScreen: {
    flex: 1,
    padding: 30,
    gap: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  onboardHeader: {
    alignItems: 'center',
    gap: 4,
  },
  onboardStep: {
    fontSize: 12,
    fontWeight: '800',
    color: TEXT_MUTED_ON_DARK,
  },
  onboardTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  onboardCopy: {
    fontSize: 14,
    color: TEXT_MUTED_ON_DARK,
  },
  onboardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 56,
  },
  onboardFields: {
    gap: 10,
    // Matches the picker track, and gives the consent sentence room to wrap cleanly.
    width: LIMIT_TRACK_W,
  },
  photoCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f7fe',
    borderWidth: 2,
    borderColor: '#e3e9f7',
  },
  photoImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  photoBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00CFE9',
    borderWidth: 2,
    borderColor: '#e3e9f7',
  },
  photoBadgeText: {
    fontSize: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 14,
  },
  stepperCol: {
    alignItems: 'center',
    gap: 8,
  },
  stepperCard: {
    width: 118,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: '#eaf9fc',
  },
  stepperViewport: {
    height: WHEEL_ITEM_H,
    alignSelf: 'stretch',
  },
  stepperItem: {
    height: WHEEL_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperArrowText: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    color: '#00CFE9',
  },
  stepperArrowDown: {
    marginTop: -4,
  },
  stepperValue: {
    fontSize: 42,
    lineHeight: 52,
    fontWeight: '900',
    color: '#00CFE9',
  },
  stepperColon: {
    marginTop: 44,
    fontSize: 30,
    fontWeight: '900',
    color: '#00CFE9',
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_MUTED_ON_DARK,
  },
  onboardLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  onboardInput: {
    width: 368,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    fontSize: 17,
    color: TEXT_ON_DARK,
    backgroundColor: '#f1f5ff',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  birthRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: 116,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#f1f5ff',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  dropdownValue: {
    fontSize: 16,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  dropdownCaret: {
    fontSize: 13,
    color: TEXT_MUTED_ON_DARK,
  },
  dropdownBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,28,60,0.3)',
  },
  dropdownSheet: {
    width: 200,
    maxHeight: 320,
    borderRadius: 20,
    paddingVertical: 8,
    backgroundColor: '#f4f7fe',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  dropdownOption: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOptionOn: {
    backgroundColor: '#00CFE9',
  },
  dropdownOptionText: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_ON_DARK,
  },
  dropdownOptionTextOn: {
    fontWeight: '900',
    color: '#04122b',
  },
  birthAge: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00CFE9',
  },
  guardianFields: {
    alignItems: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    // Top-aligned so the box stays on the first line when the sentence wraps.
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5ff',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  checkboxOn: {
    backgroundColor: '#00CFE9',
    borderColor: '#00CFE9',
  },
  checkboxMark: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  consentTextWrap: {
    gap: 2,
    alignItems: 'center',
  },
  consentSub: {
    fontSize: 12,
    lineHeight: 17,
    color: TEXT_MUTED_ON_DARK,
  },
  consentText: {
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_ON_DARK,
  },
  consentRequired: {
    fontWeight: '900',
    color: TEXT_ON_DARK,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  onboardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  toolStrip: {
    alignSelf: 'center',
    marginTop: 10,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#f4f7fe',
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  toolChipOn: {
    backgroundColor: '#00CFE9',
  },
  toolChipIcon: {
    fontSize: 16,
  },
  toolChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  toolDivider: {
    width: 1,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#e6ecfa',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  iconBtnOff: {
    opacity: 0.35,
  },
  iconBtnText: {
    fontSize: 17,
    color: TEXT_ON_DARK,
  },
  sizeSlider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sizeDotWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f1f5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelHitSm: {
    width: 120,
    height: 26,
    justifyContent: 'center',
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatchMore: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#00CFE9',
    borderWidth: 2,
  },
  swatchMoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  pickerBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,25,40,0.35)',
  },
  pickerCard: {
    gap: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#f4f7fe',
    borderWidth: 1.5,
    borderColor: '#e3e9f7',
  },
  pickerTabs: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
  },
  pickerTab: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f1f5ff',
  },
  pickerTabOn: {
    backgroundColor: '#00CFE9',
  },
  pickerTabText: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  pickerGrid: {
    flexDirection: 'row',
    alignSelf: 'center',
  },
  pickerCol: {
    flexDirection: 'column',
  },
  pickerCell: {
    width: 30,
    height: 26,
  },
  pickerCellOn: {
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  pickerCustom: {
    gap: 6,
    paddingVertical: 6,
  },
  pickerReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  pickerPreview: {
    width: 54,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e9f7',
  },
  pickerReadoutItem: {
    alignItems: 'center',
  },
  pickerReadoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED_ON_DARK,
  },
  pickerReadoutValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  pickerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingTop: 6,
  },
  pickerFooterBtn: {
    paddingHorizontal: 30,
    paddingVertical: 8,
  },
  pickerFooterText: {
    fontSize: 15,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  swatchSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  recentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MUTED_ON_DARK,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelLabel: {
    width: 14,
    fontSize: 12,
    fontWeight: '800',
    color: TEXT_ON_DARK,
  },
  channelHit: {
    width: 170,
    height: 26,
    justifyContent: 'center',
  },
  channelTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e3e9f7',
  },
  channelFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
  },
  channelThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: '#f4f7fe',
    borderWidth: 3,
    borderColor: '#00CFE9',
  },
  channelValue: {
    width: 30,
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_MUTED_ON_DARK,
    textAlign: 'right',
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    opacity: 0.92,
  },
  padPlaceholder: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: COLORS.blueSoft,
    color: COLORS.blueDark,
    fontSize: 20,
    fontWeight: '900',
  },
  reportScreen: {
    flex: 1,
    padding: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  reportIcon: {
    width: 82,
    height: 82,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f7fe',
    borderWidth: 1,
    borderColor: '#e3e9f7',
    shadowColor: '#64748b',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  reportBadge: {
    position: 'absolute',
    top: -9,
    right: -8,
    width: 25,
    height: 25,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f057a8',
  },
  reportBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  reportIconSymbol: {
    color: COLORS.blueDark,
    fontSize: 29,
    fontWeight: '900',
  },
  reportIconLabel: {
    marginTop: 4,
    color: TEXT_ON_DARK,
    fontSize: 13,
    fontWeight: '900',
  },
  reportActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportCardWide: {
    width: '92%',
    maxWidth: 1040,
    padding: 34,
    borderRadius: 28,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#e3e9f7',
    shadowColor: '#7ba3ff',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  reportHead: {
    alignItems: 'center',
    marginBottom: 22,
  },
  reportTitle: {
    color: TEXT_ON_DARK,
    fontSize: 30,
    fontWeight: '900',
  },
  reportDate: {
    marginTop: 7,
    color: TEXT_MUTED_ON_DARK,
    fontSize: 15,
    fontWeight: '800',
  },
  reportBody: {
    width: '100%',
    flexDirection: 'row',
    gap: 26,
    marginBottom: 24,
  },
  reportArtCol: {
    alignItems: 'center',
  },
  reportColLabel: {
    color: TEXT_ON_DARK,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  reportArtBox: {
    width: 300,
    minHeight: 288,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    // Picture frame: thick warm mount, thin dark rim, and a soft drop shadow.
    borderWidth: 10,
    borderColor: '#d9b382',
    shadowColor: '#171d31',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  reportArtCaption: {
    marginTop: 12,
    color: TEXT_MUTED_ON_DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  reportSumCol: {
    flex: 1,
    justifyContent: 'center',
    // Frame and summary sit on the same baseline height.
    minHeight: 308,
  },
  reportStatsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  reportStat: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#e3e9f7',
    shadowColor: '#64748b',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  reportStatValue: {
    fontSize: 42,
    fontWeight: '900',
  },
  reportStatLabel: {
    marginTop: 4,
    color: TEXT_ON_DARK,
    fontSize: 14,
    fontWeight: '900',
  },
  reportChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  reportChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.blueSoft,
  },
  reportChipText: {
    color: COLORS.blueDark,
    fontSize: 14,
    fontWeight: '900',
  },
  generatedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatedImage: {
    width: '100%',
    height: '100%',
  },
});
