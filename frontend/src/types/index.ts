// Core UHT Types

// Lightweight entity reference for pickers and selections
export interface SelectedEntity {
  uuid: string;
  name: string;
  uht_code: string;
  image_url?: string;
}

// Collection for organizing entities
export interface Collection {
  id: string;
  name: string;
  entityUuids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UHTEntity {
  uuid: string;
  name: string;
  description?: string;
  uht_code: string;
  binary_representation: string;
  created_at: string;
  layers: {
    Physical: string;
    Functional: string;
    Abstract: string;
    Social: string;
  };
  trait_evaluations: TraitEvaluation[];
  processing_time_ms: number;
  image_url?: string;
  embedding?: number[];
  embedding_similarity?: number;
}

export interface TraitEvaluation {
  trait_bit: number;
  trait_name: string;
  applicable: boolean;
  confidence: number;
  justification: string;
  evaluated_at: string;
  model_used: string;
}

export interface Trait {
  bit: number;
  name: string;
  layer: string;
  short_description: string;
  expanded_definition: string;
  url?: string;
}

// Pre-processing types
export interface EntityPreProcessing {
  original_input?: string;
  suggested_name: string;
  suggested_description: string;
  additional_context: string;
  confidence: number;
  reasoning?: string;
  suggestions?: string[];
}

export interface DuplicateCheck {
  exists: boolean;
  existing_entity?: UHTEntity;
  similar_entities: Array<{
    entity: UHTEntity;
    similarity_score: number;
    reason: string;
  }>;
}

// Graph visualization types
export interface GraphNode {
  id: string;
  name: string;
  uht_code: string;
  layer_dominance: string; // Which layer has most active traits
  trait_count: number;
  image_url?: string;
  x?: number;
  y?: number;
  z?: number;
  color?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  similarity: number;
  shared_traits: number[];
  distance?: number;
}

// Image generation types
export interface ImageGenerationRequest {
  entity_uuid?: string;  // For generating image for existing entity
  entity_name?: string;
  entity_description?: string;
  uht_code?: string;
  active_traits?: string[];
  style?: 'realistic' | 'artistic' | 'diagram' | 'cartoon';
}

export interface ImageGenerationResponse {
  success: boolean;
  image_url?: string;
  prompt_used?: string;
  generation_time_ms?: number;
  cost?: number;
  error?: string;
}

// Embeddings and comparison types
export interface EntityEmbedding {
  entity_uuid: string;
  embedding: number[];
  dimension: number;
  model_used: string;
  created_at: string;
}

export interface ComparisonMetrics {
  entity_uuid: string;
  uht_vector: number[]; // 32-dimensional
  embedding_vector: number[]; // 1536-dimensional
  cosine_similarity: number;
  euclidean_distance: number;
  correlation_score: number;
  outlier_score: number; // How different from typical patterns
}

export interface SimilarityCluster {
  cluster_id: string;
  entities: string[]; // UUIDs
  center_point: number[];
  avg_uht_code: string;
  dominant_traits: number[];
  cluster_size: number;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
  processing_time_ms?: number;
  cached?: boolean;
}

export interface ClassificationRequest {
  entity: {
    uuid?: string;  // Existing entity UUID (for reclassification)
    name: string;
    description?: string;
    context?: string;
  };
  use_cache?: boolean;
  detailed?: boolean;
  generate_image?: boolean;
  generate_embedding?: boolean;
}

// UI State types
export interface AppState {
  currentView: 'classification' | 'graph' | 'comparison' | 'gallery';
  selectedEntity?: UHTEntity;
  graphData: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
  filters: {
    layer_filter?: string;
    trait_filter?: number[];
    similarity_threshold?: number;
    show_images?: boolean;
  };
  loading: {
    classification: boolean;
    preprocess: boolean;
    graph: boolean;
    image: boolean;
    embedding: boolean;
  };
  error?: string;
}