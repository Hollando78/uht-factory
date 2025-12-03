import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  Tooltip,
  IconButton,
  Divider,
  CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Category as MetaClassIcon,
  Info as InfoIcon,
  Hub as HubIcon,
  AutoAwesome as EmergentIcon,
  TipsAndUpdates as InsightIcon
} from '@mui/icons-material';

interface MetaClass {
  id: string;
  layer: string;
  hex: string;
  binary: string;
  active_bits: number[];
  trait_names: string[];
  name: string;
  description: string;
  frequency_percent: number;
  entity_count: number;
}

interface CrossDomainMetaClass {
  id: string;
  uht_code: string;
  layers: {
    physical: { hex: string; traits: string[] };
    functional: { hex: string; traits: string[] };
    abstract: { hex: string; traits: string[] };
    social: { hex: string; traits: string[] };
  };
  name: string;
  description: string;
  frequency_percent: number;
  entity_count: number;
}

interface EmergentMetaClass {
  id: string;
  type: 'rare_trait' | 'cross_layer_correlation' | 'layer_pattern' | 'distribution_edge';
  name: string;
  description: string;
  defining_traits: string[];
  anti_traits?: string[];
  entity_count: number;
  examples: string[];
  insight: string;
}

interface MetaClassesResponse {
  version: string;
  generated_at: string;
  threshold_percent: number;
  total_meta_classes: number;
  meta_classes: MetaClass[];
  cross_domain?: CrossDomainMetaClass[];
  emergent?: EmergentMetaClass[];
}

const layerColors: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

const emergentTypeColors: Record<string, { bg: string; border: string; text: string }> = {
  rare_trait: { bg: '#FFD70010', border: '#FFD700', text: '#FFD700' },
  cross_layer_correlation: { bg: '#E040FB10', border: '#E040FB', text: '#E040FB' },
  layer_pattern: { bg: '#00BCD410', border: '#00BCD4', text: '#00BCD4' },
  distribution_edge: { bg: '#FF572210', border: '#FF5722', text: '#FF5722' }
};

const emergentTypeLabels: Record<string, string> = {
  rare_trait: 'Rare Trait',
  cross_layer_correlation: 'Cross-Layer',
  layer_pattern: 'Layer Pattern',
  distribution_edge: 'Distribution Edge'
};

const API_BASE_URL = 'http://localhost:8100';

// Meta-Class Card Component
const MetaClassCard: React.FC<{ metaClass: MetaClass }> = ({ metaClass }) => {
  return (
    <Card sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: `2px solid ${layerColors[metaClass.layer]}`,
      background: `linear-gradient(135deg, ${layerColors[metaClass.layer]}08 0%, transparent 100%)`,
      '&:hover': {
        boxShadow: `0 8px 24px ${layerColors[metaClass.layer]}30`,
        transform: 'translateY(-2px)'
      },
      transition: 'all 0.3s ease'
    }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={metaClass.hex}
              size="small"
              sx={{
                backgroundColor: layerColors[metaClass.layer],
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                fontFamily: 'monospace'
              }}
            />
          </Box>
          <Chip
            label={`${metaClass.frequency_percent.toFixed(1)}%`}
            size="small"
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'text.secondary',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}
          />
        </Box>

        <Typography variant="h6" sx={{
          fontWeight: 'bold',
          mb: 1,
          color: layerColors[metaClass.layer],
          fontSize: '1rem'
        }}>
          {metaClass.name}
        </Typography>

        <Typography variant="body2" sx={{
          color: 'text.secondary',
          mb: 2,
          lineHeight: 1.5,
          fontSize: '0.8rem',
          minHeight: 60
        }}>
          {metaClass.description}
        </Typography>

        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Binary: <code style={{ color: layerColors[metaClass.layer] }}>{metaClass.binary}</code>
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Entities: <strong>{metaClass.entity_count.toLocaleString()}</strong>
          </Typography>
        </Box>

        {metaClass.trait_names.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {metaClass.trait_names.slice(0, 4).map((name, idx) => (
              <Chip
                key={idx}
                label={name}
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  backgroundColor: `${layerColors[metaClass.layer]}20`,
                  color: layerColors[metaClass.layer],
                  border: `1px solid ${layerColors[metaClass.layer]}40`
                }}
              />
            ))}
            {metaClass.trait_names.length > 4 && (
              <Chip
                label={`+${metaClass.trait_names.length - 4}`}
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: 'text.secondary'
                }}
              />
            )}
          </Box>
        )}

        {metaClass.trait_names.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
            No traits active
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Cross-Domain Meta-Class Card
const CrossDomainCard: React.FC<{ metaClass: CrossDomainMetaClass }> = ({ metaClass }) => {
  return (
    <Card sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: '2px solid',
      borderImage: 'linear-gradient(135deg, #FF6B35, #00E5FF, #9C27B0, #4CAF50) 1',
      background: 'linear-gradient(135deg, rgba(255,107,53,0.05) 0%, rgba(0,229,255,0.05) 25%, rgba(156,39,176,0.05) 50%, rgba(76,175,80,0.05) 75%, transparent 100%)',
      '&:hover': {
        boxShadow: '0 8px 24px rgba(0, 229, 255, 0.3)',
        transform: 'translateY(-2px)'
      },
      transition: 'all 0.3s ease'
    }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Chip
            label={metaClass.uht_code}
            size="small"
            sx={{
              background: 'linear-gradient(90deg, #FF6B35, #00E5FF, #9C27B0, #4CAF50)',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              letterSpacing: 1
            }}
          />
          <Chip
            label={`${metaClass.frequency_percent.toFixed(1)}%`}
            size="small"
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'text.secondary',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}
          />
        </Box>

        <Typography variant="h6" sx={{
          fontWeight: 'bold',
          mb: 1,
          color: 'primary.main',
          fontSize: '1rem'
        }}>
          {metaClass.name}
        </Typography>

        <Typography variant="body2" sx={{
          color: 'text.secondary',
          mb: 2,
          lineHeight: 1.5,
          fontSize: '0.8rem',
          minHeight: 40
        }}>
          {metaClass.description}
        </Typography>

        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          Entities: <strong>{metaClass.entity_count.toLocaleString()}</strong>
        </Typography>

        {/* Layer breakdown */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {Object.entries(metaClass.layers).map(([layer, data]) => (
            <Tooltip key={layer} title={data.traits.join(', ') || 'No traits'}>
              <Chip
                label={data.hex}
                size="small"
                sx={{
                  fontSize: '0.65rem',
                  height: 18,
                  fontFamily: 'monospace',
                  backgroundColor: `${layerColors[layer.charAt(0).toUpperCase() + layer.slice(1)]}30`,
                  color: layerColors[layer.charAt(0).toUpperCase() + layer.slice(1)],
                  border: `1px solid ${layerColors[layer.charAt(0).toUpperCase() + layer.slice(1)]}60`
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

// Emergent Meta-Class Card
const EmergentCard: React.FC<{ metaClass: EmergentMetaClass }> = ({ metaClass }) => {
  const colors = emergentTypeColors[metaClass.type] || emergentTypeColors.rare_trait;
  const typeLabel = emergentTypeLabels[metaClass.type] || metaClass.type;

  return (
    <Card sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: `2px solid ${colors.border}`,
      background: colors.bg,
      '&:hover': {
        boxShadow: `0 8px 24px ${colors.border}40`,
        transform: 'translateY(-2px)'
      },
      transition: 'all 0.3s ease'
    }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Chip
            label={typeLabel}
            size="small"
            sx={{
              backgroundColor: `${colors.border}30`,
              color: colors.text,
              fontWeight: 'bold',
              fontSize: '0.7rem',
              border: `1px solid ${colors.border}`
            }}
          />
          <Chip
            label={`${metaClass.entity_count.toLocaleString()} entities`}
            size="small"
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'text.secondary',
              fontSize: '0.7rem'
            }}
          />
        </Box>

        <Typography variant="h6" sx={{
          fontWeight: 'bold',
          mb: 1,
          color: colors.text,
          fontSize: '1rem'
        }}>
          {metaClass.name}
        </Typography>

        <Typography variant="body2" sx={{
          color: 'text.secondary',
          mb: 2,
          lineHeight: 1.5,
          fontSize: '0.8rem',
          minHeight: 50
        }}>
          {metaClass.description}
        </Typography>

        {/* Defining Traits */}
        {metaClass.defining_traits.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Defining Traits:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {metaClass.defining_traits.map((trait, idx) => (
                <Chip
                  key={idx}
                  label={trait}
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 18,
                    backgroundColor: `${colors.border}25`,
                    color: colors.text,
                    border: `1px solid ${colors.border}50`
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Anti-Traits */}
        {metaClass.anti_traits && metaClass.anti_traits.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Anti-Traits (absent):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {metaClass.anti_traits.map((trait, idx) => (
                <Chip
                  key={idx}
                  label={trait}
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 18,
                    backgroundColor: 'rgba(255, 82, 82, 0.15)',
                    color: '#FF5252',
                    border: '1px solid rgba(255, 82, 82, 0.3)',
                    textDecoration: 'line-through'
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Examples */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Examples:
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.primary', fontStyle: 'italic' }}>
            {metaClass.examples.slice(0, 3).join(', ')}
            {metaClass.examples.length > 3 && ` +${metaClass.examples.length - 3} more`}
          </Typography>
        </Box>

        {/* Insight */}
        <Divider sx={{ my: 1.5, borderColor: `${colors.border}30` }} />
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <InsightIcon sx={{ fontSize: 16, color: colors.text, mt: 0.3 }} />
          <Typography variant="caption" sx={{
            color: colors.text,
            fontWeight: 500,
            lineHeight: 1.4,
            fontSize: '0.75rem'
          }}>
            {metaClass.insight}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

// Main Meta-Classes View Component
export default function MetaClassesView() {
  const [metaClasses, setMetaClasses] = useState<MetaClass[]>([]);
  const [crossDomain, setCrossDomain] = useState<CrossDomainMetaClass[]>([]);
  const [emergent, setEmergent] = useState<EmergentMetaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetaClasses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/traits/meta-classes`);
      if (!response.ok) {
        throw new Error(`Failed to fetch meta-classes: ${response.statusText}`);
      }
      const data: MetaClassesResponse = await response.json();
      setMetaClasses(data.meta_classes);
      setCrossDomain(data.cross_domain || []);
      setEmergent(data.emergent || []);
      setError(null);
    } catch (err) {
      console.error('Meta-classes fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meta-classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetaClasses();
  }, []);

  // Get top 8 per layer
  const getTopByLayer = (layer: string) => {
    return metaClasses
      .filter(mc => mc.layer === layer)
      .sort((a, b) => b.frequency_percent - a.frequency_percent)
      .slice(0, 8);
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <MetaClassIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            Meta-Classes
          </Typography>
          <Tooltip title="Meta-classes are emergent archetypes representing frequently occurring trait combination patterns across classified entities. They help identify common entity types in the taxonomy.">
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
              <InfoIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Emergent archetypes from frequently occurring trait combinations (patterns above 5% frequency)
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Cross-Domain Meta-Classes */}
          {crossDomain.length > 0 && (
            <Box sx={{ mb: 5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <HubIcon sx={{ color: 'primary.main' }} />
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                  Cross-Domain Archetypes
                </Typography>
                <Chip
                  label={crossDomain.length}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(0, 229, 255, 0.2)',
                    color: 'primary.main',
                    fontWeight: 'bold'
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Complete 32-bit UHT patterns that occur frequently across all four layers
              </Typography>
              <Grid container spacing={2}>
                {crossDomain.slice(0, 8).map((mc) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={mc.id}>
                    <CrossDomainCard metaClass={mc} />
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ mt: 4, borderColor: 'rgba(0, 229, 255, 0.2)' }} />
            </Box>
          )}

          {/* Emergent Meta-Classes */}
          {emergent.length > 0 && (
            <Box sx={{ mb: 5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <EmergentIcon sx={{ color: '#FFD700' }} />
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#FFD700' }}>
                  Emergent Patterns
                </Typography>
                <Chip
                  label={emergent.length}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(255, 215, 0, 0.2)',
                    color: '#FFD700',
                    fontWeight: 'bold'
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Discovered patterns from graph analysis: rare traits, cross-layer correlations, and distribution edges
              </Typography>
              <Grid container spacing={2}>
                {emergent.map((mc) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={mc.id}>
                    <EmergentCard metaClass={mc} />
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ mt: 4, borderColor: 'rgba(255, 215, 0, 0.2)' }} />
            </Box>
          )}

          {/* Layer-specific Meta-Classes */}
          {['Physical', 'Functional', 'Abstract', 'Social'].map(layer => {
            const layerMetaClasses = getTopByLayer(layer);
            if (layerMetaClasses.length === 0) return null;

            return (
              <Box key={layer} sx={{ mb: 5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <Box sx={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: layerColors[layer],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                      {layer.charAt(0)}
                    </Typography>
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold', color: layerColors[layer] }}>
                    {layer} Layer
                  </Typography>
                  <Chip
                    label={`Top ${layerMetaClasses.length}`}
                    size="small"
                    sx={{
                      backgroundColor: `${layerColors[layer]}20`,
                      color: layerColors[layer],
                      fontWeight: 'bold'
                    }}
                  />
                </Box>
                <Grid container spacing={2}>
                  {layerMetaClasses.map((mc) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={mc.id}>
                      <MetaClassCard metaClass={mc} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
