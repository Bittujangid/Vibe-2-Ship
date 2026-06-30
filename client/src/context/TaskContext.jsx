import React, { createContext, useState, useEffect, useContext } from "react";
import { useAuth } from "./AuthContext";
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  onSnapshot 
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../utils/firebase";

const TaskContext = createContext();

// Seed initial mock tasks (Cleared for production integration testing)
const getSeededTasks = () => {
  return [];
};

export function TaskProvider({ children }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firestore synchronization or local storage fallback loading
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isFirebaseConfigured && db) {
      // 1. Fetch real-time updates from Firestore subcollection: users/{uid}/tasks
      const tasksQuery = query(collection(db, "users", user.uid, "tasks"));
      const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const tasksList = [];
        snapshot.forEach((docSnap) => {
          tasksList.push({ id: docSnap.id, ...docSnap.data() });
        });
        setTasks(tasksList);
        setLoading(false);
      }, (error) => {
        console.error("[Firestore Sync Error] Loading tasks failed:", error.message);
        loadLocalStorageFallback();
      });

      return unsubscribe;
    } else {
      // 2. Offline fallback using LocalStorage
      loadLocalStorageFallback();
    }
  }, [user]);

  const loadLocalStorageFallback = () => {
    if (!user) return;
    const storageKey = `chronoguard_tasks_${user.uid}`;
    const savedTasks = localStorage.getItem(storageKey);
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    } else {
      const initialSeed = getSeededTasks();
      localStorage.setItem(storageKey, JSON.stringify(initialSeed));
      setTasks(initialSeed);
    }
    setLoading(false);
  };

  const syncLocalStorage = (updatedTasks) => {
    if (user) {
      const storageKey = `chronoguard_tasks_${user.uid}`;
      localStorage.setItem(storageKey, JSON.stringify(updatedTasks));
    }
    setTasks(updatedTasks);
  };

  // Helper: Retrieve task details
  const getTaskById = (id) => {
    return tasks.find(t => t.id === id);
  };

  // 2. Add Task (Create)
  const addTask = async (taskData) => {
    if (!user) return;

    const newTask = {
      id: taskData.id || `task-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "pending",
      progressPercentage: 0,
      subtasks: [],
      schedule: [],
      replanningHistory: [],
      riskScore: 20, 
      riskLevel: "low",
      healthScore: 80,
      rescueMode: false,
      rescueReason: "",
      ...taskData
    };

    if (isFirebaseConfigured && db) {
      try {
        const taskDocRef = doc(db, "users", user.uid, "tasks", newTask.id);
        await setDoc(taskDocRef, newTask);
        console.log(`[Firestore CRUD] Created task: ${newTask.id}`);
      } catch (err) {
        console.error("[Firestore CRUD Error] Create failed:", err.message);
        // Failover
        syncLocalStorage([newTask, ...tasks]);
      }
    } else {
      syncLocalStorage([newTask, ...tasks]);
    }
  };

  // 3. Update Task (Update)
  const updateTask = async (id, updatedFields) => {
    if (!user) return;

    if (isFirebaseConfigured && db) {
      try {
        const taskDocRef = doc(db, "users", user.uid, "tasks", id);
        await updateDoc(taskDocRef, updatedFields);
        console.log(`[Firestore CRUD] Updated task: ${id}`);
      } catch (err) {
        console.error("[Firestore CRUD Error] Update failed:", err.message);
        // Failover
        const updated = tasks.map(task => {
          if (task.id === id) return { ...task, ...updatedFields };
          return task;
        });
        syncLocalStorage(updated);
      }
    } else {
      const updated = tasks.map(task => {
        if (task.id === id) return { ...task, ...updatedFields };
        return task;
      });
      syncLocalStorage(updated);
    }
  };

  // 4. Delete Task (Delete)
  const deleteTask = async (id) => {
    if (!user) return;

    if (isFirebaseConfigured && db) {
      try {
        const taskDocRef = doc(db, "users", user.uid, "tasks", id);
        await deleteDoc(taskDocRef);
        console.log(`[Firestore CRUD] Deleted task: ${id}`);
      } catch (err) {
        console.error("[Firestore CRUD Error] Delete failed:", err.message);
        // Failover
        const filtered = tasks.filter(task => task.id !== id);
        syncLocalStorage(filtered);
      }
    } else {
      const filtered = tasks.filter(task => task.id !== id);
      syncLocalStorage(filtered);
    }
  };

  const value = {
    tasks,
    loading,
    getTaskById,
    addTask,
    updateTask,
    deleteTask
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  return useContext(TaskContext);
}
