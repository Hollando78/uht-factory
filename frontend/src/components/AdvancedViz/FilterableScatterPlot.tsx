import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  MenuItem,
  FormControlLabel,
  Switch,
  TextField,
  Autocomplete,
  InputAdornment,
  Chip,
  Collapse
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as CenterIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Gradient as HeatmapIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as SkipNextIcon,
  SkipPrevious as SkipPrevIcon,
  DirectionsWalk as WalkIcon,
  Gesture as LassoIcon,
  FitScreen as FitScreenIcon,
  Gif as GifIcon,
  Explore as TourIcon,
  Psychology as InsightIcon,
  Stop as StopIcon,
  PhoneAndroid as MobileIcon
} from '@mui/icons-material';
import GIF from 'gif.js';
import gifWorkerScript from 'gif.js/dist/gif.worker.js?raw';
import {
  explorerAPI,
  traitsAPI,
  type ProjectionPoint,
  type ClusterLabel,
  type TourResponse,
  type SelectionDescription,
  type SubsetProjectionResponse
} from '../../services/api';
import type { Trait } from '../../types';

// Import utilities from extracted module
import {
  LAYER_COLORS,
  getLabelFontSize,
  getLabelOpacity,
  getDominantLayer,
  getTraitCount,
  traitCountToColor,
  hammingDistance,
  distanceToColor,
  hasTraitBit,
  getLayerForTrait,
  pointInPolygon,
  seededRandom
} from './utils/scatterPlotUtils';
import type { ColorMode } from './types';

// Create a blob URL for the gif.js worker to avoid server path issues
const gifWorkerBlob = new Blob([gifWorkerScript], { type: 'application/javascript' });
const gifWorkerUrl = URL.createObjectURL(gifWorkerBlob);

interface Props {
  projectionType: 'umap' | 'tsne' | 'uht' | 'uht_umap';
  onEntitySelect: (uuid: string) => void;
}

export default function FilterableScatterPlot({ projectionType, onEntitySelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterLabel[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ProjectionPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [colorMode, setColorMode] = useState<ColorMode>('layer');
  const [pointSize, setPointSize] = useState(3);
  const [foundPoint, setFoundPoint] = useState<ProjectionPoint | null>(null);
  const [searchValue, setSearchValue] = useState<ProjectionPoint | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(true);
  const [layerFilter, setLayerFilter] = useState({
    Physical: true,
    Functional: true,
    Abstract: true,
    Social: true
  });
  const [traitRange, setTraitRange] = useState<[number, number]>([0, 32]);

  // Heatmap state
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapReference, setHeatmapReference] = useState<ProjectionPoint | null>(null);

  // Trait walk state
  const [traitWalk, setTraitWalk] = useState({
    isActive: false, // Whether trait walk visualization is on
    isPlaying: false, // Whether animation is running
    currentTrait: 1, // 1-32
    speed: 1000 // ms per trait
  });
  const [traits, setTraits] = useState<Trait[]>([]);
  const traitWalkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // GIF export state
  const [gifExporting, setGifExporting] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);

  // Lasso selection state
  const [lassoMode, setLassoMode] = useState<'off' | 'drawing' | 'active'>('off');
  const [lassoPoints, setLassoPoints] = useState<Array<{x: number, y: number}>>([]);
  const [lassoInvert, setLassoInvert] = useState(false);

  // Tour state
  const [tour, setTour] = useState<TourResponse | null>(null);
  const [tourPlaying, setTourPlaying] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourLoading, setTourLoading] = useState(false);
  const tourIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animated tour state
  type TourAnimPhase = 'idle' | 'highlight' | 'zoom_in' | 'neighbors' | 'linger' | 'zoom_out' | 'fly';
  const [tourAnimPhase, setTourAnimPhase] = useState<TourAnimPhase>('idle');
  const [tourAnimProgress, setTourAnimProgress] = useState(0);
  const [tourFlightPath, setTourFlightPath] = useState<Array<{x: number, y: number}>>([]);
  const [tourNeighbors, setTourNeighbors] = useState<ProjectionPoint[]>([]);
  const [tourHighlightRadius, setTourHighlightRadius] = useState(0);
  const tourAnimRef = useRef<number | null>(null);
  const tourPlayingRef = useRef(false); // Use ref to avoid stale closure
  const tourCancelledRef = useRef(false); // Track if tour was cancelled mid-animation

  // LLM Insights state
  const [selectionDescription, setSelectionDescription] = useState<SelectionDescription | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Subset projection state
  const [subsetProjection, setSubsetProjection] = useState<SubsetProjectionResponse | null>(null);
  const [subsetLoading, setSubsetLoading] = useState(false);
  const [fullPoints, setFullPoints] = useState<ProjectionPoint[]>([]); // Store original points when in subset mode

  // Cluster loading state (clusters load in background after points)
  const [clustersLoading, setClustersLoading] = useState(false);

  // Transform state
  const [transform, setTransform] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const transformRef = useRef(transform); // Keep ref in sync for animations
  transformRef.current = transform;
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Helper to convert data point to screen coordinates for lasso test
  const getPointScreenCoords = useCallback((point: ProjectionPoint) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const padding = 50;
    const plotWidth = rect.width - padding * 2;
    const plotHeight = rect.height - padding * 2;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const x = centerX + (point.x * plotWidth / 2) * transform.scale + transform.offsetX;
    const y = centerY - (point.y * plotHeight / 2) * transform.scale + transform.offsetY;

    return { x, y };
  }, [transform]);

  // Filtered points based on layer, trait count, and lasso filters
  const filteredPoints = useMemo(() => {
    const result = points.filter(point => {
      // Layer filter
      const layer = getDominantLayer(point.uht_code);
      if (!layerFilter[layer]) return false;

      // Trait count filter
      const count = getTraitCount(point.uht_code);
      if (count < traitRange[0] || count > traitRange[1]) return false;

      // Lasso filter
      if (lassoMode === 'active' && lassoPoints.length >= 3) {
        const screenCoords = getPointScreenCoords(point);
        const insideLasso = pointInPolygon(screenCoords.x, screenCoords.y, lassoPoints);
        // If invert is on, show points OUTSIDE the lasso
        if (lassoInvert ? insideLasso : !insideLasso) return false;
      }

      return true;
    });
    return result;
  }, [points, layerFilter, traitRange, lassoMode, lassoPoints, lassoInvert, getPointScreenCoords]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    const allLayersEnabled = Object.values(layerFilter).every(v => v);
    const fullTraitRange = traitRange[0] === 0 && traitRange[1] === 32;
    const hasLasso = lassoMode === 'active' && lassoPoints.length >= 3;
    return !allLayersEnabled || !fullTraitRange || hasLasso;
  }, [layerFilter, traitRange, lassoMode, lassoPoints]);

  useEffect(() => {
    loadProjections();
  }, [projectionType]);

  useEffect(() => {
    renderCanvas();
  }, [filteredPoints, clusters, showLabels, transform, colorMode, pointSize, hoveredPoint, foundPoint, heatmapEnabled, heatmapReference, lassoPoints, lassoMode, tour, tourIndex, tourAnimPhase, tourAnimProgress, tourFlightPath, tourNeighbors, tourHighlightRadius]);

  useEffect(() => {
    const handleResize = () => renderCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [filteredPoints, transform, colorMode, pointSize]);

  // Load traits for trait walk
  useEffect(() => {
    const loadTraits = async () => {
      try {
        const data = await traitsAPI.getAllTraits();
        setTraits(data.traits);
      } catch (err) {
        console.error('Failed to load traits:', err);
      }
    };
    loadTraits();
  }, []);

  // Trait walk animation
  useEffect(() => {
    if (traitWalk.isPlaying) {
      traitWalkIntervalRef.current = setInterval(() => {
        setTraitWalk(prev => ({
          ...prev,
          currentTrait: prev.currentTrait >= 32 ? 1 : prev.currentTrait + 1
        }));
      }, traitWalk.speed);
    }

    return () => {
      if (traitWalkIntervalRef.current) {
        clearInterval(traitWalkIntervalRef.current);
        traitWalkIntervalRef.current = null;
      }
    };
  }, [traitWalk.isPlaying, traitWalk.speed]);

  // Re-render when trait walk changes
  useEffect(() => {
    renderCanvas();
  }, [traitWalk.currentTrait]);

  const loadProjections = async () => {
    setLoading(true);
    setError(null);
    setClusters([]); // Clear clusters while loading

    try {
      // Step 1: Load projections first (fast) - show points immediately
      if (projectionType === 'uht') {
        // For UHT mode, fetch entity data but compute coordinates client-side
        const projData = await explorerAPI.getProjections('umap');

        // First pass: compute raw coordinates and find data range
        const rawCoords = projData.points.map(point => {
          const code = point.uht_code || '00000000';
          return {
            point,
            rawX: parseInt(code.slice(0, 4), 16),
            rawY: parseInt(code.slice(4, 8), 16)
          };
        });

        const maxX = Math.max(...rawCoords.map(c => c.rawX));
        const maxY = Math.max(...rawCoords.map(c => c.rawY));

        // Second pass: normalize so 0x0000 at bottom-left (-0.9,-0.9), max at top-right (0.9,0.9)
        const safeMaxX = maxX || 1;
        const safeMaxY = maxY || 1;
        const uhtPoints = rawCoords.map(({ point, rawX, rawY }) => {
          const normX = (rawX / safeMaxX) * 1.8 - 0.9;
          const normY = (rawY / safeMaxY) * 1.8 - 0.9;
          // Minimal jitter - just enough to prevent exact overlap
          const jitterX = (seededRandom(point.uuid) - 0.5) * 0.002;
          const jitterY = (seededRandom(point.uuid + 'y') - 0.5) * 0.002;
          return {
            ...point,
            x: normX + jitterX,
            y: normY + jitterY
          };
        });

        setPoints(uhtPoints);
      } else {
        const projData = await explorerAPI.getProjections(projectionType);
        setPoints(projData.points);
      }

      // Reset transform and search when changing projection type
      setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
      setFoundPoint(null);
      setSearchValue(null);
      setLoading(false); // Show points immediately

      // Step 2: Load clusters in background (slow) - don't block UI
      setClustersLoading(true);
      const clusterMethod = projectionType === 'uht' ? 'uht' : projectionType;
      explorerAPI.getClusters(clusterMethod, 'level7')
        .then(clusterData => {
          setClusters(clusterData.clusters || []);
        })
        .catch(err => {
          console.warn('Failed to load cluster labels (will show without labels):', err);
          // Don't set error - just show points without labels
        })
        .finally(() => {
          setClustersLoading(false);
        });

    } catch (err) {
      console.error('Failed to load projections:', err);
      setError('Failed to load projection data');
      setLoading(false);
    }
  };

  const getPointColor = useCallback((point: ProjectionPoint): string => {
    // Heatmap mode takes precedence
    if (heatmapEnabled && heatmapReference) {
      const distance = hammingDistance(point.uht_code, heatmapReference.uht_code);
      return distanceToColor(distance);
    }

    switch (colorMode) {
      case 'layer':
        return LAYER_COLORS[getDominantLayer(point.uht_code)];
      case 'trait_count':
        return traitCountToColor(getTraitCount(point.uht_code));
      case 'none':
      default:
        return '#00e5ff';
    }
  }, [colorMode, heatmapEnabled, heatmapReference]);

  // Core render function that can target any canvas
  const renderToCanvas = useCallback((
    targetCanvas: HTMLCanvasElement,
    width: number,
    height: number,
    renderTransform: { scale: number; offsetX: number; offsetY: number },
    renderPointSize: number,
    forExport: boolean = false,
    pointsToRender: ProjectionPoint[] = filteredPoints
  ) => {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // High quality rendering for export
    if (forExport) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    // Clear
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    if (pointsToRender.length === 0) return;

    const { scale, offsetX, offsetY } = renderTransform;
    const padding = 50 * (forExport ? width / 1000 : 1); // Scale padding for export
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw points
    for (const point of pointsToRender) {
      const x = centerX + (point.x * plotWidth / 2) * scale + offsetX;
      const y = centerY - (point.y * plotHeight / 2) * scale + offsetY;

      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;

      // Determine opacity based on trait walk mode
      let pointOpacity = 0.7;
      let pointColor = getPointColor(point);

      if (!forExport && traitWalk.isActive) {
        const hasTrait = hasTraitBit(point.uht_code, traitWalk.currentTrait);
        if (hasTrait) {
          // Highlight points with the current trait
          pointOpacity = 1.0;
          pointColor = LAYER_COLORS[getLayerForTrait(traitWalk.currentTrait) as keyof typeof LAYER_COLORS];
        } else {
          // Dim points without the trait
          pointOpacity = 0.15;
        }
      }

      ctx.beginPath();
      ctx.arc(x, y, renderPointSize, 0, Math.PI * 2);
      ctx.fillStyle = (!forExport && point === hoveredPoint) ? '#ffffff' : pointColor;
      ctx.globalAlpha = (!forExport && point === hoveredPoint) ? 1 : pointOpacity;
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Draw cluster labels
    if (showLabels && clusters.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxSize = Math.max(...clusters.map(c => c.size), 1);
      const fontScale = 1;

      // Track placed label bounding boxes to prevent overlap
      const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];

      // Sort clusters by size (largest first) so important labels get placed first
      const sortedClusters = [...clusters].sort((a, b) => b.size - a.size);

      for (const cluster of sortedClusters) {
        const x = centerX + (cluster.centroid_x * plotWidth / 2) * scale + offsetX;
        const y = centerY - (cluster.centroid_y * plotHeight / 2) * scale + offsetY;

        if (x < -50 || x > width + 50 || y < -20 || y > height + 20) continue;

        const fontSize = Math.round(getLabelFontSize(scale, cluster.size, maxSize) * fontScale);
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

        const labelOpacity = getLabelOpacity(cluster.size, maxSize);
        const labelText = cluster.label;
        const metrics = ctx.measureText(labelText);
        const labelPadding = 4;
        const bgWidth = metrics.width + labelPadding * 2;
        const bgHeight = fontSize + 6;

        // Check for overlap with already placed labels
        const labelBox = {
          x: x - bgWidth / 2,
          y: y - bgHeight / 2,
          w: bgWidth,
          h: bgHeight
        };

        const overlaps = placedLabels.some(placed => {
          const margin = 2; // Small margin between labels
          return !(labelBox.x + labelBox.w + margin < placed.x ||
                   labelBox.x > placed.x + placed.w + margin ||
                   labelBox.y + labelBox.h + margin < placed.y ||
                   labelBox.y > placed.y + placed.h + margin);
        });

        if (overlaps) continue; // Skip this label if it overlaps

        placedLabels.push(labelBox);

        // Draw background
        ctx.globalAlpha = labelOpacity * 0.8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight, 4);
        ctx.fill();

        // Draw text
        ctx.globalAlpha = labelOpacity;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x, y);
      }

      ctx.globalAlpha = 1;
    }

    // Draw found point (skip for export)
    if (!forExport && foundPoint) {
      const x = centerX + (foundPoint.x * plotWidth / 2) * scale + offsetX;
      const y = centerY - (foundPoint.y * plotHeight / 2) * scale + offsetY;

      ctx.beginPath();
      ctx.arc(x, y, renderPointSize + 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, renderPointSize + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, renderPointSize + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffeb3b';
      ctx.fill();
    }

    // Draw hovered point (skip for export)
    if (!forExport && hoveredPoint && hoveredPoint !== foundPoint) {
      const x = centerX + (hoveredPoint.x * plotWidth / 2) * scale + offsetX;
      const y = centerY - (hoveredPoint.y * plotHeight / 2) * scale + offsetY;

      ctx.beginPath();
      ctx.arc(x, y, renderPointSize + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw tour overlays (skip for export)
    if (!forExport && tour && tour.stops.length > 0) {
      const currentStop = tour.stops[tourIndex];
      const currentX = centerX + (currentStop.x * plotWidth / 2) * scale + offsetX;
      const currentY = centerY - (currentStop.y * plotHeight / 2) * scale + offsetY;

      // Draw flight path
      if (tourFlightPath.length > 1 && (tourAnimPhase === 'fly' || tourAnimPhase === 'zoom_out')) {
        ctx.beginPath();
        const firstPt = tourFlightPath[0];
        ctx.moveTo(
          centerX + (firstPt.x * plotWidth / 2) * scale + offsetX,
          centerY - (firstPt.y * plotHeight / 2) * scale + offsetY
        );

        // Draw path up to current progress during fly phase
        const pathProgress = tourAnimPhase === 'fly' ? tourAnimProgress : 0;
        const pathEndIdx = Math.floor(pathProgress * (tourFlightPath.length - 1));

        for (let i = 1; i <= pathEndIdx; i++) {
          const pt = tourFlightPath[i];
          ctx.lineTo(
            centerX + (pt.x * plotWidth / 2) * scale + offsetX,
            centerY - (pt.y * plotHeight / 2) * scale + offsetY
          );
        }

        // Gradient stroke for flight path
        const gradient = ctx.createLinearGradient(
          centerX + (tourFlightPath[0].x * plotWidth / 2) * scale + offsetX,
          centerY - (tourFlightPath[0].y * plotHeight / 2) * scale + offsetY,
          currentX, currentY
        );
        gradient.addColorStop(0, 'rgba(0, 229, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 229, 255, 0.8)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw neighbor connections during neighbors phase
      if ((tourAnimPhase === 'neighbors' || tourAnimPhase === 'linger') && tourNeighbors.length > 0) {
        const neighborOpacity = tourAnimPhase === 'neighbors' ? tourAnimProgress : 1;

        for (const neighbor of tourNeighbors) {
          const nx = centerX + (neighbor.x * plotWidth / 2) * scale + offsetX;
          const ny = centerY - (neighbor.y * plotHeight / 2) * scale + offsetY;

          // Draw connecting line
          ctx.beginPath();
          ctx.moveTo(currentX, currentY);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = `rgba(255, 152, 0, ${0.4 * neighborOpacity})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Draw neighbor highlight
          ctx.beginPath();
          ctx.arc(nx, ny, renderPointSize + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 152, 0, ${0.7 * neighborOpacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Draw current stop highlight ring
      if (tourAnimPhase === 'highlight' || tourAnimPhase === 'zoom_in' || tourAnimPhase === 'neighbors' || tourAnimPhase === 'linger') {
        const baseRadius = tourAnimPhase === 'highlight' ? tourHighlightRadius : 25;
        const pulseOffset = tourAnimPhase === 'linger' ? Math.sin(Date.now() / 300) * 5 : 0;

        // Outer glow
        ctx.beginPath();
        ctx.arc(currentX, currentY, baseRadius + pulseOffset + 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Middle ring
        ctx.beginPath();
        ctx.arc(currentX, currentY, baseRadius + pulseOffset + 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Inner ring
        ctx.beginPath();
        ctx.arc(currentX, currentY, baseRadius + pulseOffset, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw entity name label
        const labelText = currentStop.name;
        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        const labelWidth = ctx.measureText(labelText).width;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(currentX - labelWidth / 2 - 8, currentY + baseRadius + 25, labelWidth + 16, 24, 4);
        ctx.fill();

        // Text
        ctx.fillStyle = '#00e5ff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, currentX, currentY + baseRadius + 37);
      }

      // Draw all tour stops as small markers
      for (let i = 0; i < tour.stops.length; i++) {
        const stop = tour.stops[i];
        const sx = centerX + (stop.x * plotWidth / 2) * scale + offsetX;
        const sy = centerY - (stop.y * plotHeight / 2) * scale + offsetY;

        if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;

        const isCurrent = i === tourIndex;
        const isVisited = i < tourIndex;
        const markerRadius = isCurrent ? 14 : 10;

        // Marker circle
        ctx.beginPath();
        ctx.arc(sx, sy, markerRadius, 0, Math.PI * 2);
        if (isCurrent) {
          ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
        } else if (isVisited) {
          ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        }
        ctx.fill();

        ctx.strokeStyle = isCurrent ? '#00e5ff' : (isVisited ? '#00e5ff' : 'rgba(255, 255, 255, 0.5)');
        ctx.lineWidth = isCurrent ? 2.5 : 1.5;
        ctx.stroke();

        // Stop number
        ctx.font = isCurrent ? 'bold 12px Inter, system-ui, sans-serif' : 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = isCurrent ? '#ffffff' : (isVisited ? '#00e5ff' : 'rgba(255, 255, 255, 0.7)');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, sx, sy);
      }
    }

    // Draw lasso polygon (skip for export)
    if (!forExport && lassoPoints.length > 0) {
      // Fill outside the lasso to dim non-selected area
      if (lassoMode === 'active') {
        ctx.beginPath();
        // Draw outer rectangle (canvas bounds)
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        // Draw inner polygon (lasso) in reverse to create hole
        ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = lassoPoints.length - 1; i >= 0; i--) {
          ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        }
        ctx.closePath();

        // Fill the "donut" (outside lasso is filled, inside is clear)
        ctx.fillStyle = lassoInvert ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.5)';
        ctx.fill('evenodd');
      }

      // Draw lasso outline
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (lassoMode === 'active') {
        ctx.closePath();
      }

      ctx.strokeStyle = lassoInvert ? '#ff6464' : '#00e5ff';
      ctx.lineWidth = 2;
      ctx.setLineDash(lassoMode === 'drawing' ? [5, 5] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [filteredPoints, clusters, showLabels, getPointColor, hoveredPoint, foundPoint, traitWalk, lassoPoints, lassoMode, lassoInvert, tour, tourIndex, tourAnimPhase, tourAnimProgress, tourFlightPath, tourNeighbors, tourHighlightRadius]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      renderToCanvas(canvas, rect.width, rect.height, transform, pointSize, false);
    }
  }, [renderToCanvas, transform, pointSize]);

  // Continuous animation for tour linger phase (pulsing highlight)
  useEffect(() => {
    if (tourAnimPhase === 'linger') {
      let animId: number;
      const animate = () => {
        renderCanvas();
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animId);
    }
  }, [tourAnimPhase, renderCanvas]);

  const exportHighRes = useCallback(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = 4; // 4x resolution for crisp 4K-ish output

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = rect.width * dpr;
    exportCanvas.height = rect.height * dpr;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Render exactly as on screen
    renderToCanvas(exportCanvas, rect.width, rect.height, transform, pointSize, true);

    // Add branding, legend and contact info
    const width = rect.width;
    const height = rect.height;

    // --- UHT Branding (top-left) ---
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('UHT Embedding Explorer', 20, 20);

    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#aaaaaa';
    const projectionLabels: Record<string, string> = {
      umap: 'UMAP Projection',
      tsne: 't-SNE Projection',
      uht: 'UHT Coordinate Space',
      uht_umap: 'UHT-PaCMAP Projection'
    };
    ctx.fillText(projectionLabels[projectionType] || projectionType.toUpperCase(), 20, 44);
    const filterText = filteredPoints.length < points.length
      ? `${filteredPoints.length.toLocaleString()} of ${points.length.toLocaleString()} entities (filtered)`
      : `${points.length.toLocaleString()} entities`;
    ctx.fillText(filterText, 20, 60);

    // --- Legend (bottom-left) ---
    if (colorMode === 'layer') {
      const legendX = 20;
      const legendY = height - 100;
      const legendWidth = 180;
      const legendHeight = 85;

      // Legend background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 6);
      ctx.fill();

      // Legend title
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#aaaaaa';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Dominant Layer', legendX + 12, legendY + 10);

      // Legend items
      const layers = Object.entries(LAYER_COLORS);
      layers.forEach(([layer, color], index) => {
        const itemY = legendY + 30 + index * 14;

        // Color dot
        ctx.beginPath();
        ctx.arc(legendX + 18, itemY + 4, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(layer, legendX + 30, itemY);
      });
    }

    // --- Contact Details (bottom-right) ---
    const contactX = width - 20;
    const contactY = height - 60;

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Universal Hex Taxonomy', contactX, contactY);
    ctx.fillText('factory.universalhex.org', contactX, contactY + 14);
    ctx.fillText('info@universalhex.org', contactX, contactY + 28);
    ctx.fillText('@universalhex', contactX, contactY + 42);

    console.log(`Exporting at ${exportCanvas.width}x${exportCanvas.height}px`);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uht-explorer-${projectionType}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [points, filteredPoints, transform, pointSize, projectionType, renderToCanvas, colorMode]);

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

    // Only search visible (filtered) points
    for (const point of filteredPoints) {
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
  }, [filteredPoints, transform, pointSize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If lasso mode is enabled (but not already drawing), start drawing
    if (lassoMode === 'off' && e.shiftKey) {
      // Shift+click to start lasso
      setLassoMode('drawing');
      setLassoPoints([{ x, y }]);
      return;
    }

    if (lassoMode === 'active' && e.shiftKey) {
      // Shift+click to start a new lasso
      setLassoMode('drawing');
      setLassoPoints([{ x, y }]);
      return;
    }

    // Normal pan behavior
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If drawing lasso, add point
    if (lassoMode === 'drawing') {
      // Add point only if moved enough distance from last point
      const lastPoint = lassoPoints[lassoPoints.length - 1];
      if (lastPoint) {
        const dist = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2);
        if (dist > 5) { // Minimum distance between points
          setLassoPoints(prev => [...prev, { x, y }]);
        }
      }
      return;
    }

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
    // If drawing lasso, close and activate it
    if (lassoMode === 'drawing') {
      if (lassoPoints.length >= 3) {
        setLassoMode('active');
      } else {
        // Not enough points, cancel
        setLassoMode('off');
        setLassoPoints([]);
      }
      return;
    }

    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    // If drawing lasso, cancel it on leave
    if (lassoMode === 'drawing') {
      setLassoMode('off');
      setLassoPoints([]);
    }
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
      // If heatmap mode is enabled, set the reference point instead of navigating
      if (heatmapEnabled) {
        setHeatmapReference(point);
      } else {
        onEntitySelect(point.uuid);
      }
    }
  };

  // Attach wheel handler with passive: false to allow preventDefault
  // Use capture phase to intercept before any parent scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!container.contains(e.target as Node)) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Mouse position relative to center
      const mx = mouseX - centerX;
      const my = mouseY - centerY;

      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;

      setTransform(prev => {
        const newScale = Math.max(0.5, Math.min(10, prev.scale * scaleFactor));
        const actualFactor = newScale / prev.scale;

        // Adjust offset so the point under mouse stays in place
        const newOffsetX = mx - (mx - prev.offsetX) * actualFactor;
        const newOffsetY = my - (my - prev.offsetY) * actualFactor;

        return {
          scale: newScale,
          offsetX: newOffsetX,
          offsetY: newOffsetY
        };
      });
    };

    document.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [loading]);

  const handleZoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(10, prev.scale * 1.5) }));
  };

  const handleZoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(0.5, prev.scale / 1.5) }));
  };

  const handleCenter = () => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  };

  const handleFitToFiltered = useCallback(() => {
    const container = containerRef.current;
    if (!container || filteredPoints.length === 0) return;

    // Find bounding box of filtered points in data coordinates
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const point of filteredPoints) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // Add some padding
    const padding = 0.1;
    const rangeX = (maxX - minX) || 0.1;
    const rangeY = (maxY - minY) || 0.1;
    minX -= rangeX * padding;
    maxX += rangeX * padding;
    minY -= rangeY * padding;
    maxY += rangeY * padding;

    const rect = container.getBoundingClientRect();
    const plotPadding = 50;
    const plotWidth = rect.width - plotPadding * 2;
    const plotHeight = rect.height - plotPadding * 2;

    // Calculate scale to fit the bounding box
    const scaleX = 2 / (maxX - minX); // Data range is -1 to 1, so full range is 2
    const scaleY = 2 / (maxY - minY);
    const newScale = Math.min(scaleX, scaleY, 10); // Cap at 10x

    // Calculate offset to center the bounding box
    const centerDataX = (minX + maxX) / 2;
    const centerDataY = (minY + maxY) / 2;
    const offsetX = -centerDataX * (plotWidth / 2) * newScale;
    const offsetY = centerDataY * (plotHeight / 2) * newScale;

    setTransform({ scale: newScale, offsetX, offsetY });
  }, [filteredPoints]);

  const exportTraitWalkGif = useCallback(async (forMobile: boolean = false) => {
    const container = containerRef.current;
    if (!container || traits.length === 0 || filteredPoints.length === 0) return;

    setGifExporting(true);
    setGifProgress(0);

    const rect = container.getBoundingClientRect();
    const width = Math.min(rect.width, 1200); // Higher res for text clarity
    const height = Math.min(rect.height, 900);
    const scale = width / rect.width;

    // Mobile mode: 2x text size multiplier
    const textScale = forMobile ? 2 : 1;

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: gifWorkerUrl
    });

    // Create offscreen canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) {
      setGifExporting(false);
      return;
    }

    const padding = 50 * scale;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const centerX = width / 2;
    const centerY = height / 2;
    const ptSize = pointSize * scale * (forMobile ? 1.5 : 1); // Slightly larger points for mobile

    // Helper to draw branding on each frame (large text for GIF legibility)
    const drawBranding = () => {
      // UHT Branding (top-left)
      ctx.font = `bold ${36 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#00E5FF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('UHT Trait Walk', 20 * scale, 20 * scale);

      ctx.font = `${24 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(`${filteredPoints.length.toLocaleString()} entities`, 20 * scale, (20 + 42 * textScale) * scale);

      // Contact details (top-right)
      ctx.textAlign = 'right';
      ctx.font = `bold ${22 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#888888';
      ctx.fillText('factory.universalhex.org', width - 20 * scale, 20 * scale);
      ctx.fillText('@universalhex', width - 20 * scale, (20 + 28 * textScale) * scale);
    };

    // Helper to draw caption box with auto-sizing
    const drawCaption = (
      titleLine: string,
      mainText: string,
      descText: string,
      borderColor: string
    ) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Measure text to auto-size box
      ctx.font = `bold ${24 * scale * textScale}px Inter, system-ui, sans-serif`;
      const titleWidth = ctx.measureText(titleLine).width;

      ctx.font = `bold ${48 * scale * textScale}px Inter, system-ui, sans-serif`;
      const mainWidth = ctx.measureText(mainText).width;

      ctx.font = `${20 * scale * textScale}px Inter, system-ui, sans-serif`;
      const descWidth = ctx.measureText(descText).width;

      const contentWidth = Math.max(titleWidth, mainWidth, descWidth);
      const overlayWidth = contentWidth + 60 * scale * textScale;
      const overlayHeight = 180 * scale * textScale;
      const overlayX = width - overlayWidth - 20 * scale;
      const overlayY = height - overlayHeight - 20 * scale;
      const overlayCenterX = overlayX + overlayWidth / 2;

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.beginPath();
      ctx.roundRect(overlayX, overlayY, overlayWidth, overlayHeight, 12 * scale);
      ctx.fill();

      // Border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3 * scale * textScale;
      ctx.stroke();

      // Title line
      ctx.font = `bold ${24 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = borderColor;
      ctx.fillText(titleLine, overlayCenterX, overlayY + 38 * scale * textScale);

      // Main text
      ctx.font = `bold ${48 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(mainText, overlayCenterX, overlayY + 95 * scale * textScale);

      // Description
      ctx.font = `${20 * scale * textScale}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(descText, overlayCenterX, overlayY + 145 * scale * textScale);
    };

    // Total frames = 1 (all entities) + 32 (traits)
    const totalFrames = 33;

    // Frame 0: All Entities
    setGifProgress(Math.round((1 / totalFrames) * 100));

    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    // Draw all points with layer colors
    for (const point of filteredPoints) {
      const x = centerX + (point.x * plotWidth / 2) * transform.scale + transform.offsetX * scale;
      const y = centerY - (point.y * plotHeight / 2) * transform.scale + transform.offsetY * scale;

      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;

      ctx.beginPath();
      ctx.arc(x, y, ptSize, 0, Math.PI * 2);
      ctx.fillStyle = getPointColor(point);
      ctx.globalAlpha = 0.8;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawBranding();
    drawCaption(
      'Universal Hex Taxonomy',
      'All Entities',
      'Colored by dominant layer',
      '#00E5FF'
    );

    gif.addFrame(ctx, { copy: true, delay: traitWalk.speed * 2 }); // Double duration for intro

    // Frames 1-32: Each trait
    for (let traitNum = 1; traitNum <= 32; traitNum++) {
      setGifProgress(Math.round(((traitNum + 1) / totalFrames) * 100));

      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, height);

      const trait = traits[traitNum - 1];
      const layerColor = LAYER_COLORS[getLayerForTrait(traitNum) as keyof typeof LAYER_COLORS];

      // Draw points with trait highlighting
      for (const point of filteredPoints) {
        const x = centerX + (point.x * plotWidth / 2) * transform.scale + transform.offsetX * scale;
        const y = centerY - (point.y * plotHeight / 2) * transform.scale + transform.offsetY * scale;

        if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;

        const hasTrait = hasTraitBit(point.uht_code, traitNum);

        ctx.beginPath();
        ctx.arc(x, y, ptSize, 0, Math.PI * 2);
        ctx.fillStyle = hasTrait ? layerColor : '#333333';
        ctx.globalAlpha = hasTrait ? 1.0 : 0.15;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawBranding();
      drawCaption(
        `${getLayerForTrait(traitNum)} Layer • Trait ${traitNum}/32`,
        trait?.name || '',
        trait?.short_description || '',
        layerColor
      );

      gif.addFrame(ctx, { copy: true, delay: traitWalk.speed });
    }

    const mobileLabel = forMobile ? '-mobile' : '';
    gif.on('finished', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uht-trait-walk-${projectionType}${mobileLabel}-${Date.now()}.gif`;
      a.click();
      URL.revokeObjectURL(url);
      setGifExporting(false);
      setGifProgress(0);
    });

    gif.render();
  }, [filteredPoints, traits, transform, pointSize, traitWalk.speed, projectionType, getPointColor]);

  const centerOnPoint = useCallback((point: ProjectionPoint) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const padding = 50;
    const plotWidth = rect.width - padding * 2;
    const plotHeight = rect.height - padding * 2;

    // Zoom in to see the point clearly
    const targetScale = 3;

    // Calculate offset to center the point
    const offsetX = -(point.x * plotWidth / 2) * targetScale;
    const offsetY = (point.y * plotHeight / 2) * targetScale;

    setTransform({ scale: targetScale, offsetX, offsetY });
    setFoundPoint(point);
  }, []);

  const handleSearch = useCallback((point: ProjectionPoint | null) => {
    setSearchValue(point);
    if (point) {
      centerOnPoint(point);
    } else {
      setFoundPoint(null);
    }
  }, [centerOnPoint]);

  const clearSearch = useCallback(() => {
    setSearchValue(null);
    setFoundPoint(null);
  }, []);

  // Tour animation timing (ms)
  const TOUR_ANIM_TIMING = {
    highlight: 600,    // Pulse ring duration
    zoom_in: 500,      // Zoom in duration
    neighbors: 800,    // Show neighbors duration
    linger: 3000,      // Read narration time
    zoom_out: 300,     // Zoom out duration
    fly: 800           // Fly to next stop duration
  };

  // Helper to find nearest neighbors by screen distance
  const findNearestNeighbors = useCallback((targetPoint: {x: number, y: number}, count: number = 5) => {
    if (!filteredPoints.length) return [];

    return filteredPoints
      .map(p => ({
        point: p,
        dist: Math.sqrt(Math.pow(p.x - targetPoint.x, 2) + Math.pow(p.y - targetPoint.y, 2))
      }))
      .filter(({ dist }) => dist > 0.001)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, count)
      .map(({ point }) => point);
  }, [filteredPoints]);

  // Easing function for smooth animations
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Calculate transform for a given point at a given scale
  const getTransformForPoint = useCallback((point: {x: number, y: number}, targetScale: number) => {
    const container = containerRef.current;
    if (!container) return { scale: targetScale, offsetX: 0, offsetY: 0 };

    const rect = container.getBoundingClientRect();
    const padding = 50;
    const plotWidth = rect.width - padding * 2;
    const plotHeight = rect.height - padding * 2;
    const offsetX = -(point.x * plotWidth / 2) * targetScale;
    const offsetY = (point.y * plotHeight / 2) * targetScale;
    return { scale: targetScale, offsetX, offsetY };
  }, []);

  // Simple delay helper
  const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

  // Animate transform from current to target
  const animateToTransform = useCallback((
    targetTransform: { scale: number; offsetX: number; offsetY: number },
    duration: number
  ): Promise<void> => {
    return new Promise(resolve => {
      // Use ref to get current value, not stale closure
      const startTransform = { ...transformRef.current };
      const startTime = performance.now();

      const animate = () => {
        if (tourCancelledRef.current) {
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(progress);

        const newTransform = {
          scale: startTransform.scale + (targetTransform.scale - startTransform.scale) * eased,
          offsetX: startTransform.offsetX + (targetTransform.offsetX - startTransform.offsetX) * eased,
          offsetY: startTransform.offsetY + (targetTransform.offsetY - startTransform.offsetY) * eased
        };
        setTransform(newTransform);

        if (progress < 1) {
          tourAnimRef.current = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      tourAnimRef.current = requestAnimationFrame(animate);
    });
  }, []); // No dependencies needed - uses ref

  // Animate a phase with progress updates
  const runAnimPhase = useCallback((phase: TourAnimPhase, duration: number): Promise<void> => {
    return new Promise(resolve => {
      setTourAnimPhase(phase);
      const startTime = performance.now();

      const animate = () => {
        if (tourCancelledRef.current) {
          resolve();
          return;
        }

        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setTourAnimProgress(progress);

        if (phase === 'highlight') {
          setTourHighlightRadius(20 + Math.sin(progress * Math.PI * 3) * 15);
        }

        if (progress < 1) {
          tourAnimRef.current = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      tourAnimRef.current = requestAnimationFrame(animate);
    });
  }, []);

  // Main tour animation sequence for a single stop
  const animateSingleStop = useCallback(async (
    tourData: TourResponse,
    index: number,
    isFirstStop: boolean
  ): Promise<void> => {
    if (tourCancelledRef.current) return;

    const stop = tourData.stops[index];
    const prevStop = index > 0 ? tourData.stops[index - 1] : null;

    // Find neighbors
    const neighbors = findNearestNeighbors(stop, 6);
    setTourNeighbors(neighbors);
    setTourIndex(index);

    // Build flight path if coming from previous
    if (!isFirstStop && prevStop) {
      const pathPoints: Array<{x: number, y: number}> = [];
      const steps = 20;
      const midX = (prevStop.x + stop.x) / 2;
      const midY = (prevStop.y + stop.y) / 2;
      const perpX = -(stop.y - prevStop.y) * 0.2;
      const perpY = (stop.x - prevStop.x) * 0.2;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = (1-t)*(1-t)*prevStop.x + 2*(1-t)*t*(midX + perpX) + t*t*stop.x;
        const y = (1-t)*(1-t)*prevStop.y + 2*(1-t)*t*(midY + perpY) + t*t*stop.y;
        pathPoints.push({ x, y });
      }
      setTourFlightPath(pathPoints);

      // Zoom out from previous stop
      const zoomOutTransform = getTransformForPoint(prevStop, 1.2);
      setTourAnimPhase('zoom_out');
      await animateToTransform(zoomOutTransform, TOUR_ANIM_TIMING.zoom_out);
      if (tourCancelledRef.current) return;

      // Fly to new stop
      const flyTransform = getTransformForPoint(stop, 1.2);
      setTourAnimPhase('fly');
      await animateToTransform(flyTransform, TOUR_ANIM_TIMING.fly);
      if (tourCancelledRef.current) return;

      setTourFlightPath([]);
    } else {
      // First stop - just center on it
      const initialTransform = getTransformForPoint(stop, 1.5);
      await animateToTransform(initialTransform, 300);
      if (tourCancelledRef.current) return;
    }

    // Highlight phase
    await runAnimPhase('highlight', TOUR_ANIM_TIMING.highlight);
    if (tourCancelledRef.current) return;

    // Zoom in
    setTourAnimPhase('zoom_in');
    const zoomedTransform = getTransformForPoint(stop, 2.5);
    await animateToTransform(zoomedTransform, TOUR_ANIM_TIMING.zoom_in);
    if (tourCancelledRef.current) return;

    // Show neighbors
    await runAnimPhase('neighbors', TOUR_ANIM_TIMING.neighbors);
    if (tourCancelledRef.current) return;

    // Linger to read narration
    await runAnimPhase('linger', TOUR_ANIM_TIMING.linger);
  }, [findNearestNeighbors, getTransformForPoint, animateToTransform, runAnimPhase]);

  // Run the full tour sequence
  const runTourSequence = useCallback(async (tourData: TourResponse, startIndex: number = 0) => {
    tourCancelledRef.current = false;

    for (let i = startIndex; i < tourData.stops.length; i++) {
      if (tourCancelledRef.current || !tourPlayingRef.current) {
        setTourAnimPhase('idle');
        return;
      }

      await animateSingleStop(tourData, i, i === 0);

      if (tourCancelledRef.current) {
        setTourAnimPhase('idle');
        return;
      }
    }

    // Tour complete
    setTourPlaying(false);
    tourPlayingRef.current = false;
    setTourAnimPhase('idle');
  }, [animateSingleStop]);

  // Tour functions
  const startTour = useCallback(async (tourType: 'random_walk' | 'theme' | 'contrast' | 'complexity' | 'layer_journey', theme?: string) => {
    setTourLoading(true);
    tourCancelledRef.current = true; // Cancel any existing animation

    // Map projectionType to API projection param (handle 'uht' as special case)
    const apiProjection = projectionType === 'uht' ? 'umap' : projectionType as 'umap' | 'tsne' | 'uht_umap';

    try {
      const response = await explorerAPI.generateTour({
        tour_type: tourType,
        theme,
        num_stops: 8,
        projection: apiProjection
      });

      setTour(response);
      setTourIndex(0);
      setTourFlightPath([]);
      setTourNeighbors([]);
      setTourAnimPhase('idle');

      // Auto-play the tour
      setTourPlaying(true);
      tourPlayingRef.current = true;
      tourCancelledRef.current = false;

      // Small delay to let state settle, then start
      await delay(100);
      runTourSequence(response, 0);
    } catch (err) {
      console.error('Failed to generate tour:', err);
    } finally {
      setTourLoading(false);
    }
  }, [runTourSequence, projectionType]);

  const playTour = useCallback(() => {
    if (!tour) return;
    setTourPlaying(true);
    tourPlayingRef.current = true;
    tourCancelledRef.current = false;
    runTourSequence(tour, tourIndex);
  }, [tour, tourIndex, runTourSequence]);

  const pauseTour = useCallback(() => {
    setTourPlaying(false);
    tourPlayingRef.current = false;
    tourCancelledRef.current = true;
    if (tourAnimRef.current) {
      cancelAnimationFrame(tourAnimRef.current);
      tourAnimRef.current = null;
    }
    setTourAnimPhase('idle');
  }, []);

  const stopTour = useCallback(() => {
    tourCancelledRef.current = true;
    tourPlayingRef.current = false;
    setTour(null);
    setTourPlaying(false);
    setTourIndex(0);
    setTourFlightPath([]);
    setTourNeighbors([]);
    setTourAnimPhase('idle');
    if (tourAnimRef.current) {
      cancelAnimationFrame(tourAnimRef.current);
      tourAnimRef.current = null;
    }
    if (tourIntervalRef.current) {
      clearInterval(tourIntervalRef.current);
      tourIntervalRef.current = null;
    }
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }, []);

  const goToTourStop = useCallback(async (index: number) => {
    if (!tour || index < 0 || index >= tour.stops.length) return;

    // Pause auto-play if running
    tourPlayingRef.current = false;
    tourCancelledRef.current = true;
    setTourPlaying(false);

    await delay(50); // Let cancellation take effect

    tourCancelledRef.current = false;
    const isAdjacent = Math.abs(index - tourIndex) === 1;
    await animateSingleStop(tour, index, !isAdjacent);
    setTourAnimPhase('idle');
  }, [tour, tourIndex, animateSingleStop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tourCancelledRef.current = true;
      if (tourAnimRef.current) {
        cancelAnimationFrame(tourAnimRef.current);
      }
    };
  }, []);

  // LLM Insight functions
  const describeCurrentSelection = useCallback(async () => {
    if (filteredPoints.length === 0 || filteredPoints.length === points.length) return;

    setInsightLoading(true);
    try {
      const uuids = filteredPoints.slice(0, 100).map(p => p.uuid);
      const description = await explorerAPI.describeSelection(uuids);
      setSelectionDescription(description);
    } catch (err) {
      console.error('Failed to describe selection:', err);
    } finally {
      setInsightLoading(false);
    }
  }, [filteredPoints, points.length]);

  const clearInsight = useCallback(() => {
    setSelectionDescription(null);
  }, []);

  // Subset projection functions
  const computeSubsetProjection = useCallback(async () => {
    if (filteredPoints.length < 3) return;

    setSubsetLoading(true);
    try {
      // Store current full points for restoration later
      if (!subsetProjection) {
        setFullPoints(points);
      }

      const uuids = filteredPoints.map(p => p.uuid);
      // Map projection type to subset method: uht_umap uses pacmap, uht uses umap
      const method = projectionType === 'tsne' ? 'tsne'
                   : projectionType === 'uht_umap' ? 'pacmap'
                   : 'umap';

      const response = await explorerAPI.computeSubsetProjection(uuids, method);
      setSubsetProjection(response);

      // Replace points with subset projection results
      const subsetPoints: ProjectionPoint[] = response.points.map(p => ({
        uuid: p.uuid,
        name: p.name,
        uht_code: p.uht_code,
        x: p.x,
        y: p.y,
        image_url: p.image_url
      }));
      setPoints(subsetPoints);

      // Clear lasso since we've used it
      setLassoMode('off');
      setLassoPoints([]);

      // Reset transform to see full subset
      setTransform({ scale: 1, offsetX: 0, offsetY: 0 });

      // Use clusters computed by the subset projection
      if (response.clusters && response.clusters.length > 0) {
        const subsetClusters: ClusterLabel[] = response.clusters.map(c => ({
          cluster_id: c.cluster_id,
          centroid_x: c.centroid_x,
          centroid_y: c.centroid_y,
          label: c.label,
          size: c.size,
          count: c.size,
          dominant_layer: c.dominant_layer
        }));
        setClusters(subsetClusters);
      } else {
        setClusters([]);
      }
    } catch (err) {
      console.error('Failed to compute subset projection:', err);
    } finally {
      setSubsetLoading(false);
    }
  }, [filteredPoints, points, projectionType, subsetProjection]);

  const resetToFullProjection = useCallback(() => {
    if (fullPoints.length > 0) {
      setPoints(fullPoints);
      setFullPoints([]);
      setSubsetProjection(null);
      setTransform({ scale: 1, offsetX: 0, offsetY: 0 });

      // Reload clusters only (points are already restored from fullPoints)
      setClustersLoading(true);
      const clusterMethod = projectionType === 'uht' ? 'uht' : projectionType;
      explorerAPI.getClusters(clusterMethod, 'level7')
        .then(clusterData => {
          setClusters(clusterData.clusters || []);
        })
        .catch(err => {
          console.warn('Failed to load cluster labels:', err);
        })
        .finally(() => {
          setClustersLoading(false);
        });
    }
  }, [fullPoints, projectionType]);

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
        <Autocomplete
          size="small"
          sx={{ width: 220 }}
          options={points}
          value={searchValue}
          onChange={(_, newValue) => handleSearch(newValue)}
          getOptionLabel={(option) => option.name}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.uuid}>
              <Box>
                <Typography variant="body2">{option.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {option.uht_code}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Find entity..."
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <>
                    {searchValue && (
                      <IconButton size="small" onClick={clearSearch} sx={{ mr: -0.5 }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    )}
                    {params.InputProps.endAdornment}
                  </>
                )
              }}
            />
          )}
          filterOptions={(options, { inputValue }) => {
            const search = inputValue.toLowerCase();
            return options.filter(opt =>
              opt.name.toLowerCase().includes(search) ||
              opt.uht_code.toLowerCase().includes(search)
            ).slice(0, 50);
          }}
          isOptionEqualToValue={(option, value) => option.uuid === value.uuid}
        />

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
          <MuiTooltip title="Fit to filtered selection">
            <IconButton
              size="small"
              onClick={handleFitToFiltered}
              disabled={filteredPoints.length === points.length}
              color={filteredPoints.length < points.length ? "primary" : "default"}
            >
              <FitScreenIcon />
            </IconButton>
          </MuiTooltip>
          <MuiTooltip title="Export 4K PNG">
            <IconButton size="small" onClick={exportHighRes}><DownloadIcon /></IconButton>
          </MuiTooltip>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="caption">Labels</Typography>}
          sx={{ ml: 1 }}
        />

        <MuiTooltip title={showFilters ? "Hide filters" : "Show filters"}>
          <IconButton
            size="small"
            onClick={() => setShowFilters(!showFilters)}
            color={hasActiveFilters ? "primary" : "default"}
          >
            <FilterIcon />
            {showFilters ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </MuiTooltip>
      </Paper>

      {/* Filter Controls */}
      <Collapse in={showFilters}>
        <Paper
          sx={{
            position: 'absolute',
            top: 90,
            left: 16,
            p: 1.5,
            zIndex: 10,
            minWidth: 320,
            maxWidth: 400
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <FilterIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" color="primary">
              Filters
            </Typography>
            {hasActiveFilters && (
              <Chip
                label={`${filteredPoints.length.toLocaleString()} of ${points.length.toLocaleString()}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ ml: 'auto' }}
              />
            )}
          </Box>

          {/* Layer Filter */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Dominant Layer
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {(Object.entries(LAYER_COLORS) as [keyof typeof LAYER_COLORS, string][]).map(([layer, color]) => (
                <Chip
                  key={layer}
                  label={layer}
                  size="small"
                  onClick={() => setLayerFilter(prev => ({ ...prev, [layer]: !prev[layer] }))}
                  sx={{
                    bgcolor: layerFilter[layer] ? color : 'transparent',
                    color: layerFilter[layer] ? '#000' : color,
                    border: `1px solid ${color}`,
                    fontWeight: layerFilter[layer] ? 600 : 400,
                    '&:hover': {
                      bgcolor: layerFilter[layer] ? color : `${color}33`,
                    }
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Trait Count Range */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Trait Count: {traitRange[0]} - {traitRange[1]}
            </Typography>
            <Slider
              value={traitRange}
              onChange={(_, newValue) => setTraitRange(newValue as [number, number])}
              valueLabelDisplay="auto"
              min={0}
              max={32}
              marks={[
                { value: 0, label: '0' },
                { value: 8, label: '8' },
                { value: 16, label: '16' },
                { value: 24, label: '24' },
                { value: 32, label: '32' }
              ]}
              sx={{
                '& .MuiSlider-markLabel': {
                  fontSize: '0.65rem',
                  color: 'text.secondary'
                }
              }}
            />
          </Box>

          {/* Similarity Heatmap */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <HeatmapIcon fontSize="small" color={heatmapEnabled ? "primary" : "disabled"} />
              <Typography variant="caption" color="text.secondary">
                Similarity Heatmap
              </Typography>
              <Switch
                size="small"
                checked={heatmapEnabled}
                onChange={(e) => {
                  setHeatmapEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setHeatmapReference(null);
                  }
                }}
                sx={{ ml: 'auto' }}
              />
            </Box>
            {heatmapEnabled && (
              <Box sx={{ pl: 3.5 }}>
                {heatmapReference ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={heatmapReference.name}
                      size="small"
                      color="primary"
                      onDelete={() => setHeatmapReference(null)}
                      deleteIcon={<CloseIcon fontSize="small" />}
                      sx={{ maxWidth: 200 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {heatmapReference.uht_code}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Click an entity to set as reference
                  </Typography>
                )}
                {heatmapReference && (
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 1, alignItems: 'center' }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: 'hsl(0, 90%, 50%)' }} />
                    <Typography variant="caption" color="text.secondary">0</Typography>
                    <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: 'hsl(60, 90%, 50%)', ml: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">16</Typography>
                    <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: 'hsl(240, 90%, 50%)', ml: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">32 (Hamming)</Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {/* Trait Walk Animation */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <WalkIcon fontSize="small" color={traitWalk.isActive ? "primary" : "disabled"} />
              <Typography variant="caption" color="text.secondary">
                Trait Walk
              </Typography>
              <Switch
                size="small"
                checked={traitWalk.isActive}
                onChange={(e) => {
                  setTraitWalk(prev => ({
                    ...prev,
                    isActive: e.target.checked,
                    isPlaying: false
                  }));
                }}
                sx={{ ml: 'auto' }}
              />
            </Box>
            {traitWalk.isActive && (
              <Box sx={{ pl: 3.5 }}>
                {/* Current trait display */}
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                    Trait {traitWalk.currentTrait}: {traits[traitWalk.currentTrait - 1]?.name || 'Loading...'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getLayerForTrait(traitWalk.currentTrait)} Layer
                  </Typography>
                </Box>

                {/* Play controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <MuiTooltip title="Previous trait">
                    <IconButton
                      size="small"
                      onClick={() => setTraitWalk(prev => ({
                        ...prev,
                        currentTrait: prev.currentTrait <= 1 ? 32 : prev.currentTrait - 1
                      }))}
                    >
                      <SkipPrevIcon fontSize="small" />
                    </IconButton>
                  </MuiTooltip>
                  <MuiTooltip title={traitWalk.isPlaying ? "Pause" : "Play"}>
                    <IconButton
                      size="small"
                      onClick={() => setTraitWalk(prev => ({
                        ...prev,
                        isPlaying: !prev.isPlaying
                      }))}
                      color={traitWalk.isPlaying ? "primary" : "default"}
                    >
                      {traitWalk.isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </IconButton>
                  </MuiTooltip>
                  <MuiTooltip title="Next trait">
                    <IconButton
                      size="small"
                      onClick={() => setTraitWalk(prev => ({
                        ...prev,
                        currentTrait: prev.currentTrait >= 32 ? 1 : prev.currentTrait + 1
                      }))}
                    >
                      <SkipNextIcon fontSize="small" />
                    </IconButton>
                  </MuiTooltip>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {traitWalk.currentTrait}/32
                  </Typography>
                </Box>

                {/* Speed slider */}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Speed: {(traitWalk.speed / 1000).toFixed(1)}s
                  </Typography>
                  <Slider
                    value={traitWalk.speed}
                    onChange={(_, v) => setTraitWalk(prev => ({ ...prev, speed: v as number }))}
                    min={200}
                    max={3000}
                    step={100}
                    size="small"
                    sx={{ width: '100%' }}
                  />
                </Box>

                {/* Count of entities with current trait */}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {filteredPoints.filter(p => hasTraitBit(p.uht_code, traitWalk.currentTrait)).length.toLocaleString()} entities have this trait
                </Typography>

                {/* Export GIF buttons */}
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <MuiTooltip title="Export trait walk as animated GIF (desktop)">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => exportTraitWalkGif(false)}
                        disabled={gifExporting || traits.length === 0}
                        color="primary"
                      >
                        <GifIcon />
                      </IconButton>
                    </span>
                  </MuiTooltip>
                  <MuiTooltip title="Export for mobile (2x larger labels)">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => exportTraitWalkGif(true)}
                        disabled={gifExporting || traits.length === 0}
                        color="secondary"
                      >
                        <MobileIcon />
                      </IconButton>
                    </span>
                  </MuiTooltip>
                  {gifExporting ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="caption" color="text.secondary">
                        Exporting... {gifProgress}%
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Export GIF / Mobile
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {/* Lasso Selection */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LassoIcon fontSize="small" color={lassoMode !== 'off' ? "primary" : "disabled"} />
              <Typography variant="caption" color="text.secondary">
                Lasso Selection
              </Typography>
              {lassoMode === 'active' && (
                <Chip
                  label="Clear"
                  size="small"
                  onClick={() => {
                    setLassoMode('off');
                    setLassoPoints([]);
                  }}
                  onDelete={() => {
                    setLassoMode('off');
                    setLassoPoints([]);
                  }}
                  deleteIcon={<CloseIcon fontSize="small" />}
                  sx={{ ml: 'auto' }}
                />
              )}
            </Box>
            <Box sx={{ pl: 3.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {lassoMode === 'off' && 'Hold Shift + drag to draw lasso'}
                {lassoMode === 'drawing' && 'Drawing... release to finish'}
                {lassoMode === 'active' && `${filteredPoints.length.toLocaleString()} entities selected`}
              </Typography>
              {lassoMode === 'active' && (
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={lassoInvert}
                      onChange={(e) => setLassoInvert(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">Invert (show outside)</Typography>}
                />
              )}
              {/* Subset Projection Button */}
              {hasActiveFilters && filteredPoints.length >= 3 && filteredPoints.length < points.length && !subsetProjection && (
                <Box sx={{ mt: 1 }}>
                  <Chip
                    label={subsetLoading ? "Computing..." : "Re-project Subset"}
                    size="small"
                    onClick={computeSubsetProjection}
                    disabled={subsetLoading}
                    color="secondary"
                    icon={subsetLoading ? <CircularProgress size={12} color="inherit" /> : undefined}
                    sx={{ fontSize: '0.7rem' }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Recalculate projection for {filteredPoints.length} selected entities
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* Subset Mode Indicator */}
          {subsetProjection && (
            <Box sx={{ mb: 1, p: 1.5, bgcolor: 'rgba(156, 39, 176, 0.15)', borderRadius: 1, border: '1px solid rgba(156, 39, 176, 0.3)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="caption" color="secondary" sx={{ fontWeight: 600 }}>
                  Subset Projection Active
                </Typography>
                <Chip
                  label="Exit"
                  size="small"
                  onClick={resetToFullProjection}
                  onDelete={resetToFullProjection}
                  deleteIcon={<CloseIcon fontSize="small" />}
                  color="secondary"
                  variant="outlined"
                  sx={{ ml: 'auto', fontSize: '0.65rem' }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {subsetProjection.entity_count} entities | {subsetProjection.method.toUpperCase()} | {subsetProjection.computation_time_ms}ms
              </Typography>
            </Box>
          )}

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Box sx={{ mt: 1, textAlign: 'right' }}>
              <Chip
                label="Reset All Filters"
                size="small"
                onClick={() => {
                  setLayerFilter({ Physical: true, Functional: true, Abstract: true, Social: true });
                  setTraitRange([0, 32]);
                  setLassoMode('off');
                  setLassoPoints([]);
                  setLassoInvert(false);
                }}
                onDelete={() => {
                  setLayerFilter({ Physical: true, Functional: true, Abstract: true, Social: true });
                  setTraitRange([0, 32]);
                  setLassoMode('off');
                  setLassoPoints([]);
                  setLassoInvert(false);
                }}
                deleteIcon={<CloseIcon fontSize="small" />}
              />
            </Box>
          )}

          {/* LLM Tours */}
          <Box sx={{ mb: 1, mt: 2, borderTop: '1px solid rgba(255,255,255,0.1)', pt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TourIcon fontSize="small" color={tour ? "primary" : "disabled"} />
              <Typography variant="caption" color="text.secondary">
                LLM-Guided Tours
              </Typography>
              {tourLoading && <CircularProgress size={14} />}
            </Box>
            {!tour ? (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Chip
                  label="Complexity"
                  size="small"
                  onClick={() => startTour('complexity')}
                  disabled={tourLoading}
                  sx={{ fontSize: '0.7rem' }}
                />
                <Chip
                  label="Layers"
                  size="small"
                  onClick={() => startTour('layer_journey')}
                  disabled={tourLoading}
                  sx={{ fontSize: '0.7rem' }}
                />
                <Chip
                  label="Random"
                  size="small"
                  onClick={() => startTour('random_walk')}
                  disabled={tourLoading}
                  sx={{ fontSize: '0.7rem' }}
                />
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <MuiTooltip title="Previous stop">
                    <IconButton
                      size="small"
                      onClick={() => goToTourStop(tourIndex - 1)}
                      disabled={tourIndex === 0}
                    >
                      <SkipPrevIcon fontSize="small" />
                    </IconButton>
                  </MuiTooltip>
                  <MuiTooltip title={tourPlaying ? "Pause" : "Play"}>
                    <IconButton
                      size="small"
                      onClick={tourPlaying ? pauseTour : playTour}
                      color={tourPlaying ? "primary" : "default"}
                    >
                      {tourPlaying ? <PauseIcon /> : <PlayIcon />}
                    </IconButton>
                  </MuiTooltip>
                  <MuiTooltip title="Next stop">
                    <IconButton
                      size="small"
                      onClick={() => goToTourStop(tourIndex + 1)}
                      disabled={tourIndex >= tour.stops.length - 1}
                    >
                      <SkipNextIcon fontSize="small" />
                    </IconButton>
                  </MuiTooltip>
                  <MuiTooltip title="Stop tour">
                    <IconButton size="small" onClick={stopTour}>
                      <StopIcon fontSize="small" />
                    </IconButton>
                  </MuiTooltip>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {tourIndex + 1}/{tour.stops.length}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>

          {/* LLM Insights */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <InsightIcon fontSize="small" color={selectionDescription ? "primary" : "disabled"} />
              <Typography variant="caption" color="text.secondary">
                LLM Insights
              </Typography>
              {insightLoading && <CircularProgress size={14} />}
            </Box>
            {hasActiveFilters && filteredPoints.length < points.length && !selectionDescription && (
              <Chip
                label="Describe Selection"
                size="small"
                onClick={describeCurrentSelection}
                disabled={insightLoading}
                icon={<InsightIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '0.7rem' }}
              />
            )}
            {selectionDescription && (
              <Box sx={{ pl: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Chip
                    label={selectionDescription.suggested_label}
                    size="small"
                    color="primary"
                    onDelete={clearInsight}
                    deleteIcon={<CloseIcon fontSize="small" />}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {selectionDescription.description}
                </Typography>
                {selectionDescription.common_traits.length > 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                    Common: {selectionDescription.common_traits.slice(0, 5).join(', ')}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Collapse>

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
          zIndex: 10,
          ...(subsetProjection && {
            border: '1px solid rgba(156, 39, 176, 0.5)',
            bgcolor: 'rgba(156, 39, 176, 0.1)'
          })
        }}
      >
        <Typography variant="caption" color={subsetProjection ? "secondary" : "text.secondary"}>
          {subsetProjection
            ? `SUBSET: ${points.length.toLocaleString()} pts (${subsetProjection.method})`
            : hasActiveFilters
              ? `${filteredPoints.length.toLocaleString()}/${points.length.toLocaleString()} pts`
              : `${points.length.toLocaleString()} pts`
          } | {transform.scale.toFixed(1)}x | {clustersLoading ? '⏳' : clusters.length} labels
        </Typography>
      </Paper>

      {/* UHT Axis Labels */}
      {projectionType === 'uht' && (
        <>
          {/* X-axis label (bottom center) */}
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'text.secondary',
              zIndex: 5,
              bgcolor: 'rgba(18, 18, 18, 0.8)',
              px: 1,
              py: 0.25,
              borderRadius: 1
            }}
          >
            Physical + Functional (0x0000 → 0xFFFF) →
          </Typography>
          {/* Y-axis label (left center, rotated) */}
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%) rotate(-90deg)',
              color: 'text.secondary',
              zIndex: 5,
              bgcolor: 'rgba(18, 18, 18, 0.8)',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              whiteSpace: 'nowrap'
            }}
          >
            Abstract + Social (0x0000 → 0xFFFF) →
          </Typography>
        </>
      )}

      {/* Canvas */}
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: '100%',
          cursor: lassoMode === 'drawing' ? 'crosshair' :
                  isDraggingRef.current ? 'grabbing' :
                  heatmapEnabled ? 'crosshair' : 'grab',
          touchAction: 'none',
          position: 'relative'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
        />

        {/* Trait Walk Overlay */}
        {traitWalk.isActive && traits.length > 0 && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 32,
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 20,
              bgcolor: 'rgba(0, 0, 0, 0.75)',
              borderRadius: 2,
              px: 4,
              py: 2,
              border: `2px solid ${LAYER_COLORS[getLayerForTrait(traitWalk.currentTrait) as keyof typeof LAYER_COLORS]}`,
              minWidth: 300,
              maxWidth: '80%'
            }}
          >
            <Typography
              variant="overline"
              sx={{
                color: LAYER_COLORS[getLayerForTrait(traitWalk.currentTrait) as keyof typeof LAYER_COLORS],
                fontWeight: 600,
                letterSpacing: 2
              }}
            >
              {getLayerForTrait(traitWalk.currentTrait)} Layer • Trait {traitWalk.currentTrait}/32
            </Typography>
            <Typography
              variant="h4"
              sx={{
                color: '#fff',
                fontWeight: 700,
                mt: 0.5,
                mb: 1
              }}
            >
              {traits[traitWalk.currentTrait - 1]?.name || 'Loading...'}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255, 255, 255, 0.8)',
                maxWidth: 500,
                mx: 'auto'
              }}
            >
              {traits[traitWalk.currentTrait - 1]?.short_description || ''}
            </Typography>
          </Box>
        )}

        {/* Tour Overlay */}
        {tour && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 32,
              right: 32,
              textAlign: 'left',
              pointerEvents: 'none',
              zIndex: 20,
              bgcolor: 'rgba(0, 0, 0, 0.85)',
              borderRadius: 2,
              p: 3,
              border: '2px solid #00E5FF',
              maxWidth: 400
            }}
          >
            {tourIndex === 0 && (
              <Typography
                variant="caption"
                sx={{
                  color: '#00E5FF',
                  fontWeight: 600,
                  display: 'block',
                  mb: 1
                }}
              >
                {tour.introduction}
              </Typography>
            )}
            <Typography
              variant="overline"
              sx={{
                color: '#888',
                fontWeight: 600,
                letterSpacing: 1
              }}
            >
              Stop {tourIndex + 1} of {tour.stops.length}
            </Typography>
            <Typography
              variant="h5"
              sx={{
                color: '#fff',
                fontWeight: 700,
                mt: 0.5,
                mb: 1
              }}
            >
              {tour.stops[tourIndex]?.name}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255, 255, 255, 0.8)',
                mb: 1
              }}
            >
              {tour.stops[tourIndex]?.narration}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: '#00E5FF',
                fontFamily: 'monospace'
              }}
            >
              {tour.stops[tourIndex]?.uht_code}
            </Typography>
            {tourIndex === tour.stops.length - 1 && (
              <Typography
                variant="caption"
                sx={{
                  color: '#888',
                  display: 'block',
                  mt: 2,
                  fontStyle: 'italic'
                }}
              >
                {tour.conclusion}
              </Typography>
            )}
          </Box>
        )}
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
