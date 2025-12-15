import { Box, Typography, Chip, Skeleton, LinearProgress } from '@mui/material';
import { Link } from 'react-router-dom';
import type { UHTEntity } from '../../types';

const LAYER_COLORS: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

const LAYER_ORDER = ['Physical', 'Functional', 'Abstract', 'Social'];

interface CompactEntityViewProps {
  entity: UHTEntity | null;
  loading?: boolean;
}

function getDominantLayer(entity: UHTEntity): string {
  if (!entity.layers) return 'Unknown';

  const layerCounts: Record<string, number> = {};
  for (const [layer, hexValue] of Object.entries(entity.layers)) {
    try {
      layerCounts[layer] = hexValue.split('').reduce((count, char) => {
        return count + parseInt(char, 16).toString(2).split('1').length - 1;
      }, 0);
    } catch {
      layerCounts[layer] = 0;
    }
  }

  let dominant = 'Physical';
  let maxCount = 0;
  for (const [layer, count] of Object.entries(layerCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = layer;
    }
  }
  return dominant;
}

function getLayerBitCounts(entity: UHTEntity): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!entity.binary_representation) {
    return { Physical: 0, Functional: 0, Abstract: 0, Social: 0 };
  }

  const binary = entity.binary_representation.padStart(32, '0');
  counts.Physical = binary.slice(0, 8).split('1').length - 1;
  counts.Functional = binary.slice(8, 16).split('1').length - 1;
  counts.Abstract = binary.slice(16, 24).split('1').length - 1;
  counts.Social = binary.slice(24, 32).split('1').length - 1;

  return counts;
}

export default function CompactEntityView({ entity, loading }: CompactEntityViewProps) {
  if (loading) {
    return (
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Skeleton variant="rectangular" width={80} height={80} sx={{ borderRadius: 1 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="80%" height={24} />
            <Skeleton variant="text" width="60%" height={20} />
            <Skeleton variant="text" width="40%" height={20} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (!entity) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Entity not found
        </Typography>
      </Box>
    );
  }

  const dominantLayer = getDominantLayer(entity);
  const layerCounts = getLayerBitCounts(entity);
  const totalBits = Object.values(layerCounts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ p: 1.5 }}>
      {/* Main content row */}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {/* Image */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'rgba(255,255,255,0.05)',
            flexShrink: 0
          }}
        >
          {entity.image_url ? (
            <img
              src={entity.image_url}
              alt={entity.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                color: 'text.secondary'
              }}
            >
              {entity.name?.[0] || '?'}
            </Box>
          )}
        </Box>

        {/* Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {entity.name}
          </Typography>

          <Typography
            variant="caption"
            color="primary"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              display: 'block',
              mb: 0.5
            }}
          >
            {entity.uht_code}
          </Typography>

          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={dominantLayer}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                bgcolor: LAYER_COLORS[dominantLayer],
                color: dominantLayer === 'Functional' ? '#000' : '#fff'
              }}
            />
            <Chip
              label={`${totalBits} traits`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          </Box>
        </Box>
      </Box>

      {/* Layer bars */}
      <Box sx={{ mt: 1.5 }}>
        {LAYER_ORDER.map(layer => (
          <Box key={layer} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                width: 60,
                fontSize: '0.6rem',
                color: 'text.secondary'
              }}
            >
              {layer}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(layerCounts[layer] / 8) * 100}
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: LAYER_COLORS[layer],
                  borderRadius: 3
                }
              }}
            />
            <Typography
              variant="caption"
              sx={{
                width: 16,
                fontSize: '0.6rem',
                color: 'text.secondary',
                textAlign: 'right'
              }}
            >
              {layerCounts[layer]}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* View details link */}
      <Box sx={{ mt: 1.5, textAlign: 'center' }}>
        <Link
          to={`/entity/${entity.uuid}`}
          style={{
            color: '#00e5ff',
            fontSize: '0.75rem',
            textDecoration: 'none'
          }}
        >
          View full details →
        </Link>
      </Box>
    </Box>
  );
}
