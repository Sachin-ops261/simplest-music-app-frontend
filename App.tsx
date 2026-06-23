import React, { useState, useEffect } from "react";
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

export default function App() {
  const playbackState = usePlaybackState();
  const progress = useProgress();

  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isTrackLoading, setIsTrackLoading] = useState<boolean>(false); // ← for track play loading
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false); // ← for search loading
  const [isShuffleEnabled, setIsShuffleEnabled] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [likedSongs, setLikedSongs] = useState<string[]>([]);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState<boolean>(false);
  const [isQueueVisible, setIsQueueVisible] = useState<boolean>(false);

  const isPlaying = playbackState.state === State.Playing;

  // Initialize Native Audio System & Load Home Charts — runs ONCE only
  useEffect(() => {
    async function setupPlayer() {
      try {
        await TrackPlayer.setupPlayer({});
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
        });
      } catch (e) {
        console.log("Player initialized:", e);
      }
    }
    setupPlayer();
    loadTrendingCharts();
  }, []);

  // Remote control listeners
  useEffect(() => {
    const playListener = TrackPlayer.addEventListener(Event.RemotePlay, () =>
      TrackPlayer.play(),
    );
    const pauseListener = TrackPlayer.addEventListener(Event.RemotePause, () =>
      TrackPlayer.pause(),
    );
    const nextListener = TrackPlayer.addEventListener(Event.RemoteNext, () =>
      handleSkip("next"),
    );
    const prevListener = TrackPlayer.addEventListener(
      Event.RemotePrevious,
      () => handleSkip("prev"),
    );

    return () => {
      playListener.remove();
      pauseListener.remove();
      nextListener.remove();
      prevListener.remove();
    };
  }, [queueTracks, currentTrack, isShuffleEnabled]);

  // Sync track state on native queue changes
  useEffect(() => {
    const trackChangedListener = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      async (evt) => {
        if (evt.track) {
          const nativeTrack = evt.track as any;
          setCurrentTrack({
            id: nativeTrack.id,
            title: nativeTrack.title,
            artist: nativeTrack.artist,
            art: nativeTrack.artwork,
            durationSec: nativeTrack.duration,
            streamUrl: nativeTrack.url,
          });
        }
      },
    );
    return () => trackChangedListener.remove();
  }, []);

  const loadTrendingCharts = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/popular`);
      const data = await response.json();
      if (data.tracks) setTrendingTracks(data.tracks);
    } catch (err) {
      console.log("Failed loading dashboard popular chart items:", err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchLoading(true); // ← uses separate search loading state
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/search/instant?q=${encodeURIComponent(searchQuery)}`,
      );
      const data = await response.json();

      if (!response.ok || (!data.tracks && !data.track)) {
        alert("No tracks found matching your entry.");
        return;
      }
      const results = data.tracks ? data.tracks : [data.track];
      setSearchResults(results);
    } catch (error) {
      console.error("Connection link issues:", error);
    } finally {
      setIsSearchLoading(false);
    }
  };

  const playSingleTrack = async (track: Track) => {
    setIsTrackLoading(true); // ← uses separate track loading state
    try {
      let activeStreamUrl = track.streamUrl;

      // Always resolve if no stream URL or it's a YouTube watch URL
      if (!activeStreamUrl || activeStreamUrl.includes("youtube.com/watch")) {
        const res = await fetch(
          `${BACKEND_URL}/api/tracks/resolve?video_id=${track.id}`,
        );
        const data = await res.json();
        if (data.streamUrl) {
          activeStreamUrl = data.streamUrl;
          track.streamUrl = data.streamUrl;
        } else {
          alert("Could not resolve streaming link for this track.");
          setIsTrackLoading(false);
          return;
        }
      }

      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: activeStreamUrl ?? "",
        title: track.title,
        artist: track.artist,
        artwork: track.art,
        duration: track.durationSec,
      } as any);

      setCurrentTrack(track);
      await TrackPlayer.play();

      // Background queue fetch
      fetch(`${BACKEND_URL}/api/search/queue?video_id=${track.id}`)
        .then((res) => res.json())
        .then(async (queueData) => {
          if (queueData.tracks) {
            setQueueTracks(queueData.tracks);
            const formatForNative = queueData.tracks.map((t: Track) => ({
              id: t.id,
              url: t.streamUrl ?? "",
              title: t.title,
              artist: t.artist,
              artwork: t.art,
              duration: t.durationSec,
            }));
            await TrackPlayer.add(formatForNative as any);
          }
        })
        .catch((err) =>
          console.log("Contextual background queueing failed:", err),
        );
    } catch (err) {
      console.error("Playback execution failed:", err);
    } finally {
      setIsTrackLoading(false);
    }
  };

  const togglePlayPause = async () => {
    if (isPlaying) await TrackPlayer.pause();
    else await TrackPlayer.play();
  };

  const handleSkip = async (direction: "next" | "prev") => {
    if (queueTracks.length === 0 && !currentTrack) return;
    const fullCurrentPlaylist = currentTrack
      ? [currentTrack, ...queueTracks]
      : queueTracks;
    const currentIndex = fullCurrentPlaylist.findIndex(
      (s) => s.id === currentTrack?.id,
    );
    if (currentIndex === -1) return;

    let nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (isShuffleEnabled && direction === "next" && fullCurrentPlaylist.length > 1) {
      let randomIndex = currentIndex;
      while (randomIndex === currentIndex) {
        randomIndex = Math.floor(Math.random() * fullCurrentPlaylist.length);
      }
      nextIndex = randomIndex;
    }

    if (nextIndex >= fullCurrentPlaylist.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = fullCurrentPlaylist.length - 1;

    await playSingleTrack(fullCurrentPlaylist[nextIndex]);
  };

  const toggleLike = (id: string) => {
    setLikedSongs((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
    );
  };

  const cancelSearchFocus = () => {
    setIsSearchFocused(false);
    setSearchQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.appShell}>
      {/* HEADER BAR & SEARCH REGION */}
      <View
        style={[
          styles.headerContainer,
          isSearchFocused && styles.headerContainerFocused,
        ]}
      >
        {!isSearchFocused ? (
          <Text style={styles.brandTitle}>S-MUSIC</Text>
        ) : (
          <Pressable style={styles.backArrowButton} onPress={cancelSearchFocus}>
            <ArrowLeft size={22} color="#fff" />
          </Pressable>
        )}

        <View
          style={[
            styles.searchBarRow,
            isSearchFocused && styles.searchBarRowFull,
          ]}
        >
          <Search size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search songs or artists..."
            placeholderTextColor="#666"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            editable={!isSearchLoading}
          />
        </View>
      </View>

      {/* TRACK LOADING OVERLAY — only shows when resolving audio, doesn't block search */}
      {isTrackLoading && (
        <View style={styles.trackLoadingBar}>
          <ActivityIndicator size="small" color="#1DB954" />
          <Text style={styles.trackLoadingText}>Loading track...</Text>
        </View>
      )}

      {/* CORE DISPLAY WINDOW VIEW SWITCH */}
      {!isSearchFocused ? (
        <ScrollView
          contentContainerStyle={styles.mainContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeaderRow}>
            <Flame size={20} color="#FF5A5F" style={{ marginRight: 6 }} />
            <Text style={styles.sectionHeader}>Trending Global Hits</Text>
          </View>

          {trendingTracks.length === 0 && (
            <ActivityIndicator
              size="small"
              color="#1DB954"
              style={{ marginVertical: 30 }}
            />
          )}

          {trendingTracks.map((song, index) => {
            const isCurrent = currentTrack?.id === song.id;
            return (
              <Pressable
                key={`trend-${song.id}-${index}`}
                style={styles.songCard}
                onPress={() => playSingleTrack(song)}
              >
                <Image source={{ uri: song.art }} style={styles.songArtThumb} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={[styles.songTitleText, isCurrent && { color: "#1DB954" }]}
                    numberOfLines={1}
                  >
                    {song.title}
                  </Text>
                  <Text style={styles.songArtistText} numberOfLines={1}>
                    {song.artist}
                  </Text>
                </View>
                {isCurrent && isPlaying ? (
                  <Pause size={18} color="#1DB954" />
                ) : (
                  <Play size={18} color="#aaa" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.mainContainer}
          style={styles.blackFocusContainer}
        >
          {isSearchLoading ? (
            <ActivityIndicator
              size="large"
              color="#1DB954"
              style={{ marginTop: 40 }}
            />
          ) : searchResults.length === 0 ? (
            <View style={styles.emptySearchCenterBlock}>
              <Music size={40} color="#333" style={{ marginBottom: 12 }} />
              <Text style={styles.emptySearchText}>
                Type your favorite song title above and press enter.
              </Text>
            </View>
          ) : (
            searchResults.map((song, index) => {
              const isCurrent = currentTrack?.id === song.id;
              return (
                <Pressable
                  key={`search-${song.id}-${index}`}
                  style={styles.songCard}
                  onPress={() => playSingleTrack(song)}
                >
                  <Image source={{ uri: song.art }} style={styles.songArtThumb} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={[styles.songTitleText, isCurrent && { color: "#1DB954" }]}
                      numberOfLines={1}
                    >
                      {song.title}
                    </Text>
                    <Text style={styles.songArtistText} numberOfLines={1}>
                      {song.artist}
                    </Text>
                  </View>
                  {isCurrent && isPlaying ? (
                    <Pause size={18} color="#1DB954" />
                  ) : (
                    <Play size={18} color="#aaa" />
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MINI CONTROLLER BAR */}
      {currentTrack && (
        <Pressable
          style={styles.miniPlayer}
          onPress={() => { setIsPlayerModalOpen(true); setIsQueueVisible(false); }}
        >
          <Image source={{ uri: currentTrack.art }} style={styles.miniArt} />
          <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
            <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>

          <View style={styles.miniControlsRow}>
            <Pressable onPress={() => handleSkip("prev")} style={styles.miniControlBtn}>
              <SkipBack size={18} color="#fff" />
            </Pressable>
            <Pressable onPress={togglePlayPause} style={styles.miniControlBtn}>
              {isPlaying ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}
            </Pressable>
            <Pressable onPress={() => handleSkip("next")} style={styles.miniControlBtn}>
              <SkipForward size={18} color="#fff" />
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* DETAILED PLAYER MODAL */}
      <Modal
        visible={isPlayerModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsPlayerModalOpen(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeaderRow}>
            <Pressable style={styles.closeButton} onPress={() => setIsPlayerModalOpen(false)}>
              <ChevronDown size={28} color="#fff" />
            </Pressable>
            <Text style={styles.modalNowPlayingTitle}>Now Playing</Text>
            <Pressable style={styles.closeButton} onPress={() => setIsQueueVisible(!isQueueVisible)}>
              <ListMusic size={24} color={isQueueVisible ? "#1DB954" : "#fff"} />
            </Pressable>
          </View>

          {currentTrack && (
            <View style={styles.modalContent}>
              {!isQueueVisible ? (
                <View style={styles.classicPlayerView}>
                  <Image source={{ uri: currentTrack.art }} style={styles.bigArt} />
                  <Text style={styles.bigTitle} numberOfLines={1}>{currentTrack.title}</Text>
                  <Text style={styles.bigArtist} numberOfLines={1}>{currentTrack.artist}</Text>
                </View>
              ) : (
                <View style={styles.queueContainerView}>
                  <Text style={styles.queueHeaderLabel}>Up Next</Text>
                  <ScrollView style={styles.queueScrollView} showsVerticalScrollIndicator={false}>
                    {queueTracks.map((qSong, qIdx) => (
                      <Pressable
                        key={`queue-${qSong.id}-${qIdx}`}
                        style={styles.queueCard}
                        onPress={() => playSingleTrack(qSong)}
                      >
                        <Image source={{ uri: qSong.art }} style={styles.queueThumb} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.queueTrackTitle} numberOfLines={1}>{qSong.title}</Text>
                          <Text style={styles.queueTrackArtist} numberOfLines={1}>{qSong.artist}</Text>
                        </View>
                        <Play size={14} color="#666" />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.playerControlsDock}>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${(progress.position / (currentTrack.durationSec || 1)) * 100}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
                    <Text style={styles.timeText}>{formatTime(currentTrack.durationSec)}</Text>
                  </View>
                </View>

                <View style={styles.controlsRow}>
                  <Pressable onPress={() => toggleLike(currentTrack.id)}>
                    <Heart
                      size={24}
                      color={likedSongs.includes(currentTrack.id) ? "#1DB954" : "#fff"}
                      fill={likedSongs.includes(currentTrack.id) ? "#1DB954" : "transparent"}
                    />
                  </Pressable>

                  <Pressable onPress={() => handleSkip("prev")}>
                    <SkipBack size={32} color="#fff" />
                  </Pressable>

                  <Pressable style={styles.playButtonBig} onPress={togglePlayPause}>
                    {isPlaying ? <Pause size={32} color="#000" /> : <Play size={32} color="#000" />}
                  </Pressable>

                  <Pressable onPress={() => handleSkip("next")}>
                    <SkipForward size={32} color="#fff" />
                  </Pressable>

                  <Pressable onPress={() => setIsShuffleEnabled(!isShuffleEnabled)}>
                    <Shuffle size={24} color={isShuffleEnabled ? "#1DB954" : "#fff"} />
                  </Pressable>
                </View>

                <Pressable
                  style={styles.queueToggleArrowButton}
                  onPress={() => setIsQueueVisible(!isQueueVisible)}
                >
                  {isQueueVisible ? (
                    <ChevronDown size={24} color="#aaa" />
                  ) : (
                    <ChevronUp size={24} color="#aaa" />
                  )}
                  <Text style={styles.queueToggleActionText}>
                    {isQueueVisible ? "Hide Queue" : "Swipe / Click to See Queue"}
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

const styles = StyleSheet.create({
  appShell: { flex: 1, backgroundColor: "#0d0d0d" },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 60,
    backgroundColor: "#0d0d0d",
    borderBottomWidth: 1,
    borderBottomColor: "#161616",
    paddingBottom: 12,
  },
  headerContainerFocused: { flexDirection: "row", alignItems: "center", paddingTop: 56 },
  brandTitle: { color: "#fff", fontSize: 24, fontWeight: "bold", marginBottom: 14, letterSpacing: 0.5 },
  backArrowButton: { paddingRight: 12, paddingVertical: 8 },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    flex: 1,
  },
  searchBarRowFull: { flex: 1 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 0 },

  trackLoadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
    paddingVertical: 6,
    gap: 8,
  },
  trackLoadingText: { color: "#1DB954", fontSize: 12 },

  mainContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 },
  blackFocusContainer: { backgroundColor: "#000000", flex: 1 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  sectionHeader: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  emptySearchCenterBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptySearchText: { color: "#444", fontSize: 13, textAlign: "center", lineHeight: 18 },

  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  songArtThumb: { width: 48, height: 48, borderRadius: 4, backgroundColor: "#222" },
  songTitleText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  songArtistText: { color: "#888", fontSize: 13, marginTop: 2 },

  miniPlayer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: "#1c1c1c",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#282828",
  },
  miniArt: { width: 44, height: 44, borderRadius: 4 },
  miniTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  miniArtist: { color: "#aaa", fontSize: 12 },
  miniControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 110,
  },
  miniControlBtn: { padding: 6 },

  modalContainer: { flex: 1, backgroundColor: "#0d0d0d", paddingTop: 20 },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  modalNowPlayingTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  closeButton: { padding: 16 },
  modalContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },

  classicPlayerView: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%" },
  bigArt: { width: 300, height: 300, borderRadius: 12, marginBottom: 36 },
  bigTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", textAlign: "center", width: "100%", paddingHorizontal: 10 },
  bigArtist: { color: "#888", fontSize: 16, marginTop: 6, textAlign: "center", width: "100%" },

  queueContainerView: { flex: 1, width: "100%", marginTop: 10, marginBottom: 20 },
  queueHeaderLabel: { color: "#fff", fontSize: 16, fontWeight: "bold", marginBottom: 12, paddingLeft: 4 },
  queueScrollView: { flex: 1, width: "100%" },
  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#141414",
  },
  queueThumb: { width: 40, height: 40, borderRadius: 4 },
  queueTrackTitle: { color: "#fff", fontSize: 14, fontWeight: "500" },
  queueTrackArtist: { color: "#888", fontSize: 12 },

  playerControlsDock: { width: "100%", paddingBottom: 20 },
  progressContainer: { width: "100%", marginBottom: 24 },
  progressBarBg: { height: 4, backgroundColor: "#333", borderRadius: 2, width: "100%" },
  progressBarFill: { height: 4, backgroundColor: "#fff", borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  timeText: { color: "#888", fontSize: 12 },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 8,
  },
  playButtonBig: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  queueToggleArrowButton: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    paddingTop: 10,
  },
  queueToggleActionText: {
    color: "#444",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});