import { Box, Typography, Tooltip, Paper } from '@mui/material';
import { LAYER_COLORS, EXAMPLE_ENTITY } from './constants';

const BinaryToHexDiagram = () => {
  const { uht_code } = EXAMPLE_ENTITY;

  // Convert hex to binary
  const hexToBinary = (hex: string): string => {
    return hex.split('').map(char => {
      const binary = parseInt(char, 16).toString(2).padStart(4, '0');
      return binary;
    }).join('');
  };

  const binary = hexToBinary(uht_code);
  const binaryGroups = uht_code.split('').map((_, i) => {
    const startIdx = i * 4;
    return binary.slice(startIdx, startIdx + 4);
  });

  // Layer colors for each hex character
  const layerColors = [
    LAYER_COLORS.Physical,  // 0-1
    LAYER_COLORS.Physical,
    LAYER_COLORS.Functional, // 2-3
    LAYER_COLORS.Functional,
    LAYER_COLORS.Abstract,   // 4-5
    LAYER_COLORS.Abstract,
    LAYER_COLORS.Social,     // 6-7
    LAYER_COLORS.Social
  ];

  const layerNames = ['Physical', 'Physical', 'Functional', 'Functional', 'Abstract', 'Abstract', 'Social', 'Social'];

  return (
    <Box sx={{ width: '100%', p: { xs: 2, md: 3 } }}>
      {/* Binary Groups */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' },
          gap: { xs: 1.5, md: 2 },
          mb: 3
        }}
      >
        {binaryGroups.map((group, idx) => {
          const decimal = parseInt(group, 2);

          return (
            <Tooltip
              key={idx}
              title={
                <Box>
                  <Typography variant="caption" display="block">
                    Binary: {group}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Decimal: {decimal}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Hex: {uht_code[idx]}
                  </Typography>
                  <Typography variant="caption" display="block" sx={{ mt: 0.5, fontWeight: 'bold' }}>
                    {layerNames[idx]} Layer
                  </Typography>
                </Box>
              }
              arrow
            >
              <Paper
                elevation={2}
                sx={{
                  p: { xs: 1, md: 1.5 },
                  backgroundColor: 'rgba(26, 26, 26, 0.95)',
                  border: `2px solid ${layerColors[idx]}`,
                  borderRadius: 1,
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  animation: `highlight 0.5s ease ${idx * 0.2}s`,
                  '@keyframes highlight': {
                    '0%, 100%': {
                      transform: 'scale(1)',
                      boxShadow: 'none'
                    },
                    '50%': {
                      transform: 'scale(1.05)',
                      boxShadow: `0 0 12px ${layerColors[idx]}`
                    }
                  },
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: `0 0 16px ${layerColors[idx]}`,
                    borderWidth: '3px'
                  }
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', gap: 0.25 }}>
                    {group.split('').map((bit, bitIdx) => (
                      <Box
                        key={bitIdx}
                        sx={{
                          width: { xs: 16, md: 20 },
                          height: { xs: 16, md: 20 },
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: bit === '1' ? layerColors[idx] : 'rgba(255,255,255,0.1)',
                          borderRadius: 0.5,
                          fontSize: { xs: '10px', md: '12px' },
                          fontWeight: 'bold',
                          fontFamily: 'monospace'
                        }}
                      >
                        {bit}
                      </Box>
                    ))}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: { xs: '10px', md: '11px' },
                      color: 'text.secondary',
                      fontFamily: 'monospace'
                    }}
                  >
                    {group}
                  </Typography>
                </Box>
              </Paper>
            </Tooltip>
          );
        })}
      </Box>

      {/* Conversion Arrow */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <Typography variant="h6" sx={{ color: 'primary.main' }}>
          ⬇
        </Typography>
      </Box>

      {/* Hex Characters */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' },
          gap: { xs: 1.5, md: 2 }
        }}
      >
        {uht_code.split('').map((hexChar, idx) => (
          <Paper
            key={idx}
            elevation={3}
            sx={{
              p: { xs: 1.5, md: 2 },
              backgroundColor: 'rgba(26, 26, 26, 0.95)',
              border: `3px solid ${layerColors[idx]}`,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              '&:hover': {
                transform: 'scale(1.08)',
                boxShadow: `0 0 20px ${layerColors[idx]}`
              }
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 'bold',
                fontFamily: 'monospace',
                color: layerColors[idx],
                fontSize: { xs: '24px', md: '32px' }
              }}
            >
              {hexChar}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Legend */}
      <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
        {(['Physical', 'Functional', 'Abstract', 'Social'] as const).map((layer) => (
          <Box key={layer} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                backgroundColor: LAYER_COLORS[layer],
                borderRadius: 0.5
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {layer}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default BinaryToHexDiagram;
