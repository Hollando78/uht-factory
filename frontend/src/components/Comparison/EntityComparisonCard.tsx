import { Box, Card, CardContent, Typography, Avatar, IconButton, Chip, Tooltip } from '@mui/material';
import { Close as CloseIcon, OpenInNew as OpenIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { LAYER_COLORS, getDominantLayer, getLayerCounts } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface EntityComparisonCardProps {
  entity: UHTEntity;
  index: number;
  onRemove: () => void;
  isCompact?: boolean;
}

const ENTITY_COLORS = ['#00E5FF', '#FF6B35', '#9C27B0', '#4CAF50'];

export default function EntityComparisonCard({
  entity,
  index,
  onRemove,
  isCompact = false
}: EntityComparisonCardProps) {
  const navigate = useNavigate();
  const dominantLayer = getDominantLayer(entity.uht_code);
  const layerColor = LAYER_COLORS[dominantLayer] || '#757575';
  const cardColor = ENTITY_COLORS[index % ENTITY_COLORS.length];
  const layerCounts = getLayerCounts(entity.uht_code);
  const totalTraits = layerCounts.reduce((sum, c) => sum + c, 0);

  return (
    <Card
      sx={{
        position: 'relative',
        borderTop: `3px solid ${cardColor}`,
        '&:hover .remove-btn': { opacity: 1 }
      }}
    >
      <IconButton
        className="remove-btn"
        size="small"
        onClick={onRemove}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          opacity: 0,
          transition: 'opacity 0.2s',
          bgcolor: 'background.paper',
          '&:hover': { bgcolor: 'error.dark' }
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {/* Image */}
          {entity.image_url ? (
            <Avatar
              src={entity.image_url}
              alt={entity.name}
              variant="rounded"
              sx={{
                width: isCompact ? 48 : 64,
                height: isCompact ? 48 : 64,
                border: `2px solid ${cardColor}`
              }}
            />
          ) : (
            <Avatar
              variant="rounded"
              sx={{
                width: isCompact ? 48 : 64,
                height: isCompact ? 48 : 64,
                bgcolor: `${cardColor}30`,
                color: cardColor,
                fontSize: isCompact ? '1.25rem' : '1.5rem'
              }}
            >
              {entity.name[0]}
            </Avatar>
          )}

          {/* Info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant={isCompact ? 'body2' : 'subtitle1'}
                sx={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {entity.name}
              </Typography>
              <Tooltip title="Open entity details">
                <IconButton
                  size="small"
                  onClick={() => navigate(`/entity/${entity.uuid}`)}
                  sx={{ p: 0.25 }}
                >
                  <OpenIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>

            <Typography
              variant="caption"
              color="primary.main"
              fontFamily="monospace"
              sx={{ display: 'block', mb: 0.5 }}
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
                  bgcolor: `${layerColor}30`,
                  color: layerColor
                }}
              />
              <Chip
                label={`${totalTraits} traits`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  bgcolor: 'rgba(255,255,255,0.1)'
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Layer breakdown */}
        <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5 }}>
          {['Physical', 'Functional', 'Abstract', 'Social'].map((layer, i) => (
            <Box
              key={layer}
              sx={{
                flex: 1,
                textAlign: 'center',
                py: 0.5,
                borderRadius: 0.5,
                bgcolor: `${LAYER_COLORS[layer]}20`,
                borderBottom: `2px solid ${LAYER_COLORS[layer]}`
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontSize: '0.6rem',
                  color: LAYER_COLORS[layer],
                  fontWeight: 500
                }}
              >
                {layer[0]}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {layerCounts[i]}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
