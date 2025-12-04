import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Typography,
  Paper,
  CircularProgress,
  Popper,
  ClickAwayListener
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  History as HistoryIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { entityAPI } from '../../services/api';
import { LAYER_COLORS, getDominantLayer } from '../../utils/uhtUtils';
import type { SelectedEntity } from '../../types';

interface EntityPickerProps {
  selectedEntities: SelectedEntity[];
  onSelect: (entity: SelectedEntity) => void;
  onRemove: (uuid: string) => void;
  maxSelections?: number;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

interface SearchResult {
  uuid: string;
  name: string;
  uht_code: string;
  description?: string;
  image_url?: string;
}

const RECENT_ENTITIES_KEY = 'uht_recent_entities';
const MAX_RECENT = 10;

// Load recent entities from localStorage
const loadRecentEntities = (): SelectedEntity[] => {
  try {
    const stored = localStorage.getItem(RECENT_ENTITIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save entity to recent list
const saveToRecent = (entity: SelectedEntity) => {
  try {
    const recent = loadRecentEntities();
    // Remove if already exists
    const filtered = recent.filter(e => e.uuid !== entity.uuid);
    // Add to front
    const updated = [entity, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_ENTITIES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
};

export default function EntityPicker({
  selectedEntities,
  onSelect,
  onRemove,
  maxSelections = 4,
  placeholder = 'Search entities...',
  label,
  disabled = false
}: EntityPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentEntities = loadRecentEntities();
  const canAddMore = selectedEntities.length < maxSelections;

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setResults([]);
      setShowRecent(true);
      return;
    }

    setLoading(true);
    setShowRecent(false);

    try {
      const entities = await entityAPI.searchEntitiesByName(query, 10);
      // Filter out already selected entities
      const selectedUuids = new Set(selectedEntities.map(e => e.uuid));
      const filtered = entities.filter((e: SearchResult) => !selectedUuids.has(e.uuid));
      setResults(filtered);
    } catch (err) {
      console.error('Entity search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedEntities]);

  // Handle search input change with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  const handleSelect = (entity: SearchResult) => {
    if (!canAddMore) return;

    const selected: SelectedEntity = {
      uuid: entity.uuid,
      name: entity.name,
      uht_code: entity.uht_code,
      image_url: entity.image_url
    };

    saveToRecent(selected);
    onSelect(selected);
    setSearchQuery('');
    setResults([]);
    setOpen(false);
  };

  const handleFocus = () => {
    setOpen(true);
    if (searchQuery.length < 2) {
      setShowRecent(true);
    }
  };

  const handleClickAway = () => {
    setOpen(false);
  };

  const getLayerColor = (code: string) => {
    const layer = getDominantLayer(code);
    return LAYER_COLORS[layer] || '#757575';
  };

  // Filter recent entities to exclude already selected
  const filteredRecent = recentEntities.filter(
    e => !selectedEntities.some(s => s.uuid === e.uuid)
  );

  const showDropdown = open && canAddMore && (results.length > 0 || (showRecent && filteredRecent.length > 0) || loading);

  return (
    <Box>
      {/* Selected entities chips */}
      {selectedEntities.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          {selectedEntities.map((entity) => (
            <Chip
              key={entity.uuid}
              label={entity.name}
              onDelete={() => onRemove(entity.uuid)}
              deleteIcon={<CloseIcon />}
              avatar={
                entity.image_url ? (
                  <Avatar src={entity.image_url} alt={entity.name} />
                ) : (
                  <Avatar sx={{ bgcolor: getLayerColor(entity.uht_code) }}>
                    {entity.name[0]}
                  </Avatar>
                )
              }
              sx={{
                borderColor: getLayerColor(entity.uht_code),
                borderWidth: 2,
                borderStyle: 'solid',
                '& .MuiChip-deleteIcon': {
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main' }
                }
              }}
            />
          ))}
        </Box>
      )}

      {/* Search input */}
      <Box ref={anchorRef}>
        <TextField
          fullWidth
          size="small"
          label={label}
          placeholder={canAddMore ? placeholder : `Maximum ${maxSelections} entities selected`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleFocus}
          disabled={disabled || !canAddMore}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading ? (
                  <CircularProgress size={20} />
                ) : searchQuery ? (
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSearchQuery('');
                      setResults([]);
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </InputAdornment>
            )
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255,255,255,0.03)'
            }
          }}
        />
      </Box>

      {/* Results dropdown */}
      <Popper
        open={showDropdown}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        style={{ zIndex: 1300, width: anchorRef.current?.offsetWidth }}
      >
        <ClickAwayListener onClickAway={handleClickAway}>
          <Paper
            elevation={8}
            sx={{
              mt: 0.5,
              maxHeight: 300,
              overflow: 'auto',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            {/* Recent entities */}
            {showRecent && filteredRecent.length > 0 && (
              <>
                <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Recent
                  </Typography>
                </Box>
                <List dense disablePadding>
                  {filteredRecent.map((entity) => (
                    <ListItem key={entity.uuid} disablePadding>
                      <ListItemButton onClick={() => handleSelect(entity)}>
                        <ListItemAvatar>
                          {entity.image_url ? (
                            <Avatar
                              src={entity.image_url}
                              alt={entity.name}
                              sx={{ width: 32, height: 32 }}
                            />
                          ) : (
                            <Avatar
                              sx={{
                                width: 32,
                                height: 32,
                                bgcolor: getLayerColor(entity.uht_code),
                                fontSize: '0.875rem'
                              }}
                            >
                              {entity.name[0]}
                            </Avatar>
                          )}
                        </ListItemAvatar>
                        <ListItemText
                          primary={entity.name}
                          secondary={entity.uht_code}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{
                            variant: 'caption',
                            fontFamily: 'monospace'
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {/* Search results */}
            {results.length > 0 && (
              <List dense disablePadding>
                {results.map((entity) => (
                  <ListItem key={entity.uuid} disablePadding>
                    <ListItemButton onClick={() => handleSelect(entity)}>
                      <ListItemAvatar>
                        {entity.image_url ? (
                          <Avatar
                            src={entity.image_url}
                            alt={entity.name}
                            sx={{ width: 32, height: 32 }}
                          />
                        ) : (
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: getLayerColor(entity.uht_code),
                              fontSize: '0.875rem'
                            }}
                          >
                            {entity.name[0]}
                          </Avatar>
                        )}
                      </ListItemAvatar>
                      <ListItemText
                        primary={entity.name}
                        secondary={
                          <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Typography
                              component="span"
                              variant="caption"
                              fontFamily="monospace"
                              color="primary.main"
                            >
                              {entity.uht_code}
                            </Typography>
                            {entity.description && (
                              <Typography
                                component="span"
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 200
                                }}
                              >
                                {entity.description}
                              </Typography>
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}

            {/* No results */}
            {!loading && searchQuery.length >= 2 && results.length === 0 && (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No entities found for "{searchQuery}"
                </Typography>
              </Box>
            )}
          </Paper>
        </ClickAwayListener>
      </Popper>

      {/* Selection count */}
      {maxSelections > 1 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: 'block' }}
        >
          {selectedEntities.length} / {maxSelections} entities selected
        </Typography>
      )}
    </Box>
  );
}
