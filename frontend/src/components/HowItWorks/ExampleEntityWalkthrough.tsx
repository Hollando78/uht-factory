import { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Paper
} from '@mui/material';
import {
  ExpandMore,
  CheckCircle,
  Cancel
} from '@mui/icons-material';
import { EXAMPLE_ENTITY, LAYER_COLORS, type LayerName } from './constants';

const ExampleEntityWalkthrough = () => {
  const [expanded, setExpanded] = useState<string | false>('Physical');

  const handleChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const renderBinaryVisualization = (binary: string, color: string) => (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {binary.split('').map((bit, idx) => (
        <Box
          key={idx}
          sx={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: bit === '1' ? color : 'rgba(255,255,255,0.1)',
            borderRadius: 0.5,
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            border: `1px solid ${bit === '1' ? color : 'rgba(255,255,255,0.2)'}`
          }}
        >
          {bit}
        </Box>
      ))}
    </Box>
  );

  return (
    <Box sx={{ width: '100%', p: { xs: 2, md: 3 } }}>
      {/* Entity Header */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 3,
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          border: '2px solid rgba(0, 229, 255, 0.3)',
          borderRadius: 2
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4">📱</Typography>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              {EXAMPLE_ENTITY.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {EXAMPLE_ENTITY.description}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={`UHT Code: ${EXAMPLE_ENTITY.uht_code}`}
          sx={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: 'rgba(0, 229, 255, 0.2)',
            color: 'primary.main'
          }}
        />
      </Paper>

      {/* Layer Accordions */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(Object.keys(EXAMPLE_ENTITY.layers) as LayerName[]).map((layerName) => {
          const layer = EXAMPLE_ENTITY.layers[layerName];
          const color = LAYER_COLORS[layerName];
          const activeCount = layer.traits.filter(t => t.applicable).length;

          return (
            <Accordion
              key={layerName}
              expanded={expanded === layerName}
              onChange={handleChange(layerName)}
              sx={{
                backgroundColor: 'rgba(26, 26, 26, 0.95)',
                border: `2px solid ${color}`,
                borderRadius: '8px !important',
                '&:before': { display: 'none' },
                '&.Mui-expanded': {
                  margin: 0
                }
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore sx={{ color }} />}
                sx={{
                  backgroundColor: `${color}10`,
                  borderRadius: expanded === layerName ? '6px 6px 0 0' : '6px',
                  '&:hover': {
                    backgroundColor: `${color}20`
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <Typography variant="h6" sx={{ color, fontWeight: 'bold' }}>
                    {layerName}
                  </Typography>
                  <Chip
                    label={`${activeCount}/8 traits`}
                    size="small"
                    sx={{
                      backgroundColor: `${color}30`,
                      color: color,
                      fontWeight: 'bold'
                    }}
                  />
                  <Chip
                    label={layer.hex}
                    size="small"
                    sx={{
                      fontFamily: 'monospace',
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      color: color,
                      ml: 'auto'
                    }}
                  />
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 3 }}>
                {/* Binary Visualization */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Binary Code:
                  </Typography>
                  {renderBinaryVisualization(layer.binary, color)}
                </Box>

                {/* Traits List */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {layer.traits.map((trait) => (
                    <Paper
                      key={trait.bit}
                      elevation={1}
                      sx={{
                        p: 2,
                        backgroundColor: trait.applicable
                          ? `${color}15`
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${trait.applicable ? color : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 1
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        {trait.applicable ? (
                          <CheckCircle sx={{ color, fontSize: 20, mt: 0.2 }} />
                        ) : (
                          <Cancel sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 20, mt: 0.2 }} />
                        )}
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 'bold',
                                color: trait.applicable ? color : 'text.secondary'
                              }}
                            >
                              Bit {trait.bit}: {trait.name}
                            </Typography>
                            <Chip
                              label={trait.applicable ? '1' : '0'}
                              size="small"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                height: 20,
                                backgroundColor: trait.applicable ? color : 'rgba(255,255,255,0.1)',
                                color: trait.applicable ? '#000' : 'text.secondary'
                              }}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {trait.explanation}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>

                {/* Hex Result */}
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    backgroundColor: `${color}20`,
                    borderRadius: 1,
                    textAlign: 'center'
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    {layerName} Layer Result
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      color: color
                    }}
                  >
                    {layer.binary} = {layer.hex}
                  </Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {/* Final UHT Code */}
      <Paper
        elevation={4}
        sx={{
          mt: 3,
          p: 3,
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          border: '3px solid rgba(0, 229, 255, 0.5)',
          borderRadius: 2,
          textAlign: 'center'
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Final Classification Result
        </Typography>
        <Typography
          variant="h4"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 'bold',
            color: 'primary.main',
            letterSpacing: 4
          }}
        >
          {EXAMPLE_ENTITY.uht_code}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          {Object.keys(EXAMPLE_ENTITY.layers).map((layerName) => {
            const layer = EXAMPLE_ENTITY.layers[layerName as LayerName];
            const color = LAYER_COLORS[layerName as LayerName];
            return (
              <Chip
                key={layerName}
                label={`${layer.hex} (${layerName})`}
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  backgroundColor: `${color}30`,
                  color: color,
                  border: `1px solid ${color}`
                }}
              />
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
};

export default ExampleEntityWalkthrough;
