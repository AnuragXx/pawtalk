/**
 * Firestore Service Layer
 * All database operations go through here.
 */
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Pet Profiles ─────────────────────────────────────────────────────────────

export const petService = {
  // Save or update pet profile — always updates if id provided, creates new only if no id
  save: async (userId, petData) => {
    const { id, ...data } = petData;
    if (id) {
      // Update existing pet — never create a duplicate
      const ref = doc(db, 'users', userId, 'pets', id);
      await setDoc(ref, { ...data, id, updatedAt: serverTimestamp() }, { merge: true });
      return id;
    } else {
      // Create new pet
      const ref = doc(collection(db, 'users', userId, 'pets'));
      await setDoc(ref, { ...data, id: ref.id, updatedAt: serverTimestamp() });
      return ref.id;
    }
  },

  // Get all pets for a user
  getAll: async (userId) => {
    const snap = await getDocs(collection(db, 'users', userId, 'pets'));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },

  // Real-time listener for all pets
  listen: (userId, callback) => {
    return onSnapshot(collection(db, 'users', userId, 'pets'), snap => {
      callback(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
  },

  // Delete a pet
  delete: async (userId, petId) => {
    await deleteDoc(doc(db, 'users', userId, 'pets', petId));
  },
};

// ─── Checklist / Tasks ────────────────────────────────────────────────────────

export const taskService = {
  // Add a task
  add: async (userId, task) => {
    const ref = await addDoc(collection(db, 'users', userId, 'tasks'), {
      ...task,
      done: false,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // Get all tasks (real-time listener)
  listen: (userId, callback) => {
    const q = query(
      collection(db, 'users', userId, 'tasks'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  // Toggle done
  toggle: async (userId, taskId, done) => {
    await updateDoc(doc(db, 'users', userId, 'tasks', taskId), { done });
  },

  // Update task fields
  update: async (userId, taskId, updates) => {
    await updateDoc(doc(db, 'users', userId, 'tasks', taskId), updates);
  },

  // Delete task
  delete: async (userId, taskId) => {
    await deleteDoc(doc(db, 'users', userId, 'tasks', taskId));
  },

  // Add upcoming appointment
  addUpcoming: async (userId, appointment) => {
    const ref = await addDoc(collection(db, 'users', userId, 'appointments'), {
      ...appointment,
      date: appointment.date.toISOString(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // Get upcoming appointments (real-time)
  listenUpcoming: (userId, callback) => {
    const q = query(
      collection(db, 'users', userId, 'appointments'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        date: new Date(d.data().date),
      })));
    });
  },

  // Delete upcoming appointment
  deleteUpcoming: async (userId, appointmentId) => {
    await deleteDoc(doc(db, 'users', userId, 'appointments', appointmentId));
  },

  // Store notification ID on an appointment (for cancellation)
  updateUpcomingNotifId: async (userId, appointmentId, notificationId) => {
    await updateDoc(doc(db, 'users', userId, 'appointments', appointmentId), { notificationId });
  },
};

// ─── Sound Analysis History ───────────────────────────────────────────────────

export const soundService = {
  // Save analysis result — includes behavior detection fields
  save: async (userId, result) => {
    await addDoc(collection(db, 'users', userId, 'soundHistory'), {
      species:             result.species,
      confidence:          result.confidence,
      isMock:              result.isMock || false,
      // Behavior detection
      behavior:            result.behavior || null,
      behaviorDescription: result.behaviorDescription || null,
      behaviorEmoji:       result.behaviorEmoji || null,
      behaviorColor:       result.behaviorColor || null,
      behaviorConfidence:  result.behaviorConfidence || 0,
      createdAt:           serverTimestamp(),
    });
  },

  // Real-time listener for recent history (max 2)
  listenRecent: (userId, callback, limit = 2) => {
    const q = query(
      collection(db, 'users', userId, 'soundHistory'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, snap => {
      callback(snap.docs.slice(0, limit).map(d => ({ id: d.id, ...d.data() })));
    });
  },

  // Get recent history (one-time)
  getRecent: async (userId, limit = 10) => {
    const q = query(
      collection(db, 'users', userId, 'soundHistory'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.slice(0, limit).map(d => ({ id: d.id, ...d.data() }));
  },

  // Delete a single history entry
  delete: async (userId, entryId) => {
    await deleteDoc(doc(db, 'users', userId, 'soundHistory', entryId));
  },

  // Delete all history entries
  deleteAll: async (userId) => {
    const snap = await getDocs(collection(db, 'users', userId, 'soundHistory'));
    const batch = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(batch);
  },
};

// ─── User Profile ─────────────────────────────────────────────────────────────

export const userService = {
  update: async (userId, data) => {
    await setDoc(doc(db, 'users', userId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  },

  get: async (userId) => {
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
};
