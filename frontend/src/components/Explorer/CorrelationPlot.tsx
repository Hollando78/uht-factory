import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  Paper,
  Typography,
  Slider,
  FormControlLabel,
  Switch
} from '@mui/material';
import { explorerAPI, type CorrelationSample } from '../../services/api';

interface TooltipData {
  sample: CorrelationSample;
  x: number;
  y: number;
}

export default function CorrelationPlot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [samples, setSamples] = useState<CorrelationSample[]>([]);
  const [correlation, setCorrelation] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState(5000);
  const [showDiagonal, setShowDiagonal] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(true);
  const [pointSize, setPointSize] = useState(2);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    loadCorrelations();
  }, [sampleSize]);

  useEffect(() => {
    renderCanvas();
  }, [samples, showDiagonal, showQuadrants, pointSize]);

  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [samples, showDiagonal, showQuadrants, pointSize]);

  const loadCorrelations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await explorerAPI.getCorrelations(sampleSize);
      setSamples(data.samples);
      setCorrelation(data.correlation);
    } catch (err) {
      console.error('Failed to load correlations:', err);
      setError('Failed to load correlation data');
    } finally {
      setLoading(false);
    }
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (square)
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const padding = 60;
    const plotSize = size - padding * 2;

    // Clear
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, size, size);

    // Draw quadrant backgrounds if enabled
    if (showQuadrants) {
      // Top-left: semantic similar, structural different (high embed sim, low UHT sim)
      ctx.fillStyle = 'rgba(255, 107, 107, 0.1)';
      ctx.fillRect(padding, padding, plotSize / 2, plotSize / 2);

      // Top-right: both similar (high embed sim, high UHT sim)
      ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
      ctx.fillRect(padding + plotSize / 2, padding, plotSize / 2, plotSize / 2);

      // Bottom-left: both different (low embed sim, low UHT sim)
      ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
      ctx.fillRect(padding, padding + plotSize / 2, plotSize / 2, plotSize / 2);

      // Bottom-right: structural similar, semantic different (low embed sim, high UHT sim)
      ctx.fillStyle = 'rgba(255, 193, 7, 0.1)';
      ctx.fillRect(padding + plotSize / 2, padding + plotSize / 2, plotSize / 2, plotSize / 2);
    }

    // Draw diagonal line if enabled
    if (showDiagonal) {
      ctx.beginPath();
      ctx.moveTo(padding, padding + plotSize);
      ctx.lineTo(padding + plotSize, padding);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding + plotSize);
    ctx.lineTo(padding + plotSize, padding + plotSize);
    ctx.stroke();

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + plotSize);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    // X-axis label
    ctx.fillText('UHT Similarity (Hamming)', padding + plotSize / 2, size - 10);

    // Y-axis label
    ctx.save();
    ctx.translate(15, padding + plotSize / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Embedding Similarity (Cosine)', 0, 0);
    ctx.restore();

    // Tick marks and values
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';

    for (let i = 0; i <= 10; i += 2) {
      const val = i / 10;
      const x = padding + (val * plotSize);
      const y = padding + plotSize - (val * plotSize);

      // X ticks
      ctx.textAlign = 'center';
      ctx.fillText(val.toFixed(1), x, size - padding + 15);

      // Y ticks
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1), padding - 5, y + 4);
    }

    // Draw points
    for (const sample of samples) {
      const x = padding + (sample.uht_similarity * plotSize);
      const y = padding + plotSize - (sample.embedding_similarity * plotSize);

      // Color based on disagreement
      const diff = Math.abs(sample.embedding_similarity - sample.uht_similarity);
      let color: string;
      if (diff < 0.2) {
        color = 'rgba(76, 175, 80, 0.6)'; // Green - good agreement
      } else if (diff < 0.3) {
        color = 'rgba(0, 229, 255, 0.6)'; // Cyan - moderate
      } else {
        color = 'rgba(255, 107, 107, 0.6)'; // Red - disagreement
      }

      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Draw correlation value
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Correlation: ${correlation.toFixed(3)}`, padding + 10, padding + 20);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(`${samples.length.toLocaleString()} pairs sampled`, padding + 10, padding + 38);
  }, [samples, correlation, showDiagonal, showQuadrants, pointSize]);

  // Handle mouse move for tooltips
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || samples.length === 0) {
      setTooltip(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const size = Math.min(rect.width, rect.height);
    const padding = 60;
    const plotSize = size - padding * 2;

    // Find nearest point
    let nearestSample: CorrelationSample | null = null;
    let nearestDist = Infinity;
    const threshold = 15; // pixels

    for (const sample of samples) {
      const px = padding + (sample.uht_similarity * plotSize);
      const py = padding + plotSize - (sample.embedding_similarity * plotSize);
      const dist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2);

      if (dist < nearestDist && dist < threshold) {
        nearestDist = dist;
        nearestSample = sample;
      }
    }

    if (nearestSample) {
      setTooltip({
        sample: nearestSample,
        x: e.clientX,
        y: e.clientY
      });
    } else {
      setTooltip(null);
    }
  }, [samples]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

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
    <Box sx={{ height: '100%', display: 'flex', p: 2, gap: 2 }}>
      {/* Controls */}
      <Paper sx={{ p: 2, width: 280, flexShrink: 0, overflow: 'auto' }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>
          Correlation Analysis
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Compares embedding similarity (cosine) with UHT similarity (1 - hamming/32)
          for randomly sampled entity pairs.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Sample Size: {sampleSize.toLocaleString()}
          </Typography>
          <Slider
            value={sampleSize}
            onChange={(_, v) => setSampleSize(v as number)}
            min={1000}
            max={10000}
            step={1000}
            marks={[
              { value: 1000, label: '1K' },
              { value: 5000, label: '5K' },
              { value: 10000, label: '10K' }
            ]}
            onChangeCommitted={() => loadCorrelations()}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Point Size
          </Typography>
          <Slider
            value={pointSize}
            onChange={(_, v) => setPointSize(v as number)}
            min={1}
            max={5}
            size="small"
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={showDiagonal}
              onChange={(e) => setShowDiagonal(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">Show diagonal</Typography>}
        />

        <FormControlLabel
          control={
            <Switch
              checked={showQuadrants}
              onChange={(e) => setShowQuadrants(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">Show quadrants</Typography>}
        />

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>Legend</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(76, 175, 80, 0.6)', borderRadius: '50%' }} />
              <Typography variant="caption">Good agreement</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(0, 229, 255, 0.6)', borderRadius: '50%' }} />
              <Typography variant="caption">Moderate agreement</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(255, 107, 107, 0.6)', borderRadius: '50%' }} />
              <Typography variant="caption">Disagreement</Typography>
            </Box>
          </Box>
        </Box>

        {showQuadrants && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>Quadrants</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(255, 107, 107, 0.3)', flexShrink: 0 }} />
                <Typography variant="caption">
                  Semantic similar, structural different
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(255, 193, 7, 0.3)', flexShrink: 0 }} />
                <Typography variant="caption">
                  Structural similar, semantic different
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ width: 16, height: 16, bgcolor: 'rgba(76, 175, 80, 0.3)', flexShrink: 0 }} />
                <Typography variant="caption">
                  Agreement (both similar or different)
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Canvas */}
      <Box
        ref={containerRef}
        sx={{
          flexGrow: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', cursor: tooltip ? 'pointer' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </Box>

      {/* Tooltip */}
      {tooltip && (
        <Box
          sx={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.5)',
            borderRadius: 1,
            p: 1.5,
            maxWidth: 300,
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            {tooltip.sample.entity1_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            vs
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            {tooltip.sample.entity2_name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">UHT Sim</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {tooltip.sample.uht_similarity.toFixed(3)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Emb Sim</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {tooltip.sample.embedding_similarity.toFixed(3)}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
