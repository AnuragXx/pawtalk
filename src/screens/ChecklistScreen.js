 import useHideNavBar from "../hooks/useHideNavBar";
import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, TextInput, Modal, Platform, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "../context/AuthContext";
import { taskService } from "../services/firestore";
import { scheduleAlarm, cancelAlarm } from "../services/notifications";
import { useAlarm } from "../context/AlarmContext";

const { width, height } = Dimensions.get("window");
const scaleX = width / 412;
const scaleY = height / 917;

// No static demo data — all data comes from Firestore

const TASK_ICONS = [
  { key: "food",   label: "Feed"    },
  { key: "walk",   label: "Walk"    },
  { key: "litter", label: "Litter"  },
  { key: "vet",    label: "Vet"     },
  { key: "groom",  label: "Groom"   },
  { key: "play",   label: "Play"    },
  { key: "med",    label: "Medicine"},
];

function TaskIcon({ type, color, size = 20 }) {
  const s = size;
  if (type === "food") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === "walk") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={4} r={2} stroke={color} strokeWidth={2}/>
      <Path d="M9 22l1-6 2 3 2-5 2 8M7 12l2-4h6l2 4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === "litter") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={11} width={18} height={10} rx={2} stroke={color} strokeWidth={2}/>
      <Path d="M7 11V7a2 2 0 012-2h6a2 2 0 012 2v4" stroke={color} strokeWidth={2} strokeLinecap="round"/>
      <Path d="M12 15v2M9 15v1M15 15v1" stroke={color} strokeWidth={2} strokeLinecap="round"/>
    </Svg>
  );
  if (type === "vet") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === "groom") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  if (type === "play") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2}/>
      <Path d="M8 12s1.5-2 4-2 4 2 4 2" stroke={color} strokeWidth={2} strokeLinecap="round"/>
      <Path d="M9 9h.01M15 9h.01" stroke={color} strokeWidth={2} strokeLinecap="round"/>
    </Svg>
  );
  if (type === "med") return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

const formatDate = (date) => {
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return "Today · " + timeStr;
  if (isTomorrow) return "Tomorrow · " + timeStr;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + timeStr;
};

export default function ChecklistScreen({ navigation }) {
  useHideNavBar();
  const { user } = useAuth();
  const { triggerAlarm } = useAlarm();
  const [tasks, setTasks] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Task modal
  const [taskModal, setTaskModal] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newTaskIcon, setNewTaskIcon] = useState("food");

  // Edit task modal
  const [editModal, setEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editIcon, setEditIcon] = useState("food");


  const openEdit = (task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditTime(task.time || "");
    setEditIcon(task.icon || "food");
    setEditModal(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim() || !editingTask) return;
    const updates = { title: editTitle.trim(), time: editTime.trim() || "No time set", icon: editIcon };
    if (user) {
      taskService.update(user.uid, editingTask.id, updates).catch(() => {});
    }
    setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...updates } : t));
    setEditModal(false);
    setEditingTask(null);
  };

  // Sync tasks from Firestore — real data only, no fallback to demo
  useEffect(() => {
    if (!user) { setLoadingTasks(false); return; }
    setLoadingTasks(true);
    const unsubTasks = taskService.listen(user.uid, (data) => {
      const unique = data.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
      setTasks(unique);
      setLoadingTasks(false);
    });
    const unsubUpcoming = taskService.listenUpcoming(user.uid, (data) => {
      const unique = data.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
      setUpcoming(unique);
    });
    return () => { unsubTasks(); unsubUpcoming(); };
  }, [user]);

  // Auto-delete expired appointments when screen is focused
  useEffect(() => {
    const checkExpired = () => {
      if (!user) return;
      const now = new Date();
      upcoming.forEach(item => {
        if (item.date && new Date(item.date) < now) {
          taskService.deleteUpcoming(user.uid, item.id).catch(() => {});
          if (item.notificationId) cancelAlarm(item.notificationId).catch(() => {});
        }
      });
    };
    // Check on mount and when upcoming changes
    checkExpired();
    // Also check when app comes to foreground
    const { AppState } = require('react-native');
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkExpired();
    });
    return () => sub.remove();
  }, [user, upcoming]);



  // Upcoming modal
  const [upcomingModal, setUpcomingModal] = useState(false);
  const [newUpcomingTitle, setNewUpcomingTitle] = useState("");
  const [newUpcomingIcon, setNewUpcomingIcon] = useState("vet");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");

  const toggleTask = id => {
    const task = tasks.find(t => t.id === id);
    if (user && task) taskService.toggle(user.uid, id, !task.done).catch(() => {});
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const deleteTask = (id) => {
    Alert.alert("Delete Task", "Remove this task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          if (user) taskService.delete(user.uid, id).catch(() => {});
          setTasks(prev => prev.filter(t => t.id !== id));
        },
      },
    ]);
  };

  const deleteUpcoming = (id) => {
    const item = upcoming.find(u => u.id === id);
    Alert.alert("Delete Appointment", "Remove this appointment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          if (user) taskService.deleteUpcoming(user.uid, id).catch(() => {});
          // Cancel the scheduled notification
          if (item?.notificationId) cancelAlarm(item.notificationId).catch(() => {});
          else cancelAlarm(id).catch(() => {});
          setUpcoming(prev => prev.filter(u => u.id !== id));
        },
      },
    ]);
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const newItem = { title: newTask.trim(), time: newTime.trim() || "No time set", tag: "", icon: newTaskIcon, done: false };
    if (user) {
      await taskService.add(user.uid, newItem).catch(() => {});
    } else {
      setTasks(prev => [...prev, { id: Date.now().toString(), ...newItem }]);
    }
    setNewTask(""); setNewTime(""); setNewTaskIcon("food"); setTaskModal(false);
  };

  const addUpcoming = async () => {
    if (!newUpcomingTitle.trim()) return;
    const newItem = { title: newUpcomingTitle.trim(), date: selectedDate, icon: newUpcomingIcon };
    if (user) {
      const docId = await taskService.addUpcoming(user.uid, newItem).catch(() => null);
      if (docId) {
        const notifId = await scheduleAlarm({
          id: docId,
          title: newUpcomingTitle.trim(),
          body: `🐾 Reminder: ${newUpcomingTitle.trim()}`,
          date: selectedDate,
          onFire: triggerAlarm,
        });
        if (notifId) {
          taskService.updateUpcomingNotifId(user.uid, docId, notifId).catch(() => {});
        }
      }
    } else {
      setUpcoming(prev => [...prev, { id: Date.now().toString(), ...newItem }]);
    }
    setNewUpcomingTitle(""); setNewUpcomingIcon("vet");
    setSelectedDate(new Date()); setUpcomingModal(false);
  };

  const onDateChange = (event, date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
    if (date) {
      const updated = new Date(selectedDate);
      if (pickerMode === "date") {
        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setSelectedDate(updated);
        if (Platform.OS === "android") {
          setPickerMode("time");
          setTimeout(() => setShowTimePicker(true), 100);
        }
      } else {
        updated.setHours(date.getHours(), date.getMinutes());
        setSelectedDate(updated);
      }
    }
  };

  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Daily Care</Text>
            <Text style={styles.headerSub}>Keep your pet healthy & happy</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setTaskModal(true)}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"/>
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressTitle}>Today's Progress</Text>
            <Text style={styles.progressCount}>{done}/{total} tasks</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: total > 0 ? ((done / total) * 100) + "%" : "0%" }]} />
          </View>
          <Text style={styles.progressLabel}>{total > 0 ? Math.round((done / total) * 100) : 0}% complete</Text>
        </View>

        {/* Today's Tasks */}
        <Text style={styles.sectionTitle}>Today's Tasks</Text>
        {loadingTasks ? (
          <ActivityIndicator color="#e64980" style={{ marginVertical: 20 }} />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks yet. Tap + to add one!</Text>
          </View>
        ) : tasks.map((task, i) => (
          <TouchableOpacity key={task.id || `task-${i}`} style={[styles.taskCard, task.done && styles.taskCardDone]} onPress={() => toggleTask(task.id)} onLongPress={() => openEdit(task)} activeOpacity={0.8}>
            <View style={[styles.taskIconBox, { backgroundColor: task.done ? "#e8f5e9" : "#fce4ec" }]}>
              <TaskIcon type={task.icon} color={task.done ? "#2e7d32" : "#e64980"} />
            </View>
            <View style={styles.taskInfo}>
              <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
              <Text style={styles.taskMeta}>{task.time}{task.tag ? " · " + task.tag : ""}</Text>
            </View>
            <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
              {task.done && (
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
                </Svg>
              )}
            </View>
            <TouchableOpacity onPress={() => openEdit(task)} style={styles.editBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#bbb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteTask(task.id)} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        {/* Upcoming */}
        <View style={styles.upcomingHeader}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          <TouchableOpacity style={styles.addUpcomingBtn} onPress={() => setUpcomingModal(true)}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke="#9c27b0" strokeWidth={2.5} strokeLinecap="round"/>
            </Svg>
            <Text style={styles.addUpcomingText}>Add</Text>
          </TouchableOpacity>
        </View>
        {upcoming.map((item, i) => (
          <View key={item.id || `upcoming-${i}`} style={styles.upcomingCard}>
            <View style={styles.upcomingIconBox}>
              <TaskIcon type={item.icon} color="#9c27b0" />
            </View>
            <View style={styles.taskInfo}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.taskMeta}>{formatDate(item.date)}</Text>
            </View>
            <View style={styles.upcomingBadge}>
              <Text style={styles.upcomingBadgeText}>Upcoming</Text>
            </View>
            <TouchableOpacity onPress={() => deleteUpcoming(item.id)} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ccc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
              </Svg>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Edit Task Modal */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Task</Text>
            <TextInput style={styles.modalInput} placeholder="Task name" value={editTitle} onChangeText={setEditTitle} placeholderTextColor="#bbb" />
            <TextInput style={styles.modalInput} placeholder="Time (e.g. 9:00 AM)" value={editTime} onChangeText={setEditTime} placeholderTextColor="#bbb" />
            <Text style={styles.fieldLabel}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {TASK_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic.key}
                  style={[styles.iconChip, editIcon === ic.key && styles.iconChipActive]}
                  onPress={() => setEditIcon(ic.key)}
                >
                  <TaskIcon type={ic.key} color={editIcon === ic.key ? "#fff" : "#e64980"} size={18} />
                  <Text style={[styles.iconChipText, { color: editIcon === ic.key ? "#fff" : "#e64980" }]}>{ic.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={saveEdit}>
                <Text style={styles.modalAddText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Task Modal */}
      <Modal visible={taskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Task</Text>
            <TextInput style={styles.modalInput} placeholder="Task name" value={newTask} onChangeText={setNewTask} placeholderTextColor="#bbb" />
            <TextInput style={styles.modalInput} placeholder="Time (e.g. 9:00 AM)" value={newTime} onChangeText={setNewTime} placeholderTextColor="#bbb" />
            <Text style={styles.fieldLabel}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {TASK_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic.key}
                  style={[styles.iconChip, newTaskIcon === ic.key && styles.iconChipActive]}
                  onPress={() => setNewTaskIcon(ic.key)}
                >
                  <TaskIcon type={ic.key} color={newTaskIcon === ic.key ? "#fff" : "#e64980"} size={18} />
                  <Text style={[styles.iconChipText, { color: newTaskIcon === ic.key ? "#fff" : "#e64980" }]}>{ic.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setTaskModal(false); setNewTask(""); setNewTime(""); setNewTaskIcon("food"); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={addTask}>
                <Text style={styles.modalAddText}>Add Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Upcoming Modal */}
      <Modal visible={upcomingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Appointment</Text>
            <TextInput style={styles.modalInput} placeholder="Title (e.g. Vet Appointment)" value={newUpcomingTitle} onChangeText={setNewUpcomingTitle} placeholderTextColor="#bbb" />

            {/* Icon selector */}
            <Text style={styles.fieldLabel}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {TASK_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic.key}
                  style={[styles.iconChip, newUpcomingIcon === ic.key && styles.iconChipActive]}
                  onPress={() => setNewUpcomingIcon(ic.key)}
                >
                  <TaskIcon type={ic.key} color={newUpcomingIcon === ic.key ? "#fff" : "#9c27b0"} size={18} />
                  <Text style={[styles.iconChipText, newUpcomingIcon === ic.key && { color: "#fff" }]}>{ic.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Date & Time picker */}
            <Text style={styles.fieldLabel}>Date & Time</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setPickerMode("date"); setShowDatePicker(true); }}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                  <Rect x={3} y={4} width={18} height={18} rx={2} stroke="#9c27b0" strokeWidth={2}/>
                  <Path d="M16 2v4M8 2v4M3 10h18" stroke="#9c27b0" strokeWidth={2} strokeLinecap="round"/>
                </Svg>
                <Text style={styles.dateBtnText}>
                  {selectedDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateBtn} onPress={() => { setPickerMode("time"); setShowTimePicker(true); }}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                  <Circle cx={12} cy={12} r={10} stroke="#9c27b0" strokeWidth={2}/>
                  <Path d="M12 6v6l4 2" stroke="#9c27b0" strokeWidth={2} strokeLinecap="round"/>
                </Svg>
                <Text style={styles.dateBtnText}>
                  {selectedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </TouchableOpacity>
            </View>

            {(showDatePicker || showTimePicker) && (
              <DateTimePicker
                value={selectedDate}
                mode={pickerMode}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setUpcomingModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAdd, { backgroundColor: "#9c27b0" }]} onPress={addUpcoming}>
                <Text style={styles.modalAddText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyState: { paddingVertical: 20, alignItems: "center" },
  emptyText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#aaa" },

  container: { flex: 1, backgroundColor: "#fff1f1" },
  scroll: { paddingHorizontal: 18 * scaleX, paddingTop: 20 * scaleY },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 * scaleY },
  headerTitle: { fontFamily: "Poppins-Bold", fontSize: 24 * scaleX, color: "#1a1a1a" },
  headerSub: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#888", marginTop: 2 },
  addBtn: { width: 44 * scaleX, height: 44 * scaleX, borderRadius: 22 * scaleX, backgroundColor: "#e64980", alignItems: "center", justifyContent: "center", shadowColor: "#e64980", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },

  progressCard: { backgroundColor: "#fff", borderRadius: 16, padding: 18 * scaleX, marginBottom: 24 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  progressInfo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressTitle: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },
  progressCount: { fontFamily: "Poppins-Bold", fontSize: 14 * scaleX, color: "#e64980" },
  progressBarBg: { height: 8, backgroundColor: "#fce4ec", borderRadius: 4, marginBottom: 6 },
  progressBarFill: { height: 8, backgroundColor: "#e64980", borderRadius: 4 },
  progressLabel: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888" },

  sectionTitle: { fontFamily: "Poppins-SemiBold", fontSize: 16 * scaleX, color: "#1a1a1a", marginBottom: 12 * scaleY },
  upcomingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 * scaleY },
  addUpcomingBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3e5f5", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  addUpcomingText: { fontFamily: "Poppins-SemiBold", fontSize: 12 * scaleX, color: "#9c27b0", marginLeft: 4 },

  taskCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 * scaleX, marginBottom: 10 * scaleY, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  taskCardDone: { opacity: 0.7 },
  taskIconBox: { width: 42 * scaleX, height: 42 * scaleX, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 12 },
  taskInfo: { flex: 1 },
  taskTitle: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#1a1a1a" },
  taskTitleDone: { textDecorationLine: "line-through", color: "#aaa" },
  taskMeta: { fontFamily: "Poppins-Regular", fontSize: 11 * scaleX, color: "#888", marginTop: 2 },
  checkbox: { width: 26 * scaleX, height: 26 * scaleX, borderRadius: 8, borderWidth: 2, borderColor: "#ddd", alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: "#e64980", borderColor: "#e64980" },

  deleteBtn: { padding: 6, marginLeft: 8 },
  editBtn: { padding: 6, marginLeft: 4 },
  upcomingCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 * scaleX, marginBottom: 10 * scaleY, borderLeftWidth: 3, borderLeftColor: "#9c27b0", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  upcomingIconBox: { width: 42 * scaleX, height: 42 * scaleX, borderRadius: 12, backgroundColor: "#f3e5f5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  upcomingBadge: { backgroundColor: "#f3e5f5", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  upcomingBadgeText: { fontFamily: "Poppins-Regular", fontSize: 10 * scaleX, color: "#9c27b0" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 * scaleX, paddingBottom: 40 },
  modalTitle: { fontFamily: "Poppins-Bold", fontSize: 18 * scaleX, color: "#1a1a1a", marginBottom: 20 },
  modalInput: { borderWidth: 1.5, borderColor: "#f0d0da", borderRadius: 12, padding: 14, fontFamily: "Poppins-Regular", fontSize: 15 * scaleX, color: "#333", marginBottom: 12 },
  fieldLabel: { fontFamily: "Poppins-SemiBold", fontSize: 13 * scaleX, color: "#555", marginBottom: 8 },

  iconChip: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#9c27b0", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  iconChipActive: { backgroundColor: "#9c27b0" },
  iconChipText: { fontFamily: "Poppins-Regular", fontSize: 12 * scaleX, color: "#9c27b0", marginLeft: 5 },

  dateRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  dateBtn: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#e0c8f0", borderRadius: 12, padding: 12, backgroundColor: "#faf5ff" },
  dateBtnText: { fontFamily: "Poppins-Regular", fontSize: 13 * scaleX, color: "#333" },

  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", alignItems: "center" },
  modalCancelText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#888" },
  modalAdd: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#e64980", alignItems: "center" },
  modalAddText: { fontFamily: "Poppins-SemiBold", fontSize: 14 * scaleX, color: "#fff" },
});
