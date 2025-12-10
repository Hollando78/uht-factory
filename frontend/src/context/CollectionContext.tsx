import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Collection } from '../types';
import { useAuth } from './AuthContext';
import { collectionsAPI } from '../services/api';

// Helper to handle API calls with automatic token refresh on 401
async function withTokenRefresh<T>(
  apiCall: (token: string) => Promise<T>,
  getToken: () => string | null,
  refreshToken: () => Promise<boolean>
): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('No access token');

  try {
    return await apiCall(token);
  } catch (error: any) {
    // If 401, try to refresh token and retry
    if (error.response?.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const newToken = getToken();
        if (newToken) {
          return await apiCall(newToken);
        }
      }
    }
    throw error;
  }
}

interface CollectionState {
  collections: Collection[];
  activeCollectionId: string | null;
  isLoading: boolean;
  isSynced: boolean;  // Whether we're using server-side collections
}

type CollectionAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOAD_COLLECTIONS'; payload: { collections: Collection[]; synced: boolean } }
  | { type: 'CREATE_COLLECTION'; payload: Collection }
  | { type: 'UPDATE_COLLECTION'; payload: Collection }
  | { type: 'DELETE_COLLECTION'; payload: string }
  | { type: 'SET_ACTIVE_COLLECTION'; payload: string | null }
  | { type: 'CLEAR_ALL'; payload?: undefined };

interface CollectionContextType {
  state: CollectionState;
  createCollection: (name: string, description?: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  addEntity: (collectionId: string, entityUuid: string) => Promise<void>;
  removeEntity: (collectionId: string, entityUuid: string) => Promise<void>;
  addEntities: (collectionId: string, entityUuids: string[]) => Promise<void>;
  clearCollection: (id: string) => Promise<void>;
  setActiveCollection: (id: string | null) => void;
  getCollection: (id: string) => Collection | undefined;
  isEntityInCollection: (collectionId: string, entityUuid: string) => boolean;
  getCollectionsForEntity: (entityUuid: string) => Collection[];
  exportCollectionToUrl: (id: string) => string;
  importCollectionFromUrl: (params: URLSearchParams) => Promise<Collection | null>;
  refreshCollections: () => Promise<void>;
  migrateLocalCollections: () => Promise<number>;
}

const STORAGE_KEY = 'uht_collections';

// Generate unique ID for localStorage collections
const generateId = () => `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Load collections from localStorage
const loadLocalCollections = (): Collection[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save collections to localStorage
const saveLocalCollections = (collections: Collection[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  } catch (error) {
    console.error('Failed to save collections:', error);
  }
};

// Clear localStorage collections (after migration)
const clearLocalCollections = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear local collections:', error);
  }
};

// Reducer
function collectionReducer(state: CollectionState, action: CollectionAction): CollectionState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'LOAD_COLLECTIONS':
      return {
        ...state,
        collections: action.payload.collections,
        isSynced: action.payload.synced,
        isLoading: false
      };

    case 'CREATE_COLLECTION':
      const newCollections = [...state.collections, action.payload];
      if (!state.isSynced) saveLocalCollections(newCollections);
      return { ...state, collections: newCollections };

    case 'UPDATE_COLLECTION':
      const updatedCollections = state.collections.map(c =>
        c.id === action.payload.id ? action.payload : c
      );
      if (!state.isSynced) saveLocalCollections(updatedCollections);
      return { ...state, collections: updatedCollections };

    case 'DELETE_COLLECTION':
      const filteredCollections = state.collections.filter(c => c.id !== action.payload);
      if (!state.isSynced) saveLocalCollections(filteredCollections);
      return {
        ...state,
        collections: filteredCollections,
        activeCollectionId: state.activeCollectionId === action.payload ? null : state.activeCollectionId
      };

    case 'SET_ACTIVE_COLLECTION':
      return { ...state, activeCollectionId: action.payload };

    case 'CLEAR_ALL':
      return { ...state, collections: [], activeCollectionId: null };

    default:
      return state;
  }
}

// Context
const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

// Provider
export function CollectionProvider({ children }: { children: ReactNode }) {
  const { state: authState, getAccessToken, refreshToken } = useAuth();
  const [state, dispatch] = useReducer(collectionReducer, {
    collections: [],
    activeCollectionId: null,
    isLoading: true,
    isSynced: false
  });

  // Track if we've already loaded for the current auth state
  const loadedForAuth = useRef<string | null>(null);

  // Load collections when auth state changes
  useEffect(() => {
    const loadCollections = async () => {
      const authKey: string | null = authState.isAuthenticated ? (authState.user?.id ?? null) : 'anonymous';

      // Skip if we've already loaded for this auth state
      if (loadedForAuth.current === authKey) return;

      dispatch({ type: 'SET_LOADING', payload: true });

      if (authState.isAuthenticated && !authState.isLoading) {
        // Load from server
        try {
          const token = getAccessToken();
          if (token) {
            const response = await collectionsAPI.list(token);
            // Convert server format to local format
            const collections: Collection[] = response.collections.map(c => ({
              id: c.id,
              name: c.name,
              entityUuids: c.entity_uuids || [],
              createdAt: c.created_at,
              updatedAt: c.updated_at
            }));
            dispatch({ type: 'LOAD_COLLECTIONS', payload: { collections, synced: true } });
            loadedForAuth.current = authKey;
          }
        } catch (error) {
          console.error('Failed to load collections from server:', error);
          // Fall back to localStorage
          const localCollections = loadLocalCollections();
          dispatch({ type: 'LOAD_COLLECTIONS', payload: { collections: localCollections, synced: false } });
          loadedForAuth.current = authKey;
        }
      } else if (!authState.isLoading) {
        // Load from localStorage for anonymous users
        const localCollections = loadLocalCollections();
        dispatch({ type: 'LOAD_COLLECTIONS', payload: { collections: localCollections, synced: false } });
        loadedForAuth.current = authKey;
      }
    };

    loadCollections();
  }, [authState.isAuthenticated, authState.isLoading, authState.user?.id, getAccessToken]);

  const refreshCollections = useCallback(async () => {
    if (!authState.isAuthenticated) {
      const localCollections = loadLocalCollections();
      dispatch({ type: 'LOAD_COLLECTIONS', payload: { collections: localCollections, synced: false } });
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    try {
      const response = await collectionsAPI.list(token);
      const collections: Collection[] = response.collections.map(c => ({
        id: c.id,
        name: c.name,
        entityUuids: c.entity_uuids || [],
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }));
      dispatch({ type: 'LOAD_COLLECTIONS', payload: { collections, synced: true } });
    } catch (error) {
      console.error('Failed to refresh collections:', error);
    }
  }, [authState.isAuthenticated, getAccessToken]);

  const createCollection = useCallback(async (name: string, description?: string): Promise<Collection | null> => {
    const now = new Date().toISOString();

    if (authState.isAuthenticated) {
      try {
        const serverCollection = await withTokenRefresh(
          (token) => collectionsAPI.create(token, name, description),
          getAccessToken,
          refreshToken
        );
        const collection: Collection = {
          id: serverCollection.id,
          name: serverCollection.name,
          entityUuids: [],
          createdAt: serverCollection.created_at,
          updatedAt: serverCollection.updated_at
        };
        dispatch({ type: 'CREATE_COLLECTION', payload: collection });
        return collection;
      } catch (error) {
        console.error('Failed to create collection:', error);
        return null;
      }
    } else {
      // Local storage mode
      const collection: Collection = {
        id: generateId(),
        name: name || 'Untitled Collection',
        entityUuids: [],
        createdAt: now,
        updatedAt: now
      };
      dispatch({ type: 'CREATE_COLLECTION', payload: collection });
      return collection;
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken]);

  const deleteCollection = useCallback(async (id: string) => {
    if (authState.isAuthenticated) {
      try {
        await withTokenRefresh(
          (token) => collectionsAPI.delete(token, id),
          getAccessToken,
          refreshToken
        );
        dispatch({ type: 'DELETE_COLLECTION', payload: id });
      } catch (error) {
        console.error('Failed to delete collection:', error);
      }
    } else {
      dispatch({ type: 'DELETE_COLLECTION', payload: id });
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken]);

  const renameCollection = useCallback(async (id: string, name: string) => {
    if (authState.isAuthenticated) {
      try {
        const updated = await withTokenRefresh(
          (token) => collectionsAPI.update(token, id, { name }),
          getAccessToken,
          refreshToken
        );
        const collection = state.collections.find(c => c.id === id);
        if (collection) {
          dispatch({
            type: 'UPDATE_COLLECTION',
            payload: { ...collection, name: updated.name, updatedAt: updated.updated_at }
          });
        }
      } catch (error) {
        console.error('Failed to rename collection:', error);
      }
    } else {
      const collection = state.collections.find(c => c.id === id);
      if (collection) {
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: { ...collection, name, updatedAt: new Date().toISOString() }
        });
      }
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken, state.collections]);

  const addEntity = useCallback(async (collectionId: string, entityUuid: string) => {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection || collection.entityUuids.includes(entityUuid)) return;

    if (authState.isAuthenticated) {
      try {
        await withTokenRefresh(
          (token) => collectionsAPI.addEntities(token, collectionId, [entityUuid]),
          getAccessToken,
          refreshToken
        );
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: {
            ...collection,
            entityUuids: [...collection.entityUuids, entityUuid],
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Failed to add entity:', error);
      }
    } else {
      dispatch({
        type: 'UPDATE_COLLECTION',
        payload: {
          ...collection,
          entityUuids: [...collection.entityUuids, entityUuid],
          updatedAt: new Date().toISOString()
        }
      });
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken, state.collections]);

  const removeEntity = useCallback(async (collectionId: string, entityUuid: string) => {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    if (authState.isAuthenticated) {
      try {
        await withTokenRefresh(
          (token) => collectionsAPI.removeEntities(token, collectionId, [entityUuid]),
          getAccessToken,
          refreshToken
        );
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: {
            ...collection,
            entityUuids: collection.entityUuids.filter(uuid => uuid !== entityUuid),
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Failed to remove entity:', error);
      }
    } else {
      dispatch({
        type: 'UPDATE_COLLECTION',
        payload: {
          ...collection,
          entityUuids: collection.entityUuids.filter(uuid => uuid !== entityUuid),
          updatedAt: new Date().toISOString()
        }
      });
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken, state.collections]);

  const addEntities = useCallback(async (collectionId: string, entityUuids: string[]) => {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const existingSet = new Set(collection.entityUuids);
    const newUuids = entityUuids.filter(uuid => !existingSet.has(uuid));
    if (newUuids.length === 0) return;

    if (authState.isAuthenticated) {
      try {
        await withTokenRefresh(
          (token) => collectionsAPI.addEntities(token, collectionId, newUuids),
          getAccessToken,
          refreshToken
        );
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: {
            ...collection,
            entityUuids: [...collection.entityUuids, ...newUuids],
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Failed to add entities:', error);
      }
    } else {
      dispatch({
        type: 'UPDATE_COLLECTION',
        payload: {
          ...collection,
          entityUuids: [...collection.entityUuids, ...newUuids],
          updatedAt: new Date().toISOString()
        }
      });
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken, state.collections]);

  const clearCollection = useCallback(async (id: string) => {
    const collection = state.collections.find(c => c.id === id);
    if (!collection) return;

    if (authState.isAuthenticated) {
      try {
        // Remove all entities
        if (collection.entityUuids.length > 0) {
          await withTokenRefresh(
            (token) => collectionsAPI.removeEntities(token, id, collection.entityUuids),
            getAccessToken,
            refreshToken
          );
        }
        dispatch({
          type: 'UPDATE_COLLECTION',
          payload: { ...collection, entityUuids: [], updatedAt: new Date().toISOString() }
        });
      } catch (error) {
        console.error('Failed to clear collection:', error);
      }
    } else {
      dispatch({
        type: 'UPDATE_COLLECTION',
        payload: { ...collection, entityUuids: [], updatedAt: new Date().toISOString() }
      });
    }
  }, [authState.isAuthenticated, getAccessToken, refreshToken, state.collections]);

  const setActiveCollection = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_COLLECTION', payload: id });
  }, []);

  const getCollection = useCallback((id: string): Collection | undefined => {
    return state.collections.find(c => c.id === id);
  }, [state.collections]);

  const isEntityInCollection = useCallback((collectionId: string, entityUuid: string): boolean => {
    const collection = state.collections.find(c => c.id === collectionId);
    return collection ? collection.entityUuids.includes(entityUuid) : false;
  }, [state.collections]);

  const getCollectionsForEntity = useCallback((entityUuid: string): Collection[] => {
    return state.collections.filter(c => c.entityUuids.includes(entityUuid));
  }, [state.collections]);

  const exportCollectionToUrl = useCallback((id: string): string => {
    const collection = state.collections.find(c => c.id === id);
    if (!collection) return '';

    const params = new URLSearchParams();
    params.set('name', collection.name);
    params.set('entities', collection.entityUuids.join(','));
    return `${window.location.origin}/collections?${params.toString()}`;
  }, [state.collections]);

  const importCollectionFromUrl = useCallback(async (params: URLSearchParams): Promise<Collection | null> => {
    const name = params.get('name');
    const entitiesParam = params.get('entities');

    if (!name || !entitiesParam) return null;

    const entityUuids = entitiesParam.split(',').filter(Boolean);
    if (entityUuids.length === 0) return null;

    const collection = await createCollection(`${name} (Imported)`);
    if (collection && entityUuids.length > 0) {
      await addEntities(collection.id, entityUuids);
    }
    return collection;
  }, [createCollection, addEntities]);

  // Migrate localStorage collections to server
  const migrateLocalCollections = useCallback(async (): Promise<number> => {
    if (!authState.isAuthenticated) return 0;

    const token = getAccessToken();
    if (!token) return 0;

    const localCollections = loadLocalCollections();
    if (localCollections.length === 0) return 0;

    let migrated = 0;

    for (const local of localCollections) {
      try {
        // Create collection on server
        const serverCollection = await collectionsAPI.create(token, local.name);

        // Add entities if any
        if (local.entityUuids.length > 0) {
          await collectionsAPI.addEntities(token, serverCollection.id, local.entityUuids);
        }

        migrated++;
      } catch (error) {
        console.error(`Failed to migrate collection "${local.name}":`, error);
      }
    }

    // Clear localStorage after successful migration
    if (migrated > 0) {
      clearLocalCollections();
      await refreshCollections();
    }

    return migrated;
  }, [authState.isAuthenticated, getAccessToken, refreshCollections]);

  const value: CollectionContextType = {
    state,
    createCollection,
    deleteCollection,
    renameCollection,
    addEntity,
    removeEntity,
    addEntities,
    clearCollection,
    setActiveCollection,
    getCollection,
    isEntityInCollection,
    getCollectionsForEntity,
    exportCollectionToUrl,
    importCollectionFromUrl,
    refreshCollections,
    migrateLocalCollections
  };

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  );
}

// Hook
export function useCollections(): CollectionContextType {
  const context = useContext(CollectionContext);
  if (context === undefined) {
    throw new Error('useCollections must be used within a CollectionProvider');
  }
  return context;
}
