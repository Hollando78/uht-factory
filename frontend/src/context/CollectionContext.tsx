import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Collection } from '../types';

interface CollectionState {
  collections: Collection[];
  activeCollectionId: string | null;
}

type CollectionAction =
  | { type: 'LOAD_COLLECTIONS'; payload: Collection[] }
  | { type: 'CREATE_COLLECTION'; payload: Collection }
  | { type: 'DELETE_COLLECTION'; payload: string }
  | { type: 'RENAME_COLLECTION'; payload: { id: string; name: string } }
  | { type: 'ADD_ENTITY'; payload: { collectionId: string; entityUuid: string } }
  | { type: 'REMOVE_ENTITY'; payload: { collectionId: string; entityUuid: string } }
  | { type: 'ADD_ENTITIES'; payload: { collectionId: string; entityUuids: string[] } }
  | { type: 'CLEAR_COLLECTION'; payload: string }
  | { type: 'SET_ACTIVE_COLLECTION'; payload: string | null };

interface CollectionContextType {
  state: CollectionState;
  createCollection: (name: string) => Collection;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  addEntity: (collectionId: string, entityUuid: string) => void;
  removeEntity: (collectionId: string, entityUuid: string) => void;
  addEntities: (collectionId: string, entityUuids: string[]) => void;
  clearCollection: (id: string) => void;
  setActiveCollection: (id: string | null) => void;
  getCollection: (id: string) => Collection | undefined;
  isEntityInCollection: (collectionId: string, entityUuid: string) => boolean;
  getCollectionsForEntity: (entityUuid: string) => Collection[];
  exportCollectionToUrl: (id: string) => string;
  importCollectionFromUrl: (params: URLSearchParams) => Collection | null;
}

const STORAGE_KEY = 'uht_collections';

// Generate unique ID
const generateId = () => `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Load collections from localStorage
const loadCollections = (): Collection[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save collections to localStorage
const saveCollections = (collections: Collection[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  } catch (error) {
    console.error('Failed to save collections:', error);
  }
};

// Reducer
function collectionReducer(state: CollectionState, action: CollectionAction): CollectionState {
  let newState: CollectionState;

  switch (action.type) {
    case 'LOAD_COLLECTIONS':
      return { ...state, collections: action.payload };

    case 'CREATE_COLLECTION':
      newState = {
        ...state,
        collections: [...state.collections, action.payload]
      };
      saveCollections(newState.collections);
      return newState;

    case 'DELETE_COLLECTION':
      newState = {
        ...state,
        collections: state.collections.filter(c => c.id !== action.payload),
        activeCollectionId: state.activeCollectionId === action.payload ? null : state.activeCollectionId
      };
      saveCollections(newState.collections);
      return newState;

    case 'RENAME_COLLECTION':
      newState = {
        ...state,
        collections: state.collections.map(c =>
          c.id === action.payload.id
            ? { ...c, name: action.payload.name, updatedAt: new Date().toISOString() }
            : c
        )
      };
      saveCollections(newState.collections);
      return newState;

    case 'ADD_ENTITY':
      newState = {
        ...state,
        collections: state.collections.map(c =>
          c.id === action.payload.collectionId && !c.entityUuids.includes(action.payload.entityUuid)
            ? {
                ...c,
                entityUuids: [...c.entityUuids, action.payload.entityUuid],
                updatedAt: new Date().toISOString()
              }
            : c
        )
      };
      saveCollections(newState.collections);
      return newState;

    case 'REMOVE_ENTITY':
      newState = {
        ...state,
        collections: state.collections.map(c =>
          c.id === action.payload.collectionId
            ? {
                ...c,
                entityUuids: c.entityUuids.filter(uuid => uuid !== action.payload.entityUuid),
                updatedAt: new Date().toISOString()
              }
            : c
        )
      };
      saveCollections(newState.collections);
      return newState;

    case 'ADD_ENTITIES':
      newState = {
        ...state,
        collections: state.collections.map(c => {
          if (c.id !== action.payload.collectionId) return c;
          const existingSet = new Set(c.entityUuids);
          const newUuids = action.payload.entityUuids.filter(uuid => !existingSet.has(uuid));
          if (newUuids.length === 0) return c;
          return {
            ...c,
            entityUuids: [...c.entityUuids, ...newUuids],
            updatedAt: new Date().toISOString()
          };
        })
      };
      saveCollections(newState.collections);
      return newState;

    case 'CLEAR_COLLECTION':
      newState = {
        ...state,
        collections: state.collections.map(c =>
          c.id === action.payload
            ? { ...c, entityUuids: [], updatedAt: new Date().toISOString() }
            : c
        )
      };
      saveCollections(newState.collections);
      return newState;

    case 'SET_ACTIVE_COLLECTION':
      return { ...state, activeCollectionId: action.payload };

    default:
      return state;
  }
}

// Context
const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

// Provider
export function CollectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(collectionReducer, {
    collections: [],
    activeCollectionId: null
  });

  // Load collections on mount
  useEffect(() => {
    const collections = loadCollections();
    dispatch({ type: 'LOAD_COLLECTIONS', payload: collections });
  }, []);

  const createCollection = useCallback((name: string): Collection => {
    const now = new Date().toISOString();
    const collection: Collection = {
      id: generateId(),
      name: name || 'Untitled Collection',
      entityUuids: [],
      createdAt: now,
      updatedAt: now
    };
    dispatch({ type: 'CREATE_COLLECTION', payload: collection });
    return collection;
  }, []);

  const deleteCollection = useCallback((id: string) => {
    dispatch({ type: 'DELETE_COLLECTION', payload: id });
  }, []);

  const renameCollection = useCallback((id: string, name: string) => {
    dispatch({ type: 'RENAME_COLLECTION', payload: { id, name } });
  }, []);

  const addEntity = useCallback((collectionId: string, entityUuid: string) => {
    dispatch({ type: 'ADD_ENTITY', payload: { collectionId, entityUuid } });
  }, []);

  const removeEntity = useCallback((collectionId: string, entityUuid: string) => {
    dispatch({ type: 'REMOVE_ENTITY', payload: { collectionId, entityUuid } });
  }, []);

  const addEntities = useCallback((collectionId: string, entityUuids: string[]) => {
    dispatch({ type: 'ADD_ENTITIES', payload: { collectionId, entityUuids } });
  }, []);

  const clearCollection = useCallback((id: string) => {
    dispatch({ type: 'CLEAR_COLLECTION', payload: id });
  }, []);

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

  const importCollectionFromUrl = useCallback((params: URLSearchParams): Collection | null => {
    const name = params.get('name');
    const entitiesParam = params.get('entities');

    if (!name || !entitiesParam) return null;

    const entityUuids = entitiesParam.split(',').filter(Boolean);
    if (entityUuids.length === 0) return null;

    const now = new Date().toISOString();
    const collection: Collection = {
      id: generateId(),
      name: `${name} (Imported)`,
      entityUuids,
      createdAt: now,
      updatedAt: now
    };

    dispatch({ type: 'CREATE_COLLECTION', payload: collection });
    return collection;
  }, []);

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
    importCollectionFromUrl
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
