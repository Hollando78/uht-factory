import { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Tooltip
} from '@mui/material';
import {
  getLayerSummary,
  uhtToBinary,
  LAYER_COLORS,
  type HexOperation
} from '../../utils/uhtUtils';
import type { SelectedEntity } from '../../types';

// Canonical trait names (v2) organized by layer
const LAYER_TRAITS: Record<string, string[]> = {
  Physical: [
    'Physical Object', 'Synthetic', 'Biological/Biomimetic', 'Powered',
    'Structural', 'Observable', 'Physical Medium', 'Active'
  ],
  Functional: [
    'Intentionally Designed', 'Outputs Effect', 'Processes Signals/Logic', 'State-Transforming',
    'Human-Interactive', 'System-integrated', 'Functionally Autonomous', 'System-Essential'
  ],
  Abstract: [
    'Symbolic', 'Signalling', 'Rule-governed', 'Compositional',
    'Normative', 'Meta', 'Temporal', 'Digital/Virtual'
  ],
  Social: [
    'Social Construct', 'Institutionally Defined', 'Identity-Linked', 'Regulated',
    'Economically Significant', 'Politicised', 'Ritualised', 'Ethically Significant'
  ]
};

interface HexResultCardProps {
  hexCode: string;
  operands: SelectedEntity[];
  operation: HexOperation;
  isCompact: boolean;
}

export default function HexResultCard({ hexCode, operands, operation, isCompact }: HexResultCardProps) {
  const layerSummary = useMemo(() => getLayerSummary(hexCode), [hexCode]);
  const binary = useMemo(() => uhtToBinary(hexCode), [hexCode]);
  const totalBits = useMemo(() => {
    return Object.values(layerSummary).reduce((sum, layer) => sum + layer.count, 0);
  }, [layerSummary]);

  const layers = [
    { name: 'Physical', ...layerSummary.Physical, color: LAYER_COLORS.Physical },
    { name: 'Functional', ...layerSummary.Functional, color: LAYER_COLORS.Functional },
    { name: 'Abstract', ...layerSummary.Abstract, color: LAYER_COLORS.Abstract },
    { name: 'Social', ...layerSummary.Social, color: LAYER_COLORS.Social }
  ];

  // Get bits for each layer
  const getLayerBits = (layerIndex: number) => {
    const start = layerIndex * 8;
    return binary.slice(start, start + 8).split('');
  };

  // Compute special bits based on operation
  // XOR: "cancelled" = traits that got XOR'd out (even count)
  // AND: "excluded" = traits not shared by ALL (in some but not result)
  // OR: no special bits (all traits from any operand are included)
  const specialBits = useMemo(() => {
    if (operands.length < 2) return { bits: new Set<number>(), label: '' };

    const operandBinaries = operands.map(o => uhtToBinary(o.uht_code));
    const bits = new Set<number>();

    for (let i = 0; i < 32; i++) {
      const resultBit = binary[i] === '1';
      const operandsWithBit = operandBinaries.filter(b => b[i] === '1').length;

      if (operation === 'XOR') {
        // Cancelled = at least one operand had it, but result doesn't (even count cancelled out)
        if (operandsWithBit > 0 && !resultBit) {
          bits.add(i);
        }
      } else if (operation === 'AND') {
        // Excluded = some (but not all) operands had it, so it's not in result
        if (operandsWithBit > 0 && operandsWithBit < operands.length) {
          bits.add(i);
        }
      }
      // OR: nothing special - all traits from any operand are in result
    }

    const label = operation === 'XOR' ? 'cancelled' : operation === 'AND' ? 'excluded' : '';
    return { bits, label };
  }, [binary, operands, operation]);

  const specialCount = specialBits.bits.size;

  return (
    <Card>
      <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Result Analysis
        </Typography>

        {/* Hero Hex Display */}
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            mb: 3,
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderRadius: 2,
            border: '1px solid rgba(76, 175, 80, 0.2)'
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 1 }}
          >
            Computed UHT Code
          </Typography>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#4CAF50',
              letterSpacing: 4,
              fontSize: isCompact ? '2.5rem' : '3.5rem',
              lineHeight: 1,
              textShadow: '0 0 30px rgba(76, 175, 80, 0.3)'
            }}
          >
            {hexCode}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              <Box component="span" sx={{ fontWeight: 600, color: '#4CAF50' }}>{totalBits}</Box> active traits
            </Typography>
            {specialCount > 0 && specialBits.label && (
              <Typography variant="body2" sx={{ color: 'rgba(244, 67, 54, 0.8)' }}>
                <Box component="span" sx={{ fontWeight: 600 }}>{specialCount}</Box> {specialBits.label}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Layer Breakdown with Trait Grid */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {layers.map((layer, layerIndex) => {
            const layerBits = getLayerBits(layerIndex);
            const traits = LAYER_TRAITS[layer.name];

            return (
              <Box
                key={layer.name}
                sx={{
                  p: 1.5,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: 1,
                  borderLeft: `3px solid ${layer.color}`
                }}
              >
                {/* Layer Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: layer.color, fontWeight: 600, fontSize: '0.8rem' }}
                  >
                    {layer.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                  >
                    {layer.hex} ({layer.count}/8)
                  </Typography>
                </Box>

                {/* Trait Grid - 2 columns */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 0.75
                  }}
                >
                  {traits.map((traitName, bitIndex) => {
                    const isActive = layerBits[bitIndex] === '1';
                    const globalBitIndex = layerIndex * 8 + bitIndex;
                    const bitNumber = globalBitIndex + 1;
                    const isSpecial = specialBits.bits.has(globalBitIndex);

                    const getStatusText = () => {
                      if (isActive) return 'ON';
                      if (isSpecial && specialBits.label) return specialBits.label.toUpperCase();
                      return 'OFF';
                    };

                    return (
                      <Tooltip
                        key={bitIndex}
                        title={`Bit ${bitNumber}: ${traitName} - ${getStatusText()}`}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.75,
                            p: 0.5,
                            borderRadius: 0.5,
                            backgroundColor: isActive
                              ? `${layer.color}30`
                              : isSpecial
                                ? 'rgba(244, 67, 54, 0.08)'
                                : 'rgba(255,255,255,0.03)',
                            border: isActive
                              ? `1px solid ${layer.color}50`
                              : isSpecial
                                ? '1px solid rgba(244, 67, 54, 0.2)'
                                : '1px solid transparent',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Bit indicator */}
                          <Box
                            sx={{
                              width: 18,
                              height: 18,
                              borderRadius: 0.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isActive
                                ? layer.color
                                : isSpecial
                                  ? 'rgba(244, 67, 54, 0.25)'
                                  : 'rgba(255,255,255,0.08)',
                              color: isActive
                                ? '#000'
                                : isSpecial
                                  ? 'rgba(244, 67, 54, 0.8)'
                                  : 'rgba(255,255,255,0.25)',
                              fontFamily: 'monospace',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              flexShrink: 0,
                              textDecoration: isSpecial ? 'line-through' : 'none'
                            }}
                          >
                            {isActive ? '1' : isSpecial ? '×' : '0'}
                          </Box>

                          {/* Trait name */}
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.68rem',
                              color: isActive
                                ? 'text.primary'
                                : isSpecial
                                  ? 'rgba(244, 67, 54, 0.6)'
                                  : 'text.disabled',
                              fontWeight: isActive ? 500 : 400,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textDecoration: isSpecial ? 'line-through' : 'none'
                            }}
                          >
                            {traitName}
                          </Typography>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
