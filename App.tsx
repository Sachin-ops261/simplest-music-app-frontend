import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Animated,
} from "react-native";
import TrackPlayer, {
  State,
  Event,
  Capability,
  usePlaybackState,
  useProgress,
} from "react-native-track-player";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Search,
  Heart,
  ChevronDown,
  ChevronUp,
  Shuffle,
  ListMusic,
  ArrowLeft,
  Flame,
  Music,
} from "lucide-react-native";

const BACKEND_URL = "https://s-music-api-simplest-app.onrender.com";
const { width: SW } = Dimensions.get("window");

// ── Accent palette ──────────────────────────────────────────────────
const A = {
  bg:       "#080810",
  surface:  "#111118",
  card:     "#15151f",
  border:   "#1e1e2a",
  accent:   "#4d8aff",
  accent2:  "#63e6e0",
  green:    "#1DB954",
  text:     "#f0eef8",
  dim:      "#8a8799",
  faint:    "#3f3d4d",
};

interface Track {
  id: string;
  title: string;
  artist: string;
  art: string;
  durationSec: number;
  streamUrl?: string;
}

function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Pulsing EQ indicator ────────────────────────────────────────────
function EqDot({ active }: { active: boolean }) {
  const s1 = useRef(new Animated.Value(1)).current;
  const s2 = useRef(new Animated.Value(1)).current;
  const s3 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) { [s1, s2, s3].forEach(s => s.setValue(1)); return; }
    const bar = (s: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(s, { toValue: 14, duration: 380, useNativeDriver: false }),
        Animated.timing(s, { toValue: 3,  duration: 380, useNativeDriver: false }),
      ]));
    const a1 = bar(s1, 0); const a2 = bar(s2, 160); const a3 = bar(s3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [active]);

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2.5, height: 16 }}>
      {[s1, s2, s3].map((b, i) => (
        <Animated.View key={i} style={{
          width: 3, height: active ? b : 4,
          backgroundColor: A.accent, borderRadius: 1.5,
        }} />
      ))}
    </View>
  );
}

export default function App() {
  const playbackState = usePlaybackState();
  const progress = useProgress();

  const [trendingTracks, setTrendingTracks]   = useState<Track[]>([]);
  const [searchResults, setSearchResults]     = useState<Track[]>([]);
  const [queueTracks, setQueueTracks]         = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack]       = useState<Track | null>(null);
  const [isTrackLoading, setIsTrackLoading]   = useState<boolean>(false);
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState<boolean>(false);
  const [searchQuery, setSearchQuery]         = useState<string>("");
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [likedSongs, setLikedSongs]           = useState<string[]>([]);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState<boolean>(false);
  const [isQueueVisible, setIsQueueVisible]   = useState<boolean>(false);

  const isPlaying = playbackState.state === State.Playing;

  // ── Setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function setupPlayer() {
      try {
        await TrackPlayer.setupPlayer({});
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play, Capability.Pause,
            Capability.SkipToNext, Capability.SkipToPrevious,
          ],
          compactCapabilities: [
            Capability.Play, Capability.Pause, Capability.SkipToNext,
          ],
        });
      } catch (e) { console.log("Player initialized:", e); }
    }
    setupPlayer();
    loadTrendingCharts();
  }, []);

  useEffect(() => {
    const playListener  = TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    const pauseListener = TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    const nextListener  = TrackPlayer.addEventListener(Event.RemoteNext, () => handleSkip("next"));
    const prevListener  = TrackPlayer.addEventListener(Event.RemotePrevious, () => handleSkip("prev"));
    return () => { playListener.remove(); pauseListener.remove(); nextListener.remove(); prevListener.remove(); };
  }, [queueTracks, currentTrack, isShuffleEnabled]);

  useEffect(() => {
    const trackChangedListener = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      async (evt) => {
        if (evt.track) {
          const t = evt.track as any;
          setCurrentTrack({ id: t.id, title: t.title, artist: t.artist, art: t.artwork, durationSec: t.duration, streamUrl: t.url });
        }
      },
    );
    return () => trackChangedListener.remove();
  }, []);

  // ── Data & playback logic (unchanged) ─────────────────────────────
  const loadTrendingCharts = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/popular`);
      const data = await response.json();
      if (data.tracks) setTrendingTracks(data.tracks);
    } catch (err) { console.log("Failed loading dashboard popular chart items:", err); }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/search/instant?q=${encodeURIComponent(searchQuery)}`,
      );
      const data = await response.json();
      if (!response.ok || (!data.tracks && !data.track)) { alert("No tracks found matching your entry."); return; }
      setSearchResults(data.tracks ? data.tracks : [data.track]);
    } catch (error) { console.error("Connection link issues:", error); }
    finally { setIsSearchLoading(false); }
  };

  const playSingleTrack = async (track: Track) => {
    setIsTrackLoading(true);
    try {
      let activeStreamUrl = track.streamUrl;
      if (!activeStreamUrl || activeStreamUrl.includes("youtube.com/watch")) {
        const res  = await fetch(`${BACKEND_URL}/api/tracks/resolve?video_id=${track.id}`);
        const data = await res.json();
        if (data.streamUrl) { activeStreamUrl = data.streamUrl; track.streamUrl = data.streamUrl; }
        else { alert("Could not resolve streaming link for this track."); setIsTrackLoading(false); return; }
      }
      await TrackPlayer.reset();
      await TrackPlayer.add({ id: track.id, url: activeStreamUrl ?? "", title: track.title, artist: track.artist, artwork: track.art, duration: track.durationSec } as any);
      setCurrentTrack(track);
      await TrackPlayer.play();
      fetch(`${BACKEND_URL}/api/search/queue?video_id=${track.id}`)
        .then(r => r.json())
        .then(async queueData => {
          if (queueData.tracks) {
            setQueueTracks(queueData.tracks);
            await TrackPlayer.add(queueData.tracks.map((t: Track) => ({ id: t.id, url: t.streamUrl ?? "", title: t.title, artist: t.artist, artwork: t.art, duration: t.durationSec })) as any);
          }
        })
        .catch(err => console.log("Contextual background queueing failed:", err));
    } catch (err) { console.error("Playback execution failed:", err); }
    finally { setIsTrackLoading(false); }
  };

  const togglePlayPause = async () => { if (isPlaying) await TrackPlayer.pause(); else await TrackPlayer.play(); };

  const handleSkip = async (direction: "next" | "prev") => {
    if (queueTracks.length === 0 && !currentTrack) return;
    const fullCurrentPlaylist = currentTrack ? [currentTrack, ...queueTracks] : queueTracks;
    const currentIndex = fullCurrentPlaylist.findIndex(s => s.id === currentTrack?.id);
    if (currentIndex === -1) return;
    let nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (isShuffleEnabled && direction === "next" && fullCurrentPlaylist.length > 1) {
      let r = currentIndex;
      while (r === currentIndex) r = Math.floor(Math.random() * fullCurrentPlaylist.length);
      nextIndex = r;
    }
    if (nextIndex >= fullCurrentPlaylist.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = fullCurrentPlaylist.length - 1;
    await playSingleTrack(fullCurrentPlaylist[nextIndex]);
  };

  const toggleLike = (id: string) => {
    setLikedSongs(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const cancelSearchFocus = () => {
    setIsSearchFocused(false);
    setSearchQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
  };

  // ── Progress pct helper ────────────────────────────────────────────
  const pct = currentTrack ? Math.min(1, progress.position / (currentTrack.durationSec || 1)) : 0;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <View style={st.shell}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <View style={[st.header, isSearchFocused && st.headerFocused]}>
        {!isSearchFocused ? (
          <View style={st.headerTop}>
            <View>
              <Text style={st.headerEyebrow}>Your music, everywhere</Text>
              <Text style={st.headerBrand}>S-MUSIC</Text>
            </View>
            <View style={st.headerAvatar}><Text style={st.headerAvatarText}>S</Text></View>
          </View>
        ) : (
          <Pressable style={st.backBtn} onPress={cancelSearchFocus}>
            <ArrowLeft size={22} color={A.text} />
          </Pressable>
        )}

        {/* ── SEARCH BAR (bug fix: no flex:1 in column parent) ─────── */}
        <View style={[st.searchBar, isSearchFocused && st.searchBarFocused]}>
          <Search size={17} color={isSearchFocused ? A.accent : A.dim} />
          <TextInput
            placeholder="Search songs or artists..."
            placeholderTextColor={A.faint}
            style={st.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            editable={!isSearchLoading}
          />
          {isSearchLoading && <ActivityIndicator size="small" color={A.accent} />}
          {!!searchQuery && !isSearchLoading && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <View style={st.clearBtn}><Text style={{ color: A.dim, fontSize: 11 }}>✕</Text></View>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── TRACK LOADING BAR ──────────────────────────────────────── */}
      {isTrackLoading && (
        <View style={st.loadingBar}>
          <ActivityIndicator size="small" color={A.accent} />
          <Text style={st.loadingText}>Resolving audio stream…</Text>
        </View>
      )}

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      {!isSearchFocused ? (
        <ScrollView
          contentContainerStyle={[st.scrollContent, currentTrack && { paddingBottom: 140 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Section header */}
          <View style={st.sectionRow}>
            <View style={st.sectionIconWrap}><Flame size={16} color="#ff6b6b" /></View>
            <Text style={st.sectionTitle}>Trending Global Hits</Text>
          </View>

          {trendingTracks.length === 0 && (
            <View style={st.centeredBlock}>
              <ActivityIndicator size="large" color={A.accent} />
              <Text style={[st.hintText, { marginTop: 12 }]}>Loading charts…</Text>
            </View>
          )}

          {trendingTracks.map((song, index) => {
            const isCurrent = currentTrack?.id === song.id;
            return (
              <Pressable
                key={`trend-${song.id}-${index}`}
                style={[st.songCard, isCurrent && st.songCardActive]}
                onPress={() => playSingleTrack(song)}
              >
                {/* Rank number */}
                <Text style={[st.rankNum, isCurrent && { color: A.accent }]}>
                  {String(index + 1).padStart(2, "0")}
                </Text>

                {/* Art */}
                <View style={st.artWrap}>
                  <Image source={{ uri: song.art }} style={st.songArt} />
                  {isCurrent && (
                    <View style={st.artOverlay}>
                      <EqDot active={isPlaying} />
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[st.songTitle, isCurrent && { color: A.accent }]} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={st.songArtist} numberOfLines={1}>{song.artist}</Text>
                </View>

                {/* Like + play */}
                <Pressable onPress={() => toggleLike(song.id)} hitSlop={8} style={{ marginRight: 10 }}>
                  <Heart
                    size={16}
                    color={likedSongs.includes(song.id) ? A.accent2 : A.faint}
                    fill={likedSongs.includes(song.id) ? A.accent2 : "none"}
                  />
                </Pressable>
                {isCurrent && isPlaying
                  ? <Pause size={16} color={A.accent} fill={A.accent} />
                  : <Play  size={16} color={A.dim} />
                }
              </Pressable>
            );
          })}
        </ScrollView>

      ) : (
        /* ── SEARCH RESULTS ──────────────────────────────────────── */
        <ScrollView
          contentContainerStyle={[st.scrollContent, currentTrack && { paddingBottom: 140 }]}
          showsVerticalScrollIndicator={false}
        >
          {isSearchLoading ? (
            <View style={st.centeredBlock}>
              <ActivityIndicator size="large" color={A.accent} />
              <Text style={[st.hintText, { marginTop: 12 }]}>Searching…</Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={st.centeredBlock}>
              <View style={st.emptyIconWrap}><Music size={32} color={A.faint} /></View>
              <Text style={st.emptyTitle}>What do you want to hear?</Text>
              <Text style={st.hintText}>Type a song title or artist name{"\n"}and press enter to search.</Text>
            </View>
          ) : (
            <>
              <Text style={st.resultsLabel}>{searchResults.length} results</Text>
              {searchResults.map((song, index) => {
                const isCurrent = currentTrack?.id === song.id;
                return (
                  <Pressable
                    key={`search-${song.id}-${index}`}
                    style={[st.songCard, isCurrent && st.songCardActive]}
                    onPress={() => playSingleTrack(song)}
                  >
                    <View style={st.artWrap}>
                      <Image source={{ uri: song.art }} style={st.songArt} />
                      {isCurrent && (
                        <View style={st.artOverlay}><EqDot active={isPlaying} /></View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[st.songTitle, isCurrent && { color: A.accent }]} numberOfLines={1}>
                        {song.title}
                      </Text>
                      <Text style={st.songArtist} numberOfLines={1}>{song.artist}</Text>
                    </View>
                    <Pressable onPress={() => toggleLike(song.id)} hitSlop={8} style={{ marginRight: 10 }}>
                      <Heart
                        size={16}
                        color={likedSongs.includes(song.id) ? A.accent2 : A.faint}
                        fill={likedSongs.includes(song.id) ? A.accent2 : "none"}
                      />
                    </Pressable>
                    {isCurrent && isPlaying
                      ? <Pause size={16} color={A.accent} fill={A.accent} />
                      : <Play  size={16} color={A.dim} />
                    }
                  </Pressable>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── MINI PLAYER ────────────────────────────────────────────── */}
      {currentTrack && (
        <Pressable
          style={st.mini}
          onPress={() => { setIsPlayerModalOpen(true); setIsQueueVisible(false); }}
        >
          {/* Thin progress line across top */}
          <View style={st.miniProgressTrack}>
            <View style={[st.miniProgressFill, { width: `${pct * 100}%` as any }]} />
          </View>

          <View style={st.miniInner}>
            <Image source={{ uri: currentTrack.art }} style={st.miniArt} />
            <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
              <Text style={st.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={st.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>
            <View style={st.miniControls}>
              <Pressable onPress={(e) => { e.stopPropagation(); handleSkip("prev"); }} style={st.miniBtn}>
                <SkipBack size={18} color={A.text} />
              </Pressable>
              <Pressable onPress={(e) => { e.stopPropagation(); togglePlayPause(); }} style={st.miniPlayBtn}>
                {isPlaying ? <Pause size={18} color={A.bg} fill={A.bg} /> : <Play size={18} color={A.bg} fill={A.bg} />}
              </Pressable>
              <Pressable onPress={(e) => { e.stopPropagation(); handleSkip("next"); }} style={st.miniBtn}>
                <SkipForward size={18} color={A.text} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      )}

      {/* ── FULL PLAYER MODAL ──────────────────────────────────────── */}
      <Modal
        visible={isPlayerModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsPlayerModalOpen(false)}
      >
        <View style={st.modal}>
          {/* Background: blurred art tint */}
          {currentTrack && (
            <Image source={{ uri: currentTrack.art }} style={st.modalBgArt} blurRadius={28} />
          )}
          <View style={st.modalTint} />

          {/* Modal header */}
          <View style={st.modalHeader}>
            <Pressable style={st.modalHeaderBtn} onPress={() => setIsPlayerModalOpen(false)}>
              <ChevronDown size={28} color={A.text} />
            </Pressable>
            <Text style={st.modalHeaderLabel}>Now Playing</Text>
            <Pressable style={st.modalHeaderBtn} onPress={() => setIsQueueVisible(!isQueueVisible)}>
              <ListMusic size={22} color={isQueueVisible ? A.accent : A.text} />
            </Pressable>
          </View>

          {currentTrack && (
            <View style={st.modalContent}>
              {!isQueueVisible ? (
                /* ── Classic view ─── */
                <View style={st.classicView}>
                  {/* Album art */}
                  <View style={st.bigArtShadow}>
                    <Image source={{ uri: currentTrack.art }} style={st.bigArt} />
                  </View>

                  {/* Title + like */}
                  <View style={st.bigMeta}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.bigTitle} numberOfLines={1}>{currentTrack.title}</Text>
                      <Text style={st.bigArtist} numberOfLines={1}>{currentTrack.artist}</Text>
                    </View>
                    <Pressable onPress={() => toggleLike(currentTrack.id)} hitSlop={10}>
                      <Heart
                        size={24}
                        color={likedSongs.includes(currentTrack.id) ? A.accent2 : A.dim}
                        fill={likedSongs.includes(currentTrack.id) ? A.accent2 : "none"}
                      />
                    </Pressable>
                  </View>
                </View>
              ) : (
                /* ── Queue view ─── */
                <View style={st.queueView}>
                  <Text style={st.queueHeader}>Up Next</Text>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {queueTracks.map((qSong, qIdx) => (
                      <Pressable
                        key={`queue-${qSong.id}-${qIdx}`}
                        style={st.queueCard}
                        onPress={() => playSingleTrack(qSong)}
                      >
                        <Image source={{ uri: qSong.art }} style={st.queueThumb} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={st.queueTitle} numberOfLines={1}>{qSong.title}</Text>
                          <Text style={st.queueArtist} numberOfLines={1}>{qSong.artist}</Text>
                        </View>
                        <Play size={14} color={A.faint} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Controls dock ─────────────────────────────── */}
              <View style={st.dock}>
                {/* Progress */}
                <View style={st.progressWrap}>
                  <View style={st.progressTrack}>
                    <View style={[st.progressFill, { width: `${pct * 100}%` as any }]} />
                    {/* Thumb dot */}
                    <View style={[st.progressThumb, { left: `${pct * 100}%` as any }]} />
                  </View>
                  <View style={st.timeRow}>
                    <Text style={st.timeText}>{formatTime(progress.position)}</Text>
                    <Text style={st.timeText}>{formatTime(currentTrack.durationSec)}</Text>
                  </View>
                </View>

                {/* Controls */}
                <View style={st.controls}>
                  <Pressable onPress={() => toggleLike(currentTrack.id)} hitSlop={10}>
                    <Heart
                      size={22}
                      color={likedSongs.includes(currentTrack.id) ? A.accent2 : A.dim}
                      fill={likedSongs.includes(currentTrack.id) ? A.accent2 : "none"}
                    />
                  </Pressable>
                  <Pressable onPress={() => handleSkip("prev")}>
                    <SkipBack size={30} color={A.text} fill={A.text} />
                  </Pressable>
                  <Pressable style={st.bigPlayBtn} onPress={togglePlayPause}>
                    {isPlaying
                      ? <Pause size={30} color={A.bg} fill={A.bg} />
                      : <Play  size={30} color={A.bg} fill={A.bg} />
                    }
                  </Pressable>
                  <Pressable onPress={() => handleSkip("next")}>
                    <SkipForward size={30} color={A.text} fill={A.text} />
                  </Pressable>
                  <Pressable onPress={() => setIsShuffleEnabled(!isShuffleEnabled)}>
                    <Shuffle size={22} color={isShuffleEnabled ? A.accent : A.dim} />
                  </Pressable>
                </View>

                {/* Queue toggle */}
                <Pressable style={st.queueToggle} onPress={() => setIsQueueVisible(!isQueueVisible)}>
                  {isQueueVisible
                    ? <ChevronDown size={20} color={A.dim} />
                    : <ChevronUp   size={20} color={A.dim} />
                  }
                  <Text style={st.queueToggleText}>
                    {isQueueVisible ? "Hide Queue" : "Show Queue"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── StyleSheet ──────────────────────────────────────────────────────
const st = StyleSheet.create({
  shell:  { flex: 1, backgroundColor: A.bg },

  // Header
  header: {
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: A.bg,
    borderBottomWidth: 1,
    borderBottomColor: A.border,
    gap: 12,
  },
  headerFocused: { flexDirection: "row", alignItems: "center", paddingTop: 56, gap: 10 },
  headerTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerEyebrow: { color: A.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2 },
  headerBrand: {
    color: A.text, fontSize: 26, fontWeight: "800", letterSpacing: 0.5, marginTop: 2,
  },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: A.accent, alignItems: "center", justifyContent: "center",
  },
  headerAvatarText: { color: A.bg, fontWeight: "800", fontSize: 14 },
  backBtn: { paddingRight: 4, paddingVertical: 6 },

  // Search bar — KEY FIX: no flex:1 here so height:44 is respected in column parent
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: A.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  searchBarFocused: { flex: 1, borderColor: A.accent },
  searchInput: { flex: 1, color: A.text, fontSize: 14.5, padding: 0 },
  clearBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: A.faint, alignItems: "center", justifyContent: "center",
  },

  // Loading bar
  loadingBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(77,138,255,0.1)", paddingVertical: 7, gap: 8,
    borderBottomWidth: 1, borderBottomColor: "rgba(77,138,255,0.2)",
  },
  loadingText: { color: A.accent, fontSize: 12, fontWeight: "600" },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 110 },

  // Section
  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 },
  sectionIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(255,107,107,0.15)", alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { color: A.text, fontSize: 17, fontWeight: "700" },
  resultsLabel: { color: A.dim, fontSize: 12, marginBottom: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },

  // Song cards
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: A.card,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: A.border,
  },
  songCardActive: {
    backgroundColor: "rgba(77,138,255,0.1)",
    borderColor: "rgba(77,138,255,0.3)",
  },
  rankNum: { color: A.faint, fontSize: 13, fontWeight: "700", width: 28, textAlign: "center" },
  artWrap: { position: "relative", width: 48, height: 48 },
  songArt: { width: 48, height: 48, borderRadius: 8, backgroundColor: A.surface },
  artOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,20,0.6)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  songTitle:  { color: A.text, fontSize: 14.5, fontWeight: "600" },
  songArtist: { color: A.dim,  fontSize: 12.5, marginTop: 2 },

  // Empty / centered
  centeredBlock:  { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIconWrap:  { width: 64, height: 64, borderRadius: 20, backgroundColor: A.card, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle:     { color: A.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  hintText:       { color: A.dim, fontSize: 13, textAlign: "center", lineHeight: 20 },

  // Mini player
  mini: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(17,17,24,0.97)",
    borderTopWidth: 1, borderTopColor: A.border,
  },
  miniProgressTrack: { height: 2, backgroundColor: A.border },
  miniProgressFill:  { height: 2, backgroundColor: A.accent },
  miniInner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10, height: 68,
  },
  miniArt:     { width: 44, height: 44, borderRadius: 10, backgroundColor: A.surface },
  miniTitle:   { color: A.text, fontSize: 14, fontWeight: "600" },
  miniArtist:  { color: A.dim, fontSize: 12, marginTop: 1 },
  miniControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniBtn:     { padding: 7 },
  miniPlayBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: A.text, alignItems: "center", justifyContent: "center",
  },

  // Modal
  modal:      { flex: 1, backgroundColor: A.bg },
  modalBgArt: {
    ...StyleSheet.absoluteFillObject,
    width: "100%", height: "100%", opacity: 0.25,
  },
  modalTint:  { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,8,16,0.75)" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 54, paddingHorizontal: 8,
  },
  modalHeaderBtn:   { padding: 14 },
  modalHeaderLabel: { color: A.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5 },
  modalContent:     { flex: 1, paddingHorizontal: 24 },

  // Classic player view
  classicView: { flex: 1, alignItems: "center", justifyContent: "center" },
  bigArtShadow: {
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 }, elevation: 14,
    borderRadius: 18, marginBottom: 32,
  },
  bigArt:   { width: SW - 80, height: SW - 80, borderRadius: 18 },
  bigMeta:  { flexDirection: "row", alignItems: "center", width: "100%", gap: 12 },
  bigTitle: { color: A.text, fontSize: 22, fontWeight: "800" },
  bigArtist:{ color: A.dim,  fontSize: 15, marginTop: 4 },

  // Queue
  queueView:   { flex: 1, paddingTop: 12 },
  queueHeader: { color: A.text, fontSize: 16, fontWeight: "700", marginBottom: 14 },
  queueCard: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 9, paddingHorizontal: 12,
    backgroundColor: A.card, borderRadius: 10,
    marginBottom: 8, borderWidth: 1, borderColor: A.border,
  },
  queueThumb:  { width: 40, height: 40, borderRadius: 8, backgroundColor: A.surface },
  queueTitle:  { color: A.text, fontSize: 14, fontWeight: "600" },
  queueArtist: { color: A.dim, fontSize: 12, marginTop: 2 },

  // Controls dock
  dock: { width: "100%", paddingBottom: 28 },
  progressWrap: { marginBottom: 28 },
  progressTrack: {
    height: 4, backgroundColor: A.border, borderRadius: 2,
    width: "100%", position: "relative",
  },
  progressFill:  { height: 4, backgroundColor: A.accent, borderRadius: 2 },
  progressThumb: {
    position: "absolute", top: -5,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: A.text, marginLeft: -7,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  timeRow:   { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  timeText:  { color: A.dim, fontSize: 12 },
  controls: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", width: "100%", paddingHorizontal: 4,
    marginBottom: 24,
  },
  bigPlayBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: A.text, alignItems: "center", justifyContent: "center",
    shadowColor: A.accent, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
  },
  queueToggle:     { alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 4 },
  queueToggleText: { color: A.faint, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
});