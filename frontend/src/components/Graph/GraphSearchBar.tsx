import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  TextField,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Typography,
  Avatar,
  Paper,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Psychology as SemanticIcon,
  Code as StructuralIcon,
  MergeType as HybridIcon,
  Search as SearchIcon,
  DeleteSweep as ClearHistoryIcon
} from '@mui/icons-material';
import { entityAPI } from '../../services/api';

export type SimilarityMetric = 'embedding' | 'hamming' | 'hybrid';

interface SearchResult {
  uuid: string;
  name: string;
  uht_code?: string;
  image_url?: string;
}

interface GraphSearchBarProps {
  onEntitySelect: (uuid: string, name: string) => void;
  metric: SimilarityMetric;
  onMetricChange: (metric: SimilarityMetric) => void;
  disabled?: boolean;
}

export default function GraphSearchBar({
  onEntitySelect,
  metric,
  onMetricChange,
  disabled = false
}: GraphSearchBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('graphRecentSearches');
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((entity: SearchResult) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(e => e.uuid !== entity.uuid);
      const updated = [entity, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('graphRecentSearches', JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      return updated;
    });
  }, []);

  // Search handler with debounce
  useEffect(() => {
    if (inputValue.length < 2) {
      setOptions(recentSearches);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await entityAPI.searchEntitiesByName(inputValue, 10);
        setOptions(results.map((r: any) => ({
          uuid: r.uuid,
          name: r.name,
          uht_code: r.uht_code,
          image_url: r.image_url
        })));
      } catch (err) {
        console.error('Search failed:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [inputValue, recentSearches]);

  const handleSelect = useCallback((_event: any, value: SearchResult | null) => {
    if (value) {
      saveRecentSearch(value);
      onEntitySelect(value.uuid, value.name);
      setInputValue('');
    }
  }, [onEntitySelect, saveRecentSearch]);

  const handleMetricChange = useCallback((_event: React.MouseEvent, newMetric: SimilarityMetric | null) => {
    if (newMetric) {
      onMetricChange(newMetric);
    }
  }, [onMetricChange]);

  // Clear recent searches
  const handleClearHistory = useCallback(() => {
    setRecentSearches([]);
    setOptions([]);
    try {
      localStorage.removeItem('graphRecentSearches');
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        alignItems: { xs: 'stretch', sm: 'center' },
        bgcolor: 'rgba(26, 26, 26, 0.95)',
        backdropFilter: 'blur(10px)'
      }}
    >
      {/* Search Input */}
      <Autocomplete<SearchResult>
        sx={{ flex: 1, minWidth: 250 }}
        options={options}
        getOptionLabel={(option) => option.name}
        inputValue={inputValue}
        onInputChange={(_event, newValue) => setInputValue(newValue)}
        onChange={handleSelect}
        loading={loading}
        disabled={disabled}
        filterOptions={(x) => x} // Disable built-in filtering, we do server-side
        isOptionEqualToValue={(option, value) => option.uuid === value.uuid}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search for an entity to explore..."
            size="small"
            InputProps={{
              ...params.InputProps,
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...rest } = props;
          return (
            <Box
              component="li"
              key={option.uuid}
              {...rest}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
            >
              <Avatar
                src={option.image_url || undefined}
                sx={{ width: 32, height: 32 }}
              >
                {option.name.charAt(0)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {option.name}
                </Typography>
                {option.uht_code && (
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                  >
                    {option.uht_code}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
        noOptionsText={
          inputValue.length < 2
            ? 'Type at least 2 characters...'
            : 'No entities found'
        }
      />

      {/* Metric Toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
          Similarity:
        </Typography>
        <ToggleButtonGroup
          value={metric}
          exclusive
          onChange={handleMetricChange}
          size="small"
          disabled={disabled}
        >
          <ToggleButton value="embedding">
            <Tooltip title="Semantic similarity (meaning)">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SemanticIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Semantic
                </Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="hamming">
            <Tooltip title="Structural similarity (traits)">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <StructuralIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Structural
                </Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="hybrid">
            <Tooltip title="Combined similarity">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <HybridIcon fontSize="small" />
                <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Hybrid
                </Typography>
              </Box>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Clear History Button */}
        {recentSearches.length > 0 && (
          <Tooltip title="Clear search history">
            <IconButton
              size="small"
              onClick={handleClearHistory}
              sx={{
                ml: 1,
                color: 'text.secondary',
                '&:hover': { color: 'error.main' }
              }}
            >
              <ClearHistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}
