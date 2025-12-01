import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogContent,
  IconButton,
  Skeleton,
  Fab
} from '@mui/material';
import {
  Close as CloseIcon,
  PhotoLibrary as GalleryIcon,
  Image as ImageIcon,
  ViewModule as GridIcon,
  ViewStream as FreeformIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface GalleryItem {
  uuid: string;
  name: string;
  uht_code: string;
  description: string;
  image_url: string;
  dominant_layer: string;
  created_at: any;
}

interface CardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface GalleryResponse {
  gallery: GalleryItem[];
  total_count: number;
  layer_filter?: string;
}

const layerColors: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF', 
  Abstract: '#9C27B0',
  Social: '#4CAF50',
  Unknown: '#757575'
};

const API_BASE_URL = 'http://localhost:8100';

// Draggable Card Component
const DraggableCard: React.FC<{
  item: GalleryItem;
  position: CardPosition;
  onPositionChange: (uuid: string, position: Partial<CardPosition>) => void;
  onDoubleClick: (item: GalleryItem) => void;
  onSelect: (uuid: string) => void;
  onOpenEntity: (item: GalleryItem) => void;
}> = ({ item, position, onPositionChange, onDoubleClick, onSelect, onOpenEntity }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageAspectRatio, setImageAspectRatio] = useState(1);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.detail === 2) return; // Ignore double clicks
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    onSelect(item.uuid);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    onPositionChange(item.uuid, { x: newX, y: newY });
  }, [isDragging, dragStart, item.uuid, onPositionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    const ratio = img.naturalWidth / img.naturalHeight;
    setImageAspectRatio(ratio);
  };

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
        cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        border: '2px solid transparent',
        '&:hover': {
          border: `2px solid ${layerColors[item.dominant_layer] || layerColors.Unknown}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onDoubleClick(item)}
    >
      <CardMedia
        component="img"
        image={`${API_BASE_URL}${item.image_url}`}
        alt={item.name}
        sx={{
          height: position.height * 0.7,
          objectFit: 'cover'
        }}
        onLoad={handleImageLoad}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
      <CardContent sx={{
        height: position.height * 0.3,
        p: 1,
        '&:last-child': { pb: 1 },
        position: 'relative'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Typography
            variant="caption"
            component="h3"
            sx={{
              fontWeight: 'bold',
              fontSize: '0.7rem',
              lineHeight: 1.2,
              mb: 0.5,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {item.name}
          </Typography>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onOpenEntity(item);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{
              p: 0.3,
              ml: 0.5,
              '&:hover': {
                backgroundColor: layerColors[item.dominant_layer] || layerColors.Unknown,
                color: 'white'
              }
            }}
            title="Open entity definition"
          >
            <OpenInNewIcon sx={{ fontSize: '0.9rem' }} />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, mb: 0.5 }}>
          <Chip
            label={item.dominant_layer}
            size="small"
            sx={{
              backgroundColor: layerColors[item.dominant_layer] || layerColors.Unknown,
              color: 'white',
              fontSize: '0.6rem',
              height: '16px',
              alignSelf: 'flex-start'
            }}
          />
          <Chip
            label={item.uht_code}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.55rem',
              height: '16px',
              fontFamily: 'monospace',
              letterSpacing: '0.5px',
              alignSelf: 'flex-start'
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

// Full Screen Preview Dialog
const ImagePreviewDialog: React.FC<{
  item: GalleryItem | null;
  open: boolean;
  onClose: () => void;
}> = ({ item, open, onClose }) => {
  if (!item) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          bgcolor: 'rgba(0,0,0,0.9)',
          boxShadow: 'none',
          maxWidth: '90vw',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogContent sx={{ p: 0, position: 'relative' }}>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: 'white',
            bgcolor: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            '&:hover': {
              bgcolor: 'rgba(0,0,0,0.7)'
            }
          }}
        >
          <CloseIcon />
        </IconButton>
        
        <img
          src={`${API_BASE_URL}${item.image_url}`}
          alt={item.name}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            display: 'block'
          }}
        />
        
        <Box sx={{ 
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
          color: 'white',
          p: 2
        }}>
          <Typography variant="h6" gutterBottom>
            {item.name}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {item.description}
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Chip
              label={item.dominant_layer}
              size="small"
              sx={{
                backgroundColor: layerColors[item.dominant_layer] || layerColors.Unknown,
                color: 'white'
              }}
            />
            <Chip
              label={item.uht_code}
              size="small"
              sx={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                color: 'white'
              }}
            />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

// Main Gallery Component
export default function GalleryView() {
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layerFilter, setLayerFilter] = useState<string>('');
  const [cardPositions, setCardPositions] = useState<Record<string, CardPosition>>({});
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'freeform'>('grid');
  const [nextZIndex, setNextZIndex] = useState(1000);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleOpenEntity = (item: GalleryItem) => {
    navigate(`/entity/${item.uuid}`);
  };

  const fetchGallery = async (layer?: string) => {
    try {
      setLoading(true);
      const url = new URL(`${API_BASE_URL}/api/v1/images/gallery`);
      if (layer) {
        url.searchParams.set('layer_filter', layer);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch gallery: ${response.statusText}`);
      }
      
      const data: GalleryResponse = await response.json();
      setGallery(data.gallery || []);
      setError(null);
    } catch (err) {
      console.error('Gallery fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
    }
  };

  // Calculate positions helper
  const calculatePositions = useCallback(() => {
    if (gallery.length === 0) return;

    const newPositions: Record<string, CardPosition> = {};

    // Get the actual container width - fallback to a reasonable desktop width
    const containerWidth = containerRef.current?.clientWidth || 1200;
    const containerHeight = containerRef.current?.clientHeight || 800;

    gallery.forEach((item, index) => {
      if (viewMode === 'grid') {
        const cardWidth = 200;
        const cardHeight = 260;
        const spacing = 20;

        // Calculate how many columns can fit in the available width (min 1)
        const cols = Math.max(1, Math.floor((containerWidth - spacing) / (cardWidth + spacing)));
        const row = Math.floor(index / cols);
        const col = index % cols;

        // Center the grid in the available space
        const totalGridWidth = cols * (cardWidth + spacing) - spacing;
        const startX = Math.max(spacing, (containerWidth - totalGridWidth) / 2);

        newPositions[item.uuid] = {
          x: startX + col * (cardWidth + spacing),
          y: spacing + row * (cardHeight + spacing),
          width: cardWidth,
          height: cardHeight,
          zIndex: 1000 + index
        };
      } else {
        // Random positioning for freeform - use full container space
        const margin = 50;
        newPositions[item.uuid] = {
          x: margin + Math.random() * Math.max(0, containerWidth - 300 - margin * 2),
          y: margin + Math.random() * Math.max(0, containerHeight - 400),
          width: 180 + Math.random() * 120,
          height: 220 + Math.random() * 160,
          zIndex: 1000 + index
        };
      }
    });

    setCardPositions(newPositions);
  }, [gallery, viewMode]);

  // Initialize card positions when gallery loads
  useEffect(() => {
    if (gallery.length > 0 && Object.keys(cardPositions).length === 0) {
      // Small delay to ensure container is measured
      const timer = setTimeout(calculatePositions, 50);
      return () => clearTimeout(timer);
    }
  }, [gallery, viewMode, cardPositions, calculatePositions]);

  useEffect(() => {
    fetchGallery(layerFilter || undefined);
  }, [layerFilter]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (viewMode === 'grid' && gallery.length > 0) {
        calculatePositions();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gallery, viewMode, calculatePositions]);

  const handlePositionChange = (uuid: string, newPosition: Partial<CardPosition>) => {
    setCardPositions(prev => ({
      ...prev,
      [uuid]: {
        ...prev[uuid],
        ...newPosition
      }
    }));
  };

  const handleCardSelect = (uuid: string) => {
    setSelectedCard(uuid);
    // Bring to front
    setCardPositions(prev => ({
      ...prev,
      [uuid]: {
        ...prev[uuid],
        zIndex: nextZIndex
      }
    }));
    setNextZIndex(prev => prev + 1);
  };

  const handleDoubleClick = (item: GalleryItem) => {
    setPreviewItem(item);
  };

  const handleViewModeChange = () => {
    setViewMode(prev => prev === 'grid' ? 'freeform' : 'grid');
    setCardPositions({}); // Reset positions
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      minWidth: 0,
      minHeight: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      bgcolor: 'background.default'
    }}>
      {/* Controls Bar */}
      <Box sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GalleryIcon color="primary" />
          <Typography variant="h6">
            Gallery
          </Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Filter by Layer</InputLabel>
          <Select
            value={layerFilter}
            label="Filter by Layer"
            onChange={(e) => setLayerFilter(e.target.value)}
          >
            <MenuItem value="">All Layers</MenuItem>
            <MenuItem value="Physical">Physical</MenuItem>
            <MenuItem value="Functional">Functional</MenuItem>
            <MenuItem value="Abstract">Abstract</MenuItem>
            <MenuItem value="Social">Social</MenuItem>
          </Select>
        </FormControl>

        {!loading && (
          <Typography variant="body2" color="text.secondary">
            {gallery.length} image{gallery.length !== 1 ? 's' : ''}
          </Typography>
        )}
      </Box>

      {/* View Mode Toggle */}
      <Fab
        onClick={handleViewModeChange}
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 2000
        }}
        color="primary"
      >
        {viewMode === 'grid' ? <FreeformIcon /> : <GridIcon />}
      </Fab>

      {/* Gallery Container */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          height: 'calc(100% - 72px)',
          position: 'relative',
          userSelect: 'none',
          overflow: 'auto'
        }}
      >
        {loading ? (
          <Box sx={{ p: 3 }}>
            <Typography>Loading gallery...</Typography>
          </Box>
        ) : gallery.length === 0 ? (
          <Box sx={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <ImageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No images found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generate some images for classified entities to see them here
            </Typography>
          </Box>
        ) : (
          gallery.map((item) => (
            cardPositions[item.uuid] && (
              <DraggableCard
                key={item.uuid}
                item={item}
                position={cardPositions[item.uuid]}
                onPositionChange={handlePositionChange}
                onDoubleClick={handleDoubleClick}
                onSelect={handleCardSelect}
                onOpenEntity={handleOpenEntity}
              />
            )
          ))
        )}
      </Box>

      {/* Full Screen Preview */}
      <ImagePreviewDialog
        item={previewItem}
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </Box>
  );
}