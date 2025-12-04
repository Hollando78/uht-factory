import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  FormControlLabel,
  Switch,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { Refresh as RefreshIcon, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon } from '@mui/icons-material';
import { LAYERS } from '../../utils/uhtUtils';

interface CooccurrencePair {
  trait1: number;
  name1: string;
  layer1: string;
  trait2: number;
  name2: string;
  layer2: string;
  cooccurrence: number;
}

interface CooccurrenceHeatmapProps {
  data: CooccurrencePair[];
  totalEntities: number;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  isCompact?: boolean;
}

// Canonical trait names
const TRAIT_NAMES: Record<number, string> = {
  1: 'Physical Object', 2: 'Synthetic', 3: 'Biological/Biomimetic', 4: 'Powered',
  5: 'Structural', 6: 'Observable', 7: 'Physical Medium', 8: 'Active',
  9: 'Intentionally Designed', 10: 'Outputs Effect', 11: 'Processes Signals/Logic', 12: 'State-Transforming',
  13: 'Human-Interactive', 14: 'System-integrated', 15: 'Functionally Autonomous', 16: 'System-Essential',
  17: 'Symbolic', 18: 'Signalling', 19: 'Rule-governed', 20: 'Compositional',
  21: 'Normative', 22: 'Meta', 23: 'Temporal', 24: 'Digital/Virtual',
  25: 'Social Construct', 26: 'Institutionally Defined', 27: 'Identity-Linked', 28: 'Regulated',
  29: 'Economically Significant', 30: 'Politicised', 31: 'Ritualised', 32: 'Ethically Significant'
};

export default function CooccurrenceHeatmap({
  data,
  totalEntities,
  loading = false,
  error = null,
  onRefresh,
  isCompact = false
}: CooccurrenceHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; value: number } | null>(null);
  const [cellSize, setCellSize] = useState(isCompact ? 16 : 24);
  const [showLabels, setShowLabels] = useState(!isCompact);
  const [layerFilter, setLayerFilter] = useState<string>('all');
  const [minThreshold, setMinThreshold] = useState(0);

  // Build matrix from data
  const { matrix, maxValue } = useMemo(() => {
    const m: number[][] = Array.from({ length: 32 }, () => Array(32).fill(0));
    let max = 0;

    for (const pair of data) {
      const i = pair.trait1 - 1;
      const j = pair.trait2 - 1;
      if (i >= 0 && i < 32 && j >= 0 && j < 32) {
        m[i][j] = pair.cooccurrence;
        m[j][i] = pair.cooccurrence; // Symmetric
        max = Math.max(max, pair.cooccurrence);
      }
    }

    return { matrix: m, maxValue: max };
  }, [data]);

  // Get indices to display based on layer filter
  const visibleIndices = useMemo(() => {
    if (layerFilter === 'all') {
      return Array.from({ length: 32 }, (_, i) => i);
    }
    const layerIndex = LAYERS.findIndex(l => l.name === layerFilter);
    if (layerIndex === -1) return [];
    return Array.from({ length: 8 }, (_, i) => layerIndex * 8 + i);
  }, [layerFilter]);

  // Color scale function
  const getColor = useCallback((value: number) => {
    if (value === 0 || value < minThreshold) return 'rgba(20, 20, 20, 1)';

    const ratio = value / maxValue;

    // Cool to hot gradient: dark blue -> blue -> cyan -> green -> yellow -> orange -> red
    if (ratio < 0.2) {
      const t = ratio / 0.2;
      return `rgba(${Math.round(20 + t * 30)}, ${Math.round(20 + t * 40)}, ${Math.round(60 + t * 100)}, 1)`;
    } else if (ratio < 0.4) {
      const t = (ratio - 0.2) / 0.2;
      return `rgba(${Math.round(50 * (1 - t))}, ${Math.round(60 + t * 140)}, ${Math.round(160 + t * 95)}, 1)`;
    } else if (ratio < 0.6) {
      const t = (ratio - 0.4) / 0.2;
      return `rgba(${Math.round(t * 100)}, ${Math.round(200 + t * 55)}, ${Math.round(255 * (1 - t) + 50)}, 1)`;
    } else if (ratio < 0.8) {
      const t = (ratio - 0.6) / 0.2;
      return `rgba(${Math.round(100 + t * 155)}, ${Math.round(255 - t * 100)}, ${Math.round(50 * (1 - t))}, 1)`;
    } else {
      const t = (ratio - 0.8) / 0.2;
      return `rgba(${Math.round(255)}, ${Math.round(155 - t * 100)}, ${Math.round(t * 30)}, 1)`;
    }
  }, [maxValue, minThreshold]);

  // Draw the heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const n = visibleIndices.length;
    const labelSpace = showLabels ? 60 : 0;
    const totalSize = n * cellSize + labelSpace;

    canvas.width = totalSize;
    canvas.height = totalSize;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw cells
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const i = visibleIndices[row];
        const j = visibleIndices[col];
        const value = matrix[i][j];

        const x = labelSpace + col * cellSize;
        const y = labelSpace + row * cellSize;

        ctx.fillStyle = getColor(value);
        ctx.fillRect(x, y, cellSize - 1, cellSize - 1);

        // Highlight hovered cell
        if (hoveredCell && hoveredCell.x === col && hoveredCell.y === row) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, cellSize - 1, cellSize - 1);
        }
      }
    }

    // Draw layer dividers
    if (layerFilter === 'all') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        const pos = labelSpace + i * 8 * cellSize;
        ctx.beginPath();
        ctx.moveTo(labelSpace, pos);
        ctx.lineTo(totalSize, pos);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos, labelSpace);
        ctx.lineTo(pos, totalSize);
        ctx.stroke();
      }
    }

    // Draw labels
    if (showLabels) {
      ctx.font = `${Math.min(cellSize - 4, 10)}px monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < n; i++) {
        const traitNum = visibleIndices[i] + 1;
        const layerIndex = Math.floor(visibleIndices[i] / 8);
        ctx.fillStyle = LAYERS[layerIndex].color;

        // Row labels
        ctx.textAlign = 'right';
        ctx.fillText(`${traitNum}`, labelSpace - 4, labelSpace + i * cellSize + cellSize / 2);

        // Column labels
        ctx.save();
        ctx.translate(labelSpace + i * cellSize + cellSize / 2, labelSpace - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillText(`${traitNum}`, 0, 0);
        ctx.restore();
      }
    }
  }, [matrix, visibleIndices, cellSize, showLabels, hoveredCell, getColor]);

  // Handle mouse events
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const labelSpace = showLabels ? 60 : 0;
    const x = (e.clientX - rect.left) * scaleX - labelSpace;
    const y = (e.clientY - rect.top) * scaleY - labelSpace;

    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    const n = visibleIndices.length;
    if (col >= 0 && col < n && row >= 0 && row < n) {
      const i = visibleIndices[row];
      const j = visibleIndices[col];
      setHoveredCell({ x: col, y: row, value: matrix[i][j] });
    } else {
      setHoveredCell(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  // Get hovered cell info
  const hoveredInfo = hoveredCell ? {
    trait1: visibleIndices[hoveredCell.y] + 1,
    trait2: visibleIndices[hoveredCell.x] + 1,
    name1: TRAIT_NAMES[visibleIndices[hoveredCell.y] + 1],
    name2: TRAIT_NAMES[visibleIndices[hoveredCell.x] + 1],
    value: hoveredCell.value,
    percentage: ((hoveredCell.value / totalEntities) * 100).toFixed(1)
  } : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Layer Filter</InputLabel>
          <Select
            value={layerFilter}
            label="Layer Filter"
            onChange={(e) => setLayerFilter(e.target.value)}
          >
            <MenuItem value="all">All Layers</MenuItem>
            {LAYERS.map(layer => (
              <MenuItem key={layer.name} value={layer.name}>{layer.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={() => setCellSize(s => Math.max(8, s - 4))}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption">{cellSize}px</Typography>
          <IconButton size="small" onClick={() => setCellSize(s => Math.min(40, s + 4))}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Box>

        <FormControlLabel
          control={<Switch checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} size="small" />}
          label="Labels"
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 150 }}>
          <Typography variant="caption">Min:</Typography>
          <Slider
            value={minThreshold}
            onChange={(_, v) => setMinThreshold(v as number)}
            min={0}
            max={Math.ceil(maxValue / 2)}
            size="small"
            sx={{ width: 100 }}
          />
          <Typography variant="caption">{minThreshold}</Typography>
        </Box>

        {onRefresh && (
          <IconButton size="small" onClick={onRefresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Heatmap */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Paper
          sx={{
            p: 1,
            bgcolor: 'rgba(0,0,0,0.5)',
            overflow: 'auto',
            maxWidth: '100%'
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              cursor: 'crosshair',
              imageRendering: 'pixelated'
            }}
          />
        </Paper>

        {/* Info Panel */}
        <Box sx={{ minWidth: 200 }}>
          {/* Hovered cell info */}
          {hoveredInfo ? (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Co-occurrence
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Chip
                  label={`${hoveredInfo.trait1}: ${hoveredInfo.name1}`}
                  size="small"
                  sx={{
                    bgcolor: `${LAYERS[Math.floor((hoveredInfo.trait1 - 1) / 8)].color}30`,
                    borderColor: LAYERS[Math.floor((hoveredInfo.trait1 - 1) / 8)].color
                  }}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Chip
                  label={`${hoveredInfo.trait2}: ${hoveredInfo.name2}`}
                  size="small"
                  sx={{
                    bgcolor: `${LAYERS[Math.floor((hoveredInfo.trait2 - 1) / 8)].color}30`,
                    borderColor: LAYERS[Math.floor((hoveredInfo.trait2 - 1) / 8)].color
                  }}
                  variant="outlined"
                />
              </Box>
              <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>
                {hoveredInfo.value.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {hoveredInfo.percentage}% of entities
              </Typography>
            </Paper>
          ) : (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Hover over a cell to see details
              </Typography>
            </Paper>
          )}

          {/* Color scale */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Scale
            </Typography>
            <Box sx={{
              height: 20,
              background: 'linear-gradient(to right, #141428, #325ca0, #00c8ff, #64ff64, #ffff00, #ff9900, #ff3020)',
              borderRadius: 1,
              mb: 1
            }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption">0</Typography>
              <Typography variant="caption">{maxValue.toLocaleString()}</Typography>
            </Box>
          </Paper>

          {/* Layer legend */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Layers
            </Typography>
            {LAYERS.map((layer, i) => (
              <Box key={layer.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Box sx={{ width: 12, height: 12, bgcolor: layer.color, borderRadius: 0.5 }} />
                <Typography variant="caption">
                  {layer.name} ({i * 8 + 1}-{(i + 1) * 8})
                </Typography>
              </Box>
            ))}
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
