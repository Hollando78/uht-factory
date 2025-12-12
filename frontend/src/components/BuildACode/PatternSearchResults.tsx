import { Box, Typography, List, ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar, Chip, CircularProgress, Alert, IconButton, Tooltip } from '@mui/material';
import { Add as AddIcon, OpenInNew as OpenIcon, Compare as CompareIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { LAYER_COLORS, getDominantLayer } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface PatternSearchResultsProps {
  results: UHTEntity[];
  loading: boolean;
  error: string | null;
  pattern: string;
  onAddToCollection?: (entity: UHTEntity) => void;
  onAddToComparison?: (entity: UHTEntity) => void;
  isCompact?: boolean;
}

export default function PatternSearchResults({
  results,
  loading,
  error,
  pattern,
  onAddToCollection,
  onAddToComparison,
  isCompact = false
}: PatternSearchResultsProps) {
  const navigate = useNavigate();

  // Calculate distance from pattern (treating X as matching)
  const getPatternDistance = (code: string) => {
    const binary = parseInt(code, 16).toString(2).padStart(32, '0');
    let distance = 0;
    for (let i = 0; i < 32; i++) {
      if (pattern[i] !== 'X' && pattern[i] !== binary[i]) {
        distance++;
      }
    }
    return distance;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
    );
  }

  // Check if pattern has any constraints
  const hasConstraints = pattern.includes('0') || pattern.includes('1');

  if (!hasConstraints) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Click on bits in the grid above to set constraints
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          Set at least one bit to ON (1) or OFF (0) to search
        </Typography>
      </Box>
    );
  }

  if (results.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No matching entities found
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          Try increasing the tolerance or changing constraints
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, flexShrink: 0 }}>
        {results.length} matching entit{results.length === 1 ? 'y' : 'ies'}
      </Typography>

      <List dense disablePadding sx={{ flex: 1, overflow: 'auto' }}>
        {results.map((entity) => {
          const dominantLayer = getDominantLayer(entity.uht_code);
          const layerColor = LAYER_COLORS[dominantLayer] || '#757575';
          const distance = getPatternDistance(entity.uht_code);

          return (
            <ListItem
              key={entity.uuid}
              disablePadding
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {onAddToComparison && (
                    <Tooltip title="Add to comparison">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToComparison(entity);
                        }}
                      >
                        <CompareIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {onAddToCollection && (
                    <Tooltip title="Add to collection">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCollection(entity);
                        }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Open entity">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/entity/${entity.uuid}`);
                      }}
                    >
                      <OpenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            >
              <ListItemButton
                onClick={() => navigate(`/entity/${entity.uuid}`)}
                sx={{
                  borderLeft: `3px solid ${layerColor}`,
                  '&:hover': { bgcolor: `${layerColor}15` }
                }}
              >
                <ListItemAvatar>
                  {entity.image_url ? (
                    <Avatar
                      src={entity.image_url}
                      alt={entity.name}
                      variant="rounded"
                      sx={{ width: isCompact ? 36 : 44, height: isCompact ? 36 : 44 }}
                    />
                  ) : (
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: isCompact ? 36 : 44,
                        height: isCompact ? 36 : 44,
                        bgcolor: `${layerColor}30`,
                        color: layerColor
                      }}
                    >
                      {entity.name[0]}
                    </Avatar>
                  )}
                </ListItemAvatar>
                <ListItemText
                  primary={entity.name}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        component="span"
                        variant="caption"
                        fontFamily="monospace"
                        color="primary.main"
                      >
                        {entity.uht_code}
                      </Typography>
                      <Chip
                        label={dominantLayer}
                        size="small"
                        sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          bgcolor: `${layerColor}30`,
                          color: layerColor
                        }}
                      />
                      {distance > 0 && (
                        <Chip
                          label={`${distance} diff`}
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: '0.6rem',
                            bgcolor: 'rgba(255,152,0,0.2)',
                            color: '#FF9800'
                          }}
                        />
                      )}
                    </Box>
                  }
                  primaryTypographyProps={{
                    variant: isCompact ? 'body2' : 'body1',
                    sx: {
                      fontWeight: 500
                    }
                  }}
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
