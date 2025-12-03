import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Button,
  IconButton,
  Tooltip,
  LinearProgress,
  Collapse,
  Divider,
  Card,
  CardContent,
  Grid
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Image as ImageIcon,
  Code as CodeIcon,
  Category as TraitIcon,
  CompareArrows as SimilarIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { entityAPI, traitsAPI, imageAPI, getApiKey } from '../../services/api';
import { useMobile } from '../../context/MobileContext';
import type { Trait } from '../../types';

// Layer configuration
const LAYERS = [
  { name: 'Physical', color: '#FF6B35', bits: [1, 2, 3, 4, 5, 6, 7, 8], hexSlice: [0, 2] },
  { name: 'Functional', color: '#00E5FF', bits: [9, 10, 11, 12, 13, 14, 15, 16], hexSlice: [2, 4] },
  { name: 'Abstract', color: '#9C27B0', bits: [17, 18, 19, 20, 21, 22, 23, 24], hexSlice: [4, 6] },
  { name: 'Social', color: '#4CAF50', bits: [25, 26, 27, 28, 29, 30, 31, 32], hexSlice: [6, 8] }
];

interface EntityData {
  uuid: string;
  name: string;
  description: string;
  uht_code: string;
  binary_representation: string;
  image_url?: string;
  created_at: any;
  updated_at?: any;
  version: number;
  traits: TraitEvaluation[];
}

interface TraitEvaluation {
  bit: number;
  name: string;
  layer: string;
  short_description: string;
  expanded_definition: string;
  url?: string;
  evaluation: {
    applicable: boolean;
    confidence: number;
    justification: string;
  };
}

// Use relative URL for API calls (works with nginx proxy in production)
const API_BASE_URL = '';

// Binary visualization component
const BinaryVisualization: React.FC<{ binary: string; uhtCode: string; isMobile?: boolean }> = ({ binary, uhtCode, isMobile = false }) => {
  const paddedBinary = binary.padStart(32, '0');

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Binary Representation (32 bits)
      </Typography>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        overflowX: 'auto',
        pb: 1
      }}>
        {LAYERS.map((layer, layerIndex) => {
          const layerBits = paddedBinary.slice(layerIndex * 8, (layerIndex + 1) * 8);
          const hexPart = uhtCode.slice(layer.hexSlice[0], layer.hexSlice[1]);

          return (
            <Box key={layer.name} sx={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? 1 : 2,
              minWidth: isMobile ? 'fit-content' : 'auto'
            }}>
              <Tooltip title={layer.name}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: layer.color,
                    flexShrink: 0
                  }}
                />
              </Tooltip>
              <Typography
                variant="caption"
                sx={{
                  width: isMobile ? 60 : 80,
                  color: layer.color,
                  fontWeight: 500,
                  fontSize: isMobile ? '0.7rem' : '0.75rem',
                  flexShrink: 0
                }}
              >
                {isMobile ? layer.name.slice(0, 4) : layer.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
                {layerBits.split('').map((bit, bitIndex) => (
                  <Tooltip
                    key={bitIndex}
                    title={`Bit ${layerIndex * 8 + bitIndex + 1}: ${bit === '1' ? 'Active' : 'Inactive'}`}
                  >
                    <Box
                      sx={{
                        width: isMobile ? 20 : 24,
                        height: isMobile ? 20 : 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 0.5,
                        fontFamily: 'monospace',
                        fontSize: isMobile ? '0.65rem' : '0.75rem',
                        fontWeight: 600,
                        backgroundColor: bit === '1' ? `${layer.color}` : 'rgba(255,255,255,0.05)',
                        color: bit === '1' ? 'white' : 'text.disabled',
                        border: `1px solid ${bit === '1' ? layer.color : 'rgba(255,255,255,0.1)'}`
                      }}
                    >
                      {bit}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
              <Chip
                label={hexPart}
                size="small"
                sx={{
                  fontFamily: 'monospace',
                  backgroundColor: `${layer.color}30`,
                  color: layer.color,
                  fontWeight: 600,
                  fontSize: isMobile ? '0.65rem' : '0.75rem',
                  flexShrink: 0
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// Trait card component
const TraitCard: React.FC<{
  trait: TraitEvaluation;
  layerColor: string;
  expanded: boolean;
  onToggle: () => void;
  isMobile?: boolean;
}> = ({ trait, layerColor, expanded, onToggle, isMobile = false }) => {
  const { evaluation } = trait;

  return (
    <Paper
      sx={{
        mb: 1,
        overflow: 'hidden',
        border: `1px solid ${evaluation.applicable ? layerColor : 'rgba(255,255,255,0.1)'}40`,
        opacity: evaluation.applicable ? 1 : 0.7
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: isMobile ? 1 : 1.5,
          p: isMobile ? 1 : 1.5,
          cursor: 'pointer',
          backgroundColor: evaluation.applicable ? `${layerColor}10` : 'transparent',
          '&:hover': {
            backgroundColor: evaluation.applicable ? `${layerColor}20` : 'rgba(255,255,255,0.02)'
          }
        }}
      >
        {/* Bit number */}
        <Chip
          label={trait.bit}
          size="small"
          sx={{
            minWidth: 32,
            fontFamily: 'monospace',
            fontWeight: 600,
            fontSize: isMobile ? '0.7rem' : '0.8rem',
            backgroundColor: evaluation.applicable ? layerColor : 'rgba(255,255,255,0.1)',
            color: evaluation.applicable ? 'white' : 'text.secondary'
          }}
        />

        {/* Applicable indicator */}
        <Box
          sx={{
            width: isMobile ? 20 : 24,
            height: isMobile ? 20 : 24,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: evaluation.applicable ? '#4CAF50' : '#f44336',
            flexShrink: 0
          }}
        >
          {evaluation.applicable ? (
            <CheckIcon sx={{ fontSize: isMobile ? 12 : 16, color: 'white' }} />
          ) : (
            <CloseIcon sx={{ fontSize: isMobile ? 12 : 16, color: 'white' }} />
          )}
        </Box>

        {/* Trait name */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: 500,
            fontSize: isMobile ? '0.8rem' : '0.875rem',
            minWidth: isMobile ? '100px' : 'auto'
          }}
        >
          {trait.name}
        </Typography>

        {/* Confidence - simplified on mobile */}
        {isMobile ? (
          <Chip
            label={`${(evaluation.confidence * 100).toFixed(0)}%`}
            size="small"
            sx={{
              fontSize: '0.65rem',
              height: 20,
              backgroundColor: evaluation.confidence > 0.8 ? '#4CAF5030' :
                evaluation.confidence > 0.6 ? '#FF980030' : '#f4433630',
              color: evaluation.confidence > 0.8 ? '#4CAF50' :
                evaluation.confidence > 0.6 ? '#FF9800' : '#f44336'
            }}
          />
        ) : (
          <Tooltip title={`Confidence: ${(evaluation.confidence * 100).toFixed(0)}%`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
              <LinearProgress
                variant="determinate"
                value={evaluation.confidence * 100}
                sx={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: evaluation.confidence > 0.8 ? '#4CAF50' :
                      evaluation.confidence > 0.6 ? '#FF9800' : '#f44336',
                    borderRadius: 3
                  }
                }}
              />
              <Typography variant="caption" sx={{ minWidth: 35, textAlign: 'right' }}>
                {(evaluation.confidence * 100).toFixed(0)}%
              </Typography>
            </Box>
          </Tooltip>
        )}

        <IconButton size="small" sx={{ p: isMobile ? 0.5 : 1 }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: isMobile ? 1.5 : 2, pt: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 1.5, fontSize: isMobile ? '0.8rem' : '0.875rem' }}
          >
            <strong>Definition:</strong> {trait.expanded_definition || trait.short_description}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: isMobile ? '0.8rem' : '0.875rem' }}
          >
            <strong>Justification:</strong> {evaluation.justification}
          </Typography>
          {trait.url && (
            <Button
              size="small"
              href={trait.url}
              target="_blank"
              sx={{ mt: 1, minHeight: 36 }}
            >
              Learn More
            </Button>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

// Layer section component
const LayerSection: React.FC<{
  layer: typeof LAYERS[0];
  traits: TraitEvaluation[];
  expandedTraits: Set<number>;
  onToggleTrait: (bit: number) => void;
  isMobile?: boolean;
}> = ({ layer, traits, expandedTraits, onToggleTrait, isMobile = false }) => {
  const [expanded, setExpanded] = useState(true);
  const applicableCount = traits.filter(t => t.evaluation.applicable).length;

  return (
    <Paper sx={{ mb: 2, overflow: 'hidden', border: `1px solid ${layer.color}30` }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 1 : 2,
          p: isMobile ? 1.5 : 2,
          cursor: 'pointer',
          backgroundColor: `${layer.color}15`,
          '&:hover': { backgroundColor: `${layer.color}20` }
        }}
      >
        <Box
          sx={{
            width: isMobile ? 12 : 16,
            height: isMobile ? 12 : 16,
            borderRadius: '50%',
            backgroundColor: layer.color,
            flexShrink: 0
          }}
        />
        <Typography
          variant={isMobile ? 'subtitle1' : 'h6'}
          sx={{
            color: layer.color,
            fontWeight: 600,
            flex: 1,
            fontSize: isMobile ? '0.95rem' : '1.25rem'
          }}
        >
          {layer.name} Layer
        </Typography>
        <Chip
          label={`${applicableCount}/${traits.length}`}
          size="small"
          sx={{
            backgroundColor: `${layer.color}30`,
            color: layer.color,
            fontSize: isMobile ? '0.7rem' : '0.8rem'
          }}
        />
        <IconButton size="small" sx={{ color: layer.color, p: isMobile ? 0.5 : 1 }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: isMobile ? 1 : 2 }}>
          {traits.length === 0 ? (
            <Typography color="text.secondary">No traits evaluated for this layer</Typography>
          ) : (
            traits.map(trait => (
              <TraitCard
                key={trait.bit}
                trait={trait}
                layerColor={layer.color}
                expanded={expandedTraits.has(trait.bit)}
                onToggle={() => onToggleTrait(trait.bit)}
                isMobile={isMobile}
              />
            ))
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

// Similar Entities Card Component
const SimilarEntitiesCard: React.FC<{
  entities: any[];
  loading: boolean;
  onEntityClick: (uuid: string) => void;
}> = ({ entities, loading, onEntityClick }) => {
  const getDominantLayer = (uhtCode: string): string => {
    if (!uhtCode || uhtCode.length !== 8) return 'Physical';
    try {
      const physical = uhtCode.slice(0, 2);
      const functional = uhtCode.slice(2, 4);
      const abstract = uhtCode.slice(4, 6);
      const social = uhtCode.slice(6, 8);

      const counts: Record<string, number> = {
        Physical: (parseInt(physical, 16)).toString(2).split('1').length - 1,
        Functional: (parseInt(functional, 16)).toString(2).split('1').length - 1,
        Abstract: (parseInt(abstract, 16)).toString(2).split('1').length - 1,
        Social: (parseInt(social, 16)).toString(2).split('1').length - 1
      };

      return Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    } catch {
      return 'Physical';
    }
  };

  const getLayerColor = (layer: string): string => {
    const colors: Record<string, string> = {
      Physical: '#FF6B35',
      Functional: '#00E5FF',
      Abstract: '#9C27B0',
      Social: '#4CAF50'
    };
    return colors[layer] || '#FF6B35';
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SimilarIcon color="primary" />
          Similar Entities
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : entities.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No similar entities found (threshold: d≤4 Hamming distance)
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {entities.map((entity, index) => {
              const dominantLayer = getDominantLayer(entity.uht_code);
              const layerColor = getLayerColor(dominantLayer);

              return (
                <Paper
                  key={entity.uuid || index}
                  onClick={() => onEntityClick(entity.uuid)}
                  sx={{
                    p: 1.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    border: `1px solid ${layerColor}30`,
                    '&:hover': {
                      backgroundColor: `${layerColor}10`,
                      borderColor: `${layerColor}50`
                    },
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: layerColor,
                      flexShrink: 0
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {entity.name}
                  </Typography>
                  <Chip
                    label={entity.uht_code}
                    size="small"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      backgroundColor: `${layerColor}20`,
                      color: layerColor,
                      fontWeight: 600
                    }}
                  />
                  <Tooltip title={`Hamming distance: ${32 - entity.similarity_score} bits differ (${entity.similarity_score}/32 match)`}>
                    <Chip
                      label={`d=${32 - entity.similarity_score}`}
                      size="small"
                      sx={{
                        minWidth: 40,
                        backgroundColor: entity.similarity_score >= 30 ? '#4CAF5030' :
                                        entity.similarity_score >= 28 ? '#FF980030' : '#75757530',
                        color: entity.similarity_score >= 30 ? '#4CAF50' :
                               entity.similarity_score >= 28 ? '#FF9800' : '#757575',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem'
                      }}
                    />
                  </Tooltip>
                </Paper>
              );
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default function EntityDetails() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [entity, setEntity] = useState<EntityData | null>(null);
  const [allTraits, setAllTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedTraits, setExpandedTraits] = useState<Set<number>>(new Set());
  const [imageError, setImageError] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [similarEntities, setSimilarEntities] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const fetchEntity = async () => {
    if (!uuid) return;

    try {
      setLoading(true);
      const [entityData, traitsData] = await Promise.all([
        entityAPI.getEntity(uuid),
        traitsAPI.getAllTraits()
      ]);
      setEntity(entityData as unknown as EntityData);
      setAllTraits(traitsData.traits || []);
      setError(null);

      // Fetch similar entities in background
      setLoadingSimilar(true);
      try {
        const similarData = await entityAPI.findSimilarEntities(uuid, 28);
        setSimilarEntities(similarData.similar_entities?.slice(0, 10) || []);
      } catch (similarErr) {
        console.error('Failed to fetch similar entities:', similarErr);
        setSimilarEntities([]);
      } finally {
        setLoadingSimilar(false);
      }
    } catch (err) {
      console.error('Failed to fetch entity:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntity();
  }, [uuid]);

  const handleCopyCode = () => {
    if (entity) {
      navigator.clipboard.writeText(entity.uht_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateImage = async () => {
    if (!entity?.uuid) return;

    // Check if API key is configured
    const apiKey = getApiKey();
    if (!apiKey) {
      setImageGenError('API key required. Please configure your API key in Settings.');
      return;
    }

    setGeneratingImage(true);
    setImageGenError(null);

    try {
      const result = await imageAPI.generateImage({
        entity_uuid: entity.uuid,
        style: 'realistic'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate image');
      }

      // Refresh entity data to get the new image
      await fetchEntity();
      setImageError(false);
    } catch (err) {
      console.error('Image generation failed:', err);
      // Handle axios error format
      const errorMessage = (err as any)?.response?.data?.detail ||
                          (err instanceof Error ? err.message : 'Failed to generate image');
      setImageGenError(errorMessage);
    } finally {
      setGeneratingImage(false);
    }
  };

  const toggleTrait = (bit: number) => {
    setExpandedTraits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bit)) {
        newSet.delete(bit);
      } else {
        newSet.add(bit);
      }
      return newSet;
    });
  };

  const getTraitsByLayer = (layerName: string): TraitEvaluation[] => {
    if (!entity?.traits) return [];

    // Get trait info from allTraits and merge with evaluation from entity
    const layer = LAYERS.find(l => l.name === layerName);
    if (!layer) return [];

    return layer.bits.map(bit => {
      const entityTrait = entity.traits.find(t => t.bit === bit);
      const traitDef = allTraits.find(t => t.bit === bit);

      if (entityTrait) {
        return entityTrait;
      } else if (traitDef) {
        // Trait wasn't evaluated for this entity - show as inactive
        return {
          ...traitDef,
          evaluation: {
            applicable: false,
            confidence: 0,
            justification: 'Not evaluated'
          }
        };
      }
      return null;
    }).filter(Boolean) as TraitEvaluation[];
  };

  const getImageUrl = () => {
    if (!entity?.image_url) return null;
    if (entity.image_url.startsWith('data:')) return entity.image_url;
    if (entity.image_url.startsWith('http://') || entity.image_url.startsWith('https://')) return entity.image_url;
    return `${API_BASE_URL}${entity.image_url}`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !entity) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Entity not found'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </Box>
    );
  }

  const imageUrl = getImageUrl();
  const activeTraitCount = entity.traits?.filter(t => t.evaluation?.applicable).length || 0;
  const totalTraitCount = entity.traits?.length || 0;

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Paper sx={{ p: isCompact ? 1.5 : 2, borderRadius: 0, borderBottom: '1px solid rgba(0, 229, 255, 0.3)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: isCompact ? 1 : 2 }}>
          <IconButton onClick={() => navigate(-1)}>
            <BackIcon />
          </IconButton>
          <Typography variant={isCompact ? 'h6' : 'h5'} sx={{ flex: 1 }}>
            Entity Details
          </Typography>
          <IconButton onClick={fetchEntity}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Content */}
      <Box sx={{ p: isCompact ? 1.5 : 3, maxWidth: 1400, mx: 'auto' }}>
        <Grid container spacing={isCompact ? 2 : 3}>
          {/* Left Column - Entity Info */}
          <Grid size={{ xs: 12, md: 4 }}>
            {/* Image Card */}
            <Card sx={{ mb: isCompact ? 2 : 3 }}>
              <Box
                sx={{
                  height: isCompact ? 200 : 250,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  overflow: 'hidden'
                }}
              >
                {imageUrl && !imageError ? (
                  <img
                    src={imageUrl}
                    alt={entity.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    <ImageIcon sx={{ fontSize: 64, opacity: 0.5 }} />
                    <Typography variant="body2">No image available</Typography>
                  </Box>
                )}
              </Box>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  {entity.name}
                </Typography>

                {/* UHT Code */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CodeIcon color="primary" />
                  <Chip
                    label={entity.uht_code}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(0, 229, 255, 0.2)',
                      color: 'primary.main'
                    }}
                  />
                  <Tooltip title={copied ? 'Copied!' : 'Copy UHT Code'}>
                    <IconButton size="small" onClick={handleCopyCode}>
                      {copied ? <CheckIcon color="success" /> : <CopyIcon />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Generate Image">
                    <span>
                      <IconButton
                        size="small"
                        onClick={handleGenerateImage}
                        disabled={generatingImage}
                        sx={{ ml: 0.5 }}
                      >
                        {generatingImage ? (
                          <CircularProgress size={20} />
                        ) : (
                          <ImageIcon color="secondary" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>

                {/* Image generation error */}
                {imageGenError && (
                  <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImageGenError(null)}>
                    {imageGenError}
                  </Alert>
                )}

                {/* Stats */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip
                    icon={<TraitIcon />}
                    label={`${activeTraitCount}/${totalTraitCount} traits`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`v${entity.version}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                {/* Description */}
                <Typography variant="body2" color="text.secondary">
                  {entity.description}
                </Typography>
              </CardContent>
            </Card>

            {/* Binary Visualization */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CodeIcon color="primary" />
                  UHT Code Breakdown
                </Typography>
                <BinaryVisualization
                  binary={entity.binary_representation}
                  uhtCode={entity.uht_code}
                  isMobile={isCompact}
                />

                {/* Actions */}
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    startIcon={<SimilarIcon />}
                    variant="outlined"
                    onClick={() => navigate(`/graph?highlight=${entity.uuid}`)}
                  >
                    Find Similar
                  </Button>
                  <Button
                    size="small"
                    startIcon={<CopyIcon />}
                    variant="outlined"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(entity, null, 2));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    Copy JSON
                  </Button>
                </Box>
              </CardContent>
            </Card>

            {/* Similar Entities */}
            <SimilarEntitiesCard
              entities={similarEntities}
              loading={loadingSimilar}
              onEntityClick={(uuid) => navigate(`/entity/${uuid}`)}
            />
          </Grid>

          {/* Right Column - Traits */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Typography
              variant={isCompact ? 'subtitle1' : 'h6'}
              gutterBottom
              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <TraitIcon color="primary" />
              Trait Evaluations
            </Typography>
            {!isCompact && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Click on any trait to see the detailed evaluation and justification.
              </Typography>
            )}

            {LAYERS.map(layer => (
              <LayerSection
                key={layer.name}
                layer={layer}
                traits={getTraitsByLayer(layer.name)}
                expandedTraits={expandedTraits}
                onToggleTrait={toggleTrait}
                isMobile={isCompact}
              />
            ))}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
