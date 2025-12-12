import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Psychology as TraitsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useMobile } from '../../context/MobileContext';

interface Trait {
  bit: number;
  name: string;
  layer: string;
  short_description: string;
  expanded_definition: string;
  url: string;
}

interface TraitsResponse {
  version: string;
  total_traits: number;
  layers: {
    [layerName: string]: Trait[];
  };
}

const layerColors: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF', 
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

const layerDescriptions: Record<string, string> = {
  Physical: 'Material existence and tangible properties (Bits 1-8)',
  Functional: 'Operational capabilities and purpose (Bits 9-16)', 
  Abstract: 'Conceptual and symbolic properties (Bits 17-24)',
  Social: 'Cultural and collective aspects (Bits 25-32)'
};

const API_BASE_URL = '';

// Trait Card Component
const TraitCard: React.FC<{
  trait: Trait;
}> = ({ trait }) => {
  return (
    <Card sx={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      border: `2px solid ${layerColors[trait.layer]}`,
      '&:hover': {
        boxShadow: `0 8px 24px ${layerColors[trait.layer]}20`,
        transform: 'translateY(-2px)'
      },
      transition: 'all 0.3s ease'
    }}>
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={`Bit ${trait.bit}`}
              size="small"
              sx={{
                backgroundColor: layerColors[trait.layer],
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.7rem'
              }}
            />
            <Chip
              label={trait.layer}
              size="small"
              variant="outlined"
              sx={{
                borderColor: layerColors[trait.layer],
                color: layerColors[trait.layer],
                fontSize: '0.7rem'
              }}
            />
          </Box>
          
          <Tooltip title="View canonical definition">
            <IconButton
              size="small"
              onClick={() => window.open(trait.url, '_blank')}
              sx={{ color: 'text.secondary' }}
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography variant="h6" component="h3" sx={{ 
          fontWeight: 'bold',
          mb: 1,
          color: layerColors[trait.layer],
          fontSize: '1rem'
        }}>
          {trait.name}
        </Typography>

        <Typography variant="body2" sx={{ 
          color: 'text.secondary',
          mb: 2,
          lineHeight: 1.4
        }}>
          {trait.short_description}
        </Typography>

        <Typography variant="body2" sx={{ 
          color: 'text.primary',
          fontSize: '0.85rem',
          lineHeight: 1.4
        }}>
          {trait.expanded_definition}
        </Typography>
      </CardContent>
    </Card>
  );
};

// Main Traits View Component
export default function TraitsView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [traits, setTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layerFilter, setLayerFilter] = useState<string>('');

  const fetchTraits = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/traits/`);
      if (!response.ok) {
        throw new Error(`Failed to fetch traits: ${response.statusText}`);
      }
      
      const data: TraitsResponse = await response.json();
      
      // Flatten traits from all layers
      const allTraits: Trait[] = [];
      Object.values(data.layers).forEach(layerTraits => {
        allTraits.push(...layerTraits);
      });
      
      // Sort by bit number
      allTraits.sort((a, b) => a.bit - b.bit);
      
      setTraits(allTraits);
      setError(null);
    } catch (err) {
      console.error('Traits fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load traits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraits();
  }, []);

  const filteredTraits = layerFilter
    ? traits.filter(trait => trait.layer === layerFilter)
    : traits;

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: isCompact ? 1.5 : 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{
        mb: isCompact ? 2 : 3,
        display: 'flex',
        alignItems: isCompact ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        flexDirection: isCompact ? 'column' : 'row',
        gap: isCompact ? 2 : 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: isCompact ? 1 : 2 }}>
          <TraitsIcon sx={{ fontSize: isCompact ? 24 : 32, color: 'primary.main' }} />
          <Box>
            <Typography
              variant={isCompact ? 'h6' : 'h4'}
              sx={{ fontWeight: 'bold', color: 'primary.main' }}
            >
              Canonical Traits
            </Typography>
            {!isCompact && (
              <Typography variant="body2" color="text.secondary">
                The 32 fundamental traits that define the Universal Hex Taxonomy
              </Typography>
            )}
          </Box>
        </Box>

        <FormControl size="small" sx={{ minWidth: isCompact ? 140 : 200 }}>
          <InputLabel sx={{ fontSize: isCompact ? '0.8rem' : '1rem' }}>
            {isCompact ? 'Layer' : 'Filter by Layer'}
          </InputLabel>
          <Select
            value={layerFilter}
            label={isCompact ? 'Layer' : 'Filter by Layer'}
            onChange={(e) => setLayerFilter(e.target.value)}
            sx={{ fontSize: isCompact ? '0.85rem' : '1rem' }}
          >
            <MenuItem value="">All ({traits.length})</MenuItem>
            {Object.keys(layerColors).map(layer => (
              <MenuItem key={layer} value={layer}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: layerColors[layer]
                    }}
                  />
                  {isCompact ? layer : `${layer} (${traits.filter(t => t.layer === layer).length})`}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Layer Legend - simplified on mobile */}
      {!layerFilter && (
        <Box sx={{ mb: isCompact ? 2 : 3 }}>
          {!isCompact && (
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>
              Layers Overview
            </Typography>
          )}
          <Grid container spacing={isCompact ? 1 : 2}>
            {Object.entries(layerDescriptions).map(([layer, description]) => (
              <Grid size={{ xs: 6, sm: 6, md: 3 }} key={layer}>
                <Card sx={{
                  border: `2px solid ${layerColors[layer]}`,
                  backgroundColor: `${layerColors[layer]}10`
                }}>
                  <CardContent sx={{ p: isCompact ? 1 : 2 }}>
                    <Typography
                      variant={isCompact ? 'body2' : 'subtitle1'}
                      sx={{
                        fontWeight: 'bold',
                        color: layerColors[layer],
                        mb: isCompact ? 0 : 1
                      }}
                    >
                      {layer}
                    </Typography>
                    {!isCompact && (
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Traits Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography>Loading traits...</Typography>
        </Box>
      ) : (
        <Grid container spacing={isCompact ? 1.5 : 3}>
          {filteredTraits.map((trait) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={trait.bit}>
              <TraitCard trait={trait} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}