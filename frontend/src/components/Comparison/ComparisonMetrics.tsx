import { Box, Typography, Tooltip } from '@mui/material';
import { useMemo } from 'react';
import { hammingDistance, jaccardSimilarity, getActiveTraitBits, getLayerCounts } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface ComparisonMetricsProps {
  entities: UHTEntity[];
  isCompact?: boolean;
}

const ENTITY_COLORS = ['#00E5FF', '#FF6B35', '#9C27B0', '#4CAF50'];

export default function ComparisonMetrics({ entities, isCompact = false }: ComparisonMetricsProps) {
  // Calculate pairwise metrics
  const pairwiseMetrics = useMemo(() => {
    const metrics: Array<{
      entity1: UHTEntity;
      entity2: UHTEntity;
      index1: number;
      index2: number;
      hamming: number;
      jaccard: number;
    }> = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        metrics.push({
          entity1: entities[i],
          entity2: entities[j],
          index1: i,
          index2: j,
          hamming: hammingDistance(entities[i].uht_code, entities[j].uht_code),
          jaccard: jaccardSimilarity(entities[i].uht_code, entities[j].uht_code)
        });
      }
    }

    return metrics;
  }, [entities]);

  // Calculate aggregate stats
  const aggregateStats = useMemo(() => {
    const allBits = entities.map(e => new Set(getActiveTraitBits(e.uht_code)));

    // Find shared traits (intersection)
    let sharedBits = new Set(allBits[0]);
    for (let i = 1; i < allBits.length; i++) {
      sharedBits = new Set([...sharedBits].filter(bit => allBits[i].has(bit)));
    }

    // Find union of all traits
    const unionBits = new Set(allBits.flatMap(s => [...s]));

    // Average traits per entity
    const avgTraits = entities.reduce((sum, e) => {
      return sum + getActiveTraitBits(e.uht_code).length;
    }, 0) / entities.length;

    // Layer distribution
    const layerDistributions = entities.map(e => getLayerCounts(e.uht_code));

    return {
      sharedCount: sharedBits.size,
      unionCount: unionBits.size,
      avgTraits: avgTraits.toFixed(1),
      avgHamming: pairwiseMetrics.length > 0
        ? (pairwiseMetrics.reduce((sum, m) => sum + m.hamming, 0) / pairwiseMetrics.length).toFixed(1)
        : '0',
      avgJaccard: pairwiseMetrics.length > 0
        ? (pairwiseMetrics.reduce((sum, m) => sum + m.jaccard, 0) / pairwiseMetrics.length * 100).toFixed(0)
        : '0',
      layerDistributions
    };
  }, [entities, pairwiseMetrics]);

  const getHammingColor = (distance: number) => {
    // 0 = green (identical), 32 = red (completely different)
    const ratio = distance / 32;
    if (ratio < 0.2) return '#4CAF50';
    if (ratio < 0.4) return '#8BC34A';
    if (ratio < 0.6) return '#FFC107';
    if (ratio < 0.8) return '#FF9800';
    return '#F44336';
  };

  const getJaccardColor = (similarity: number) => {
    // 1 = green (identical), 0 = red (no overlap)
    if (similarity > 0.8) return '#4CAF50';
    if (similarity > 0.6) return '#8BC34A';
    if (similarity > 0.4) return '#FFC107';
    if (similarity > 0.2) return '#FF9800';
    return '#F44336';
  };

  return (
    <Box>
      {/* Summary Stats */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: 2,
          mb: 3
        }}
      >
        <StatCard
          label="Shared Traits"
          value={aggregateStats.sharedCount.toString()}
          subtitle={`of ${aggregateStats.unionCount} total`}
          color="#4CAF50"
          isCompact={isCompact}
        />
        <StatCard
          label="Avg Traits"
          value={aggregateStats.avgTraits}
          subtitle="per entity"
          color="#00E5FF"
          isCompact={isCompact}
        />
        <StatCard
          label="Avg Distance"
          value={aggregateStats.avgHamming}
          subtitle="Hamming bits"
          color="#FF9800"
          isCompact={isCompact}
        />
        <StatCard
          label="Avg Similarity"
          value={`${aggregateStats.avgJaccard}%`}
          subtitle="Jaccard index"
          color="#9C27B0"
          isCompact={isCompact}
        />
      </Box>

      {/* Pairwise Distance Matrix */}
      {entities.length > 2 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
            Distance Matrix (Hamming)
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `auto repeat(${entities.length}, 1fr)`,
              gap: 0.5
            }}
          >
            {/* Header row */}
            <Box /> {/* Empty corner */}
            {entities.map((entity, i) => (
              <Tooltip key={entity.uuid} title={entity.name}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 0.5
                  }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: ENTITY_COLORS[i % ENTITY_COLORS.length]
                    }}
                  />
                </Box>
              </Tooltip>
            ))}

            {/* Data rows */}
            {entities.map((rowEntity, i) => (
              <>
                <Tooltip key={`label-${rowEntity.uuid}`} title={rowEntity.name}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 0.5
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: ENTITY_COLORS[i % ENTITY_COLORS.length]
                      }}
                    />
                  </Box>
                </Tooltip>
                {entities.map((colEntity, j) => {
                  const distance = i === j ? 0 : hammingDistance(rowEntity.uht_code, colEntity.uht_code);
                  return (
                    <Tooltip
                      key={`${rowEntity.uuid}-${colEntity.uuid}`}
                      title={i === j ? 'Same entity' : `${rowEntity.name} ↔ ${colEntity.name}: ${distance} bits`}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          p: 1,
                          bgcolor: i === j ? 'rgba(255,255,255,0.05)' : getHammingColor(distance),
                          borderRadius: 0.5,
                          minHeight: 36
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 600,
                            color: i === j ? 'text.disabled' : 'black'
                          }}
                        >
                          {i === j ? '—' : distance}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </>
            ))}
          </Box>
        </Box>
      )}

      {/* Pairwise Details (for 2 entities or small lists) */}
      {pairwiseMetrics.length > 0 && pairwiseMetrics.length <= 6 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
            Pairwise Comparison
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {pairwiseMetrics.map((metric) => (
              <Box
                key={`${metric.entity1.uuid}-${metric.entity2.uuid}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 1.5,
                  bgcolor: 'rgba(255,255,255,0.03)',
                  borderRadius: 1
                }}
              >
                {/* Entity indicators */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 60 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: ENTITY_COLORS[metric.index1 % ENTITY_COLORS.length]
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">↔</Typography>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: ENTITY_COLORS[metric.index2 % ENTITY_COLORS.length]
                    }}
                  />
                </Box>

                {/* Names */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {metric.entity1.name} vs {metric.entity2.name}
                  </Typography>
                </Box>

                {/* Metrics */}
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Tooltip title="Hamming distance (bits that differ)">
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: getHammingColor(metric.hamming)
                        }}
                      >
                        {metric.hamming}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        bits
                      </Typography>
                    </Box>
                  </Tooltip>
                  <Tooltip title="Jaccard similarity (intersection / union)">
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: getJaccardColor(metric.jaccard)
                        }}
                      >
                        {(metric.jaccard * 100).toFixed(0)}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        similar
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// Helper component for stat cards
function StatCard({
  label,
  value,
  subtitle,
  color,
  isCompact
}: {
  label: string;
  value: string;
  subtitle: string;
  color: string;
  isCompact: boolean;
}) {
  return (
    <Box
      sx={{
        p: isCompact ? 1.5 : 2,
        bgcolor: `${color}15`,
        borderRadius: 1,
        borderLeft: `3px solid ${color}`
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={isCompact ? 'h6' : 'h5'}
        sx={{ fontWeight: 700, color, lineHeight: 1.2 }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {subtitle}
      </Typography>
    </Box>
  );
}
