import { Box, Typography, Tooltip } from '@mui/material';
import { useMemo } from 'react';
import { uhtToBinary, LAYERS } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface BinaryOverlayProps {
  entities: UHTEntity[];
  isCompact?: boolean;
}

const ENTITY_COLORS = ['#00E5FF', '#FF6B35', '#9C27B0', '#4CAF50'];

export default function BinaryOverlay({ entities, isCompact = false }: BinaryOverlayProps) {
  // Convert all entity codes to binary
  const entityBinaries = useMemo(() => {
    return entities.map(e => uhtToBinary(e.uht_code));
  }, [entities]);

  // Calculate bit-by-bit analysis
  const bitAnalysis = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const values = entityBinaries.map(binary => binary[i] === '1');
      const activeCount = values.filter(Boolean).length;

      return {
        bit: i + 1,
        values,
        activeCount,
        allActive: activeCount === entities.length,
        noneActive: activeCount === 0,
        percentage: (activeCount / entities.length) * 100
      };
    });
  }, [entityBinaries, entities.length]);

  const getBitColor = (analysis: typeof bitAnalysis[0]) => {
    if (analysis.allActive) return '#4CAF50'; // All have it
    if (analysis.noneActive) return 'rgba(255,255,255,0.1)'; // None have it
    // Gradient based on percentage
    const intensity = analysis.percentage / 100;
    return `rgba(255, 152, 0, ${0.3 + intensity * 0.7})`;
  };

  return (
    <Box>
      {/* Main Binary Grid - 4 rows x 8 cols */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {LAYERS.map((layer, layerIndex) => (
          <Box key={layer.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Layer Label */}
            <Typography
              variant="caption"
              sx={{
                width: isCompact ? 16 : 24,
                color: layer.color,
                fontWeight: 700,
                fontSize: isCompact ? '0.65rem' : '0.75rem'
              }}
            >
              {layer.name[0]}
            </Typography>

            {/* Bits for this layer */}
            <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
              {Array.from({ length: 8 }, (_, bitIndex) => {
                const globalBitIndex = layerIndex * 8 + bitIndex;
                const analysis = bitAnalysis[globalBitIndex];

                return (
                  <Tooltip
                    key={bitIndex}
                    title={
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Bit {analysis.bit} ({layer.name})
                        </Typography>
                        <br />
                        {entities.map((entity, i) => (
                          <Typography key={entity.uuid} variant="caption" sx={{ display: 'block' }}>
                            {entity.name}: {analysis.values[i] ? '1' : '0'}
                          </Typography>
                        ))}
                      </Box>
                    }
                  >
                    <Box
                      sx={{
                        flex: 1,
                        aspectRatio: '1',
                        maxWidth: isCompact ? 28 : 40,
                        bgcolor: getBitColor(analysis),
                        borderRadius: 0.5,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: analysis.allActive || analysis.noneActive
                          ? 'none'
                          : '1px dashed rgba(255,255,255,0.3)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                        '&:hover': {
                          transform: 'scale(1.1)',
                          zIndex: 1
                        }
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: isCompact ? '0.6rem' : '0.7rem',
                          color: analysis.allActive ? 'white' : 'text.secondary'
                        }}
                      >
                        {analysis.activeCount}/{entities.length}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Entity Binary Codes */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Individual Codes
        </Typography>
        {entities.map((entity, entityIndex) => {
          const binary = entityBinaries[entityIndex];
          return (
            <Box
              key={entity.uuid}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 0.5
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ENTITY_COLORS[entityIndex % ENTITY_COLORS.length],
                  flexShrink: 0
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  width: isCompact ? 60 : 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {entity.name}
              </Typography>
              <Box sx={{ display: 'flex', flex: 1, fontFamily: 'monospace' }}>
                {LAYERS.map((layer, layerIndex) => (
                  <Typography
                    key={layer.name}
                    variant="caption"
                    sx={{
                      color: layer.color,
                      letterSpacing: '1px',
                      fontSize: isCompact ? '0.6rem' : '0.7rem',
                      mr: 0.5
                    }}
                  >
                    {binary.slice(layerIndex * 8, (layerIndex + 1) * 8)}
                  </Typography>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Consensus Code */}
      <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Consensus (bits active in all entities)
        </Typography>
        <Box sx={{ display: 'flex', fontFamily: 'monospace' }}>
          {LAYERS.map((layer, layerIndex) => (
            <Typography
              key={layer.name}
              variant="body2"
              sx={{
                color: layer.color,
                letterSpacing: '2px',
                fontWeight: 600,
                mr: 1
              }}
            >
              {bitAnalysis
                .slice(layerIndex * 8, (layerIndex + 1) * 8)
                .map(b => b.allActive ? '1' : '0')
                .join('')}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
