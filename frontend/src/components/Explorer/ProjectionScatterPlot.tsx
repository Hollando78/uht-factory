import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  Paper,
  Typography,
  Tooltip as MuiTooltip,
  IconButton,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as CenterIcon
} from '@mui/icons-material';
import { explorerAPI, type ProjectionPoint } from '../../services/api';

interface Props {
  projectionType: 'umap' | 'tsne';
  onEntitySelect: (uuid: string) => void;
}

type ColorMode = 'layer' | 'trait_count' | 'none';

const LAYER_COLORS = {
  Physical: '#FF6B35',   // Orange
  Functional: '#00E5FF', // Cyan
  Abstract: '#9C27B0',   // Purple
  Social: '#4CAF50'      // Green
};

function getDominantLayer(uhtCode: string): keyof typeof LAYER_COLORS {
  if (!uhtCode || uhtCode.length !== 8) return 'Physical';

  const layers = {
    Physical: 0,
    Functional: 0,
    Abstract: 0,
    Social: 0
  };

  try {
    const physical = parseInt(uhtCode.slice(0, 2), 16);
    const functional = parseInt(uhtCode.slice(2, 4), 16);
    const abstract = parseInt(uhtCode.slice(4, 6), 16);
    const social = parseInt(uhtCode.slice(6, 8), 16);

    layers.Physical = physical.toString(2).split('1').length - 1;
    layers.Functional = functional.toString(2).split('1').length - 1;
    layers.Abstract = abstract.toString(2).split('1').length - 1;
    layers.Social = social.toString(2).split('1').length - 1;
  } catch {
    return 'Physical';
  }

  return Object.entries(layers).reduce((a, b) => b[1] > a[1] ? b : a)[0] as keyof typeof LAYER_COLORS;
}

function getTraitCount(uhtCode: string): number {
  try {
    const num = parseInt(uhtCode, 16);
    return num.toString(2).split('1').length - 1;
  } catch {
    return 0;
  }
}

function traitCountToColor(count: number): string {
  // 0-8: blue, 8-16: green, 16-24: yellow, 24-32: red
  const normalized = Math.min(count / 32, 1);
  if (normalized < 0.25) {
    return `hsl(200, 80%, ${50 + normalized * 100}%)`;
  } else if (normalized < 0.5) {
    return `hsl(${200 - (normalized - 0.25) * 400}, 80%, 60%)`;
  } else if (normalized < 0.75) {
    return `hsl(${100 - (normalized - 0.5) * 200}, 80%, 55%)`;
  } else {
    return `hsl(${50 - (normalized - 0.75) * 200}, 80%, 50%)`;
  }
}

export default function ProjectionScatterPlot({ projectionType, onEntitySelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ProjectionPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [colorMode, setColorMode] = useState<ColorMode>('layer');
  const [pointSize, setPointSize] = useState(3);

  // Transform state
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadProjections();
  }, [projectionType]);

  useEffect(() => {
    renderCanvas();
  }, [points, transform, colorMode, pointSize, hoveredPoint]);

  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [points, transform, colorMode, pointSize]);

  const loadProjections = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await explorerAPI.getProjections(projectionType);
      setPoints(data.points);
      // Reset transform when changing projection type
      setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
    } catch (err) {
      console.error('Failed to load projections:', err);
      setError('Failed to load projection data');
    } finally {
      setLoading(false);
    }
  };

  const getPointColor = useCallback((point: ProjectionPoint): string => {
    switch (colorMode) {
      case 'layer':
        return LAYER_COLORS[getDominantLayer(point.uht_code)];
      case 'trait_count':
        return traitCountToColor(getTraitCount(point.uht_code));
      case 'none':
      default:
        return '#00e5ff';
    }
  }, [colorMode]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (points.length === 0) return;

    const { scale, offsetX, offsetY } = transform;
    const padding = 50;
    const plotWidth = rect.width - padding * 2;
    const plotHeight = rect.height - padding * 2;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Draw points
    for (const point of points) {
      // Map [-1, 1] to canvas coordinates
      const x = centerX + (point.x * plotWidth / 2) * scale + offsetX;
      const y = centerY - (point.y * plotHeight / 2) * scale + offsetY;

      // Skip if out of view
      if (x < -10 || x > rect.width + 10 || y < -10 || y > rect.height + 10) continue;

      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fillStyle = point === hoveredPoint ? '#ffffff' : getPointColor(point);
      ctx.globalAlpha = point === hoveredPoint ? 1 : 0.7;
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Draw highlighted point larger
    if (hoveredPoint) {
      const x = centerX + (hoveredPoint.x * plotWidth / 2) * scale + offsetX;
      const y = centerY - (hoveredPoint.y * plotHeight / 2) * scale + offsetY;

      ctx.beginPath();
      ctx.arc(x, y, pointSize + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [points, transform, colorMode, pointSize, hoveredPoint, getPointColor]);

  const findPointAt = useCallback((screenX: number, screenY: number): ProjectionPoint | null => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const { scale, offsetX, offsetY } = transform;
    const padding = 50;
    const plotWidth = rect.width - padding * 2;
    const plotHeight = rect.height - padding * 2;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const hitRadius = (pointSize + 5) / scale;

    for (const point of points) {
      const px = centerX + (point.x * plotWidth / 2) * scale + offsetX;
      const py = centerY - (point.y * plotHeight / 2) * scale + offsetY;

      const dx = screenX - px;
      const dy = screenY - py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitRadius * scale) {
        return point;
      }
    }

    return null;
  }, [points, transform, pointSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDraggingRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      setTransform(prev => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy
      }));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      setHoveredPoint(null);
    } else {
      const point = findPointAt(x, y);
      setHoveredPoint(point);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredPoint(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container || isDraggingRef.current) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const point = findPointAt(x, y);
    if (point) {
      onEntitySelect(point.uuid);
    }
  };

  // Attach wheel handler with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform(prev => ({
        ...prev,
        scale: Math.max(0.5, Math.min(10, prev.scale * delta))
      }));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.5) }));
  };

  const handleZoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(0.5, prev.scale / 1.5) }));
  };

  const handleCenter = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      {/* Controls */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          p: 1.5,
          zIndex: 10,
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Color by</InputLabel>
          <Select
            value={colorMode}
            label="Color by"
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
          >
            <MenuItem value="layer">Dominant Layer</MenuItem>
            <MenuItem value="trait_count">Trait Count</MenuItem>
            <MenuItem value="none">None</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ width: 100 }}>
          <Typography variant="caption" color="text.secondary">Point size</Typography>
          <Slider
            value={pointSize}
            onChange={(_, v) => setPointSize(v as number)}
            min={1}
            max={8}
            size="small"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <MuiTooltip title="Zoom in">
            <IconButton size="small" onClick={handleZoomIn}><ZoomInIcon /></IconButton>
          </MuiTooltip>
          <MuiTooltip title="Zoom out">
            <IconButton size="small" onClick={handleZoomOut}><ZoomOutIcon /></IconButton>
          </MuiTooltip>
          <MuiTooltip title="Reset view">
            <IconButton size="small" onClick={handleCenter}><CenterIcon /></IconButton>
          </MuiTooltip>
        </Box>
      </Paper>

      {/* Legend */}
      {colorMode === 'layer' && (
        <Paper
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            p: 1.5,
            zIndex: 10
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Dominant Layer
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {Object.entries(LAYER_COLORS).map(([layer, color]) => (
              <Box key={layer} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color }} />
                <Typography variant="caption">{layer}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Stats */}
      <Paper
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          p: 1.5,
          zIndex: 10
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {points.length.toLocaleString()} points | Zoom: {transform.scale.toFixed(1)}x
        </Typography>
      </Paper>

      {/* Canvas */}
      <Box
        ref={containerRef}
        sx={{ width: '100%', height: '100%', cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </Box>

      {/* Tooltip */}
      {hoveredPoint && (
        <Paper
          sx={{
            position: 'fixed',
            left: tooltipPos.x + 15,
            top: tooltipPos.y + 15,
            p: 1.5,
            zIndex: 1000,
            pointerEvents: 'none',
            maxWidth: 300
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {hoveredPoint.name}
          </Typography>
          <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace' }}>
            {hoveredPoint.uht_code}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Click to view neighbors
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
