import { Box, Typography, Paper } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { LAYER_COLORS } from './constants';

const ClassificationFlowDiagram = () => {
  const stages = [
    {
      title: 'Entity',
      icon: '📱',
      description: 'Start with any concept',
      example: 'Smartphone'
    },
    {
      title: '32 Traits',
      icon: '📋',
      description: 'Evaluate each trait',
      example: '32 yes/no questions'
    },
    {
      title: 'Binary',
      icon: '01',
      description: 'Create binary code',
      example: '11001110...'
    },
    {
      title: 'Hex Code',
      icon: '🔢',
      description: 'Convert to hex',
      example: 'CEFDF09F'
    }
  ];

  return (
    <Box sx={{ width: '100%', p: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 2, md: 0 },
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {stages.map((stage, idx) => (
          <Box
            key={stage.title}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'center',
              gap: 0
            }}
          >
            {/* Stage Card */}
            <Paper
              elevation={3}
              sx={{
                p: { xs: 2, md: 2.5 },
                backgroundColor: 'rgba(26, 26, 26, 0.95)',
                border: '2px solid rgba(0, 229, 255, 0.3)',
                borderRadius: 2,
                textAlign: 'center',
                minWidth: { xs: 'auto', md: 180 },
                width: { xs: '100%', md: 'auto' },
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'scale(1.05)',
                  borderColor: 'primary.main',
                  boxShadow: '0 0 20px rgba(0, 229, 255, 0.4)'
                }
              }}
            >
              {/* Icon */}
              <Typography variant="h3" sx={{ mb: 1, fontSize: { xs: '32px', md: '40px' } }}>
                {stage.icon}
              </Typography>

              {/* Title */}
              <Typography
                variant="h6"
                sx={{
                  color: 'primary.main',
                  fontWeight: 'bold',
                  mb: 1,
                  fontSize: { xs: '14px', md: '16px' }
                }}
              >
                {stage.title}
              </Typography>

              {/* Description */}
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5, fontSize: { xs: '12px', md: '14px' } }}
              >
                {stage.description}
              </Typography>

              {/* Example */}
              <Paper
                sx={{
                  p: 1,
                  backgroundColor: 'rgba(0, 229, 255, 0.1)',
                  borderRadius: 1
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: idx === 2 || idx === 3 ? 'monospace' : 'inherit',
                    fontSize: { xs: '11px', md: '12px' },
                    color: 'primary.light'
                  }}
                >
                  {stage.example}
                </Typography>
              </Paper>
            </Paper>

            {/* Arrow (not after last stage) */}
            {idx < stages.length - 1 && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'primary.main',
                  opacity: 0.6,
                  px: { xs: 0, md: 2 },
                  py: { xs: 2, md: 0 },
                  flexShrink: 0
                }}
              >
                <ArrowForward
                  sx={{
                    fontSize: { xs: 32, md: 40 },
                    transform: { xs: 'rotate(90deg)', md: 'none' }
                  }}
                />
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Trait Grid Visualization */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          The 32 traits are organized into 4 colored layers:
        </Typography>
        <Box
          sx={{
            display: 'inline-grid',
            gridTemplateColumns: 'repeat(16, 1fr)',
            gap: 0.5,
            p: 2,
            backgroundColor: 'rgba(26, 26, 26, 0.5)',
            borderRadius: 1,
            border: '1px solid rgba(0, 229, 255, 0.2)'
          }}
        >
          {Array.from({ length: 32 }, (_, i) => {
            const layerColors = [
              ...Array(8).fill(LAYER_COLORS.Physical),
              ...Array(8).fill(LAYER_COLORS.Functional),
              ...Array(8).fill(LAYER_COLORS.Abstract),
              ...Array(8).fill(LAYER_COLORS.Social)
            ];

            return (
              <Box
                key={i}
                sx={{
                  width: { xs: 12, md: 16 },
                  height: { xs: 12, md: 16 },
                  backgroundColor: layerColors[i],
                  borderRadius: 0.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'scale(1.3)',
                    boxShadow: `0 0 8px ${layerColors[i]}`
                  }
                }}
              />
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default ClassificationFlowDiagram;
