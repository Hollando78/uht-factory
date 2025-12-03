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

const API_BASE = 'http://localhost:8100/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
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
  }
};

// Traits API
export const traitsAPI = {
  getAllTraits: async (): Promise<{ traits: Trait[] }> => {
    const response = await api.get('/traits/');
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