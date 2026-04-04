import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Spacing,
  BorderRadius,
  Colors,
  GlowColors,
  TextColors,
  Backgrounds,
} from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CoachStackParamList } from "@/coach/navigation/CoachNavigator";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";

type NavigationProp = NativeStackNavigationProp<CoachStackParamList>;

const SPORTS = ["tennis", "padel", "pickleball"];
const FORMATS = [
  { key: "knockout", label: "Single Elimination" },
  { key: "round_robin", label: "Round Robin" },
  { key: "group_knockout", label: "Group + Knockout" },
  { key: "americano", label: "Americano (Rotating Partners)" },
];
const TYPES = ["singles"];

interface Tournament {
  id: string;
  name: string;
  sport: string;
  type: string;
  format: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  location: string;
  description: string | null;
  entryFee: string | null;
  spotsTotal: number;
  spotsTaken: number;
  categories: string[];
  xpReward: number;
  status: string;
  drawPublished: boolean;
  winnerId: string | null;
}

interface TournamentMatch {
  id: string;
  round: string;
  matchOrder: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  score: string | null;
  status: string;
}

interface Participant {
  participant: {
    id: string;
    playerId: string;
    category: string | null;
    seed: number | null;
    status: string;
  };
  player: {
    id: string;
    name: string;
    photoUrl: string | null;
  };
}

interface TournamentDetail extends Tournament {
  participants: Participant[];
  matches: TournamentMatch[];
}

interface CreateTournamentPayload {
  name: string;
  sport: string;
  type: string;
  format: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  location: string;
  description: string | null;
  spotsTotal: number;
  categories: string[];
  xpReward: number;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    upcoming: { bg: "#1E3A8A", text: "#93C5FD" },
    registration_open: { bg: "#14532D", text: "#86EFAC" },
    registration_closed: { bg: "#713F12", text: "#FCD34D" },
    in_progress: { bg: "#7C2D12", text: "#FCA5A5" },
    completed: { bg: "#1F2937", text: "#9CA3AF" },
    cancelled: { bg: "#1F2937", text: "#6B7280" },
  };
  const c = colors[status] || colors.upcoming;
  const label = status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

function CreateTournamentModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sport, setSport] = useState("tennis");
  const [type, setType] = useState("singles");
  const [format, setFormat] = useState("knockout");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [regDeadline, setRegDeadline] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [spotsTotal, setSpotsTotal] = useState("16");
  const [xpReward, setXpReward] = useState("100");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTournamentPayload) => apiRequest("POST", "/api/tournaments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
      onClose();
      resetForm();
    },
    onError: (e: Error) => {
      Alert.alert("Error", e.message || "Failed to create tournament");
    },
  });

  const resetForm = () => {
    setName(""); setSport("tennis"); setType("singles"); setFormat("knockout");
    setStartDate(""); setEndDate(""); setRegDeadline(""); setLocation("");
    setDescription(""); setSpotsTotal("16"); setXpReward("100");
    setCategories([]); setCategory("");
  };

  const addCategory = () => {
    const cat = category.trim();
    if (cat && !categories.includes(cat)) {
      setCategories(prev => [...prev, cat]);
      setCategory("");
    }
  };

  const handleCreate = () => {
    if (!name.trim() || !startDate || !endDate || !location.trim()) {
      Alert.alert("Missing Fields", "Name, start date, end date, and location are required.");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      sport,
      type,
      format,
      startDate,
      endDate,
      registrationDeadline: regDeadline || null,
      location: location.trim(),
      description: description.trim() || null,
      spotsTotal: parseInt(spotsTotal) || 16,
      xpReward: parseInt(xpReward) || 100,
      categories,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create Tournament</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={TextColors.secondary} />
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>Tournament Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Summer Open 2025"
            placeholderTextColor={TextColors.muted}
          />

          <Text style={styles.fieldLabel}>Sport</Text>
          <View style={styles.pillRow}>
            {SPORTS.map(s => (
              <Pressable key={s} style={[styles.pill, sport === s ? styles.pillActive : null]} onPress={() => setSport(s)}>
                <Text style={[styles.pillText, sport === s ? styles.pillTextActive : null]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Match Type</Text>
          <View style={styles.pillRow}>
            {TYPES.map(t => (
              <Pressable key={t} style={[styles.pill, type === t ? styles.pillActive : null]} onPress={() => setType(t)}>
                <Text style={[styles.pillText, type === t ? styles.pillTextActive : null]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Format</Text>
          {FORMATS.map(f => (
            <Pressable key={f.key} style={[styles.formatOption, format === f.key ? styles.formatOptionActive : null]} onPress={() => setFormat(f.key)}>
              <View style={[styles.radioCircle, format === f.key ? styles.radioCircleActive : null]}>
                {format === f.key ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={[styles.formatLabel, format === f.key ? styles.formatLabelActive : null]}>{f.label}</Text>
            </Pressable>
          ))}

          <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD) *</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2025-06-01"
            placeholderTextColor={TextColors.muted}
          />

          <Text style={styles.fieldLabel}>End Date (YYYY-MM-DD) *</Text>
          <TextInput
            style={styles.input}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2025-06-03"
            placeholderTextColor={TextColors.muted}
          />

          <Text style={styles.fieldLabel}>Registration Deadline (optional)</Text>
          <TextInput
            style={styles.input}
            value={regDeadline}
            onChangeText={setRegDeadline}
            placeholder="2025-05-28T23:59:00"
            placeholderTextColor={TextColors.muted}
          />

          <Text style={styles.fieldLabel}>Location *</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Main Court, Academy Name"
            placeholderTextColor={TextColors.muted}
          />

          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tournament rules and details..."
            placeholderTextColor={TextColors.muted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>Max Players</Text>
              <TextInput
                style={styles.input}
                value={spotsTotal}
                onChangeText={setSpotsTotal}
                keyboardType="numeric"
                placeholder="16"
                placeholderTextColor={TextColors.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>XP Reward (winner)</Text>
              <TextInput
                style={styles.input}
                value={xpReward}
                onChangeText={setXpReward}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={TextColors.muted}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Categories (optional)</Text>
          <View style={styles.categoryInputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. beginner, u18"
              placeholderTextColor={TextColors.muted}
              onSubmitEditing={addCategory}
              returnKeyType="done"
            />
            <Pressable style={styles.addCatBtn} onPress={addCategory}>
              <Ionicons name="add" size={18} color={GlowColors.primary} />
            </Pressable>
          </View>
          {categories.length > 0 ? (
            <View style={styles.categoryTags}>
              {categories.map(c => (
                <Pressable key={c} style={styles.categoryTag} onPress={() => setCategories(prev => prev.filter(x => x !== c))}>
                  <Text style={styles.categoryTagText}>{c}</Text>
                  <Ionicons name="close" size={12} color={GlowColors.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            style={[styles.createBtn, createMutation.isPending ? styles.createBtnDisabled : null]}
            onPress={handleCreate}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trophy" size={16} color="#fff" />
                <Text style={styles.createBtnText}>Create Tournament</Text>
              </>
            )}
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

function ResultModal({ match, participants, onClose, onSubmit }: {
  match: TournamentMatch;
  participants: Participant[];
  onClose: () => void;
  onSubmit: (matchId: string, winnerId: string, score: string) => void;
}) {
  const [score, setScore] = useState("");
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const p1 = participants.find(p => p.participant.playerId === match.player1Id);
  const p2 = participants.find(p => p.participant.playerId === match.player2Id);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.resultModal}>
          <Text style={styles.resultTitle}>Enter Match Result</Text>
          <Text style={styles.resultRound}>{match.round}</Text>

          <Text style={styles.fieldLabel}>Winner</Text>
          {p1 ? (
            <Pressable
              style={[styles.playerOption, winnerId === match.player1Id ? styles.playerOptionActive : null]}
              onPress={() => setWinnerId(match.player1Id)}
            >
              <View style={[styles.radioCircle, winnerId === match.player1Id ? styles.radioCircleActive : null]}>
                {winnerId === match.player1Id ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.playerOptionText}>{p1.player.name}</Text>
            </Pressable>
          ) : null}
          {p2 ? (
            <Pressable
              style={[styles.playerOption, winnerId === match.player2Id ? styles.playerOptionActive : null]}
              onPress={() => setWinnerId(match.player2Id)}
            >
              <View style={[styles.radioCircle, winnerId === match.player2Id ? styles.radioCircleActive : null]}>
                {winnerId === match.player2Id ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.playerOptionText}>{p2.player.name}</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Score (e.g. 6-3, 6-4)</Text>
          <TextInput
            style={styles.input}
            value={score}
            onChangeText={setScore}
            placeholder="6-3, 6-4"
            placeholderTextColor={TextColors.muted}
          />

          <View style={styles.resultActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, (!winnerId || !score.trim()) ? styles.submitBtnDisabled : null]}
              disabled={!winnerId || !score.trim()}
              onPress={() => winnerId && onSubmit(match.id, winnerId, score.trim())}
            >
              <Text style={styles.submitBtnText}>Save Result</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TournamentList({ onCreatePress, onSelectTournament }: { onCreatePress: () => void; onSelectTournament: (id: string) => void }) {
  const { data: tournamentList, isLoading, refetch } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={GlowColors.primary} />
      </View>
    );
  }

  const tournaments = tournamentList || [];

  return (
    <FlatList
      data={tournaments}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.listContent}
      refreshing={false}
      onRefresh={refetch}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Ionicons name="trophy-outline" size={48} color={TextColors.muted} />
          <Text style={styles.emptyTitle}>No Tournaments Yet</Text>
          <Text style={styles.emptyText}>Create your first tournament to get started.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.tournamentCard, pressed ? styles.cardPressed : null]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelectTournament(item.id);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardSub}>{item.sport} · {item.type} · {item.format.replace(/_/g, " ")}</Text>
            </View>
            <StatusBadge status={item.status} />
          </View>

          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={TextColors.muted} />
              <Text style={styles.metaText}>{item.startDate}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={12} color={TextColors.muted} />
              <Text style={styles.metaText}>{item.spotsTaken}/{item.spotsTotal}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="flash-outline" size={12} color="#FFB020" />
              <Text style={styles.metaText}>{item.xpReward} XP</Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={16} color={TextColors.muted} style={styles.chevron} />
        </Pressable>
      )}
    />
  );
}

interface AmericanoStandingEntry {
  playerId: string;
  name: string;
  points: number;
  played: number;
}

function AmericanoResultModal({ match, participants, onClose, onSubmit }: {
  match: TournamentMatch;
  participants: Participant[];
  onClose: () => void;
  onSubmit: (matchId: string, team1Points: number, team2Points: number) => void;
}) {
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");

  const partnersStr = match.score || "";
  let team1Player2Id: string | null = null;
  let team2Player2Id: string | null = null;
  if (partnersStr.startsWith("partners:")) {
    const parts = partnersStr.replace("partners:", "").split("|");
    team1Player2Id = parts[0] || null;
    team2Player2Id = parts[1] || null;
  }

  const p1 = participants.find(p => p.participant.playerId === match.player1Id);
  const p1partner = participants.find(p => p.participant.playerId === team1Player2Id);
  const p2 = participants.find(p => p.participant.playerId === match.player2Id);
  const p2partner = participants.find(p => p.participant.playerId === team2Player2Id);

  const team1Name = [p1?.player.name, p1partner?.player.name].filter(Boolean).join(" & ") || "Team 1";
  const team2Name = [p2?.player.name, p2partner?.player.name].filter(Boolean).join(" & ") || "Team 2";

  const t1 = parseInt(team1Score);
  const t2 = parseInt(team2Score);
  const isValid = !isNaN(t1) && !isNaN(t2) && t1 >= 0 && t2 >= 0;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.resultModal}>
          <Text style={styles.resultTitle}>Americano Score</Text>
          <Text style={styles.resultRound}>{match.round} · Court {match.matchOrder}</Text>

          <View style={{ gap: 12, marginTop: 12 }}>
            <View>
              <Text style={styles.fieldLabel}>{team1Name}</Text>
              <TextInput
                style={styles.input}
                value={team1Score}
                onChangeText={setTeam1Score}
                keyboardType="numeric"
                placeholder="e.g. 9"
                placeholderTextColor={TextColors.muted}
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>{team2Name}</Text>
              <TextInput
                style={styles.input}
                value={team2Score}
                onChangeText={setTeam2Score}
                keyboardType="numeric"
                placeholder="e.g. 7"
                placeholderTextColor={TextColors.muted}
              />
            </View>
          </View>

          <View style={styles.resultActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, !isValid ? styles.submitBtnDisabled : null]}
              disabled={!isValid}
              onPress={() => isValid && onSubmit(match.id, t1, t2)}
            >
              <Text style={styles.submitBtnText}>Save Score</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TournamentDetailView({ tournamentId }: { tournamentId: string }) {
  const queryClient = useQueryClient();
  const [resultMatch, setResultMatch] = useState<TournamentMatch | null>(null);
  const [americanoResultMatch, setAmericanoResultMatch] = useState<TournamentMatch | null>(null);
  const [swapSelection, setSwapSelection] = useState<{ matchId: string; slot: "player1" | "player2"; playerName: string } | null>(null);

  const { data: tournament, isLoading, refetch } = useQuery<TournamentDetail>({
    queryKey: ["/api/tournaments", tournamentId],
  });

  const generateDrawMutation = useMutation({
    mutationFn: (publish: boolean) => apiRequest("POST", `/api/tournaments/${tournamentId}/generate-draw`, { publish }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to generate draw"),
  });

  const publishDrawMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tournaments/${tournamentId}/publish-draw`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to publish draw"),
  });

  const adjustDrawMutation = useMutation({
    mutationFn: (body: {
      swapMatchId1?: string; swapSlot1?: string; swapMatchId2?: string; swapSlot2?: string;
      matchId?: string; player1Id?: string | null; player2Id?: string | null;
    }) => apiRequest("PATCH", `/api/tournaments/${tournamentId}/draw/adjust`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      setSwapSelection(null);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to adjust draw"),
  });

  const openRegistrationMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/tournaments/${tournamentId}`, { status: "registration_open" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const resultMutation = useMutation({
    mutationFn: ({ matchId, winnerId, score }: { matchId: string; winnerId: string; score: string }) =>
      apiRequest("POST", `/api/tournaments/${tournamentId}/matches/${matchId}/result`, { winnerId, score }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      setResultMatch(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to record result"),
  });

  const generateAmericanoMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/coach/tournaments/${tournamentId}/generate-americano-rounds`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to generate Americano rounds"),
  });

  const americanoResultMutation = useMutation({
    mutationFn: ({ matchId, team1Points, team2Points }: { matchId: string; team1Points: number; team2Points: number }) =>
      apiRequest("POST", `/api/coach/tournaments/${tournamentId}/americano-match-result`, { matchId, team1Points, team2Points }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      setAmericanoResultMatch(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message || "Failed to record Americano result"),
  });

  if (isLoading || !tournament) {
    return <View style={styles.centered}><ActivityIndicator color={GlowColors.primary} /></View>;
  }

  const pendingMatches = tournament.matches.filter(
    m => m.status !== "completed" && m.player1Id && m.player2Id
  );
  const completedMatches = tournament.matches.filter(m => m.status === "completed");

  const canGenerateDraw = tournament.participants.length >= 2;
  const hasDraw = tournament.matches.length > 0;

  const participantMap = new Map(tournament.participants.map(p => [p.participant.playerId, p.player.name]));

  return (
    <ScrollView style={styles.detailContainer} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      <View style={styles.detailCard}>
        <View style={styles.detailCardHeader}>
          <StatusBadge status={tournament.status} />
          <Text style={styles.detailSport}>{tournament.sport} · {tournament.type}</Text>
        </View>
        <Text style={styles.detailFormat}>{tournament.format.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</Text>
        <View style={styles.detailMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={TextColors.muted} />
            <Text style={styles.metaText}>{tournament.startDate} - {tournament.endDate}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={13} color={TextColors.muted} />
            <Text style={styles.metaText}>{tournament.location}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={13} color={TextColors.muted} />
            <Text style={styles.metaText}>{tournament.spotsTaken}/{tournament.spotsTotal} players registered</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="flash" size={13} color="#FFB020" />
            <Text style={styles.metaText}>{tournament.xpReward} XP reward for winner</Text>
          </View>
        </View>
      </View>

      {tournament.status === "upcoming" ? (
        <Pressable
          style={[styles.actionBtn, styles.actionBtnGreen]}
          onPress={() => {
            Alert.alert("Open Registration", "Allow players to register for this tournament?", [
              { text: "Cancel", style: "cancel" },
              { text: "Open", onPress: () => openRegistrationMutation.mutate() },
            ]);
          }}
        >
          <Ionicons name="log-in-outline" size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Open Registration</Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Participants ({tournament.participants.length})</Text>
      </View>

      {tournament.participants.length === 0 ? (
        <Text style={styles.emptyText}>No players registered yet.</Text>
      ) : (
        <View style={styles.participantsList}>
          {tournament.participants.map((p, idx) => (
            <View key={p.participant.id} style={styles.participantRow}>
              <Text style={styles.participantNum}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.participantName}>{p.player.name}</Text>
                {p.participant.category ? (
                  <Text style={styles.participantCategory}>{p.participant.category}</Text>
                ) : null}
              </View>
              {p.participant.seed ? (
                <View style={styles.seedBadge}>
                  <Text style={styles.seedText}>Seed {p.participant.seed}</Text>
                </View>
              ) : null}
              <Text style={[styles.participantStatus, p.participant.status === "eliminated" ? { color: "#EF4444" } : { color: "#10B981" }]}>
                {p.participant.status}
              </Text>
            </View>
          ))}
        </View>
      )}

      {tournament.format === "americano" ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Americano Rounds</Text>
          </View>

          {tournament.participants.length < 4 || tournament.participants.length % 4 !== 0 ? (
            <Text style={styles.emptyText}>
              Need players divisible by 4 (min 4) to generate Americano rounds. Currently {tournament.participants.length} registered.
            </Text>
          ) : (
            <Pressable
              style={[styles.actionBtn, hasDraw ? styles.actionBtnGray : styles.actionBtnBlue]}
              onPress={() => {
                Alert.alert(
                  hasDraw ? "Regenerate Rounds?" : "Generate Americano Rounds",
                  hasDraw ? "This will reset all existing rounds. Continue?" : `Generate ${tournament.participants.length - 1} rounds for ${tournament.participants.length} players?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Generate", onPress: () => generateAmericanoMutation.mutate() },
                  ]
                );
              }}
              disabled={generateAmericanoMutation.isPending}
            >
              {generateAmericanoMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{hasDraw ? "Regenerate Rounds" : "Generate Rounds"}</Text>
                </>
              )}
            </Pressable>
          )}

          {hasDraw ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Standings</Text>
              </View>
              {((tournament as any).americanoStandings as AmericanoStandingEntry[] | null | undefined)?.map((entry, idx) => (
                <View key={entry.playerId} style={styles.participantRow}>
                  <Text style={[styles.participantNum, idx < 3 ? { color: ["#FFB020", "#C0C0C0", "#CD7F32"][idx] } : null]}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.participantName}>{entry.name}</Text>
                    <Text style={styles.participantCategory}>{entry.played} rounds played</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: GlowColors.primary }}>{entry.points} pts</Text>
                </View>
              )) ?? null}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Court Results</Text>
              </View>
              {tournament.matches.filter(m => m.status !== "completed").map(match => {
                const partnersStr = match.score || "";
                let p1PartnerId: string | null = null;
                let p2PartnerId: string | null = null;
                if (partnersStr.startsWith("partners:")) {
                  const parts = partnersStr.replace("partners:", "").split("|");
                  p1PartnerId = parts[0] || null;
                  p2PartnerId = parts[1] || null;
                }
                const t1Names = [participantMap.get(match.player1Id || ""), participantMap.get(p1PartnerId || "")].filter(Boolean).join(" & ");
                const t2Names = [participantMap.get(match.player2Id || ""), participantMap.get(p2PartnerId || "")].filter(Boolean).join(" & ");
                return (
                  <Pressable
                    key={match.id}
                    style={styles.matchCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setAmericanoResultMatch(match);
                    }}
                  >
                    <View style={styles.matchRoundBadge}>
                      <Text style={styles.matchRoundText}>{match.round}</Text>
                    </View>
                    <View style={styles.matchPlayers}>
                      <Text style={styles.matchPlayer} numberOfLines={1}>{t1Names || "Team 1"}</Text>
                      <Text style={styles.matchVs}>vs</Text>
                      <Text style={styles.matchPlayer} numberOfLines={1}>{t2Names || "Team 2"}</Text>
                    </View>
                    <View style={styles.enterResultBtn}>
                      <Text style={styles.enterResultText}>Score</Text>
                    </View>
                  </Pressable>
                );
              })}

              {tournament.matches.filter(m => m.status === "completed").map(match => (
                <View key={match.id} style={[styles.matchCard, styles.matchCardCompleted]}>
                  <View style={[styles.matchRoundBadge, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                    <Text style={[styles.matchRoundText, { color: "#10B981" }]}>{match.round}</Text>
                  </View>
                  <View style={styles.matchPlayers}>
                    <Text style={styles.matchPlayer} numberOfLines={1}>
                      {participantMap.get(match.player1Id || "") || "Team 1"}
                    </Text>
                    <Text style={styles.scoreDisplay}>{match.score}</Text>
                    <Text style={styles.matchPlayer} numberOfLines={1}>
                      {participantMap.get(match.player2Id || "") || "Team 2"}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Draw</Text>
            {!tournament.drawPublished && hasDraw ? (
              <Pressable
                style={styles.publishBtn}
                onPress={() => {
                  Alert.alert("Publish Draw", "This will make the bracket visible to all players.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Publish", onPress: () => publishDrawMutation.mutate() },
                  ]);
                }}
                disabled={publishDrawMutation.isPending}
              >
                <Text style={styles.publishBtnText}>Publish to Players</Text>
              </Pressable>
            ) : null}
          </View>

          {canGenerateDraw ? (
            <Pressable
              style={[styles.actionBtn, hasDraw ? styles.actionBtnGray : styles.actionBtnBlue]}
              onPress={() => {
                Alert.alert(
                  hasDraw ? "Regenerate Draw?" : "Generate Draw",
                  hasDraw ? "This will reset all existing matches. Continue?" : "Generate the bracket from current registrations?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Generate", onPress: () => generateDrawMutation.mutate(false) },
                  ]
                );
              }}
              disabled={generateDrawMutation.isPending}
            >
              {generateDrawMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="git-network-outline" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>{hasDraw ? "Regenerate Draw" : "Generate Draw"}</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Text style={styles.emptyText}>Need at least 2 participants to generate draw.</Text>
          )}
        </>
      )}

      {/* Draft draw adjustment: shown when draw exists but not yet published (non-Americano only) */}
      {tournament.format !== "americano" && hasDraw && !tournament.drawPublished ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Draft Bracket</Text>
            {swapSelection ? (
              <Pressable onPress={() => setSwapSelection(null)}>
                <Text style={{ color: "#EF4444", fontSize: 13 }}>Cancel Swap</Text>
              </Pressable>
            ) : (
              <Text style={{ color: TextColors.muted, fontSize: 12 }}>Tap players to swap</Text>
            )}
          </View>
          {tournament.matches.filter(m => !m.round.startsWith("KO") || tournament.format !== "group_knockout").map(match => (
            <View key={match.id} style={styles.matchCard}>
              <View style={styles.matchRoundBadge}>
                <Text style={styles.matchRoundText}>{match.round}</Text>
              </View>
              <View style={styles.matchPlayers}>
                {(["player1Id", "player2Id"] as const).map((slot, si) => {
                  const pid = slot === "player1Id" ? match.player1Id : match.player2Id;
                  const slotKey: "player1" | "player2" = slot === "player1Id" ? "player1" : "player2";
                  const name = pid ? (participantMap.get(pid) || "TBD") : "TBD";
                  const isSelected = swapSelection?.matchId === match.id && swapSelection?.slot === slotKey;
                  return (
                    <React.Fragment key={slot}>
                      {si === 1 ? <Text style={styles.matchVs}>vs</Text> : null}
                      <Pressable
                        onPress={() => {
                          if (!swapSelection) {
                            setSwapSelection({ matchId: match.id, slot: slotKey, playerName: name });
                          } else if (swapSelection.matchId === match.id && swapSelection.slot === slotKey) {
                            setSwapSelection(null);
                          } else {
                            adjustDrawMutation.mutate({
                              swapMatchId1: swapSelection.matchId,
                              swapSlot1: swapSelection.slot,
                              swapMatchId2: match.id,
                              swapSlot2: slotKey,
                            });
                          }
                        }}
                        style={[styles.swapPlayerSlot, isSelected ? styles.swapPlayerSlotSelected : null]}
                      >
                        <Text style={[styles.matchPlayer, isSelected ? { color: Colors.dark.xpCyan } : null]} numberOfLines={1}>{name}</Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {tournament.format !== "americano" && pendingMatches.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Results ({pendingMatches.length})</Text>
          </View>
          {pendingMatches.map(match => (
            <Pressable
              key={match.id}
              style={styles.matchCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setResultMatch(match);
              }}
            >
              <View style={styles.matchRoundBadge}>
                <Text style={styles.matchRoundText}>{match.round}</Text>
              </View>
              <View style={styles.matchPlayers}>
                <Text style={styles.matchPlayer} numberOfLines={1}>
                  {participantMap.get(match.player1Id || "") || "TBD"}
                </Text>
                <Text style={styles.matchVs}>vs</Text>
                <Text style={styles.matchPlayer} numberOfLines={1}>
                  {participantMap.get(match.player2Id || "") || "TBD"}
                </Text>
              </View>
              <View style={styles.enterResultBtn}>
                <Text style={styles.enterResultText}>Enter Result</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {tournament.format !== "americano" && completedMatches.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Completed ({completedMatches.length})</Text>
          </View>
          {completedMatches.map(match => (
            <View key={match.id} style={[styles.matchCard, styles.matchCardCompleted]}>
              <View style={[styles.matchRoundBadge, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
                <Text style={[styles.matchRoundText, { color: "#10B981" }]}>{match.round}</Text>
              </View>
              <View style={styles.matchPlayers}>
                <Text style={[styles.matchPlayer, match.winnerId === match.player1Id ? styles.matchWinner : styles.matchLoser]} numberOfLines={1}>
                  {participantMap.get(match.player1Id || "") || "TBD"}
                </Text>
                <Text style={styles.scoreDisplay}>{match.score}</Text>
                <Text style={[styles.matchPlayer, match.winnerId === match.player2Id ? styles.matchWinner : styles.matchLoser]} numberOfLines={1}>
                  {participantMap.get(match.player2Id || "") || "TBD"}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {tournament.status === "completed" && tournament.winnerId ? (
        <View style={styles.winnerCard}>
          <Ionicons name="trophy" size={24} color="#FFB020" />
          <Text style={styles.winnerLabel}>Tournament Winner</Text>
          <Text style={styles.winnerName}>{participantMap.get(tournament.winnerId) || "Champion"}</Text>
          <Text style={styles.winnerXp}>+{tournament.xpReward} XP awarded</Text>
        </View>
      ) : null}

      {resultMatch ? (
        <ResultModal
          match={resultMatch}
          participants={tournament.participants}
          onClose={() => setResultMatch(null)}
          onSubmit={(matchId, winnerId, score) => resultMutation.mutate({ matchId, winnerId, score })}
        />
      ) : null}

      {americanoResultMatch ? (
        <AmericanoResultModal
          match={americanoResultMatch}
          participants={tournament.participants}
          onClose={() => setAmericanoResultMatch(null)}
          onSubmit={(matchId, team1Points, team2Points) => americanoResultMutation.mutate({ matchId, team1Points, team2Points })}
        />
      ) : null}
    </ScrollView>
  );
}

export default function TournamentManagementScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleBack = () => {
    if (selectedTournamentId) {
      setSelectedTournamentId(null);
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="chevron-back" size={22} color={GlowColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{selectedTournamentId ? "Tournament" : "Tournaments"}</Text>
        {!selectedTournamentId ? (
          <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={22} color={GlowColors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {selectedTournamentId ? (
        <TournamentDetailView tournamentId={selectedTournamentId} />
      ) : (
        <TournamentList
          onCreatePress={() => setShowCreate(true)}
          onSelectTournament={(id) => setSelectedTournamentId(id)}
        />
      )}

      <CreateTournamentModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Backgrounds.card },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TextColors.primary },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Backgrounds.card, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GlowColors.primary + "20", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: GlowColors.primary + "40",
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: TextColors.primary },
  emptyText: { fontSize: 13, color: TextColors.muted, textAlign: "center", paddingHorizontal: Spacing.md, marginTop: 4 },
  listContent: { padding: Spacing.md, paddingBottom: 40, gap: 10 },
  tournamentCard: {
    backgroundColor: Backgrounds.card, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    position: "relative",
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: TextColors.primary, flex: 1, marginRight: 8 },
  cardSub: { fontSize: 11, color: TextColors.muted, marginTop: 2, textTransform: "capitalize" },
  cardMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, color: TextColors.secondary },
  chevron: { position: "absolute", right: Spacing.md, top: "50%" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "700" },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Backgrounds.card },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: TextColors.primary },
  closeBtn: { padding: 8 },
  modalContent: { padding: Spacing.md, paddingBottom: 60 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: TextColors.secondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: TextColors.primary, fontSize: 14, marginBottom: 4,
  },
  textArea: { height: 80, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row" },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  pillActive: { backgroundColor: GlowColors.primary + "20", borderColor: GlowColors.primary },
  pillText: { fontSize: 13, color: TextColors.secondary },
  pillTextActive: { color: GlowColors.primary, fontWeight: "600" },
  formatOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    marginBottom: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  formatOptionActive: { backgroundColor: GlowColors.primary + "10", borderColor: GlowColors.primary + "40" },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  radioCircleActive: { borderColor: GlowColors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GlowColors.primary },
  formatLabel: { fontSize: 14, color: TextColors.secondary },
  formatLabelActive: { color: TextColors.primary, fontWeight: "600" },
  categoryInputRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  addCatBtn: {
    width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: GlowColors.primary + "15", borderWidth: 1, borderColor: GlowColors.primary + "30",
  },
  categoryTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  categoryTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: GlowColors.primary + "15", borderWidth: 1, borderColor: GlowColors.primary + "30",
  },
  categoryTagText: { fontSize: 12, color: GlowColors.primary },
  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: GlowColors.primary, borderRadius: 10,
    paddingVertical: 14, marginTop: 20,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Detail
  detailContainer: { flex: 1 },
  detailContent: { padding: Spacing.md, paddingBottom: 60, gap: 12 },
  detailCard: {
    backgroundColor: Backgrounds.card, borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  detailCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  detailSport: { fontSize: 12, color: TextColors.muted, textTransform: "capitalize" },
  detailFormat: { fontSize: 18, fontWeight: "700", color: TextColors.primary, marginBottom: 10 },
  detailMeta: { gap: 6 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: TextColors.primary },
  publishBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: GlowColors.primary + "20", borderWidth: 1, borderColor: GlowColors.primary + "40",
  },
  publishBtnText: { fontSize: 11, fontWeight: "700", color: GlowColors.primary },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 10, paddingVertical: 12,
  },
  actionBtnGreen: { backgroundColor: "#10B981" },
  actionBtnBlue: { backgroundColor: GlowColors.primary },
  actionBtnGray: { backgroundColor: "#374151" },
  actionBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  participantsList: { gap: 6 },
  participantRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  participantNum: { fontSize: 12, fontWeight: "700", color: TextColors.muted, width: 20 },
  participantName: { fontSize: 14, color: TextColors.primary },
  participantCategory: { fontSize: 11, color: TextColors.muted, marginTop: 1 },
  seedBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: GlowColors.primary + "20",
  },
  seedText: { fontSize: 10, color: GlowColors.primary, fontWeight: "600" },
  participantStatus: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  matchCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  matchCardCompleted: { opacity: 0.8 },
  matchRoundBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: GlowColors.primary + "20",
    minWidth: 36, alignItems: "center",
  },
  matchRoundText: { fontSize: 10, fontWeight: "700", color: GlowColors.primary },
  matchPlayers: { flex: 1, gap: 2 },
  matchPlayer: { fontSize: 13, color: TextColors.primary },
  matchWinner: { color: "#10B981", fontWeight: "700" },
  matchLoser: { color: TextColors.muted },
  matchVs: { fontSize: 10, color: TextColors.muted },
  scoreDisplay: { fontSize: 11, color: TextColors.secondary, fontWeight: "600" },
  enterResultBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: GlowColors.primary + "15",
    borderWidth: 1, borderColor: GlowColors.primary + "30",
  },
  enterResultText: { fontSize: 11, fontWeight: "700", color: GlowColors.primary },
  swapPlayerSlot: {
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, borderColor: "transparent",
  },
  swapPlayerSlotSelected: {
    borderColor: Colors.dark.xpCyan, backgroundColor: Colors.dark.xpCyan + "15",
  },
  winnerCard: {
    alignItems: "center", gap: 6, padding: Spacing.lg,
    backgroundColor: "rgba(255,176,32,0.1)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,176,32,0.3)",
  },
  winnerLabel: { fontSize: 12, color: "#FFB020", fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  winnerName: { fontSize: 22, fontWeight: "800", color: TextColors.primary },
  winnerXp: { fontSize: 13, color: "#FFB020", fontWeight: "600" },

  // Result modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: Spacing.lg },
  resultModal: {
    backgroundColor: "#1A1A2E", borderRadius: 16, padding: Spacing.lg, width: "100%",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  resultTitle: { fontSize: 18, fontWeight: "700", color: TextColors.primary, marginBottom: 4 },
  resultRound: { fontSize: 12, color: TextColors.muted, marginBottom: 16 },
  playerOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  playerOptionActive: { backgroundColor: GlowColors.primary + "10", borderColor: GlowColors.primary },
  playerOptionText: { fontSize: 15, color: TextColors.primary },
  resultActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  cancelBtnText: { color: TextColors.secondary, fontWeight: "600" },
  submitBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center",
    backgroundColor: GlowColors.primary,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "700" },
});
