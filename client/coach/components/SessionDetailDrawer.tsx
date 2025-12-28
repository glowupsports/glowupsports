import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Player {
  id: string;
  name: string;
  level?: string;
  status?: string;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  players?: Player[];
}

interface Court {
  id: string;
  name: string;
}

interface AvailablePlayer {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface SessionDetailDrawerProps {
  visible: boolean;
  session: Session | null;
  courts: Court[];
  onClose: () => void;
  onAttendance: () => void;
  onFeedback?: () => void;
}

type StartDateOption = "today" | "previous" | "custom";

export default function SessionDetailDrawer({
  visible,
  session,
  courts,
  onClose,
  onAttendance,
  onFeedback,
}: SessionDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<AvailablePlayer | null>(null);
  const [startDateOption, setStartDateOption] = useState<StartDateOption>("today");
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCatchUp, setShowCatchUp] = useState(false);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [catchUpAttendance, setCatchUpAttendance] = useState<Map<string, "present" | "absent" | "holiday">>(new Map());
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [showGuestConvert, setShowGuestConvert] = useState<{id: string; name: string} | null>(null);
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestAge, setGuestAge] = useState("");
  const [guestBallLevel, setGuestBallLevel] = useState<string>("");
  const [conversionErrors, setConversionErrors] = useState<{email?: string; age?: string}>({});

  const { data: allPlayersData } = useQuery<AvailablePlayer[]>({
    queryKey: ["/api/players"],
    enabled: visible && showAddPlayer,
  });
  const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : [];

  const existingPlayerIds = session?.players?.map(p => p.id) || [];
  const availablePlayers = allPlayers.filter(p => !existingPlayerIds.includes(p.id));

  const addPlayerMutation = useMutation({
    mutationFn: async ({ playerId }: { playerId: string }) => {
      return apiRequest("POST", `/api/coach/sessions/${session?.id}/players`, { 
        playerId,
        isGuest: false,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowAddPlayer(false);
      setSelectedPlayer(null);
      setStartDateOption("today");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add player");
    },
  });

  const saveCatchUpMutation = useMutation({
    mutationFn: async (records: { sessionId: string; playerId: string; status: string }[]) => {
      const promises = records.map(record => 
        apiRequest("POST", `/api/coach/sessions/${record.sessionId}/attendance`, {
          playerId: record.playerId,
          status: record.status,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      setShowCatchUp(false);
      setCatchUpAttendance(new Map());
      setPastSessions([]);
      setShowAddPlayer(false);
      setSelectedPlayer(null);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save attendance");
    },
  });

  const addGuestMutation = useMutation({
    mutationFn: async (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Guest name is required");
      }
      if (!session?.id) {
        throw new Error("No session selected");
      }
      const createRes = await apiRequest("POST", "/api/players", {
        name: `${trimmedName} (Guest)`,
        membershipType: "guest",
      });
      const guest = await createRes.json();
      await apiRequest("POST", `/api/coach/sessions/${session.id}/players`, {
        playerId: guest.id,
        isGuest: true,
      });
      return guest;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setGuestName("");
      setShowGuestInput(false);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add guest");
    },
  });

  const convertGuestMutation = useMutation({
    mutationFn: async ({ playerId, phone, email, age, ballLevel }: { playerId: string; phone: string | null; email: string | null; age: number | null; ballLevel: string | null }) => {
      const cleanName = showGuestConvert?.name.replace(" (Guest)", "") || "";
      return apiRequest("PATCH", `/api/players/${playerId}`, {
        name: cleanName,
        phone,
        email,
        age,
        ballLevel,
        membershipType: "regular",
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowGuestConvert(null);
      setGuestPhone("");
      setGuestEmail("");
      setGuestAge("");
      setGuestBallLevel("");
      setConversionErrors({});
      Alert.alert("Success", "Guest converted to player");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to convert guest");
    },
  });

  const validateConversionFields = (): boolean => {
    const errors: {email?: string; age?: string} = {};
    
    // Validate email format if provided
    const emailTrimmed = guestEmail.trim();
    if (emailTrimmed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        errors.email = "Invalid email format";
      }
    }
    
    // Validate age if provided
    const ageTrimmed = guestAge.trim();
    if (ageTrimmed) {
      const ageNum = parseInt(ageTrimmed, 10);
      if (isNaN(ageNum)) {
        errors.age = "Age must be a number";
      } else if (ageNum < 0) {
        errors.age = "Age must be positive";
      } else if (ageNum > 120) {
        errors.age = "Age must be realistic";
      }
    }
    
    setConversionErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleConvertGuest = () => {
    if (!showGuestConvert) return;
    if (!validateConversionFields()) return;
    
    const ageTrimmed = guestAge.trim();
    const ageNum = ageTrimmed ? parseInt(ageTrimmed, 10) : null;
    const emailTrimmed = guestEmail.trim();
    
    convertGuestMutation.mutate({
      playerId: showGuestConvert.id,
      phone: guestPhone.trim() || null,
      email: emailTrimmed || null,
      age: ageNum !== null && !isNaN(ageNum) ? ageNum : null,
      ballLevel: guestBallLevel || null,
    });
  };

  const handleAddGuest = () => {
    if (!guestName.trim()) return;
    addGuestMutation.mutate(guestName.trim());
  };

  if (!visible || !session) return null;

  const court = courts.find(c => c.id === session.courtId);
  const sessionDate = new Date(session.startTime);
  const sessionType = session.sessionType === "private" ? "Private" :
                      session.sessionType === "semi_private" ? "Semi-Private" :
                      session.sessionType === "group" ? "Group" :
                      session.sessionType === "physical" ? "Physical" : session.sessionType;

  const getStartDate = (): Date => {
    if (startDateOption === "today") return new Date();
    if (startDateOption === "previous") {
      const prev = new Date(session.startTime);
      prev.setDate(prev.getDate() - 7);
      return prev;
    }
    return customDate;
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayer) return;
    
    const startDate = getStartDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    
    if (startDate < today) {
      const weeksDiff = Math.ceil((today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      
      Alert.alert(
        "Past Sessions Found",
        `This player has ${weeksDiff} past session${weeksDiff > 1 ? 's' : ''} since ${startDate.toLocaleDateString()}. Do you want to review attendance now?`,
        [
          { 
            text: "Skip", 
            style: "cancel",
            onPress: () => addPlayerMutation.mutate({ playerId: selectedPlayer.id }),
          },
          { 
            text: "Review Attendance",
            onPress: () => {
              const sessions: Session[] = [];
              let date = new Date(startDate);
              const sessionDay = new Date(session.startTime).getDay();
              
              while (date <= today) {
                if (date.getDay() === sessionDay && date < today) {
                  sessions.push({
                    ...session,
                    id: `${session.id}-${date.toISOString()}`,
                    startTime: new Date(date.setHours(new Date(session.startTime).getHours(), new Date(session.startTime).getMinutes())).toISOString(),
                    endTime: new Date(date.setHours(new Date(session.endTime).getHours(), new Date(session.endTime).getMinutes())).toISOString(),
                  });
                }
                date.setDate(date.getDate() + 1);
              }
              
              setPastSessions(sessions);
              const initial = new Map<string, "present" | "absent" | "holiday">();
              sessions.forEach(s => initial.set(s.id, "present"));
              setCatchUpAttendance(initial);
              setShowCatchUp(true);
            },
          },
        ]
      );
    } else {
      addPlayerMutation.mutate({ playerId: selectedPlayer.id });
    }
  };

  const handleSaveCatchUp = async () => {
    if (!selectedPlayer) return;
    
    const records = pastSessions.map(s => ({
      sessionId: session.id,
      playerId: selectedPlayer.id,
      status: catchUpAttendance.get(s.id) || "present",
    }));
    
    addPlayerMutation.mutate({ playerId: selectedPlayer.id }, {
      onSuccess: () => {
        if (records.length > 0) {
          saveCatchUpMutation.mutate(records);
        }
      },
    });
  };

  const getCalendarDays = () => {
    const year = customDate.getFullYear();
    const month = customDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    
    const startPadding = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    
    return days;
  };

  const renderMainContent = () => (
    <>
      <View style={styles.sessionInfo}>
        <View style={styles.sessionHeader}>
          <View style={[styles.typeBadge, { backgroundColor: getTypeColor(session.sessionType) }]}>
            <Text style={styles.typeBadgeText}>{sessionType}</Text>
          </View>
          <Text style={styles.sessionTime}>
            {new Date(session.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
            {" - "}
            {new Date(session.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </Text>
        </View>
        
        <Text style={styles.sessionDate}>
          {sessionDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
        
        {court && (
          <View style={styles.courtRow}>
            <Ionicons name="location-outline" size={16} color={Colors.dark.disabled} />
            <Text style={styles.courtName}>{court.name}</Text>
          </View>
        )}
      </View>

      <View style={styles.playersSection}>
        <Text style={styles.sectionTitle}>Players ({session.players?.length || 0})</Text>
        {session.players && session.players.length > 0 ? (
          <View style={styles.playersList}>
            {session.players.map(player => {
              const isGuest = player.name.includes("(Guest)");
              const isPastSession = new Date(session.endTime) < new Date();
              return (
                <Pressable 
                  key={player.id} 
                  style={[styles.playerRow, isGuest && styles.playerRowGuest]}
                  onPress={() => {
                    if (isGuest && isPastSession) {
                      setShowGuestConvert({ id: player.id, name: player.name });
                      setGuestPhone("");
                      setGuestBallLevel("");
                    }
                  }}
                  disabled={!isGuest || !isPastSession}
                >
                  <View style={[styles.playerAvatar, isGuest && styles.playerAvatarGuest]}>
                    <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.playerNameContainer}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {isGuest && isPastSession ? (
                      <Text style={styles.convertHint}>Tap to convert</Text>
                    ) : null}
                  </View>
                  {player.status ? (
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(player.status) }]} />
                  ) : null}
                  {isGuest && isPastSession ? (
                    <Ionicons name="chevron-forward" size={16} color={Colors.dark.xpCyan} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noPlayersText}>No players assigned yet</Text>
        )}
      </View>

      {/* Guest Conversion Form */}
      {showGuestConvert ? (
        <View style={styles.guestConvertSection}>
          <View style={styles.guestConvertHeader}>
            <Text style={styles.guestConvertTitle}>Convert Guest to Player</Text>
            <Pressable onPress={() => { setShowGuestConvert(null); setConversionErrors({}); }}>
              <Ionicons name="close" size={20} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>
          <Text style={styles.guestConvertName}>{showGuestConvert.name.replace(" (Guest)", "")}</Text>
          
          <TextInput
            style={styles.guestConvertInput}
            placeholder="Phone number (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestPhone}
            onChangeText={setGuestPhone}
            keyboardType="phone-pad"
          />
          
          <TextInput
            style={[styles.guestConvertInput, conversionErrors.email && styles.guestConvertInputError]}
            placeholder="Email (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestEmail}
            onChangeText={(text) => { setGuestEmail(text); if (conversionErrors.email) setConversionErrors(prev => ({ ...prev, email: undefined })); }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {conversionErrors.email ? <Text style={styles.conversionErrorText}>{conversionErrors.email}</Text> : null}
          
          <TextInput
            style={[styles.guestConvertInput, conversionErrors.age && styles.guestConvertInputError]}
            placeholder="Age (optional)"
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestAge}
            onChangeText={(text) => { setGuestAge(text); if (conversionErrors.age) setConversionErrors(prev => ({ ...prev, age: undefined })); }}
            keyboardType="number-pad"
          />
          {conversionErrors.age ? <Text style={styles.conversionErrorText}>{conversionErrors.age}</Text> : null}
          
          <Text style={styles.guestConvertLabel}>Ball Level</Text>
          <View style={styles.ballLevelRow}>
            {["red", "orange", "green", "yellow"].map(level => (
              <Pressable
                key={level}
                style={[
                  styles.ballLevelOption,
                  guestBallLevel === level && styles.ballLevelSelected,
                ]}
                onPress={() => setGuestBallLevel(level)}
              >
                <Text style={[
                  styles.ballLevelText,
                  guestBallLevel === level && styles.ballLevelTextSelected,
                ]}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          
          <Pressable
            style={[styles.convertBtn, convertGuestMutation.isPending && styles.convertBtnDisabled]}
            onPress={handleConvertGuest}
            disabled={convertGuestMutation.isPending}
          >
            {convertGuestMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <Text style={styles.convertBtnText}>Convert to Player</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {showGuestInput && (
        <View style={styles.guestInputRow}>
          <TextInput
            style={styles.guestInput}
            placeholder="Guest name..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={guestName}
            onChangeText={setGuestName}
            onSubmitEditing={handleAddGuest}
            returnKeyType="done"
            autoFocus
          />
          <Pressable
            onPress={handleAddGuest}
            disabled={!guestName.trim() || addGuestMutation.isPending}
            style={[
              styles.guestAddBtn,
              (!guestName.trim() || addGuestMutation.isPending) && styles.guestAddBtnDisabled,
            ]}
          >
            {addGuestMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <Ionicons name="add" size={20} color={Colors.dark.backgroundRoot} />
            )}
          </Pressable>
          <Pressable
            onPress={() => { setShowGuestInput(false); setGuestName(""); }}
            style={styles.guestCancelBtn}
          >
            <Ionicons name="close" size={20} color={Colors.dark.tabIconDefault} />
          </Pressable>
        </View>
      )}

      <View style={styles.actionsSection}>
        <Pressable style={styles.actionButton} onPress={() => setShowAddPlayer(true)}>
          <Ionicons name="person-add-outline" size={20} color={Colors.dark.primary} />
          <Text style={styles.actionButtonText}>Add Player</Text>
        </Pressable>

        <Pressable 
          style={styles.actionButton} 
          onPress={() => setShowGuestInput(true)}
        >
          <Ionicons name="person-add-outline" size={20} color={Colors.dark.xpCyan} />
          <Text style={[styles.actionButtonText, { color: Colors.dark.xpCyan }]}>Add Guest</Text>
        </Pressable>
        
        <Pressable style={styles.actionButton} onPress={onAttendance}>
          <Ionicons name="checkmark-circle-outline" size={20} color={Colors.dark.orange} />
          <Text style={[styles.actionButtonText, { color: Colors.dark.orange }]}>Attendance</Text>
        </Pressable>
        
        {onFeedback && (
          <Pressable style={styles.actionButton} onPress={onFeedback}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.gold} />
            <Text style={[styles.actionButtonText, { color: Colors.dark.gold }]}>Feedback</Text>
          </Pressable>
        )}
      </View>
    </>
  );

  const renderAddPlayerContent = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => { setShowAddPlayer(false); setSelectedPlayer(null); }}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Add Player</Text>
        <View style={{ width: 24 }} />
      </View>

      {!selectedPlayer ? (
        <>
          <Text style={styles.stepLabel}>Select Player</Text>
          <ScrollView style={styles.playerSelectList}>
            {availablePlayers.map(player => (
              <Pressable
                key={player.id}
                style={styles.playerSelectItem}
                onPress={() => setSelectedPlayer(player)}
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                </View>
                <View style={styles.playerSelectInfo}>
                  <Text style={styles.playerSelectName}>{player.name}</Text>
                  {player.ballLevel && (
                    <Text style={styles.playerSelectLevel}>{player.ballLevel} ball</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.disabled} />
              </Pressable>
            ))}
            {availablePlayers.length === 0 && (
              <Text style={styles.noPlayersText}>All players are already in this session</Text>
            )}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.selectedPlayerCard}>
            <View style={styles.playerAvatar}>
              <Text style={styles.playerAvatarText}>{selectedPlayer.name.charAt(0)}</Text>
            </View>
            <Text style={styles.selectedPlayerName}>{selectedPlayer.name}</Text>
          </View>

          <Text style={styles.stepLabel}>Start Date</Text>
          <View style={styles.dateOptions}>
            <Pressable
              style={[styles.dateOption, startDateOption === "today" && styles.dateOptionActive]}
              onPress={() => setStartDateOption("today")}
            >
              <View style={[styles.radioOuter, startDateOption === "today" && styles.radioOuterActive]}>
                {startDateOption === "today" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>Today</Text>
            </Pressable>
            
            <Pressable
              style={[styles.dateOption, startDateOption === "previous" && styles.dateOptionActive]}
              onPress={() => setStartDateOption("previous")}
            >
              <View style={[styles.radioOuter, startDateOption === "previous" && styles.radioOuterActive]}>
                {startDateOption === "previous" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>Previous Week</Text>
            </Pressable>
            
            <Pressable
              style={[styles.dateOption, startDateOption === "custom" && styles.dateOptionActive]}
              onPress={() => { setStartDateOption("custom"); setShowCalendar(true); }}
            >
              <View style={[styles.radioOuter, startDateOption === "custom" && styles.radioOuterActive]}>
                {startDateOption === "custom" && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.dateOptionText}>
                Custom: {customDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
            </Pressable>
          </View>

          {showCalendar && startDateOption === "custom" && (
            <View style={styles.calendarContainer}>
              <View style={styles.calendarHeader}>
                <Pressable onPress={() => setCustomDate(new Date(customDate.setMonth(customDate.getMonth() - 1)))}>
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.calendarMonth}>
                  {customDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>
                <Pressable onPress={() => setCustomDate(new Date(customDate.setMonth(customDate.getMonth() + 1)))}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
                </Pressable>
              </View>
              <View style={styles.calendarWeekDays}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <Text key={i} style={styles.calendarWeekDay}>{d}</Text>
                ))}
              </View>
              <View style={styles.calendarDays}>
                {getCalendarDays().map((day, i) => {
                  if (!day) return <View key={i} style={styles.calendarDayEmpty} />;
                  const isSelected = day.toDateString() === customDate.toDateString();
                  const isFuture = day > new Date();
                  return (
                    <Pressable
                      key={i}
                      style={[styles.calendarDay, isSelected && styles.calendarDaySelected, isFuture && styles.calendarDayDisabled]}
                      onPress={() => !isFuture && setCustomDate(day)}
                      disabled={isFuture}
                    >
                      <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isFuture && styles.calendarDayTextDisabled]}>
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <Pressable
            style={[styles.confirmButton, addPlayerMutation.isPending && styles.confirmButtonDisabled]}
            onPress={handleAddPlayer}
            disabled={addPlayerMutation.isPending}
          >
            <Text style={styles.confirmButtonText}>
              {addPlayerMutation.isPending ? "Adding..." : "Add to Session"}
            </Text>
          </Pressable>
        </>
      )}
    </>
  );

  const renderCatchUpContent = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={() => setShowCatchUp(false)}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Attendance Catch-Up</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.catchUpInfo}>
        <Text style={styles.catchUpPlayerName}>{selectedPlayer?.name}</Text>
        <Text style={styles.catchUpSubtitle}>
          Review {pastSessions.length} past session{pastSessions.length > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.bulkActions}>
        <Pressable
          style={styles.bulkButton}
          onPress={() => {
            const updated = new Map(catchUpAttendance);
            pastSessions.forEach(s => updated.set(s.id, "present"));
            setCatchUpAttendance(updated);
          }}
        >
          <Text style={styles.bulkButtonText}>Mark All Present</Text>
        </Pressable>
        <Pressable
          style={[styles.bulkButton, styles.bulkButtonSecondary]}
          onPress={() => {
            const updated = new Map(catchUpAttendance);
            pastSessions.forEach(s => updated.set(s.id, "absent"));
            setCatchUpAttendance(updated);
          }}
        >
          <Text style={[styles.bulkButtonText, styles.bulkButtonTextSecondary]}>Mark All Absent</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.catchUpList}>
        {pastSessions.map(s => {
          const date = new Date(s.startTime);
          const status = catchUpAttendance.get(s.id) || "present";
          return (
            <View key={s.id} style={styles.catchUpRow}>
              <View style={styles.catchUpDate}>
                <Text style={styles.catchUpDateDay}>
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </Text>
                <Text style={styles.catchUpDateNum}>
                  {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
              <View style={styles.catchUpOptions}>
                {(["present", "absent", "holiday"] as const).map(opt => (
                  <Pressable
                    key={opt}
                    style={[styles.catchUpOption, status === opt && styles.catchUpOptionActive]}
                    onPress={() => {
                      const updated = new Map(catchUpAttendance);
                      updated.set(s.id, opt);
                      setCatchUpAttendance(updated);
                    }}
                  >
                    <View style={[styles.radioSmall, status === opt && styles.radioSmallActive]} />
                    <Text style={[styles.catchUpOptionText, status === opt && styles.catchUpOptionTextActive]}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Pressable
        style={[styles.confirmButton, saveCatchUpMutation.isPending && styles.confirmButtonDisabled]}
        onPress={handleSaveCatchUp}
        disabled={saveCatchUpMutation.isPending}
      >
        <Text style={styles.confirmButtonText}>
          {saveCatchUpMutation.isPending ? "Saving..." : "Save & Add Player"}
        </Text>
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom + Spacing.md }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Session Details</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {showCatchUp ? renderCatchUpContent() : 
           showAddPlayer ? renderAddPlayerContent() : 
           renderMainContent()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const getTypeColor = (type: string) => {
  switch (type) {
    case "private": return Colors.dark.primary;
    case "semi_private": return Colors.dark.xpCyan;
    case "group": return Colors.dark.orange;
    case "physical": return Colors.dark.gold;
    default: return Colors.dark.disabled;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "present": return Colors.dark.primary;
    case "late": return Colors.dark.gold;
    case "absent": return Colors.dark.error;
    default: return Colors.dark.disabled;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  sessionInfo: {
    marginBottom: Spacing.xl,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  sessionTime: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  sessionDate: {
    ...Typography.body,
    color: Colors.dark.disabled,
    marginBottom: Spacing.sm,
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  courtName: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  playersSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  playersList: {
    gap: Spacing.sm,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noPlayersText: {
    ...Typography.body,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  playerRowGuest: {
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    borderStyle: "dashed",
  },
  playerAvatarGuest: {
    backgroundColor: Colors.dark.xpCyan,
  },
  playerNameContainer: {
    flex: 1,
  },
  convertHint: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontSize: 10,
  },
  guestConvertSection: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  guestConvertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  guestConvertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  guestConvertName: {
    ...Typography.h3,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
  },
  guestConvertInput: {
    height: 44,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    ...Typography.body,
    borderWidth: 1,
    borderColor: "transparent",
  },
  guestConvertInputError: {
    borderColor: Colors.dark.error,
    marginBottom: Spacing.xs,
  },
  conversionErrorText: {
    ...Typography.small,
    color: Colors.dark.error,
    marginBottom: Spacing.sm,
  },
  guestConvertLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ballLevelRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  ballLevelOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  ballLevelSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  ballLevelText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  ballLevelTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  convertBtn: {
    backgroundColor: Colors.dark.xpCyan,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  convertBtnDisabled: {
    opacity: 0.5,
  },
  convertBtnText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  guestInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  guestInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  guestAddBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  guestAddBtnDisabled: {
    opacity: 0.5,
  },
  guestCancelBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  actionsSection: {
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  actionButtonText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  stepTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  stepLabel: {
    ...Typography.small,
    color: Colors.dark.disabled,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  playerSelectList: {
    flex: 1,
  },
  playerSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  playerSelectInfo: {
    flex: 1,
  },
  playerSelectName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playerSelectLevel: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  selectedPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    marginBottom: Spacing.xl,
  },
  selectedPlayerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dateOptions: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  dateOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  dateOptionActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  dateOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.dark.disabled,
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterActive: {
    borderColor: Colors.dark.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  calendarContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  calendarMonth: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarWeekDays: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  calendarWeekDay: {
    ...Typography.small,
    color: Colors.dark.disabled,
    width: "14.28%",
    textAlign: "center",
  },
  calendarDays: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.full,
  },
  calendarDayEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: Colors.dark.primary,
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDayText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  calendarDayTextSelected: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  calendarDayTextDisabled: {
    color: Colors.dark.disabled,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  catchUpInfo: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  catchUpPlayerName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  catchUpSubtitle: {
    ...Typography.body,
    color: Colors.dark.disabled,
  },
  bulkActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bulkButton: {
    flex: 1,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  bulkButtonSecondary: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
  },
  bulkButtonText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  bulkButtonTextSecondary: {
    color: Colors.dark.text,
  },
  catchUpList: {
    flex: 1,
  },
  catchUpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  catchUpDate: {
    width: 60,
  },
  catchUpDateDay: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  catchUpDateNum: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  catchUpOptions: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  catchUpOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  catchUpOptionActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  radioSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.dark.disabled,
  },
  radioSmallActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary,
  },
  catchUpOptionText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  catchUpOptionTextActive: {
    color: Colors.dark.text,
  },
});
