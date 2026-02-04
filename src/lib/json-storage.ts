import fs from "fs/promises";
import path from "path";

// Get data directory path (relative to project root)
const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Generic JSON file operations
export async function readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    // If file doesn't exist, create it with default value
    await writeJsonFile(filename, defaultValue);
    return defaultValue;
  }
}

export async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ==================== Dashboard Layout Storage ====================

export interface DashboardLayoutData {
  id: number;
  user_id: string;
  layout_name: string;
  layout_data: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DashboardLayoutStore {
  nextId: number;
  layouts: DashboardLayoutData[];
}

const DASHBOARD_FILE = "dashboard_layout.json";

const defaultDashboardStore: DashboardLayoutStore = {
  nextId: 1,
  layouts: [],
};

export async function getDashboardLayouts(): Promise<DashboardLayoutStore> {
  return readJsonFile(DASHBOARD_FILE, defaultDashboardStore);
}

export async function saveDashboardLayouts(store: DashboardLayoutStore): Promise<void> {
  return writeJsonFile(DASHBOARD_FILE, store);
}

// Get all layouts for a user
export async function getLayoutsByUserId(userId: string): Promise<DashboardLayoutData[]> {
  const store = await getDashboardLayouts();
  return store.layouts
    .filter((l) => l.user_id === userId)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

// Get specific layout by ID
export async function getLayoutById(layoutId: number, userId: string): Promise<DashboardLayoutData | null> {
  const store = await getDashboardLayouts();
  return store.layouts.find((l) => l.id === layoutId && l.user_id === userId) || null;
}

// Get active layout for user
export async function getActiveLayout(userId: string): Promise<DashboardLayoutData | null> {
  const store = await getDashboardLayouts();
  return store.layouts.find((l) => l.user_id === userId && l.is_active) || null;
}

// Create new layout
export async function createLayout(
  userId: string,
  layoutName: string,
  layoutData: unknown,
  setActive: boolean = true,
): Promise<DashboardLayoutData> {
  const store = await getDashboardLayouts();
  const now = new Date().toISOString();

  // If setting as active, deactivate others
  if (setActive) {
    store.layouts.forEach((l) => {
      if (l.user_id === userId) {
        l.is_active = false;
      }
    });
  }

  const newLayout: DashboardLayoutData = {
    id: store.nextId++,
    user_id: userId,
    layout_name: layoutName,
    layout_data: layoutData,
    is_active: setActive,
    created_at: now,
    updated_at: now,
  };

  store.layouts.push(newLayout);
  await saveDashboardLayouts(store);

  return newLayout;
}

// Update existing layout
export async function updateLayout(
  layoutId: number,
  userId: string,
  updates: {
    layout_name?: string;
    layout_data?: unknown;
    is_active?: boolean;
  },
): Promise<DashboardLayoutData | null> {
  const store = await getDashboardLayouts();
  const layoutIndex = store.layouts.findIndex((l) => l.id === layoutId && l.user_id === userId);

  if (layoutIndex === -1) return null;

  // If setting as active, deactivate others first
  if (updates.is_active) {
    store.layouts.forEach((l) => {
      if (l.user_id === userId) {
        l.is_active = false;
      }
    });
  }

  const layout = store.layouts[layoutIndex];

  if (updates.layout_name !== undefined) {
    layout.layout_name = updates.layout_name;
  }
  if (updates.layout_data !== undefined) {
    layout.layout_data = updates.layout_data;
  }
  if (updates.is_active !== undefined) {
    layout.is_active = updates.is_active;
  }
  layout.updated_at = new Date().toISOString();

  await saveDashboardLayouts(store);
  return layout;
}

// Update or create layout by name (upsert)
export async function upsertLayoutByName(
  userId: string,
  layoutName: string,
  layoutData: unknown,
  setActive: boolean = true,
): Promise<{ layout: DashboardLayoutData; isNew: boolean }> {
  const store = await getDashboardLayouts();
  const existingIndex = store.layouts.findIndex((l) => l.user_id === userId && l.layout_name === layoutName);

  if (existingIndex !== -1) {
    // Update existing
    if (setActive) {
      store.layouts.forEach((l) => {
        if (l.user_id === userId) {
          l.is_active = false;
        }
      });
    }

    store.layouts[existingIndex].layout_data = layoutData;
    store.layouts[existingIndex].is_active = setActive;
    store.layouts[existingIndex].updated_at = new Date().toISOString();

    await saveDashboardLayouts(store);
    return { layout: store.layouts[existingIndex], isNew: false };
  } else {
    // Create new
    const newLayout = await createLayout(userId, layoutName, layoutData, setActive);
    return { layout: newLayout, isNew: true };
  }
}

// Delete layout
export async function deleteLayout(layoutId: number): Promise<boolean> {
  const store = await getDashboardLayouts();
  const initialLength = store.layouts.length;
  store.layouts = store.layouts.filter((l) => l.id !== layoutId);

  if (store.layouts.length !== initialLength) {
    await saveDashboardLayouts(store);
    return true;
  }
  return false;
}

// ==================== Server Location Storage ====================

export interface ServerLocationData {
  id: number;
  server_name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

interface ServerLocationStore {
  nextId: number;
  locations: ServerLocationData[];
}

const SERVER_LOCATION_FILE = "server_location.json";

const defaultServerLocationStore: ServerLocationStore = {
  nextId: 1,
  locations: [],
};

export async function getServerLocationStore(): Promise<ServerLocationStore> {
  return readJsonFile(SERVER_LOCATION_FILE, defaultServerLocationStore);
}

export async function saveServerLocationStore(store: ServerLocationStore): Promise<void> {
  return writeJsonFile(SERVER_LOCATION_FILE, store);
}

// Get all server locations
export async function getAllServerLocations(): Promise<ServerLocationData[]> {
  const store = await getServerLocationStore();
  return store.locations.sort((a, b) => a.server_name.localeCompare(b.server_name));
}

// Get server location by name
export async function getServerLocationByName(serverName: string): Promise<ServerLocationData | null> {
  const store = await getServerLocationStore();
  return store.locations.find((l) => l.server_name === serverName) || null;
}

// Create or update server location (upsert)
export async function upsertServerLocation(
  serverName: string,
  latitude: number | null,
  longitude: number | null,
): Promise<{ location: ServerLocationData; isNew: boolean }> {
  const store = await getServerLocationStore();
  const existingIndex = store.locations.findIndex((l) => l.server_name === serverName);
  const now = new Date().toISOString();

  if (existingIndex !== -1) {
    // Update existing
    store.locations[existingIndex].latitude = latitude;
    store.locations[existingIndex].longitude = longitude;
    store.locations[existingIndex].updated_at = now;

    await saveServerLocationStore(store);
    return { location: store.locations[existingIndex], isNew: false };
  } else {
    // Create new
    const newLocation: ServerLocationData = {
      id: store.nextId++,
      server_name: serverName,
      latitude,
      longitude,
      created_at: now,
      updated_at: now,
    };

    store.locations.push(newLocation);
    await saveServerLocationStore(store);
    return { location: newLocation, isNew: true };
  }
}

// Delete server location
export async function deleteServerLocation(serverName: string): Promise<boolean> {
  const store = await getServerLocationStore();
  const initialLength = store.locations.length;
  store.locations = store.locations.filter((l) => l.server_name !== serverName);

  if (store.locations.length !== initialLength) {
    await saveServerLocationStore(store);
    return true;
  }
  return false;
}

// ==================== User Storage ====================

export type UserRole = "admin" | "operator" | "viewer";

export interface UserData {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface UserPublicData {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

interface UserStore {
  nextId: number;
  users: UserData[];
}

const USERS_FILE = "users.json";

const defaultUserStore: UserStore = {
  nextId: 1,
  users: [],
};

export async function getUserStore(): Promise<UserStore> {
  return readJsonFile(USERS_FILE, defaultUserStore);
}

export async function saveUserStore(store: UserStore): Promise<void> {
  return writeJsonFile(USERS_FILE, store);
}

// Convert UserData to UserPublicData (safe for client)
export function toUserPublic(user: UserData): UserPublicData {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

// Get all users
export async function getAllUsers(): Promise<UserData[]> {
  const store = await getUserStore();
  return store.users;
}

// Find user by ID
export async function findUserById(id: number): Promise<UserData | null> {
  const store = await getUserStore();
  return store.users.find((u) => u.id === id) || null;
}

// Find user by username
export async function findUserByUsername(username: string): Promise<UserData | null> {
  const store = await getUserStore();
  return store.users.find((u) => u.username === username) || null;
}

// Find user by email
export async function findUserByEmail(email: string): Promise<UserData | null> {
  const store = await getUserStore();
  return store.users.find((u) => u.email === email) || null;
}

// Check if username or email already exists
export async function userExists(
  username: string,
  email: string,
): Promise<{ exists: boolean; field?: "username" | "email" }> {
  const store = await getUserStore();

  const existingUser = store.users.find((u) => u.username === username || u.email === email);

  if (!existingUser) return { exists: false };

  if (existingUser.username === username) {
    return { exists: true, field: "username" };
  }
  return { exists: true, field: "email" };
}

// Create new user
export async function createUser(
  username: string,
  email: string,
  passwordHash: string,
  role: UserRole = "viewer",
): Promise<UserData> {
  const store = await getUserStore();
  const now = new Date().toISOString();

  const newUser: UserData = {
    id: store.nextId++,
    username,
    email,
    password_hash: passwordHash,
    role,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  store.users.push(newUser);
  await saveUserStore(store);

  return newUser;
}

// Update user's last login
export async function updateLastLogin(userId: number): Promise<void> {
  const store = await getUserStore();
  const userIndex = store.users.findIndex((u) => u.id === userId);

  if (userIndex !== -1) {
    store.users[userIndex].last_login = new Date().toISOString();
    store.users[userIndex].updated_at = new Date().toISOString();
    await saveUserStore(store);
  }
}

// Update user
export async function updateUser(
  userId: number,
  updates: Partial<Omit<UserData, "id" | "created_at">>,
): Promise<UserData | null> {
  const store = await getUserStore();
  const userIndex = store.users.findIndex((u) => u.id === userId);

  if (userIndex === -1) return null;

  const user = store.users[userIndex];

  if (updates.username !== undefined) user.username = updates.username;
  if (updates.email !== undefined) user.email = updates.email;
  if (updates.password_hash !== undefined) user.password_hash = updates.password_hash;
  if (updates.role !== undefined) user.role = updates.role;
  if (updates.is_active !== undefined) user.is_active = updates.is_active;
  if (updates.last_login !== undefined) user.last_login = updates.last_login;
  user.updated_at = new Date().toISOString();

  await saveUserStore(store);
  return user;
}

// Delete user
export async function deleteUser(userId: number): Promise<boolean> {
  const store = await getUserStore();
  const initialLength = store.users.length;
  store.users = store.users.filter((u) => u.id !== userId);

  if (store.users.length !== initialLength) {
    await saveUserStore(store);
    return true;
  }
  return false;
}
