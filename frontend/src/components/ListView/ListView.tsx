import React, { useState, useEffect, useMemo, useCallback, useRef, useTransition } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButton,
  ToggleButtonGroup,
  Badge,
  Divider,
  Collapse
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  TableChart as ListIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenIcon,
  Tune as TuneIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { entityAPI, traitsAPI } from '../../services/api';
import { useMobile } from '../../context/MobileContext';
import type { UHTEntity, Trait } from '../../types';

// Layer configuration
const LAYERS = [
  { name: 'Physical', color: '#FF6B35', bits: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'Functional', color: '#00E5FF', bits: [9, 10, 11, 12, 13, 14, 15, 16] },
  { name: 'Abstract', color: '#9C27B0', bits: [17, 18, 19, 20, 21, 22, 23, 24] },
  { name: 'Social', color: '#4CAF50', bits: [25, 26, 27, 28, 29, 30, 31, 32] }
];

const LAYER_COLORS: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

type TraitFilterValue = '1' | '0' | 'X';
type TraitFilterState = Record<number, TraitFilterValue>;

interface EntityMetrics {
  dominantLayer: string;
  layerCounts: [number, number, number, number]; // P, F, A, S
  totalTraits: number;
}

// Cache for computed metrics
const metricsCache = new Map<string, EntityMetrics>();

// Cache for API data (persists across navigation)
let entitiesCache: { data: UHTEntity[]; timestamp: number } | null = null;
let traitsCache: { data: Trait[]; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 1 minute cache

// LocalStorage keys for filter persistence
const STORAGE_KEYS = {
  searchQuery: 'listView_searchQuery',
  selectedLayers: 'listView_selectedLayers',
  minTraitCount: 'listView_minTraitCount',
  traitFilter: 'listView_traitFilter',
  hexFilters: 'listView_hexFilters'
};

// Hex filter per layer (Physical, Functional, Abstract, Social)
type HexFilters = {
  Physical: string;
  Functional: string;
  Abstract: string;
  Social: string;
};

const DEFAULT_HEX_FILTERS: HexFilters = { Physical: '', Functional: '', Abstract: '', Social: '' };

interface PersistedFilters {
  searchQuery: string;
  selectedLayers: string[];
  minTraitCount: number | '';
  traitFilter: TraitFilterState | null;
  hexFilters: HexFilters;
}

// Load persisted filters from localStorage
const loadPersistedFilters = (): PersistedFilters => {
  try {
    const searchQuery = localStorage.getItem(STORAGE_KEYS.searchQuery) || '';
    const selectedLayers = JSON.parse(localStorage.getItem(STORAGE_KEYS.selectedLayers) || '[]');
    const minTraitCount = localStorage.getItem(STORAGE_KEYS.minTraitCount);
    const traitFilter = JSON.parse(localStorage.getItem(STORAGE_KEYS.traitFilter) || 'null');
    const hexFilters = JSON.parse(localStorage.getItem(STORAGE_KEYS.hexFilters) || 'null');

    return {
      searchQuery,
      selectedLayers: Array.isArray(selectedLayers) ? selectedLayers : [],
      minTraitCount: minTraitCount ? parseInt(minTraitCount) : '',
      traitFilter: traitFilter || null,
      hexFilters: hexFilters || DEFAULT_HEX_FILTERS
    };
  } catch {
    return { searchQuery: '', selectedLayers: [], minTraitCount: '', traitFilter: null, hexFilters: DEFAULT_HEX_FILTERS };
  }
};

// Save filters to localStorage
const saveFilter = (key: keyof typeof STORAGE_KEYS, value: any) => {
  try {
    if (typeof value === 'object') {
      localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    } else {
      localStorage.setItem(STORAGE_KEYS[key], String(value));
    }
  } catch {
    // Ignore storage errors
  }
};

const clearPersistedFilters = () => {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
};

const computeEntityMetrics = (uhtCode: string): EntityMetrics => {
  if (!uhtCode || uhtCode.length !== 8) {
    return { dominantLayer: 'Unknown', layerCounts: [0, 0, 0, 0], totalTraits: 0 };
  }

  const cached = metricsCache.get(uhtCode);
  if (cached) return cached;

  const p = (parseInt(uhtCode.slice(0, 2), 16).toString(2).match(/1/g) || []).length;
  const f = (parseInt(uhtCode.slice(2, 4), 16).toString(2).match(/1/g) || []).length;
  const a = (parseInt(uhtCode.slice(4, 6), 16).toString(2).match(/1/g) || []).length;
  const s = (parseInt(uhtCode.slice(6, 8), 16).toString(2).match(/1/g) || []).length;

  const counts: [number, number, number, number] = [p, f, a, s];
  const maxIdx = counts.indexOf(Math.max(...counts));
  const layers = ['Physical', 'Functional', 'Abstract', 'Social'];

  const result: EntityMetrics = {
    dominantLayer: layers[maxIdx],
    layerCounts: counts,
    totalTraits: p + f + a + s
  };

  metricsCache.set(uhtCode, result);
  return result;
};

const getBinaryFromUHT = (uhtCode: string): string => {
  if (!uhtCode || uhtCode.length !== 8) return '0'.repeat(32);
  return parseInt(uhtCode, 16).toString(2).padStart(32, '0');
};

// Layer byte positions in UHT code (each layer is 2 hex chars)
const LAYER_BYTE_POSITIONS: Record<string, [number, number]> = {
  Physical: [0, 2],    // chars 0-1
  Functional: [2, 4],  // chars 2-3
  Abstract: [4, 6],    // chars 4-5
  Social: [6, 8]       // chars 6-7
};

const matchesHexFilters = (uhtCode: string, hexFilters: HexFilters): boolean => {
  if (!uhtCode || uhtCode.length !== 8) return false;
  const upperCode = uhtCode.toUpperCase();

  for (const [layer, filter] of Object.entries(hexFilters)) {
    if (!filter) continue; // Empty filter = don't care
    const upperFilter = filter.toUpperCase();
    const [start, end] = LAYER_BYTE_POSITIONS[layer];
    const layerHex = upperCode.slice(start, end);

    // Support partial match: "A" matches "A0", "A7", "AF", etc.
    if (!layerHex.startsWith(upperFilter)) {
      return false;
    }
  }
  return true;
};

const countActiveHexFilters = (hexFilters: HexFilters): number => {
  return Object.values(hexFilters).filter(v => v.length > 0).length;
};

const matchesTraitFilter = (uhtCode: string, filter: TraitFilterState, activeCount: number): boolean => {
  if (activeCount === 0) return true;
  const binary = getBinaryFromUHT(uhtCode);

  // AND logic: all non-X filters must match
  for (const [bit, value] of Object.entries(filter)) {
    if (value === 'X') continue;
    // Bit 1 = index 0 (MSB), Bit 32 = index 31 (LSB)
    const bitIndex = parseInt(bit) - 1;
    const hasTrait = binary[bitIndex] === '1';
    if (value === '1' && !hasTrait) return false;
    if (value === '0' && hasTrait) return false;
  }
  return true;
};

const countActiveFilters = (filter: TraitFilterState): number => {
  return Object.values(filter).filter(v => v !== 'X').length;
};

type SortField = 'name' | 'uht_code' | 'trait_count' | 'created_at';
type SortDirection = 'asc' | 'desc';

// Trait Filter Dialog Component (memoized)
const TraitFilterDialog = React.memo<{
  open: boolean;
  onClose: () => void;
  traits: Trait[];
  traitFilter: TraitFilterState;
  onFilterChange: (filter: TraitFilterState) => void;
}>(({ open, onClose, traits, traitFilter, onFilterChange }) => {
  const [localFilter, setLocalFilter] = useState<TraitFilterState>(traitFilter);

  useEffect(() => {
    if (open) setLocalFilter(traitFilter);
  }, [traitFilter, open]);

  const handleTraitChange = (bit: number, value: TraitFilterValue) => {
    setLocalFilter(prev => ({ ...prev, [bit]: value }));
  };

  const handleApply = () => {
    onFilterChange(localFilter);
    onClose();
  };

  const handleClearAll = () => {
    const cleared: TraitFilterState = {};
    for (let i = 1; i <= 32; i++) cleared[i] = 'X';
    setLocalFilter(cleared);
  };

  const handleSetAllLayer = (layerBits: number[], value: TraitFilterValue) => {
    setLocalFilter(prev => {
      const newFilter = { ...prev };
      layerBits.forEach(bit => { newFilter[bit] = value; });
      return newFilter;
    });
  };

  const getTraitsByLayer = (layerName: string) => {
    return traits.filter(t => t.layer === layerName).sort((a, b) => a.bit - b.bit);
  };

  const activeCount = countActiveFilters(localFilter);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon color="primary" />
          <Typography variant="h6">Trait Filter</Typography>
          {activeCount > 0 && <Chip label={`${activeCount} active`} size="small" color="primary" />}
        </Box>
        <Button size="small" onClick={handleClearAll} startIcon={<ClearIcon />}>Clear All</Button>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Set filter conditions: <strong>1</strong> = must have, <strong>0</strong> = must not have, <strong>X</strong> = don't care
        </Typography>
        {LAYERS.map((layer) => {
          const layerTraits = getTraitsByLayer(layer.name);
          return (
            <Box key={layer.name} sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: layer.color }} />
                <Typography variant="subtitle1" sx={{ color: layer.color, fontWeight: 600 }}>
                  {layer.name} Layer (Bits {layer.bits[0]}-{layer.bits[7]})
                </Typography>
                <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                  {(['1', '0', 'X'] as const).map(v => (
                    <Button key={v} size="small" variant="outlined" sx={{ minWidth: 32, px: 1, fontSize: '0.7rem' }}
                      onClick={() => handleSetAllLayer(layer.bits, v)}>All {v}</Button>
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {layerTraits.map((trait) => (
                  <Box key={trait.bit} sx={{
                    display: 'flex', alignItems: 'center', gap: 2, p: 1, borderRadius: 1,
                    backgroundColor: localFilter[trait.bit] !== 'X' ? `${layer.color}15` : 'transparent',
                    border: `1px solid ${localFilter[trait.bit] !== 'X' ? layer.color : 'transparent'}40`
                  }}>
                    <Chip label={trait.bit} size="small" sx={{ minWidth: 32, fontFamily: 'monospace', backgroundColor: `${layer.color}30`, color: layer.color }} />
                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={trait.expanded_definition || trait.short_description}>{trait.name}</Typography>
                    <ToggleButtonGroup value={localFilter[trait.bit] || 'X'} exclusive
                      onChange={(_, value) => value && handleTraitChange(trait.bit, value)} size="small">
                      <ToggleButton value="1" sx={{ px: 1.5, '&.Mui-selected': { backgroundColor: '#4CAF50', color: 'white', '&:hover': { backgroundColor: '#45a049' } } }}>1</ToggleButton>
                      <ToggleButton value="0" sx={{ px: 1.5, '&.Mui-selected': { backgroundColor: '#f44336', color: 'white', '&:hover': { backgroundColor: '#da190b' } } }}>0</ToggleButton>
                      <ToggleButton value="X" sx={{ px: 1.5, '&.Mui-selected': { backgroundColor: '#757575', color: 'white', '&:hover': { backgroundColor: '#616161' } } }}>X</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                ))}
              </Box>
              {layer.name !== 'Social' && <Divider sx={{ mt: 2 }} />}
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="contained" color="primary">Apply Filter</Button>
      </DialogActions>
    </Dialog>
  );
});

TraitFilterDialog.displayName = 'TraitFilterDialog';

export default function ListView() {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [entities, setEntities] = useState<UHTEntity[]>([]);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(!isMobile);

  // Load persisted filters on initial render
  const persistedFilters = useMemo(() => loadPersistedFilters(), []);
  const defaultTraitFilter = useMemo(() => {
    const initial: TraitFilterState = {};
    for (let i = 1; i <= 32; i++) initial[i] = 'X';
    return initial;
  }, []);

  // Filter state - initialized from localStorage
  const [searchQuery, setSearchQueryState] = useState(persistedFilters.searchQuery);
  const [deferredSearch, setDeferredSearch] = useState(persistedFilters.searchQuery);
  const [selectedLayers, setSelectedLayersState] = useState<string[]>(persistedFilters.selectedLayers);
  const [minTraitCount, setMinTraitCountState] = useState<number | ''>(persistedFilters.minTraitCount);
  const [traitFilter, setTraitFilterState] = useState<TraitFilterState>(
    persistedFilters.traitFilter || defaultTraitFilter
  );
  const [traitFilterDialogOpen, setTraitFilterDialogOpen] = useState(false);
  const [sortField] = useState<SortField>('name');
  const [sortDirection] = useState<SortDirection>('asc');

  // Wrapped setters that also persist to localStorage
  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryState(value);
    saveFilter('searchQuery', value);
  }, []);

  const setSelectedLayers = useCallback((value: string[]) => {
    setSelectedLayersState(value);
    saveFilter('selectedLayers', value);
  }, []);

  const setMinTraitCount = useCallback((value: number | '') => {
    setMinTraitCountState(value);
    saveFilter('minTraitCount', value === '' ? '' : value);
  }, []);

  const setTraitFilter = useCallback((value: TraitFilterState) => {
    setTraitFilterState(value);
    saveFilter('traitFilter', value);
  }, []);

  // Hex filter state
  const [hexFilters, setHexFiltersState] = useState<HexFilters>(persistedFilters.hexFilters);

  const setHexFilters = useCallback((value: HexFilters) => {
    setHexFiltersState(value);
    saveFilter('hexFilters', value);
  }, []);

  const updateHexFilter = useCallback((layer: keyof HexFilters, value: string) => {
    // Only allow valid hex characters (0-9, A-F), max 2 chars
    const cleanValue = value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 2);
    setHexFilters({ ...hexFilters, [layer]: cleanValue });
  }, [hexFilters, setHexFilters]);

  const activeHexFilterCount = useMemo(() => countActiveHexFilters(hexFilters), [hexFilters]);

  // Debounce search with transition
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setDeferredSearch(searchQuery);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Check cache first (unless force refresh)
    if (!forceRefresh && entitiesCache && traitsCache &&
        now - entitiesCache.timestamp < CACHE_TTL &&
        now - traitsCache.timestamp < CACHE_TTL) {
      setEntities(entitiesCache.data);
      setTraits(traitsCache.data);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [entitiesData, traitsData] = await Promise.all([
        entityAPI.getAllEntities(),
        traitsAPI.getAllTraits()
      ]);

      // Update cache
      entitiesCache = { data: entitiesData, timestamp: now };
      traitsCache = { data: traitsData.traits || [], timestamp: now };

      setEntities(entitiesData);
      setTraits(traitsData.traits || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeTraitFilterCount = useMemo(() => countActiveFilters(traitFilter), [traitFilter]);

  // Pre-compute and filter entities
  const flatList = useMemo(() => {
    const query = deferredSearch.toLowerCase().trim();
    const hasLayerFilter = selectedLayers.length > 0;
    const hasMinTraits = minTraitCount !== '' && minTraitCount > 0;
    const hasHexFilters = activeHexFilterCount > 0;

    const result: Array<{ entity: UHTEntity; metrics: EntityMetrics; layerColor: string }> = [];

    for (const entity of entities) {
      const metrics = computeEntityMetrics(entity.uht_code);

      // Quick filters first
      if (hasLayerFilter && !selectedLayers.includes(metrics.dominantLayer)) continue;
      if (hasMinTraits && metrics.totalTraits < minTraitCount) continue;
      if (!matchesTraitFilter(entity.uht_code, traitFilter, activeTraitFilterCount)) continue;
      if (hasHexFilters && !matchesHexFilters(entity.uht_code, hexFilters)) continue;

      // Search filter (most expensive, do last)
      if (query) {
        const nameMatch = entity.name.toLowerCase().includes(query);
        const descMatch = entity.description?.toLowerCase().includes(query);
        const codeMatch = entity.uht_code.toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !codeMatch) continue;
      }

      result.push({
        entity,
        metrics,
        layerColor: LAYER_COLORS[metrics.dominantLayer] || '#757575'
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.entity.name.localeCompare(b.entity.name); break;
        case 'uht_code': cmp = a.entity.uht_code.localeCompare(b.entity.uht_code); break;
        case 'trait_count': cmp = a.metrics.totalTraits - b.metrics.totalTraits; break;
        case 'created_at': cmp = new Date(a.entity.created_at).getTime() - new Date(b.entity.created_at).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [entities, deferredSearch, selectedLayers, minTraitCount, traitFilter, activeTraitFilterCount, hexFilters, activeHexFilterCount, sortField, sortDirection]);

  const rowVirtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 20
  });

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedLayers([]);
    setMinTraitCount('');
    const cleared: TraitFilterState = {};
    for (let i = 1; i <= 32; i++) cleared[i] = 'X';
    setTraitFilter(cleared);
    setHexFilters(DEFAULT_HEX_FILTERS);
    clearPersistedFilters();
  }, [setSearchQuery, setSelectedLayers, setMinTraitCount, setTraitFilter, setHexFilters]);

  const handleEntityClick = useCallback((uuid: string) => {
    navigate(`/entity/${uuid}`);
  }, [navigate]);

  const hasAnyFilter = searchQuery || selectedLayers.length > 0 || minTraitCount !== '' || activeTraitFilterCount > 0 || activeHexFilterCount > 0;

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button onClick={() => fetchData(true)} startIcon={<RefreshIcon />}>Retry</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1, minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <Paper sx={{ p: isCompact ? 1.5 : 2, borderRadius: 0, borderBottom: '1px solid rgba(0, 229, 255, 0.3)', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: isCompact ? 1 : 2, mb: isCompact ? 1 : 2, flexWrap: 'wrap' }}>
          <ListIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
            {isCompact ? 'Entities' : 'Entity List View'}
          </Typography>
          <Chip
            label={isCompact ? `${flatList.length}/${entities.length}` : `${flatList.length} of ${entities.length} entities`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: isCompact ? '0.7rem' : '0.8rem' }}
          />
          {isPending && <CircularProgress size={16} />}

          {/* Mobile: Filter toggle button */}
          {isCompact && (
            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
              <Badge badgeContent={hasAnyFilter ? (selectedLayers.length + (searchQuery ? 1 : 0) + (minTraitCount !== '' ? 1 : 0) + activeTraitFilterCount + activeHexFilterCount) : 0} color="primary">
                <IconButton
                  size="small"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  sx={{
                    minWidth: 44,
                    minHeight: 44,
                    backgroundColor: filtersExpanded ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <FilterIcon sx={{ fontSize: 18 }} />
                  {filtersExpanded ? <ExpandLessIcon sx={{ fontSize: 14, ml: -0.5 }} /> : <ExpandMoreIcon sx={{ fontSize: 14, ml: -0.5 }} />}
                </IconButton>
              </Badge>
              <IconButton
                size="small"
                onClick={() => fetchData(true)}
                disabled={loading}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <RefreshIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          )}
        </Box>

        {/* Filters - collapsible on mobile */}
        <Collapse in={!isCompact || filtersExpanded}>
          <Box sx={{ display: 'flex', gap: isCompact ? 1 : 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <TextField
              size="small"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                width: isCompact ? '100%' : 220,
                '& .MuiOutlinedInput-root': {
                  height: isCompact ? 44 : 36,
                  backgroundColor: 'rgba(255,255,255,0.03)'
                }
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.5 }}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            {!isCompact && <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />}

            {/* Layer Filter */}
            <FormControl size="small" sx={{ minWidth: isCompact ? 'calc(50% - 4px)' : 140, flex: isCompact ? 1 : 'none' }}>
              <InputLabel sx={{ fontSize: '0.85rem' }}>Layer</InputLabel>
              <Select
                multiple
                value={selectedLayers}
                onChange={(e) => setSelectedLayers(e.target.value as string[])}
                input={<OutlinedInput label="Layer" />}
                sx={{
                  height: isCompact ? 44 : 36,
                  backgroundColor: selectedLayers.length > 0 ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.03)',
                  '& .MuiSelect-select': { py: 0.75 }
                }}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {selected.map((layer) => (
                      <Chip key={layer} label={layer.slice(0, 1)} size="small"
                        sx={{ height: 18, fontSize: '0.65rem', backgroundColor: LAYER_COLORS[layer], color: 'white' }} />
                    ))}
                  </Box>
                )}
              >
                {LAYERS.map((layer) => (
                  <MenuItem key={layer.name} value={layer.name}>
                    <Checkbox checked={selectedLayers.includes(layer.name)} size="small" />
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: layer.color, mr: 1 }} />
                    <ListItemText primary={layer.name} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Min Traits */}
            <TextField
              size="small"
              type="number"
              label={isCompact ? 'Min' : 'Min Traits'}
              value={minTraitCount}
              onChange={(e) => setMinTraitCount(e.target.value === '' ? '' : parseInt(e.target.value))}
              sx={{
                width: isCompact ? 80 : 100,
                '& .MuiOutlinedInput-root': {
                  height: isCompact ? 44 : 36,
                  backgroundColor: minTraitCount !== '' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.03)'
                },
                '& .MuiInputLabel-root': { fontSize: '0.85rem' }
              }}
              inputProps={{ min: 0, max: 32 }}
            />

            {/* Traits Filter */}
            <Badge badgeContent={activeTraitFilterCount} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', minWidth: 16, height: 16 } }}>
              <Button
                size="small"
                variant={activeTraitFilterCount > 0 ? 'contained' : 'outlined'}
                startIcon={!isCompact && <TuneIcon sx={{ fontSize: 16 }} />}
                onClick={() => setTraitFilterDialogOpen(true)}
                sx={{
                  height: isCompact ? 44 : 36,
                  minWidth: isCompact ? 44 : 'auto',
                  textTransform: 'none',
                  fontSize: '0.85rem',
                  px: isCompact ? 1.5 : 2
                }}
              >
                {isCompact ? <TuneIcon sx={{ fontSize: 18 }} /> : 'Traits'}
              </Button>
            </Badge>

            {!isCompact && <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />}

            {/* Hex Filters per Layer - simplified on mobile */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: isCompact ? 'wrap' : 'nowrap', width: isCompact ? '100%' : 'auto' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5, width: isCompact ? '100%' : 'auto', mb: isCompact ? 0.5 : 0 }}>
                {isCompact ? 'Hex Filters (P/F/A/S):' : 'Hex:'}
              </Typography>
              {LAYERS.map((layer) => (
                <TextField
                  key={layer.name}
                  size="small"
                  placeholder={layer.name.slice(0, 1)}
                  value={hexFilters[layer.name as keyof HexFilters]}
                  onChange={(e) => updateHexFilter(layer.name as keyof HexFilters, e.target.value)}
                  sx={{
                    width: isCompact ? 'calc(25% - 3px)' : 48,
                    flex: isCompact ? 1 : 'none',
                    '& .MuiOutlinedInput-root': {
                      height: isCompact ? 44 : 36,
                      backgroundColor: hexFilters[layer.name as keyof HexFilters]
                        ? `${layer.color}20`
                        : 'rgba(255,255,255,0.03)',
                      borderColor: hexFilters[layer.name as keyof HexFilters] ? layer.color : undefined
                    },
                    '& .MuiOutlinedInput-input': {
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      p: isCompact ? '10px 4px' : '8px 4px'
                    }
                  }}
                  inputProps={{ maxLength: 2 }}
                  title={`${layer.name} layer hex filter (e.g. A7)`}
                />
              ))}
            </Box>

            {!isCompact && <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />}

            {/* Clear All Filters */}
            <Button
              size="small"
              startIcon={<ClearIcon sx={{ fontSize: 16 }} />}
              onClick={clearFilters}
              variant="outlined"
              color={hasAnyFilter ? 'error' : 'inherit'}
              disabled={!hasAnyFilter}
              sx={{
                height: isCompact ? 44 : 36,
                textTransform: 'none',
                fontSize: '0.85rem',
                px: 2,
                flex: isCompact ? 1 : 'none',
                borderColor: hasAnyFilter ? undefined : 'rgba(255,255,255,0.2)',
                color: hasAnyFilter ? undefined : 'text.secondary'
              }}
            >
              Clear
            </Button>

            {/* Refresh - desktop only (mobile has it in header) */}
            {!isCompact && (
              <Box sx={{ ml: 'auto' }}>
                <IconButton
                  size="small"
                  onClick={() => fetchData(true)}
                  disabled={loading}
                  sx={{
                    width: 36,
                    height: 36,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' }
                  }}
                >
                  <RefreshIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Table Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', px: isCompact ? 1.5 : 2, py: 1,
        backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0
      }}>
        {!isCompact && <Typography variant="caption" sx={{ width: '5%', fontWeight: 600 }}>#</Typography>}
        <Typography variant="caption" sx={{ width: isCompact ? '45%' : '25%', fontWeight: 600 }}>
          {isCompact ? 'Entity' : 'Entity Name'}
        </Typography>
        <Typography variant="caption" sx={{ width: isCompact ? '30%' : '12%', fontWeight: 600 }}>
          {isCompact ? 'Code' : 'UHT Code'}
        </Typography>
        <Typography variant="caption" sx={{ width: isCompact ? '20%' : '8%', fontWeight: 600 }}>Layer</Typography>
        {!isCompact && (
          <>
            <Typography variant="caption" sx={{ width: '30%', fontWeight: 600 }}>Description</Typography>
            <Typography variant="caption" sx={{ width: '15%', fontWeight: 600, textAlign: 'center' }}>Traits (P/F/A/S)</Typography>
          </>
        )}
        <Typography variant="caption" sx={{ width: '5%', fontWeight: 600 }}></Typography>
      </Box>

      {/* Content */}
      <Box ref={parentRef} sx={{ flexGrow: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <CircularProgress />
          </Box>
        ) : flatList.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <FilterIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">No entities found</Typography>
            <Typography variant="body2" color="text.secondary">
              {entities.length > 0 ? 'Try adjusting your search or filters' : 'Classify some entities to see them here'}
            </Typography>
          </Box>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const { entity, metrics, layerColor } = flatList[virtualRow.index];
              return (
                <div
                  key={entity.uuid}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  <Box
                    onClick={() => handleEntityClick(entity.uuid)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: isCompact ? 1.5 : 2,
                      height: '100%',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      minHeight: isCompact ? 48 : 40,
                      '&:hover': { backgroundColor: `${layerColor}15` },
                      '&:active': { backgroundColor: `${layerColor}25` }
                    }}
                  >
                    {!isCompact && (
                      <Typography variant="body2" sx={{ width: '5%', color: 'text.secondary', fontSize: '0.75rem' }}>
                        {virtualRow.index + 1}
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{
                      width: isCompact ? '45%' : '25%',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      pr: 1,
                      fontSize: isCompact ? '0.85rem' : '0.875rem'
                    }}>
                      {entity.name}
                    </Typography>
                    <Typography variant="body2" sx={{
                      width: isCompact ? '30%' : '12%',
                      fontFamily: 'monospace',
                      fontSize: isCompact ? '0.7rem' : '0.75rem',
                      color: 'text.secondary'
                    }}>
                      {entity.uht_code}
                    </Typography>
                    <Box sx={{ width: isCompact ? '20%' : '8%' }}>
                      <Box sx={{
                        display: 'inline-block',
                        px: isCompact ? 0.5 : 1,
                        py: 0.25,
                        borderRadius: 1,
                        fontSize: isCompact ? '0.6rem' : '0.7rem',
                        backgroundColor: `${layerColor}30`,
                        color: layerColor
                      }}>
                        {isCompact ? metrics.dominantLayer.slice(0, 1) : metrics.dominantLayer.slice(0, 4)}
                      </Box>
                    </Box>
                    {!isCompact && (
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ width: '30%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pr: 1 }}>
                          {entity.description || '-'}
                        </Typography>
                        <Box sx={{ width: '15%', display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          {metrics.layerCounts.map((count, i) => (
                            <Box key={i} sx={{
                              minWidth: 20, height: 18, fontSize: '0.65rem',
                              backgroundColor: `${LAYERS[i].color}30`, color: LAYERS[i].color,
                              borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              {count}
                            </Box>
                          ))}
                        </Box>
                      </>
                    )}
                    <Box sx={{ width: '5%', display: 'flex', justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleEntityClick(entity.uuid); }}
                        sx={{ minWidth: isCompact ? 40 : 32, minHeight: isCompact ? 40 : 32 }}
                      >
                        <OpenIcon sx={{ fontSize: isCompact ? 18 : 16 }} />
                      </IconButton>
                    </Box>
                  </Box>
                </div>
              );
            })}
          </div>
        )}
      </Box>

      <TraitFilterDialog
        open={traitFilterDialogOpen}
        onClose={() => setTraitFilterDialogOpen(false)}
        traits={traits}
        traitFilter={traitFilter}
        onFilterChange={setTraitFilter}
      />
    </Box>
  );
}
