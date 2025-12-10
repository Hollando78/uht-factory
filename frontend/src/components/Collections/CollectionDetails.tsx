import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardMedia,
  CardContent,
  Fab
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Compare as CompareIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
  ViewList as ListIcon,
  ViewModule as CanvasIcon,
  Timeline as ConnectIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as ResetZoomIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useCollections } from '../../context/CollectionContext';
import type { Collection } from '../../types';
import { entityAPI } from '../../services/api';
import { LAYER_COLORS, getDominantLayer, getLayerCounts } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

interface CollectionDetailsProps {
  collection: Collection;
  onBack: () => void;
  isCompact?: boolean;
}

interface CardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  color?: string;
}

// Storage keys
const getPositionsKey = (collectionId: string) => `collection_positions_${collectionId}`;
const getConnectionsKey = (collectionId: string) => `collection_connections_${collectionId}`;

// Load/save helpers
const loadPositions = (collectionId: string): Record<string, CardPosition> | null => {
  try {
    const stored = localStorage.getItem(getPositionsKey(collectionId));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const savePositions = (collectionId: string, positions: Record<string, CardPosition>) => {
  try {
    localStorage.setItem(getPositionsKey(collectionId), JSON.stringify(positions));
  } catch {
    // Ignore storage errors
  }
};

const loadConnections = (collectionId: string): Connection[] => {
  try {
    const stored = localStorage.getItem(getConnectionsKey(collectionId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveConnections = (collectionId: string, connections: Connection[]) => {
  try {
    localStorage.setItem(getConnectionsKey(collectionId), JSON.stringify(connections));
  } catch {
    // Ignore storage errors
  }
};

// Memoized Draggable Card Component
const DraggableEntityCard = memo(function DraggableEntityCard({
  entity,
  position,
  onPositionChange,
  onRemove,
  onOpen,
  isConnecting,
  isSelected,
  onSelect,
  isMobile = false
}: {
  entity: UHTEntity;
  position: CardPosition;
  onPositionChange: (uuid: string, position: Partial<CardPosition>) => void;
  onRemove: (uuid: string) => void;
  onOpen: (uuid: string) => void;
  isConnecting: boolean;
  isSelected: boolean;
  onSelect: (uuid: string) => void;
  isMobile?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const dominantLayer = getDominantLayer(entity.uht_code);
  const layerColor = LAYER_COLORS[dominantLayer] || '#757575';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isConnecting) {
      e.preventDefault();
      e.stopPropagation();
      onSelect(entity.uuid);
      return;
    }
    if (isMobile) return;
    if (e.detail === 2) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    onPositionChange(entity.uuid, { zIndex: Date.now() });
    e.preventDefault();
  }, [isConnecting, isMobile, position.x, position.y, entity.uuid, onPositionChange, onSelect]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = Math.max(0, e.clientY - dragStart.y);
    onPositionChange(entity.uuid, { x: newX, y: newY });
  }, [isDragging, dragStart, entity.uuid, onPositionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isConnecting) {
      e.preventDefault();
      e.stopPropagation();
      onSelect(entity.uuid);
      return;
    }
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
    onPositionChange(entity.uuid, { zIndex: Date.now() });
  }, [isConnecting, position.x, position.y, entity.uuid, onPositionChange, onSelect]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = Math.max(0, touch.clientY - dragStart.y);
    onPositionChange(entity.uuid, { x: newX, y: newY });
  }, [isDragging, dragStart, entity.uuid, onPositionChange]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return (
    <Card
      ref={cardRef}
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        zIndex: position.zIndex,
        cursor: isConnecting ? 'crosshair' : (isDragging ? 'grabbing' : 'grab'),
        boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,0.3)' : (isSelected ? `0 0 0 3px ${layerColor}` : '0 2px 8px rgba(0,0,0,0.1)'),
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        border: isSelected ? `2px solid ${layerColor}` : `2px solid ${layerColor}40`,
        touchAction: isMobile ? 'none' : 'auto',
        '&:hover': {
          border: `2px solid ${layerColor}`,
          boxShadow: isSelected ? `0 0 0 3px ${layerColor}` : '0 4px 16px rgba(0,0,0,0.2)'
        }
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {entity.image_url ? (
        <CardMedia
          component="img"
          image={entity.image_url}
          alt={entity.name}
          sx={{
            height: position.height * 0.65,
            objectFit: 'cover'
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      ) : (
        <Box
          sx={{
            height: position.height * 0.65,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `${layerColor}20`
          }}
        >
          <Typography variant="h3" sx={{ color: layerColor, opacity: 0.5 }}>
            {entity.name[0]}
          </Typography>
        </Box>
      )}
      <CardContent sx={{
        height: position.height * 0.35,
        p: 1,
        '&:last-child': { pb: 1 },
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ minHeight: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 'bold',
              fontSize: '0.7rem',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block'
            }}
          >
            {entity.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.55rem',
              color: 'primary.main',
              lineHeight: 1.1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block'
            }}
          >
            {entity.uht_code}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={dominantLayer}
            size="small"
            sx={{
              backgroundColor: layerColor,
              color: 'white',
              fontSize: '0.55rem',
              height: '16px',
              '& .MuiChip-label': { px: 0.5 }
            }}
          />
          {!isConnecting && (
            <Box
              sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <IconButton
                size="small"
                onClick={() => onOpen(entity.uuid)}
                sx={{ p: 0.25 }}
              >
                <OpenIcon sx={{ fontSize: '0.75rem' }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => onRemove(entity.uuid)}
                sx={{ p: 0.25, '&:hover': { color: 'error.main' } }}
              >
                <DeleteIcon sx={{ fontSize: '0.75rem' }} />
              </IconButton>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
});

// Connection Lines SVG Component
const ConnectionLines = memo(function ConnectionLines({
  connections,
  positions,
  pendingConnection,
  mousePos
}: {
  connections: Connection[];
  positions: Record<string, CardPosition>;
  pendingConnection: string | null;
  mousePos: { x: number; y: number } | null;
}) {
  const getCardCenter = (uuid: string) => {
    const pos = positions[uuid];
    if (!pos) return null;
    return {
      x: pos.x + pos.width / 2,
      y: pos.y + pos.height / 2
    };
  };

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="rgba(0, 229, 255, 0.8)" />
        </marker>
      </defs>

      {/* Existing connections */}
      {connections.map((conn) => {
        const from = getCardCenter(conn.from);
        const to = getCardCenter(conn.to);
        if (!from || !to) return null;

        return (
          <line
            key={conn.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={conn.color || 'rgba(0, 229, 255, 0.6)'}
            strokeWidth="2"
            strokeDasharray="5,5"
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      {/* Pending connection line */}
      {pendingConnection && mousePos && (
        <>
          {(() => {
            const from = getCardCenter(pendingConnection);
            if (!from) return null;
            return (
              <line
                x1={from.x}
                y1={from.y}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="rgba(0, 229, 255, 0.4)"
                strokeWidth="2"
                strokeDasharray="8,4"
              />
            );
          })()}
        </>
      )}
    </svg>
  );
});

export default function CollectionDetails({ collection, onBack, isCompact = false }: CollectionDetailsProps) {
  const navigate = useNavigate();
  const { removeEntity, exportCollectionToUrl } = useCollections();

  const [entities, setEntities] = useState<UHTEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('canvas');
  const [cardPositions, setCardPositions] = useState<Record<string, CardPosition>>(() =>
    loadPositions(collection.id) || {}
  );
  const [connections, setConnections] = useState<Connection[]>(() =>
    loadConnections(collection.id)
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const entitiesLoadedRef = useRef(false);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.1;

  // Load entities only once
  useEffect(() => {
    if (entitiesLoadedRef.current) return;

    const loadEntities = async () => {
      setLoading(true);
      setError(null);

      try {
        const loadedEntities = await Promise.all(
          collection.entityUuids.map(uuid =>
            entityAPI.getEntity(uuid).catch(() => null)
          )
        );
        const filtered = loadedEntities.filter((e): e is UHTEntity => e !== null);
        setEntities(filtered);
        entitiesLoadedRef.current = true;
      } catch (err) {
        console.error('Failed to load entities:', err);
        setError('Failed to load some entities');
      } finally {
        setLoading(false);
      }
    };

    if (collection.entityUuids.length > 0) {
      loadEntities();
    } else {
      setEntities([]);
      setLoading(false);
    }
  }, [collection.id]); // Only depend on collection.id, not entityUuids

  // Update entities when collection changes (for removals)
  useEffect(() => {
    if (!entitiesLoadedRef.current) return;
    setEntities(prev => prev.filter(e => collection.entityUuids.includes(e.uuid)));
  }, [collection.entityUuids]);

  // Initialize card positions for new entities
  useEffect(() => {
    if (viewMode !== 'canvas' || entities.length === 0) return;

    const canvas = canvasRef.current;
    const containerWidth = canvas?.clientWidth || 800;
    const cardWidth = isCompact ? 140 : 180;
    const cardHeight = isCompact ? 180 : 220;
    const padding = 20;
    const cols = Math.max(1, Math.floor((containerWidth - padding) / (cardWidth + padding)));

    setCardPositions(prev => {
      const newPositions = { ...prev };
      let needsUpdate = false;

      entities.forEach((entity, index) => {
        if (!newPositions[entity.uuid]) {
          needsUpdate = true;
          const col = index % cols;
          const row = Math.floor(index / cols);

          newPositions[entity.uuid] = {
            x: padding + col * (cardWidth + padding),
            y: padding + row * (cardHeight + padding),
            width: cardWidth,
            height: cardHeight,
            zIndex: index
          };
        }
      });

      if (needsUpdate) {
        savePositions(collection.id, newPositions);
      }
      return needsUpdate ? newPositions : prev;
    });
  }, [viewMode, entities, isCompact, collection.id]);

  // Save positions when they change
  const handlePositionChange = useCallback((uuid: string, position: Partial<CardPosition>) => {
    setCardPositions(prev => {
      const updated = {
        ...prev,
        [uuid]: { ...prev[uuid], ...position }
      };
      savePositions(collection.id, updated);
      return updated;
    });
  }, [collection.id]);

  // Save connections when they change
  useEffect(() => {
    saveConnections(collection.id, connections);
  }, [connections, collection.id]);

  // Handle card selection for connections
  const handleCardSelect = useCallback((uuid: string) => {
    if (!isConnecting) return;

    if (!pendingConnection) {
      setPendingConnection(uuid);
    } else if (pendingConnection !== uuid) {
      // Create connection
      const newConnection: Connection = {
        id: `${pendingConnection}-${uuid}-${Date.now()}`,
        from: pendingConnection,
        to: uuid
      };
      setConnections(prev => [...prev, newConnection]);
      setPendingConnection(null);
    }
  }, [isConnecting, pendingConnection]);

  // Track mouse position for pending connection (accounting for zoom/pan)
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!pendingConnection) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Adjust for pan and zoom
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    setMousePos({
      x: (rawX - pan.x) / zoom,
      y: (rawY - pan.y) / zoom
    });
  }, [pendingConnection, pan, zoom]);

  const handleShare = useCallback(() => {
    const url = exportCollectionToUrl(collection.id);
    navigator.clipboard.writeText(url);
  }, [collection.id, exportCollectionToUrl]);

  const handleCompare = useCallback(() => {
    const uuids = collection.entityUuids.slice(0, 4).join(',');
    navigate(`/comparison?entities=${uuids}`);
  }, [collection.entityUuids, navigate]);

  const handleRemoveFromCollection = useCallback((uuid: string) => {
    // Also remove any connections involving this entity
    setConnections(prev => prev.filter(c => c.from !== uuid && c.to !== uuid));
    // Remove from positions
    setCardPositions(prev => {
      const { [uuid]: _, ...rest } = prev;
      savePositions(collection.id, rest);
      return rest;
    });
    removeEntity(collection.id, uuid);
  }, [collection.id, removeEntity]);

  const handleUndoLastConnection = useCallback(() => {
    setConnections(prev => prev.slice(0, -1));
  }, []);

  const handleClearConnections = useCallback(() => {
    setConnections([]);
  }, []);

  const toggleConnectMode = useCallback(() => {
    setIsConnecting(prev => !prev);
    setPendingConnection(null);
    setMousePos(null);
  }, []);

  // Zoom handlers - zoom centered on mouse position
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Mouse position relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new zoom
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));

    if (newZoom === zoom) return;

    // Calculate the point in canvas space under the mouse
    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    // Adjust pan so the same canvas point stays under the mouse after zoom
    const newPanX = mouseX - canvasX * newZoom;
    const newPanY = mouseY - canvasY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  // Add wheel listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewMode !== 'canvas') return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel, viewMode]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan handlers (middle mouse button or right-click drag)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button (button 1) or right-click (button 2) for panning
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleCanvasPanMove = useCallback((e: MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  }, [isPanning, panStart]);

  const handleCanvasPanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Add pan event listeners
  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleCanvasPanMove);
      window.addEventListener('mouseup', handleCanvasPanEnd);
      window.addEventListener('mouseleave', handleCanvasPanEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleCanvasPanMove);
      window.removeEventListener('mouseup', handleCanvasPanEnd);
      window.removeEventListener('mouseleave', handleCanvasPanEnd);
    };
  }, [isPanning, handleCanvasPanMove, handleCanvasPanEnd]);

  // Calculate collection stats (memoized)
  const stats = useMemo(() => {
    if (entities.length === 0) return null;

    const totalTraits = entities.reduce((sum, e) => {
      const counts = getLayerCounts(e.uht_code);
      return sum + counts.reduce((a, b) => a + b, 0);
    }, 0);

    return {
      totalTraits,
      avgTraits: (totalTraits / entities.length).toFixed(1),
      layerDistribution: ['Physical', 'Functional', 'Abstract', 'Social'].map(layer => {
        const count = entities.filter(e => getDominantLayer(e.uht_code) === layer).length;
        return { layer, count, percentage: ((count / entities.length) * 100).toFixed(0) };
      })
    };
  }, [entities]);

  // Calculate canvas height (memoized)
  const canvasHeight = useMemo(() =>
    Object.values(cardPositions).reduce((max, pos) =>
      Math.max(max, pos.y + pos.height + 40), 400
    ), [cardPositions]
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper
        sx={{
          p: isCompact ? 1.5 : 2,
          borderRadius: 0,
          borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
          flexShrink: 0
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onBack} size="small">
            <BackIcon />
          </IconButton>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant={isCompact ? 'subtitle1' : 'h6'}
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {collection.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {collection.entityUuids.length} entities • {connections.length} connections
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {/* View Mode Toggle */}
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, value) => value && setViewMode(value)}
              size="small"
            >
              <ToggleButton value="list" sx={{ px: 1 }}>
                <Tooltip title="List view">
                  <ListIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="canvas" sx={{ px: 1 }}>
                <Tooltip title="Canvas view">
                  <CanvasIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>

            {collection.entityUuids.length >= 2 && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<CompareIcon />}
                onClick={handleCompare}
              >
                Compare
              </Button>
            )}
            <Tooltip title="Copy share link">
              <IconButton size="small" onClick={handleShare}>
                <ShareIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Stats */}
        {stats && (
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <Chip
              label={`${stats.avgTraits} avg traits`}
              size="small"
              variant="outlined"
            />
            {stats.layerDistribution.map(({ layer, count, percentage }) => (
              count > 0 && (
                <Chip
                  key={layer}
                  label={`${layer}: ${percentage}%`}
                  size="small"
                  sx={{
                    bgcolor: `${LAYER_COLORS[layer]}20`,
                    borderColor: LAYER_COLORS[layer],
                    color: LAYER_COLORS[layer]
                  }}
                  variant="outlined"
                />
              )
            ))}
          </Box>
        )}
      </Paper>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: viewMode === 'list' ? (isCompact ? 1 : 2) : 0, position: 'relative' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="warning" sx={{ mb: 2, mx: viewMode === 'canvas' ? 2 : 0 }}>{error}</Alert>
        )}

        {!loading && entities.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              This collection is empty
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add entities from the List View, Gallery, or Entity Details pages
            </Typography>
          </Box>
        )}

        {/* List View */}
        {!loading && entities.length > 0 && viewMode === 'list' && (
          <List disablePadding>
            {entities.map((entity) => {
              const dominantLayer = getDominantLayer(entity.uht_code);
              const layerColor = LAYER_COLORS[dominantLayer];

              return (
                <ListItem key={entity.uuid} disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => navigate(`/entity/${entity.uuid}`)}
                    sx={{
                      borderRadius: 1,
                      borderLeft: `3px solid ${layerColor}`,
                      bgcolor: 'rgba(255,255,255,0.02)',
                      '&:hover': { bgcolor: `${layerColor}15` }
                    }}
                  >
                    <ListItemAvatar>
                      {entity.image_url ? (
                        <Avatar
                          src={entity.image_url}
                          alt={entity.name}
                          variant="rounded"
                          sx={{ width: 48, height: 48 }}
                        />
                      ) : (
                        <Avatar
                          variant="rounded"
                          sx={{
                            width: 48,
                            height: 48,
                            bgcolor: `${layerColor}30`,
                            color: layerColor
                          }}
                        >
                          {entity.name[0]}
                        </Avatar>
                      )}
                    </ListItemAvatar>
                    <ListItemText
                      primary={entity.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            component="span"
                            variant="caption"
                            fontFamily="monospace"
                            color="primary.main"
                          >
                            {entity.uht_code}
                          </Typography>
                          <Chip
                            label={dominantLayer}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: `${layerColor}20`,
                              color: layerColor
                            }}
                          />
                        </Box>
                      }
                      primaryTypographyProps={{
                        sx: {
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }
                      }}
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Open entity">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/entity/${entity.uuid}`);
                          }}
                        >
                          <OpenIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove from collection">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromCollection(entity.uuid);
                          }}
                          sx={{ '&:hover': { color: 'error.main' } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}

        {/* Canvas View */}
        {!loading && entities.length > 0 && viewMode === 'canvas' && (
          <Box
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onContextMenu={(e) => e.preventDefault()}
            sx={{
              position: 'relative',
              minHeight: '100%',
              overflow: 'hidden',
              bgcolor: 'rgba(0,0,0,0.2)',
              cursor: isPanning ? 'grabbing' : (isConnecting ? 'crosshair' : 'default')
            }}
          >
            {/* Transformable canvas content */}
            <Box
              onMouseMove={handleCanvasMouseMove}
              onClick={(e) => {
                // Only clear pending connection if clicking directly on canvas background
                // (not when clicking on a card which handles its own selection)
                if (pendingConnection && e.target === e.currentTarget) {
                  setPendingConnection(null);
                  setMousePos(null);
                }
              }}
              sx={{
                position: 'relative',
                minHeight: canvasHeight * zoom,
                minWidth: '100%',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`
              }}
            >
              {/* Connection Lines */}
              <ConnectionLines
                connections={connections}
                positions={cardPositions}
                pendingConnection={pendingConnection}
                mousePos={mousePos}
              />

              {/* Entity Cards */}
              {entities.map((entity) => (
                cardPositions[entity.uuid] && (
                  <DraggableEntityCard
                    key={entity.uuid}
                    entity={entity}
                    position={cardPositions[entity.uuid]}
                    onPositionChange={handlePositionChange}
                    onRemove={handleRemoveFromCollection}
                    onOpen={(uuid) => navigate(`/entity/${uuid}`)}
                    isConnecting={isConnecting}
                    isSelected={pendingConnection === entity.uuid}
                    onSelect={handleCardSelect}
                    isMobile={isCompact}
                />
              )
            ))}
            </Box>

            {/* Canvas Tools - Connection controls */}
            <Box
              sx={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 1000
              }}
            >
              <Tooltip title={isConnecting ? 'Exit connect mode' : 'Connect entities'} placement="left">
                <Fab
                  size="medium"
                  color={isConnecting ? 'secondary' : 'primary'}
                  onClick={toggleConnectMode}
                >
                  <ConnectIcon />
                </Fab>
              </Tooltip>

              {connections.length > 0 && (
                <>
                  <Tooltip title="Undo last connection" placement="left">
                    <Fab size="small" onClick={handleUndoLastConnection}>
                      <UndoIcon />
                    </Fab>
                  </Tooltip>
                  <Tooltip title="Clear all connections" placement="left">
                    <Fab size="small" color="error" onClick={handleClearConnections}>
                      <ClearIcon />
                    </Fab>
                  </Tooltip>
                </>
              )}
            </Box>

            {/* Zoom Controls */}
            <Box
              sx={{
                position: 'fixed',
                bottom: 24,
                left: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 1000
              }}
            >
              <Tooltip title="Zoom in" placement="right">
                <Fab size="small" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM}>
                  <ZoomInIcon />
                </Fab>
              </Tooltip>
              <Tooltip title="Zoom out" placement="right">
                <Fab size="small" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM}>
                  <ZoomOutIcon />
                </Fab>
              </Tooltip>
              <Tooltip title="Reset view" placement="right">
                <Fab size="small" onClick={handleResetZoom}>
                  <ResetZoomIcon />
                </Fab>
              </Tooltip>
            </Box>

            {/* Zoom Level Indicator */}
            <Paper
              sx={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                px: 2,
                py: 0.5,
                bgcolor: 'background.paper',
                opacity: 0.8,
                zIndex: 999
              }}
            >
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                {Math.round(zoom * 100)}%
              </Typography>
            </Paper>

            {/* Connect Mode Indicator */}
            {isConnecting && (
              <Paper
                sx={{
                  position: 'fixed',
                  top: 80,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  px: 3,
                  py: 1,
                  bgcolor: 'secondary.main',
                  color: 'white',
                  zIndex: 1000
                }}
              >
                <Typography variant="body2">
                  {pendingConnection ? 'Click another card to connect' : 'Click a card to start connection'}
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
