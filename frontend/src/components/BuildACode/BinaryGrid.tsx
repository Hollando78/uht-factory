import { Box, Typography, Tooltip } from '@mui/material';
import { LAYERS } from '../../utils/uhtUtils';

interface BinaryGridProps {
  pattern: string; // 32-char string of '0', '1', 'X'
  onChange: (pattern: string) => void;
  isCompact?: boolean;
  disabled?: boolean;
}

// Canonical trait names
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

export default function BinaryGrid({ pattern, onChange, isCompact = false, disabled = false }: BinaryGridProps) {
  // Cycle through states: X -> 1 -> 0 -> X
  const handleBitClick = (index: number) => {
    if (disabled) return;

    const currentChar = pattern[index];
    let nextChar: string;

    switch (currentChar) {
      case 'X':
        nextChar = '1';
        break;
      case '1':
        nextChar = '0';
        break;
      case '0':
        nextChar = 'X';
        break;
      default:
        nextChar = 'X';
    }

    const newPattern = pattern.slice(0, index) + nextChar + pattern.slice(index + 1);
    onChange(newPattern);
  };

  // Right-click to go backwards: X -> 0 -> 1 -> X
  const handleBitRightClick = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;

    const currentChar = pattern[index];
    let nextChar: string;

    switch (currentChar) {
      case 'X':
        nextChar = '0';
        break;
      case '0':
        nextChar = '1';
        break;
      case '1':
        nextChar = 'X';
        break;
      default:
        nextChar = 'X';
    }

    const newPattern = pattern.slice(0, index) + nextChar + pattern.slice(index + 1);
    onChange(newPattern);
  };

  const getBitStyles = (char: string, layerColor: string) => {
    switch (char) {
      case '1':
        return {
          bgcolor: layerColor,
          color: 'black',
          border: `2px solid ${layerColor}`
        };
      case '0':
        return {
          bgcolor: 'rgba(0,0,0,0.3)',
          color: 'text.disabled',
          border: '2px solid rgba(255,255,255,0.1)'
        };
      default: // 'X'
        return {
          bgcolor: 'transparent',
          color: 'text.secondary',
          border: '2px dashed rgba(255,255,255,0.3)'
        };
    }
  };

  const cellSize = isCompact ? 36 : 48;

  return (
    <Box>
      {/* Layer rows */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {LAYERS.map((layer, layerIndex) => (
          <Box key={layer.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Layer label */}
            <Tooltip title={layer.name}>
              <Box
                sx={{
                  width: isCompact ? 60 : 80,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}
              >
                <Box
                  sx={{
                    width: 4,
                    height: cellSize,
                    bgcolor: layer.color,
                    borderRadius: 1
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: layer.color,
                    fontWeight: 600,
                    fontSize: isCompact ? '0.65rem' : '0.75rem'
                  }}
                >
                  {isCompact ? layer.name.slice(0, 4) : layer.name}
                </Typography>
              </Box>
            </Tooltip>

            {/* Bit cells */}
            <Box sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
              {Array.from({ length: 8 }, (_, bitIndex) => {
                const globalIndex = layerIndex * 8 + bitIndex;
                const char = pattern[globalIndex] || 'X';
                const styles = getBitStyles(char, layer.color);
                const traitName = TRAIT_NAMES[globalIndex + 1];

                return (
                  <Tooltip
                    key={bitIndex}
                    title={
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          Bit {globalIndex + 1}: {traitName}
                        </Typography>
                        <br />
                        <Typography variant="caption">
                          Click: cycle forward (X→1→0)
                        </Typography>
                        <br />
                        <Typography variant="caption">
                          Right-click: cycle backward
                        </Typography>
                      </Box>
                    }
                  >
                    <Box
                      onClick={() => handleBitClick(globalIndex)}
                      onContextMenu={(e) => handleBitRightClick(globalIndex, e)}
                      sx={{
                        width: cellSize,
                        height: cellSize,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1,
                        cursor: disabled ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                        userSelect: 'none',
                        ...styles,
                        '&:hover': disabled ? {} : {
                          transform: 'scale(1.1)',
                          boxShadow: `0 0 12px ${layer.color}60`
                        }
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: isCompact ? '1rem' : '1.25rem',
                          fontFamily: 'monospace'
                        }}
                      >
                        {char}
                      </Typography>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* Bit position labels */}
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ width: 40, textAlign: 'right', fontSize: '0.65rem' }}
            >
              {layerIndex * 8 + 1}-{(layerIndex + 1) * 8}
            </Typography>
          </Box>
        ))}
      </Box>

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
          <Box sx={{
            width: 24,
            height: 24,
            border: '2px dashed rgba(255,255,255,0.3)',
            borderRadius: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>X</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">Wildcard (any)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 24,
            height: 24,
            bgcolor: '#00E5FF',
            borderRadius: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'black' }}>1</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">Must be ON</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 24,
            height: 24,
            bgcolor: 'rgba(0,0,0,0.3)',
            border: '2px solid rgba(255,255,255,0.1)',
            borderRadius: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.disabled' }}>0</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">Must be OFF</Typography>
        </Box>
      </Box>
    </Box>
  );
}
