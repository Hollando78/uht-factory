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
  ApiResponse
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
});

// Add API key to requests if available
api.interceptors.request.use((config) => {
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
});

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

export default {
  classification: classificationAPI,
  entities: entityAPI,
  traits: traitsAPI,
  preprocess: preprocessAPI,
  images: imageAPI,
  embeddings: embeddingAPI,
  graph: graphAPI,
  system: systemAPI
};