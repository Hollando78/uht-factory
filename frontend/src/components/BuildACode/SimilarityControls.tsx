import { Box, Typography, Slider, Chip, Button, ButtonGroup } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

interface SimilarityControlsProps {
  tolerance: number;
  onToleranceChange: (value: number) => void;
  pattern: string;
  onPatternChange: (pattern: string) => void;
  constraintCount: number;
  matchCount: number;
  isCompact?: boolean;
}

export default function SimilarityControls({
  tolerance,
  onToleranceChange,
  pattern,
  onPatternChange,
  constraintCount,
  matchCount,
}: SimilarityControlsProps) {
  const handleClearAll = () => {
    onPatternChange('X'.repeat(32));
  };

  const handleSetAll = (value: '0' | '1') => {
    onPatternChange(value.repeat(32));
  };

  return (
    <Box>
      {/* Pattern Stats */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        mb: 2,
        flexWrap: 'wrap'
      }}>
        <Chip
          label={`${constraintCount} constraints`}
          size="small"
          color={constraintCount > 0 ? 'primary' : 'default'}
          variant="outlined"
        />
        <Chip
          label={`${pattern.split('').filter(c => c === '1').length} must be ON`}
          size="small"
          sx={{ bgcolor: 'rgba(76, 175, 80, 0.2)', borderColor: '#4CAF50' }}
          variant="outlined"
        />
        <Chip
          label={`${pattern.split('').filter(c => c === '0').length} must be OFF`}
          size="small"
          sx={{ bgcolor: 'rgba(244, 67, 54, 0.2)', borderColor: '#F44336' }}
          variant="outlined"
        />
        <Chip
          label={`${matchCount} matches`}
          size="small"
          color={matchCount > 0 ? 'success' : 'default'}
        />
      </Box>

      {/* Tolerance Slider */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Tolerance
          </Typography>
          <Typography variant="body2" color="primary">
            {tolerance} bit{tolerance !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Slider
          value={tolerance}
          onChange={(_, value) => onToleranceChange(value as number)}
          min={0}
          max={8}
          step={1}
          marks={[
            { value: 0, label: '0' },
            { value: 2, label: '2' },
            { value: 4, label: '4' },
            { value: 6, label: '6' },
            { value: 8, label: '8' }
          ]}
          sx={{
            '& .MuiSlider-markLabel': {
              fontSize: '0.7rem'
            }
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Allow up to {tolerance} bit{tolerance !== 1 ? 's' : ''} to differ from the pattern
        </Typography>
      </Box>

      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={handleClearAll}
            startIcon={<RefreshIcon />}
          >
            Reset
          </Button>
          <Button
            onClick={() => handleSetAll('1')}
            sx={{ color: '#4CAF50', borderColor: '#4CAF50' }}
          >
            All ON
          </Button>
          <Button
            onClick={() => handleSetAll('0')}
            sx={{ color: '#F44336', borderColor: '#F44336' }}
          >
            All OFF
          </Button>
        </ButtonGroup>
      </Box>
    </Box>
  );
}
