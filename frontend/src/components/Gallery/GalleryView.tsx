import { useState, useEffect, useRef, useCallback } from 'react';
import type { FC, SyntheticEvent } from 'react';
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
  Fab,
  CircularProgress,
  TextField,
  InputAdornment,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  PhotoLibrary as GalleryIcon,
  Image as ImageIcon,
  ViewModule as GridIcon,
  ViewStream as FreeformIcon,
  OpenInNew as OpenInNewIcon,
  Sort as SortIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  AutoAwesome as SemanticIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import AddToCollectionButton from '../common/AddToCollectionButton';

interface GalleryItem {
  uuid: string;
  name: string;
  uht_code: string;
  description: string;
  image_url: string;
  dominant_layer: string;
  created_at: any;
  view_count?: number;
  wikidata_qid?: string;
  avg_confidence?: number;
  similarity_score?: number;  // For semantic search results
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
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  layer_filter?: string;
  sort_by?: string;
}

interface SemanticSearchResult {
  uuid: string;
  name: string;
  description: string;
  uht_code: string;
  image_url: string;
  similarity_score: number;
}

interface SemanticSearchResponse {
  query: string;
  results: SemanticSearchResult[];
  result_count: number;
  min_score: number;
  query_tokens: number;
  query_cost_usd: number;
}

type SortOption = 'newest' | 'most_views' | 'uht_code' | 'name' | 'random';

// Cache for gallery data (persists across navigation)
let galleryCache: {
  data: GalleryItem[];
  timestamp: number;
  filters: { layerFilter: string; sortBy: SortOption; hasWikidata: string; textSearch: string };
  totalCount: number;
  hasMore: boolean;
} | null = null;
const CACHE_TTL = 300000; // 5 minute cache

// LocalStorage keys for filter persistence
const GALLERY_STORAGE_KEYS = {
  layerFilter: 'gallery_layerFilter',
  sortBy: 'gallery_sortBy',
  hasWikidata: 'gallery_hasWikidata',
  textSearch: 'gallery_textSearch',
  viewMode: 'gallery_viewMode'
};

// Load persisted filters from localStorage
const loadGalleryFilters = () => {
  try {
    return {
      layerFilter: localStorage.getItem(GALLERY_STORAGE_KEYS.layerFilter) || '',
      sortBy: (localStorage.getItem(GALLERY_STORAGE_KEYS.sortBy) as SortOption) || 'newest',
      hasWikidata: localStorage.getItem(GALLERY_STORAGE_KEYS.hasWikidata) || 'all',
      textSearch: localStorage.getItem(GALLERY_STORAGE_KEYS.textSearch) || '',
      viewMode: (localStorage.getItem(GALLERY_STORAGE_KEYS.viewMode) as 'grid' | 'freeform') || 'grid'
    };
  } catch {
    return { layerFilter: '', sortBy: 'newest' as SortOption, hasWikidata: 'all', textSearch: '', viewMode: 'grid' as const };
  }
};

// Save filter to localStorage
const saveGalleryFilter = (key: keyof typeof GALLERY_STORAGE_KEYS, value: string) => {
  try {
    localStorage.setItem(GALLERY_STORAGE_KEYS[key], value);
  } catch {
    // Ignore storage errors
  }
};

const layerColors: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50',
  Unknown: '#757575'
};

// Calculate dominant layer from UHT code (same logic as backend)
const calculateDominantLayer = (uhtCode: string): string => {
  try {
    if (!uhtCode || uhtCode.length !== 8) return 'Unknown';

    const layers: Record<string, number> = {
      Physical: (parseInt(uhtCode.slice(0, 2), 16)).toString(2).split('1').length - 1,
      Functional: (parseInt(uhtCode.slice(2, 4), 16)).toString(2).split('1').length - 1,
      Abstract: (parseInt(uhtCode.slice(4, 6), 16)).toString(2).split('1').length - 1,
      Social: (parseInt(uhtCode.slice(6, 8), 16)).toString(2).split('1').length - 1
    };

    return Object.entries(layers).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  } catch {
    return 'Unknown';
  }
};

const API_BASE_URL = '';

// Helper to get correct image URL (handles both local and external URLs)
const getImageUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE_URL}${url}`;
};

// Draggable Card Component
const DraggableCard: FC<{
  item: GalleryItem;
  position: CardPosition;
  onPositionChange: (uuid: string, position: Partial<CardPosition>) => void;
  onDoubleClick: (item: GalleryItem) => void;
  onSelect: (uuid: string) => void;
  onOpenEntity: (item: GalleryItem) => void;
  isMobile?: boolean;
}> = ({ item, position, onPositionChange, onDoubleClick, onSelect, onOpenEntity, isMobile = false }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return; // Disable mouse drag on mobile (use touch)
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

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
    onSelect(item.uuid);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];

    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;

    onPositionChange(item.uuid, { x: newX, y: newY });
  }, [isDragging, dragStart, item.uuid, onPositionChange]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const handleImageLoad = (_e: SyntheticEvent<HTMLImageElement>) => {
    // Image loaded successfully
  };

  // Handle tap to open on mobile (instead of double-click)
  const handleClick = () => {
    if (isMobile && !isDragging) {
      onDoubleClick(item);
    }
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
        touchAction: isMobile ? 'none' : 'auto', // Prevent scroll interference on mobile
        '&:hover': {
          border: `2px solid ${layerColors[item.dominant_layer] || layerColors.Unknown}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      onDoubleClick={() => !isMobile && onDoubleClick(item)}
    >
      <CardMedia
        component="img"
        image={getImageUrl(item.image_url)}
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
        minHeight: 0,
        p: 0.75,
        '&:last-child': { pb: 0.75 },
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <Typography
          variant="caption"
          component="h3"
          sx={{
            fontWeight: 'bold',
            fontSize: '0.65rem',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.name}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
          <Chip
            label={item.dominant_layer}
            size="small"
            sx={{
              backgroundColor: layerColors[item.dominant_layer] || layerColors.Unknown,
              color: 'white',
              fontSize: '0.65rem',
              height: '20px',
              '& .MuiChip-label': { px: 0.75 }
            }}
          />
          <Chip
            label={item.uht_code}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.6rem',
              height: '20px',
              fontFamily: 'monospace',
              '& .MuiChip-label': { px: 0.6 }
            }}
          />
          <Box
            sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <AddToCollectionButton
              entityUuid={item.uuid}
              entityName={item.name}
              size="small"
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEntity(item);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              sx={{
                p: 0.25,
                '&:hover': {
                  backgroundColor: layerColors[item.dominant_layer] || layerColors.Unknown,
                  color: 'white'
                }
              }}
              title="Open entity definition"
            >
              <OpenInNewIcon sx={{ fontSize: '0.75rem' }} />
            </IconButton>
          </Box>
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
      sx={{
        zIndex: 9999  // Ensure dialog is on top of everything
      }}
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
          src={getImageUrl(item.image_url)}
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
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  // Load persisted filters
  const persistedFilters = loadGalleryFilters();

  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layerFilter, setLayerFilterState] = useState<string>(persistedFilters.layerFilter);
  const [sortBy, setSortByState] = useState<SortOption>(persistedFilters.sortBy);
  const [hasWikidata, setHasWikidataState] = useState<string>(persistedFilters.hasWikidata);
  const [cardPositions, setCardPositions] = useState<Record<string, CardPosition>>({});
  const [, setSelectedCard] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [viewMode, setViewModeState] = useState<'grid' | 'freeform'>(persistedFilters.viewMode);
  const [nextZIndex, setNextZIndex] = useState(1000);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 50;

  // Simple text search state
  const [textSearch, setTextSearch] = useState(persistedFilters.textSearch);
  const [activeTextSearch, setActiveTextSearch] = useState(persistedFilters.textSearch);

  // Wrapped setters that persist to localStorage
  const setLayerFilter = (value: string) => {
    setLayerFilterState(value);
    saveGalleryFilter('layerFilter', value);
  };
  const setSortBy = (value: SortOption) => {
    setSortByState(value);
    saveGalleryFilter('sortBy', value);
  };
  const setHasWikidata = (value: string) => {
    setHasWikidataState(value);
    saveGalleryFilter('hasWikidata', value);
  };
  const setViewMode = (value: 'grid' | 'freeform') => {
    setViewModeState(value);
    saveGalleryFilter('viewMode', value);
  };
  // Note: setTextSearchWithPersist is defined for future use with text search persistence
  const _setTextSearchWithPersist = (value: string) => {
    setTextSearch(value);
    saveGalleryFilter('textSearch', value);
  };
  void _setTextSearchWithPersist; // Suppress unused warning

  // Semantic search state
  const [semanticQuery, setSemanticQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSemanticMode, setIsSemanticMode] = useState(false);

  const handleOpenEntity = (item: GalleryItem) => {
    // Track view
    trackEntityView(item.uuid);
    navigate(`/entity/${item.uuid}`);
  };

  const trackEntityView = async (uuid: string) => {
    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      await fetch(`${baseUrl}/api/v1/images/entity/${uuid}/view`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to track view:', err);
    }
  };

  // Simple text search - submit on Enter or click
  const handleTextSearchSubmit = () => {
    if (textSearch.trim() === activeTextSearch) return; // No change
    const searchTerm = textSearch.trim();
    setActiveTextSearch(searchTerm);
    saveGalleryFilter('textSearch', searchTerm);
    setOffset(0);
    setCardPositions({});
    fetchGalleryWithSearch(searchTerm);
  };

  const handleTextSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTextSearchSubmit();
    }
  };

  // Fetch gallery with optional text search
  const fetchGalleryWithSearch = async (search?: string) => {
    try {
      setLoading(true);

      const baseUrl = API_BASE_URL || window.location.origin;
      const url = new URL(`${baseUrl}/api/v1/images/gallery`);
      url.searchParams.set('limit', ITEMS_PER_PAGE.toString());
      url.searchParams.set('offset', '0');
      url.searchParams.set('sort_by', sortBy);

      if (layerFilter) {
        url.searchParams.set('layer_filter', layerFilter);
      }
      if (hasWikidata === 'yes') {
        url.searchParams.set('has_wikidata', 'true');
      } else if (hasWikidata === 'no') {
        url.searchParams.set('has_wikidata', 'false');
      }
      if (search && search.trim()) {
        url.searchParams.set('search', search.trim());
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch gallery: ${response.statusText}`);
      }

      const data: GalleryResponse = await response.json();
      setGallery(data.gallery || []);
      setOffset(data.gallery?.length || 0);
      setHasMore(data.has_more);
      setTotalCount(data.total_count);
      setError(null);
    } catch (err) {
      console.error('Gallery fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
    }
  };

  // Semantic search function - only called on Enter or icon click
  const performSemanticSearch = async () => {
    const query = semanticQuery.trim();
    if (!query) {
      return;
    }

    setIsSearching(true);
    setIsSemanticMode(true);
    setError(null);

    try {
      const baseUrl = API_BASE_URL || window.location.origin;
      const response = await fetch(`${baseUrl}/api/v1/embeddings/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          limit: 50,
          min_score: 0.5
        })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data: SemanticSearchResponse = await response.json();
      setSearchResults(data.results);
      setCardPositions({}); // Reset positions for new results
    } catch (err) {
      console.error('Semantic search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Enter key for semantic search
  const handleSemanticKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && semanticQuery.trim()) {
      performSemanticSearch();
    }
  };

  // Clear semantic search and return to gallery mode
  const clearSemanticSearch = () => {
    setSemanticQuery('');
    setSearchResults([]);
    setIsSemanticMode(false);
    setCardPositions({});
  };

  // Clear text search
  const clearTextSearch = () => {
    setTextSearch('');
    setActiveTextSearch('');
    setOffset(0);
    setCardPositions({});
    fetchGallery(layerFilter || undefined, sortBy, hasWikidata, false);
  };

  // Convert search results to GalleryItem format for display (deduplicated)
  const searchResultsAsGallery: GalleryItem[] = searchResults
    .filter(r => r.image_url) // Only show items with images
    .filter((r, index, self) => self.findIndex(x => x.uuid === r.uuid) === index) // Deduplicate by UUID
    .map(result => ({
      uuid: result.uuid,
      name: result.name,
      description: result.description || '',
      uht_code: result.uht_code || '',
      image_url: result.image_url,
      dominant_layer: calculateDominantLayer(result.uht_code || ''),
      created_at: null,
      similarity_score: result.similarity_score
    }));

  // Items to display - either semantic search results or gallery
  const displayItems = isSemanticMode ? searchResultsAsGallery : gallery;

  const fetchGallery = async (layer?: string, sort?: SortOption, wikidata?: string, appendMode = false, forceRefresh = false) => {
    const currentFilters = {
      layerFilter: layer || '',
      sortBy: sort || sortBy,
      hasWikidata: wikidata || hasWikidata,
      textSearch: activeTextSearch
    };

    // Check cache first (only for initial load, not append mode)
    if (!appendMode && !forceRefresh && galleryCache) {
      const now = Date.now();
      const filtersMatch =
        galleryCache.filters.layerFilter === currentFilters.layerFilter &&
        galleryCache.filters.sortBy === currentFilters.sortBy &&
        galleryCache.filters.hasWikidata === currentFilters.hasWikidata &&
        galleryCache.filters.textSearch === currentFilters.textSearch;

      if (filtersMatch && now - galleryCache.timestamp < CACHE_TTL) {
        setGallery(galleryCache.data);
        setTotalCount(galleryCache.totalCount);
        setHasMore(galleryCache.hasMore);
        setOffset(galleryCache.data.length);
        setLoading(false);
        return;
      }
    }

    try {
      if (appendMode) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = appendMode ? offset : 0;

      // Build URL with query params
      const baseUrl = API_BASE_URL || window.location.origin;
      const url = new URL(`${baseUrl}/api/v1/images/gallery`);
      url.searchParams.set('limit', ITEMS_PER_PAGE.toString());
      url.searchParams.set('offset', currentOffset.toString());
      url.searchParams.set('sort_by', sort || sortBy);

      if (layer) {
        url.searchParams.set('layer_filter', layer);
      }

      const wikidataFilter = wikidata || hasWikidata;
      if (wikidataFilter === 'yes') {
        url.searchParams.set('has_wikidata', 'true');
      } else if (wikidataFilter === 'no') {
        url.searchParams.set('has_wikidata', 'false');
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch gallery: ${response.statusText}`);
      }

      const data: GalleryResponse = await response.json();

      if (appendMode) {
        // Deduplicate when appending to avoid duplicate keys
        setGallery(prev => {
          const existingUuids = new Set(prev.map(item => item.uuid));
          const newItems = (data.gallery || []).filter(item => !existingUuids.has(item.uuid));
          const combined = [...prev, ...newItems];
          // Update cache with combined data
          galleryCache = {
            data: combined,
            timestamp: Date.now(),
            filters: currentFilters,
            totalCount: data.total_count,
            hasMore: data.has_more
          };
          return combined;
        });
        setOffset(currentOffset + (data.gallery?.length || 0));
      } else {
        setGallery(data.gallery || []);
        setOffset(data.gallery?.length || 0);
        setCardPositions({}); // Reset positions for new data
        // Update cache
        galleryCache = {
          data: data.gallery || [],
          timestamp: Date.now(),
          filters: currentFilters,
          totalCount: data.total_count,
          hasMore: data.has_more
        };
      }

      setHasMore(data.has_more);
      setTotalCount(data.total_count);
      setError(null);
    } catch (err) {
      console.error('Gallery fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchGallery(layerFilter || undefined, sortBy, hasWikidata, true);
    }
  }, [loadingMore, hasMore, layerFilter, sortBy, hasWikidata]);

  // Calculate positions helper
  const calculatePositions = useCallback(() => {
    if (displayItems.length === 0) return;

    setCardPositions(prevPositions => {
      const newPositions: Record<string, CardPosition> = { ...prevPositions };

      // Get the actual container width - fallback to a reasonable width
      const containerWidth = containerRef.current?.clientWidth || (isCompact ? 375 : 1200);
      const containerHeight = containerRef.current?.clientHeight || 800;

      // Use smaller cards on mobile
      const cardWidth = isCompact ? 140 : 200;
      const cardHeight = isCompact ? 180 : 260;
      const spacing = isCompact ? 12 : 20;

      displayItems.forEach((item, index) => {
        // Skip items that already have positions (unless in freeform mode which randomizes)
        if (newPositions[item.uuid] && viewMode === 'grid') return;

        // Force grid mode on mobile, or use selected viewMode
        const effectiveViewMode = isCompact ? 'grid' : viewMode;

        if (effectiveViewMode === 'grid') {
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

      return newPositions;
    });
  }, [displayItems, viewMode, isCompact]);

  // Initialize card positions when items load or new items are added
  useEffect(() => {
    if (displayItems.length > 0) {
      // Check if we need to calculate positions for new items
      const hasNewItems = displayItems.some(item => !cardPositions[item.uuid]);
      if (hasNewItems || Object.keys(cardPositions).length === 0) {
        // Small delay to ensure container is measured
        const timer = setTimeout(calculatePositions, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [displayItems, viewMode, calculatePositions]);

  // Fetch gallery when filters change
  useEffect(() => {
    // If there's an active text search, use fetchGalleryWithSearch
    if (activeTextSearch) {
      fetchGalleryWithSearch(activeTextSearch);
    } else {
      fetchGallery(layerFilter || undefined, sortBy, hasWikidata, false);
    }
  }, [layerFilter, sortBy, hasWikidata, activeTextSearch]);

  // Scroll-based infinite scroll (more reliable with absolute positioning)
  // Disabled in search mode since search results are not paginated
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isSemanticMode) return;

    const handleScroll = () => {
      if (loadingMore || loading || !hasMore || isSemanticMode) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when user scrolls within 300px of the bottom
      if (scrollTop + clientHeight >= scrollHeight - 300) {
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    // Also check on initial load and when card positions change
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loading, loadMore, cardPositions, isSemanticMode]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (viewMode === 'grid' && displayItems.length > 0) {
        calculatePositions();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [displayItems, viewMode, calculatePositions]);

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
    trackEntityView(item.uuid);
    setPreviewItem(item);
  };

  const handleViewModeChange = () => {
    setViewMode(viewMode === 'grid' ? 'freeform' : 'grid');
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
        p: isCompact ? 1 : 2,
        display: 'flex',
        alignItems: 'center',
        gap: isCompact ? 1 : 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexWrap: 'wrap'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GalleryIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'}>
            Gallery
          </Typography>
        </Box>

        {/* Simple Text Search - filters by name/description (Enter or click to search) */}
        <Tooltip title="Filter by name. Press Enter or click 🔍 to search." arrow>
          <TextField
            size="small"
            placeholder="Filter by name..."
            value={textSearch}
            onChange={(e) => setTextSearch(e.target.value)}
            onKeyDown={handleTextSearchKeyDown}
            disabled={isSemanticMode}
            sx={{
              minWidth: isCompact ? 100 : 150,
              maxWidth: isCompact ? 130 : 180,
              '& .MuiOutlinedInput-root': {
                fontSize: isCompact ? '0.85rem' : '1rem',
                bgcolor: activeTextSearch ? 'action.selected' : 'transparent'
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton
                    size="small"
                    onClick={handleTextSearchSubmit}
                    disabled={isSemanticMode || !textSearch.trim()}
                    sx={{ p: 0, mr: -0.5 }}
                  >
                    <SearchIcon sx={{ fontSize: 18, color: textSearch.trim() ? 'primary.main' : 'action.active' }} />
                  </IconButton>
                </InputAdornment>
              ),
              endAdornment: textSearch && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={clearTextSearch}
                    edge="end"
                    sx={{ p: 0.5 }}
                  >
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Tooltip>

        {/* Semantic Search Input - press Enter or click icon to search */}
        <Tooltip title="AI semantic search. Press Enter or click ✨ to search." arrow>
          <TextField
            size="small"
            placeholder={isCompact ? "AI search..." : "Semantic search..."}
            value={semanticQuery}
            onChange={(e) => setSemanticQuery(e.target.value)}
            onKeyDown={handleSemanticKeyDown}
            sx={{
              minWidth: isCompact ? 100 : 160,
              maxWidth: isCompact ? 140 : 200,
              '& .MuiOutlinedInput-root': {
                fontSize: isCompact ? '0.85rem' : '1rem',
                bgcolor: isSemanticMode ? 'action.selected' : 'transparent'
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton
                    size="small"
                    onClick={performSemanticSearch}
                    disabled={!semanticQuery.trim() || isSearching}
                    sx={{ p: 0.25 }}
                  >
                    {isSearching ? (
                      <CircularProgress size={16} />
                    ) : (
                      <SemanticIcon sx={{ fontSize: 18, color: isSemanticMode ? 'primary.main' : 'action.active' }} />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
              endAdornment: (semanticQuery || isSemanticMode) && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={clearSemanticSearch}
                    edge="end"
                    sx={{ p: 0.5 }}
                  >
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Tooltip>

        {/* Sort dropdown - hidden in semantic search mode */}
        {!isSemanticMode && (
          <FormControl size="small" sx={{ minWidth: isCompact ? 100 : 130 }}>
            <InputLabel sx={{ fontSize: isCompact ? '0.8rem' : '1rem' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SortIcon sx={{ fontSize: 16 }} /> Sort
              </Box>
            </InputLabel>
            <Select
              value={sortBy}
              label="Sort"
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              sx={{ fontSize: isCompact ? '0.85rem' : '1rem' }}
            >
              <MenuItem value="newest">Newest</MenuItem>
              <MenuItem value="most_views">Most Views</MenuItem>
              <MenuItem value="uht_code">UHT Code</MenuItem>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="random">Random</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* Layer filter - hidden in semantic search mode */}
        {!isSemanticMode && (
          <FormControl size="small" sx={{ minWidth: isCompact ? 100 : 130 }}>
            <InputLabel sx={{ fontSize: isCompact ? '0.8rem' : '1rem' }}>
              Layer
            </InputLabel>
            <Select
              value={layerFilter}
              label="Layer"
              onChange={(e) => setLayerFilter(e.target.value)}
              sx={{ fontSize: isCompact ? '0.85rem' : '1rem' }}
            >
              <MenuItem value="">All Layers</MenuItem>
              <MenuItem value="Physical">Physical</MenuItem>
              <MenuItem value="Functional">Functional</MenuItem>
              <MenuItem value="Abstract">Abstract</MenuItem>
              <MenuItem value="Social">Social</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* Wikidata filter - hidden in semantic search mode */}
        {!isSemanticMode && (
          <FormControl size="small" sx={{ minWidth: isCompact ? 100 : 130 }}>
            <InputLabel sx={{ fontSize: isCompact ? '0.8rem' : '1rem' }}>
              Source
            </InputLabel>
            <Select
              value={hasWikidata}
              label="Source"
              onChange={(e) => setHasWikidata(e.target.value)}
              sx={{ fontSize: isCompact ? '0.85rem' : '1rem' }}
            >
              <MenuItem value="all">All Sources</MenuItem>
              <MenuItem value="yes">Wikidata</MenuItem>
              <MenuItem value="no">Custom</MenuItem>
            </Select>
          </FormControl>
        )}

        {/* Status text */}
        {!loading && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: isCompact ? '0.75rem' : '0.875rem', ml: 'auto' }}>
            {isSemanticMode ? (
              <>
                <SemanticIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                {searchResultsAsGallery.length} results
              </>
            ) : (
              <>{gallery.length} of {totalCount} {isCompact ? '' : 'images'}</>
            )}
          </Typography>
        )}
      </Box>

      {/* View Mode Toggle - hidden on mobile (grid only) */}
      {!isCompact && (
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
      )}

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
        {loading || isSearching ? (
          <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={24} />
            <Typography>{isSearching ? 'Searching...' : 'Loading gallery...'}</Typography>
          </Box>
        ) : displayItems.length === 0 ? (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            {isSemanticMode ? (
              <>
                <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No matching images found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Try a different search term or clear the search to browse all images
                </Typography>
              </>
            ) : (
              <>
                <ImageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No images found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Generate some images for classified entities to see them here
                </Typography>
              </>
            )}
          </Box>
        ) : (
          <>
            {displayItems.map((item) => (
              cardPositions[item.uuid] && (
                <DraggableCard
                  key={item.uuid}
                  item={item}
                  position={cardPositions[item.uuid]}
                  onPositionChange={handlePositionChange}
                  onDoubleClick={handleDoubleClick}
                  onSelect={handleCardSelect}
                  onOpenEntity={handleOpenEntity}
                  isMobile={isCompact}
                />
              )
            ))}
            {/* Loading indicator - positioned below all cards */}
            <Box
              sx={{
                position: 'absolute',
                top: Object.values(cardPositions).reduce((max, pos) =>
                  Math.max(max, pos.y + pos.height), 0) + 20,
                left: 0,
                right: 0,
                height: 100,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {loadingMore && !isSemanticMode && (
                <CircularProgress size={32} />
              )}
              {!isSemanticMode && !hasMore && gallery.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  All {totalCount} images loaded
                </Typography>
              )}
              {isSemanticMode && displayItems.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Showing {displayItems.length} semantically similar images
                </Typography>
              )}
            </Box>
          </>
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