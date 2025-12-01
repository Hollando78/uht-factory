import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { AppState, UHTEntity, GraphNode, GraphLink } from '../types/index';

// Initial state
const initialState: AppState = {
  currentView: 'classification',
  selectedEntity: undefined,
  graphData: {
    nodes: [],
    links: []
  },
  filters: {
    show_images: true,
    similarity_threshold: 0.7
  },
  loading: {
    classification: false,
    preprocess: false,
    graph: false,
    image: false,
    embedding: false
  },
  error: undefined
};

// Action types
type AppAction =
  | { type: 'SET_VIEW'; payload: AppState['currentView'] }
  | { type: 'SET_SELECTED_ENTITY'; payload: UHTEntity | undefined }
  | { type: 'SET_GRAPH_DATA'; payload: { nodes: GraphNode[]; links: GraphLink[] } }
  | { type: 'SET_FILTERS'; payload: Partial<AppState['filters']> }
  | { type: 'SET_LOADING'; payload: Partial<AppState['loading']> }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'ADD_ENTITY_TO_GRAPH'; payload: UHTEntity }
  | { type: 'UPDATE_ENTITY'; payload: UHTEntity }
  | { type: 'CLEAR_ERROR' };

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    
    case 'SET_SELECTED_ENTITY':
      return { ...state, selectedEntity: action.payload };
    
    case 'SET_GRAPH_DATA':
      return { 
        ...state, 
        graphData: action.payload 
      };
    
    case 'SET_FILTERS':
      return { 
        ...state, 
        filters: { ...state.filters, ...action.payload } 
      };
    
    case 'SET_LOADING':
      return { 
        ...state, 
        loading: { ...state.loading, ...action.payload } 
      };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'ADD_ENTITY_TO_GRAPH':
      const newNode: GraphNode = {
        id: action.payload.uuid,
        name: action.payload.name,
        uht_code: action.payload.uht_code,
        layer_dominance: getDominantLayer(action.payload),
        trait_count: action.payload.trait_evaluations?.filter(t => t.applicable).length || 0,
        image_url: action.payload.image_url,
        color: getNodeColor(action.payload)
      };
      
      return {
        ...state,
        graphData: {
          ...state.graphData,
          nodes: [...state.graphData.nodes, newNode]
        }
      };
    
    case 'UPDATE_ENTITY':
      const updatedNodes = state.graphData.nodes.map(node => 
        node.id === action.payload.uuid 
          ? { 
              ...node, 
              name: action.payload.name,
              uht_code: action.payload.uht_code,
              image_url: action.payload.image_url,
              color: getNodeColor(action.payload)
            }
          : node
      );
      
      return {
        ...state,
        selectedEntity: action.payload,
        graphData: {
          ...state.graphData,
          nodes: updatedNodes
        }
      };
    
    case 'CLEAR_ERROR':
      return { ...state, error: undefined };
    
    default:
      return state;
  }
}

// Helper functions
function getDominantLayer(entity: UHTEntity): string {
  if (!entity.layers) return 'Physical';
  
  const layerCounts = {
    Physical: parseInt(entity.layers.Physical, 16).toString(2).split('1').length - 1,
    Functional: parseInt(entity.layers.Functional, 16).toString(2).split('1').length - 1,
    Abstract: parseInt(entity.layers.Abstract, 16).toString(2).split('1').length - 1,
    Social: parseInt(entity.layers.Social, 16).toString(2).split('1').length - 1
  };
  
  return Object.entries(layerCounts).reduce((a, b) => 
    layerCounts[a[0] as keyof typeof layerCounts] > layerCounts[b[0] as keyof typeof layerCounts] ? a : b
  )[0];
}

function getNodeColor(entity: UHTEntity): string {
  const dominant = getDominantLayer(entity);
  const colors = {
    Physical: '#FF6B35', // Orange
    Functional: '#00E5FF', // Cyan  
    Abstract: '#9C27B0', // Purple
    Social: '#4CAF50'     // Green
  };
  return colors[dominant as keyof typeof colors] || '#FFFFFF';
}

// Context
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    setView: (view: AppState['currentView']) => void;
    setSelectedEntity: (entity: UHTEntity | undefined) => void;
    setGraphData: (data: { nodes: GraphNode[]; links: GraphLink[] }) => void;
    setFilters: (filters: Partial<AppState['filters']>) => void;
    setLoading: (loading: Partial<AppState['loading']>) => void;
    setError: (error: string | undefined) => void;
    addEntityToGraph: (entity: UHTEntity) => void;
    updateEntity: (entity: UHTEntity) => void;
    clearError: () => void;
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  
  const actions = {
    setView: (view: AppState['currentView']) => dispatch({ type: 'SET_VIEW', payload: view }),
    setSelectedEntity: (entity: UHTEntity | undefined) => dispatch({ type: 'SET_SELECTED_ENTITY', payload: entity }),
    setGraphData: (data: { nodes: GraphNode[]; links: GraphLink[] }) => dispatch({ type: 'SET_GRAPH_DATA', payload: data }),
    setFilters: (filters: Partial<AppState['filters']>) => dispatch({ type: 'SET_FILTERS', payload: filters }),
    setLoading: (loading: Partial<AppState['loading']>) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | undefined) => dispatch({ type: 'SET_ERROR', payload: error }),
    addEntityToGraph: (entity: UHTEntity) => dispatch({ type: 'ADD_ENTITY_TO_GRAPH', payload: entity }),
    updateEntity: (entity: UHTEntity) => dispatch({ type: 'UPDATE_ENTITY', payload: entity }),
    clearError: () => dispatch({ type: 'CLEAR_ERROR' })
  };
  
  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}