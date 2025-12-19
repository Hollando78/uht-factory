import axios from 'axios';
import type {
  UHTEntity,
  Trait,
  ClassificationRequest,
  EntityPreProcessing,
  DuplicateCheck,
  ImageGenerationRequest,
  ImageGenerationResponse,
  EntityEmbedding,
  ComparisonMetrics,
  ApiResponse,
  EntityVersion,
  EntityHistoryResponse
} from '../types/index';

// Use relative path when accessed via production domain (nginx proxies to backend)
// Use localhost only when accessed via localhost
const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE = isLocalhost
  ? 'http://localhost:8100/api/v1'
  : '/api/v1';

// API Key management
const API_KEY_STORAGE_KEY = 'uht_api_key';

export const getApiKey = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

export const clearApiKey = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests (for refresh token)
});

// Add API key to requests if available
api.interceptors.request.use((config) => {
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
});

// Token refresh state management
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

// Response interceptor to handle 401 errors and auto-refresh tokens
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 errors for authenticated requests (those with Authorization header)
    if (
      error.response?.status === 401 &&
      originalRequest.headers?.Authorization &&
      !originalRequest._retry
    ) {
      // Mark this request as retried to prevent infinite loops
      originalRequest._retry = true;

      // If already refreshing, wait for the refresh to complete
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Attempt to refresh the token
        const response = await api.post('/users/refresh', {});
        const newAccessToken = response.data.access_token;

        // Notify all waiting requests
        onTokenRefreshed(newAccessToken);

        // Update the failed request with the new token and retry
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // Dispatch custom event so AuthContext can update its state
        window.dispatchEvent(
          new CustomEvent('tokenRefreshed', { detail: { accessToken: newAccessToken } })
        );

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - dispatch logout event
        window.dispatchEvent(new CustomEvent('tokenRefreshFailed'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Classification API
export const classificationAPI = {
  classifyEntity: async (request: ClassificationRequest): Promise<ApiResponse<UHTEntity>> => {
    const response = await api.post('/classify/', request);
    return response.data;
  },

  explainClassification: async (entityName: string, uhtCode: string) => {
    const response = await api.post('/classify/explain', null, {
      params: { entity_name: entityName, uht_code: uhtCode }
    });
    return response.data;
  },

  batchClassify: async (entities: ClassificationRequest['entity'][]) => {
    const response = await api.post('/classify/batch', {
      entities,
      parallel_workers: 4
    });
    return response.data;
  }
};

// Entity management API
export const entityAPI = {
  getEntity: async (uuid: string): Promise<UHTEntity> => {
    const response = await api.get(`/entities/${uuid}`);
    return response.data;
  },

  searchEntities: async (params: {
    uht_pattern?: string;
    name_contains?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await api.get('/entities/', { params });
    return response.data;
  },

  findSimilarEntities: async (uuid: string, threshold: number = 28) => {
    const response = await api.get(`/entities/${uuid}/similar`, {
      params: { threshold }
    });
    return response.data;
  },

  getAllEntities: async (): Promise<UHTEntity[]> => {
    const response = await api.get('/entities/', {
      params: { limit: 50000 }
    });
    return response.data.entities || [];
  },

  // Lightweight endpoint for list views - only essential fields
  getEntitiesMinimal: async (): Promise<Pick<UHTEntity, 'uuid' | 'name' | 'uht_code' | 'description' | 'created_at'>[]> => {
    const response = await api.get('/entities/list/minimal');
    return response.data.entities || [];
  },

  searchEntitiesByName: async (name: string, limit = 500): Promise<UHTEntity[]> => {
    const response = await api.get('/entities/', {
      params: { name_contains: name, limit }
    });
    return response.data.entities || [];
  },

  updateEntity: async (uuid: string, update: {
    name?: string;
    description?: string;
    additional_context?: string;
    nsfw?: boolean;
  }): Promise<UHTEntity> => {
    const response = await api.patch(`/entities/${uuid}`, update);
    return response.data;
  },

  // Search by binary pattern (32-char string of 0/1/X)
  searchByPattern: async (pattern: string, tolerance: number = 0, limit: number = 100): Promise<UHTEntity[]> => {
    const response = await api.get('/entities/search/pattern', {
      params: { pattern, tolerance, limit }
    });
    return response.data.entities || [];
  },

  // Flag as NSFW (no auth required - anyone can flag)
  flagNsfw: async (uuid: string): Promise<UHTEntity> => {
    const response = await api.post(`/entities/${uuid}/flag-nsfw`);
    return response.data;
  },

  // Unflag NSFW (requires auth)
  unflagNsfw: async (uuid: string): Promise<UHTEntity> => {
    const response = await api.post(`/entities/${uuid}/unflag-nsfw`);
    return response.data;
  },

  // Flag a trait as incorrect (no auth required - public crowdsourcing)
  flagTrait: async (
    entityUuid: string,
    traitBit: number,
    suggestedValue: boolean,
    reason: string
  ): Promise<{ flag_id: string; status: string }> => {
    const response = await api.post(
      `/entities/${entityUuid}/traits/${traitBit}/flag`,
      { suggested_value: suggestedValue, reason }
    );
    return response.data;
  },

  // Version history endpoints
  getHistory: async (uuid: string, limit: number = 50, offset: number = 0): Promise<EntityHistoryResponse> => {
    const response = await api.get(`/entities/${uuid}/history`, {
      params: { limit, offset }
    });
    return response.data;
  },

  getVersion: async (uuid: string, version: number): Promise<EntityVersion> => {
    const response = await api.get(`/entities/${uuid}/history/${version}`);
    return response.data;
  }
};

// Traits API with caching
let traitsCache: { data: { traits: Trait[] }; timestamp: number } | null = null;
const TRAITS_CACHE_TTL = 300000; // 5 minutes - traits rarely change

export const traitsAPI = {
  getAllTraits: async (): Promise<{ traits: Trait[] }> => {
    const now = Date.now();
    if (traitsCache && now - traitsCache.timestamp < TRAITS_CACHE_TTL) {
      return traitsCache.data;
    }
    const response = await api.get('/traits/');
    traitsCache = { data: response.data, timestamp: now };
    return response.data;
  },

  getTraitByBit: async (bit: number): Promise<Trait> => {
    const response = await api.get(`/traits/${bit}`);
    return response.data;
  },

  getTraitsByLayer: async (layer: string) => {
    const response = await api.get(`/traits/layer/${layer}`);
    return response.data;
  }
};

// Pre-processing API
export const preprocessAPI = {
  preprocessEntity: async (entityName: string): Promise<EntityPreProcessing> => {
    const response = await api.post(`/preprocess/preprocess?entity_name=${encodeURIComponent(entityName)}`);
    return response.data;
  },

  checkDuplicate: async (entityName: string): Promise<DuplicateCheck> => {
    const response = await api.post(`/preprocess/duplicate-check?entity_name=${encodeURIComponent(entityName)}`);
    return response.data;
  }
};

// Image generation API
export const imageAPI = {
  generateImage: async (request: ImageGenerationRequest): Promise<ImageGenerationResponse> => {
    const response = await api.post('/images/generate', request);
    return response.data;
  },

  getImageHistory: async (entityUuid: string) => {
    const response = await api.get(`/images/history/${entityUuid}`);
    return response.data;
  }
};

// Embeddings API
export const embeddingAPI = {
  generateEmbedding: async (entityUuid: string): Promise<EntityEmbedding> => {
    const response = await api.post('/embeddings/generate', { entity_uuid: entityUuid });
    return response.data;
  },

  compareEmbeddings: async (entityUuid1: string, entityUuid2: string) => {
    const response = await api.post('/embeddings/compare', {
      entity_uuid_1: entityUuid1,
      entity_uuid_2: entityUuid2
    });
    return response.data;
  },

  getEmbeddingMetrics: async (entityUuid: string): Promise<ComparisonMetrics> => {
    const response = await api.get(`/embeddings/metrics/${entityUuid}`);
    return response.data;
  },

  getAllEmbeddings: async (): Promise<EntityEmbedding[]> => {
    const response = await api.get('/embeddings/');
    return response.data;
  }
};

// Graph data API
export const graphAPI = {
  getNodes: async (limit: number = 100) => {
    const response = await api.get(`/graph/nodes?limit=${limit}`);
    return response.data;
  },

  getLinks: async (similarityThreshold: number = 0.7) => {
    const response = await api.get(`/graph/links?similarity_threshold=${similarityThreshold}`);
    return response.data;
  },

  getFullGraph: async (nodeLimit: number = 50, similarityThreshold: number = 0.7) => {
    const response = await api.get(`/graph/full?node_limit=${nodeLimit}&similarity_threshold=${similarityThreshold}`);
    return response.data;
  },

  getNeighborhood: async (
    uuid: string,
    metric: 'embedding' | 'hamming' | 'hybrid' = 'embedding',
    k: number = 15,
    includeTraits: boolean = true
  ) => {
    const response = await api.get(`/graph/neighborhood/${uuid}?metric=${metric}&k=${k}&include_traits=${includeTraits}`);
    return response.data;
  },

  expandNode: async (
    entityUuid: string,
    metric: 'embedding' | 'hamming' | 'hybrid',
    k: number = 10,
    excludeUuids: string[] = []
  ) => {
    const response = await api.post('/graph/expand', {
      entity_uuid: entityUuid,
      metric,
      k,
      exclude_uuids: excludeUuids
    });
    return response.data;
  }
};

// Health and system API
export const systemAPI = {
  getHealth: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/stats');
    return response.data;
  }
};

// User Authentication API
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: string;
  email: string;
  verified: boolean;
  created_at: string;
  last_login?: string;
}

export const authAPI = {
  register: async (email: string, password: string): Promise<AuthUser> => {
    const response = await api.post('/users/register', { email, password });
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthTokens> => {
    const response = await api.post('/users/login', { email, password });
    return response.data;
  },

  logout: async (accessToken: string): Promise<void> => {
    await api.post('/users/logout', null, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  },

  refresh: async (refreshToken?: string): Promise<AuthTokens> => {
    const response = await api.post('/users/refresh',
      refreshToken ? { refresh_token: refreshToken } : {}
    );
    return response.data;
  },

  me: async (accessToken: string): Promise<AuthUser> => {
    const response = await api.get('/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await api.post('/users/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    const response = await api.post('/users/reset-password', { token, password });
    return response.data;
  },

  changePassword: async (accessToken: string, currentPassword: string, newPassword: string): Promise<{ message: string }> => {
    const response = await api.post('/users/change-password',
      { current_password: currentPassword, new_password: newPassword },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return response.data;
  },

  getMyApiKeys: async (accessToken: string): Promise<{ api_keys: any[]; count: number }> => {
    const response = await api.get('/users/me/apikeys', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  },

  generateMyApiKey: async (accessToken: string): Promise<{ api_key: string; key_id: string; message: string; scopes: string[]; expires_at?: string }> => {
    const response = await api.post('/users/me/apikeys/generate', null, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
  }
};

// Collections API (authenticated)
export interface Collection {
  id: string;
  name: string;
  description?: string;
  entity_count: number;
  entity_uuids: string[];
  created_at: string;
  updated_at: string;
}

export interface CollectionDetail extends Collection {
  entities: Array<{
    uuid: string;
    name: string;
    uht_code: string;
    added_at?: string;
  }>;
}

const createAuthHeader = (accessToken: string) => ({
  headers: { Authorization: `Bearer ${accessToken}` }
});

export const collectionsAPI = {
  list: async (accessToken: string): Promise<{ collections: Collection[]; total: number }> => {
    const response = await api.get('/collections', createAuthHeader(accessToken));
    return response.data;
  },

  create: async (accessToken: string, name: string, description?: string): Promise<Collection> => {
    const response = await api.post('/collections', { name, description }, createAuthHeader(accessToken));
    return response.data;
  },

  get: async (accessToken: string, collectionId: string): Promise<CollectionDetail> => {
    const response = await api.get(`/collections/${collectionId}`, createAuthHeader(accessToken));
    return response.data;
  },

  update: async (accessToken: string, collectionId: string, updates: { name?: string; description?: string }): Promise<Collection> => {
    const response = await api.patch(`/collections/${collectionId}`, updates, createAuthHeader(accessToken));
    return response.data;
  },

  delete: async (accessToken: string, collectionId: string): Promise<void> => {
    await api.delete(`/collections/${collectionId}`, createAuthHeader(accessToken));
  },

  addEntities: async (accessToken: string, collectionId: string, entityUuids: string[]): Promise<{ added_count: number }> => {
    const response = await api.post(`/collections/${collectionId}/entities`,
      { entity_uuids: entityUuids },
      createAuthHeader(accessToken)
    );
    return response.data;
  },

  removeEntities: async (accessToken: string, collectionId: string, entityUuids: string[]): Promise<{ removed_count: number }> => {
    const response = await api.delete(`/collections/${collectionId}/entities`, {
      ...createAuthHeader(accessToken),
      data: { entity_uuids: entityUuids }
    });
    return response.data;
  }
};

// Admin API (requires JWT authentication)
export interface TraitFlag {
  flag_id: string;
  entity_uuid: string;
  entity_name: string;
  trait_bit: number;
  trait_name: string;
  current_value: boolean;
  suggested_value: boolean;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  resolution_notes?: string;
}

export interface TraitFlagListResponse {
  flags: TraitFlag[];
  total: number;
  offset: number;
  limit: number;
}

export interface ReviewFlagRequest {
  action: 'approve' | 'reject';
  trigger_reclassification?: boolean;
  resolution_notes?: string;
}

export interface ReviewFlagResponse {
  flag_id: string;
  status: string;
  reviewed_by: string;
  reclassified: boolean;
  old_value?: boolean;
  new_value?: boolean;
  new_uht_code?: string;
  confidence?: number;
  message: string;
}

export const adminAPI = {
  listTraitFlags: async (
    accessToken: string,
    status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
    limit: number = 100,
    offset: number = 0
  ): Promise<TraitFlagListResponse> => {
    const response = await api.get('/admin/trait-flags', {
      ...createAuthHeader(accessToken),
      params: { status, limit, offset }
    });
    return response.data;
  },

  reviewTraitFlag: async (
    accessToken: string,
    flagId: string,
    review: ReviewFlagRequest
  ): Promise<ReviewFlagResponse> => {
    const response = await api.post(
      `/admin/trait-flags/${flagId}/review`,
      review,
      createAuthHeader(accessToken)
    );
    return response.data;
  }
};

// Embedding Explorer API
export interface ProjectionPoint {
  uuid: string;
  name: string;
  uht_code: string;
  x: number;
  y: number;
  image_url?: string;
}

export interface ProjectionStats {
  total_entities: number;
  with_umap: number;
  with_tsne: number;
  with_embedding: number;
}

export interface CorrelationSample {
  entity1_uuid: string;
  entity1_name: string;
  entity2_uuid: string;
  entity2_name: string;
  embedding_similarity: number;
  uht_similarity: number;
}

export interface Neighbor {
  uuid: string;
  name: string;
  uht_code: string;
  image_url?: string;
  similarity?: number;
  hamming_distance?: number;
}

export interface NeighborComparison {
  entity_uuid: string;
  entity_name: string;
  embedding_neighbors: Neighbor[];
  hamming_neighbors: Neighbor[];
  overlap_count: number;
  jaccard_similarity: number;
}

export interface Outlier {
  entity1_uuid: string;
  entity1_name: string;
  entity1_uht_code: string;
  entity2_uuid: string;
  entity2_name: string;
  entity2_uht_code: string;
  embedding_similarity: number;
  uht_similarity: number;
  disagreement: number;
  type: 'semantic_similar_structural_different' | 'structural_similar_semantic_different';
}

export interface ClusterLabel {
  cluster_id: number;
  centroid_x: number;
  centroid_y: number;
  label: string;
  count: number;
  size: number;  // Same as count, used for adaptive sizing
  dominant_layer: string;
}

export type ClusterResolution = 'level1' | 'level2' | 'level3' | 'level4' | 'level5' | 'level6' | 'level7';

export interface ClusterResponse {
  method: string;
  resolution: ClusterResolution;
  total_points: number;
  clustered_points: number;
  noise_points: number;
  clusters: ClusterLabel[];
}

export const explorerAPI = {
  getProjections: async (method: 'umap' | 'tsne' | 'uht_umap' = 'umap'): Promise<{ points: ProjectionPoint[]; count: number }> => {
    const response = await api.get('/explorer/projections', { params: { method } });
    return response.data;
  },

  getProjectionStats: async (): Promise<ProjectionStats> => {
    const response = await api.get('/explorer/projections/stats');
    return response.data;
  },

  getCorrelations: async (sampleSize: number = 5000): Promise<{
    samples: CorrelationSample[];
    correlation: number;
    sample_size: number;
  }> => {
    const response = await api.get('/explorer/correlations', { params: { sample_size: sampleSize } });
    return response.data;
  },

  getNeighbors: async (uuid: string, k: number = 20): Promise<NeighborComparison> => {
    const response = await api.get(`/explorer/neighbors/${uuid}`, { params: { k } });
    return response.data;
  },

  getOutliers: async (threshold: number = 0.3, limit: number = 50): Promise<{
    semantic_only: Outlier[];
    structural_only: Outlier[];
  }> => {
    const response = await api.get('/explorer/outliers', { params: { threshold, limit } });
    return response.data;
  },

  getClusters: async (
    method: 'umap' | 'tsne' | 'uht' | 'uht_umap' = 'umap',
    resolution: ClusterResolution = 'level4'
  ): Promise<ClusterResponse> => {
    const response = await api.get('/explorer/clusters', { params: { method, resolution } });
    return response.data;
  },

  computeClusters: async (method: 'umap' | 'tsne' = 'umap'): Promise<{ status: string; message: string }> => {
    const response = await api.post('/explorer/clusters/compute', null, { params: { method } });
    return response.data;
  },

  // LLM-enhanced tour and insights
  generateTour: async (params: {
    tour_type: 'random_walk' | 'theme' | 'contrast' | 'complexity' | 'layer_journey';
    theme?: string;
    start_uuid?: string;
    num_stops?: number;
    projection?: 'umap' | 'tsne' | 'uht_umap';
  }): Promise<TourResponse> => {
    const response = await api.post('/explorer/generate-tour', params);
    return response.data;
  },

  describeSelection: async (uuids: string[]): Promise<SelectionDescription> => {
    const response = await api.post('/explorer/describe-selection', { uuids });
    return response.data;
  },

  explainSimilarity: async (referenceUuid: string, sampleUuids: string[]): Promise<SimilarityExplanation> => {
    const response = await api.post('/explorer/explain-similarity', {
      reference_uuid: referenceUuid,
      sample_uuids: sampleUuids
    });
    return response.data;
  },

  computeSubsetProjection: async (
    uuids: string[],
    method: 'umap' | 'tsne' | 'pacmap' = 'umap'
  ): Promise<SubsetProjectionResponse> => {
    const response = await api.post('/explorer/subset-projection', { uuids, method });
    return response.data;
  }
};

// Tour and insight types
export interface TourStop {
  uuid: string;
  name: string;
  uht_code: string;
  x: number;
  y: number;
  narration: string;
  image_url?: string;
}

export interface TourResponse {
  tour_type: string;
  theme?: string;
  stops: TourStop[];
  introduction: string;
  conclusion: string;
}

export interface SelectionDescription {
  description: string;
  common_traits: string[];
  suggested_label: string;
  entity_count: number;
}

export interface SimilarityExplanation {
  reference_name: string;
  reference_code: string;
  explanation: string;
  pattern_summary: string;
}

export interface SubsetProjectionPoint {
  uuid: string;
  name: string;
  uht_code: string;
  x: number;
  y: number;
  image_url?: string;
}

export interface SubsetCluster {
  cluster_id: number;
  centroid_x: number;
  centroid_y: number;
  label: string;
  size: number;
  dominant_layer: string;
}

export interface SubsetProjectionResponse {
  method: string;
  entity_count: number;
  points: SubsetProjectionPoint[];
  clusters: SubsetCluster[];
  computation_time_ms: number;
}

export default {
  classification: classificationAPI,
  entities: entityAPI,
  traits: traitsAPI,
  preprocess: preprocessAPI,
  images: imageAPI,
  embeddings: embeddingAPI,
  graph: graphAPI,
  system: systemAPI,
  auth: authAPI,
  collections: collectionsAPI,
  admin: adminAPI,
  explorer: explorerAPI
};