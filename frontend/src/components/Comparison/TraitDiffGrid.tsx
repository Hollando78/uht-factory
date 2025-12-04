import { Box, Typography, Tooltip, Collapse, IconButton } from '@mui/material';
import { ExpandMore as ExpandIcon, ExpandLess as CollapseIcon } from '@mui/icons-material';
import { useState, useMemo } from 'react';
import { uhtToBinary, LAYERS } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface TraitDiffGridProps {
  entities: UHTEntity[];
  isCompact?: boolean;
}

// Canonical trait names for each bit position (1-32)
const TRAIT_NAMES: Record<number, string> = {
  // Physical (1-8)
  1: 'Physical Object', 2: 'Synthetic', 3: 'Biological/Biomimetic', 4: 'Powered',
  5: 'Structural', 6: 'Observable', 7: 'Physical Medium', 8: 'Active',
  // Functional (9-16)
  9: 'Intentionally Designed', 10: 'Outputs Effect', 11: 'Processes Signals/Logic', 12: 'State-Transforming',
  13: 'Human-Interactive', 14: 'System-integrated', 15: 'Functionally Autonomous', 16: 'System-Essential',
  // Abstract (17-24)
  17: 'Symbolic', 18: 'Signalling', 19: 'Rule-governed', 20: 'Compositional',
  21: 'Normative', 22: 'Meta', 23: 'Temporal', 24: 'Digital/Virtual',
  // Social (25-32)
  25: 'Social Construct', 26: 'Institutionally Defined', 27: 'Identity-Linked', 28: 'Regulated',
  29: 'Economically Significant', 30: 'Politicised', 31: 'Ritualised', 32: 'Ethically Significant'
};

export default function TraitDiffGrid({ entities, isCompact = false }: TraitDiffGridProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([0, 1, 2, 3]));

  const toggleLayer = (layerIndex: number) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerIndex)) {
        next.delete(layerIndex);
      } else {
        next.add(layerIndex);
      }
      return next;
    });
  };

  // Convert all entity codes to binary
  const entityBinaries = useMemo(() => {
    return entities.map(e => uhtToBinary(e.uht_code));
  }, [entities]);

  // Analyze each trait across all entities
  const traitAnalysis = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => {
      const bitIndex = i;
      const values = entityBinaries.map(binary => binary[bitIndex] === '1');
      const activeCount = values.filter(Boolean).length;

      return {
        bit: i + 1,
        name: TRAIT_NAMES[i + 1] || `Trait ${i + 1}`,
        values,
        allActive: activeCount === entities.length,
        noneActive: activeCount === 0,
        someActive: activeCount > 0 && activeCount < entities.length
      };
    });
  }, [entityBinaries, entities.length]);

  const getCellColor = (isActive: boolean, trait: typeof traitAnalysis[0]) => {
    if (trait.allActive) return '#4CAF50'; // Green - all have it
    if (trait.noneActive) return 'rgba(255,255,255,0.1)'; // Gray - none have it
    return isActive ? '#FF9800' : 'rgba(255,255,255,0.05)'; // Orange for active, dim for inactive (mixed)
  };

  return (
    <Box>
      {LAYERS.map((layer, layerIndex) => {
        const isExpanded = expandedLayers.has(layerIndex);
        const layerTraits = traitAnalysis.slice(layerIndex * 8, (layerIndex + 1) * 8);
        const layerActiveCount = layerTraits.filter(t => t.someActive || t.allActive).length;

        return (
          <Box key={layer.name} sx={{ mb: 1 }}>
            {/* Layer Header */}
            <Box
              onClick={() => toggleLayer(layerIndex)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                bgcolor: `${layer.color}15`,
                borderLeft: `3px solid ${layer.color}`,
                cursor: 'pointer',
                '&:hover': { bgcolor: `${layer.color}25` }
              }}
            >
              <IconButton size="small" sx={{ p: 0 }}>
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
              <Typography
                variant="subtitle2"
                sx={{ color: layer.color, fontWeight: 600, flex: 1 }}
              >
                {layer.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {layerActiveCount}/8 traits active
              </Typography>
            </Box>

            {/* Layer Traits */}
            <Collapse in={isExpanded}>
              <Box sx={{ borderLeft: `3px solid ${layer.color}30` }}>
                {layerTraits.map((trait) => (
                  <Box
                    key={trait.bit}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }
                    }}
                  >
                    {/* Trait Name */}
                    <Box sx={{
                      width: isCompact ? 100 : 140,
                      p: 1,
                      flexShrink: 0,
                      borderRight: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <Tooltip title={`Bit ${trait.bit}`} placement="left">
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: trait.noneActive ? 'text.disabled' : 'text.primary'
                          }}
                        >
                          {trait.name}
                        </Typography>
                      </Tooltip>
                    </Box>

                    {/* Entity Values */}
                    <Box sx={{ display: 'flex', flex: 1 }}>
                      {trait.values.map((isActive, entityIndex) => (
                        <Tooltip
                          key={entityIndex}
                          title={`${entities[entityIndex].name}: ${isActive ? 'Yes' : 'No'}`}
                        >
                          <Box
                            sx={{
                              flex: 1,
                              height: isCompact ? 28 : 36,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: getCellColor(isActive, trait),
                              borderRight: entityIndex < entities.length - 1
                                ? '1px solid rgba(0,0,0,0.3)'
                                : 'none',
                              transition: 'background-color 0.2s'
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 600,
                                color: isActive
                                  ? (trait.allActive ? 'white' : 'black')
                                  : 'text.disabled',
                                fontSize: isCompact ? '0.65rem' : '0.75rem'
                              }}
                            >
                              {isActive ? '1' : '0'}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ))}
                    </Box>

                    {/* Status Indicator */}
                    <Box sx={{
                      width: 24,
                      display: 'flex',
                      justifyContent: 'center',
                      borderLeft: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      {trait.allActive && (
                        <Box sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: '#4CAF50'
                        }} />
                      )}
                      {trait.someActive && (
                        <Box sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: '#FF9800'
                        }} />
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {/* Legend */}
      <Box sx={{
        display: 'flex',
        gap: 3,
        mt: 2,
        pt: 2,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        flexWrap: 'wrap'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 16, height: 16, bgcolor: '#4CAF50', borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">All entities share</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 16, height: 16, bgcolor: '#FF9800', borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">Some entities have</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">None have</Typography>
        </Box>
      </Box>
    </Box>
  );
}
