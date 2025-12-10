import { Box, Typography, Tooltip, Paper } from '@mui/material';
import { LAYER_COLORS } from './constants';

const LayerBreakdownDiagram = () => {
  const layers = [
    { name: 'Physical', bits: [1, 2, 3, 4, 5, 6, 7, 8], hexPositions: '1-2', color: LAYER_COLORS.Physical },
    { name: 'Functional', bits: [9, 10, 11, 12, 13, 14, 15, 16], hexPositions: '3-4', color: LAYER_COLORS.Functional },
    { name: 'Abstract', bits: [17, 18, 19, 20, 21, 22, 23, 24], hexPositions: '5-6', color: LAYER_COLORS.Abstract },
    { name: 'Social', bits: [25, 26, 27, 28, 29, 30, 31, 32], hexPositions: '7-8', color: LAYER_COLORS.Social }
  ];

  // Canonical trait names for tooltips
  const traitNames: Record<number, string> = {
    1: 'Physical Object', 2: 'Synthetic', 3: 'Biological/Biomimetic', 4: 'Powered',
    5: 'Structural', 6: 'Observable', 7: 'Physical Medium', 8: 'Active',
    9: 'Intentionally Designed', 10: 'Outputs Effect', 11: 'Processes Signals/Logic', 12: 'State-Transforming',
    13: 'Human-Interactive', 14: 'System-integrated', 15: 'Functionally Autonomous', 16: 'System-Essential',
    17: 'Symbolic', 18: 'Signalling', 19: 'Rule-governed', 20: 'Compositional',
    21: 'Normative', 22: 'Meta', 23: 'Temporal', 24: 'Digital/Virtual',
    25: 'Social Construct', 26: 'Institutionally Defined', 27: 'Identity-Linked', 28: 'Regulated',
    29: 'Economically Significant', 30: 'Politicised', 31: 'Ritualised', 32: 'Ethically Significant'
  };

  // Example entities that have each trait
  const traitExamples: Record<number, string> = {
    1: 'chair, rock, smartphone', 2: 'plastic bottle, computer, car', 3: 'tree, bacteria, neural network', 4: 'lamp, refrigerator, electric car',
    5: 'beam, skeleton, bridge', 6: 'mountain, sunset, music', 7: 'water, metal, wood', 8: 'animal, robot, wind',
    9: 'hammer, software, bridge', 10: 'speaker, lightbulb, heater', 11: 'computer, brain, calculator', 12: 'thermostat, traffic light, cell',
    13: 'keyboard, door handle, touchscreen', 14: 'CPU, heart, network router', 15: 'robot vacuum, pacemaker, autopilot', 16: 'engine, power supply, kernel',
    17: 'flag, logo, cross', 18: 'traffic light, alarm, smoke signal', 19: 'chess, legal system, protocol', 20: 'molecule, sentence, module',
    21: 'law, recipe, instruction manual', 22: 'dictionary, meta-analysis, recursion', 23: 'timeline, music, narrative', 24: 'app, video game, cryptocurrency',
    25: 'money, marriage, nation', 26: 'degree, patent, diagnosis', 27: 'uniform, badge, professional title', 28: 'medicine, aircraft, pesticide',
    29: 'oil, labor, real estate', 30: 'healthcare, immigration, gun control', 31: 'wedding, graduation, prayer', 32: 'gene editing, AI, nuclear weapons'
  };

  return (
    <Box sx={{ width: '100%', p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {layers.map((layer) => (
          <Paper
            key={layer.name}
            elevation={2}
            sx={{
              backgroundColor: 'rgba(26, 26, 26, 0.95)',
              border: `2px solid ${layer.color}`,
              borderRadius: 1,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.02)',
                boxShadow: `0 0 20px ${layer.color}40`
              }
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
              {/* Layer Name */}
              <Box
                sx={{
                  p: 2,
                  backgroundColor: `${layer.color}20`,
                  borderRight: { md: `2px solid ${layer.color}` },
                  borderBottom: { xs: `2px solid ${layer.color}`, md: 'none' },
                  minWidth: { md: 180 },
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: layer.color,
                    fontWeight: 'bold',
                    fontSize: { xs: '16px', md: '18px' }
                  }}
                >
                  {layer.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Bits {layer.bits[0]}-{layer.bits[7]} • Hex {layer.hexPositions}
                </Typography>
              </Box>

              {/* Trait Segments */}
              <Box
                sx={{
                  flex: 1,
                  display: { xs: 'grid', md: 'flex' },
                  gridTemplateColumns: { xs: 'repeat(4, 1fr)' },
                  gap: { xs: 0.5, md: 0 },
                  p: { xs: 1, md: 0 }
                }}
              >
                {layer.bits.map((bitNum, idx) => (
                  <Tooltip
                    key={bitNum}
                    title={
                      <Box>
                        <Typography variant="caption" display="block" fontWeight="bold">
                          Bit {bitNum}: {traitNames[bitNum]}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                          Layer: {layer.name}
                        </Typography>
                        <Typography variant="caption" display="block" sx={{ mt: 1, fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>
                          Examples: {traitExamples[bitNum]}
                        </Typography>
                      </Box>
                    }
                    arrow
                  >
                    <Box
                      sx={{
                        flex: { md: 1 },
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: { xs: 0.5, md: 1 },
                        borderLeft: { xs: 'none', md: idx > 0 ? `1px solid ${layer.color}40` : 'none' },
                        border: { xs: `1px solid ${layer.color}40`, md: 'none' },
                        borderRadius: { xs: 1, md: 0 },
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        minHeight: { xs: '70px', md: '80px' },
                        '&:hover': {
                          backgroundColor: `${layer.color}30`,
                          transform: 'scale(1.02)'
                        }
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: { xs: '10px', md: '11px' },
                          fontWeight: 'bold',
                          color: layer.color,
                          mb: 0.5
                        }}
                      >
                        {bitNum}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: { xs: '9px', md: '10px' },
                          color: 'text.secondary',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          wordBreak: 'break-word',
                          hyphens: 'auto',
                          px: { xs: 0.5, md: 0 }
                        }}
                      >
                        {traitNames[bitNum]}
                      </Typography>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      {/* Summary */}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Each layer contains 8 traits (bits) that combine to form 2 hex characters
        </Typography>
      </Box>
    </Box>
  );
};

export default LayerBreakdownDiagram;
