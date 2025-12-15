import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Slider,
  Autocomplete,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as OverlapIcon,
  OpenInNew as PopoutIcon
} from '@mui/icons-material';
import { explorerAPI, entityAPI, type NeighborComparison, type Neighbor } from '../../services/api';
import { useFloatingCards } from '../../context/FloatingCardsContext';
import type { UHTEntity } from '../../types';

interface Props {
  selectedEntityUuid: string | null;
  onEntitySelect: (uuid: string | null) => void;
}

export default function NeighborComparisonPanel({ selectedEntityUuid, onEntitySelect }: Props) {
  const { addFloatingCard } = useFloatingCards();
  const [, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UHTEntity[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [comparison, setComparison] = useState<NeighborComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState(20);

  useEffect(() => {
    if (selectedEntityUuid) {
      loadComparison(selectedEntityUuid);
    } else {
      setComparison(null);
    }
  }, [selectedEntityUuid, k]);

  const loadComparison = async (uuid: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await explorerAPI.getNeighbors(uuid, k);
      setComparison(data);
    } catch (err) {
      console.error('Failed to load neighbor comparison:', err);
      setError('Failed to load neighbor comparison');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await entityAPI.searchEntitiesByName(query, 10);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const isOverlap = useCallback((uuid: string): boolean => {
    if (!comparison) return false;
    const embeddingUuids = new Set(comparison.embedding_neighbors.map(n => n.uuid));
    const hammingUuids = new Set(comparison.hamming_neighbors.map(n => n.uuid));
    return embeddingUuids.has(uuid) && hammingUuids.has(uuid);
  }, [comparison]);

  const renderNeighborList = (neighbors: Neighbor[], type: 'embedding' | 'hamming') => (
    <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
      {neighbors.map((neighbor, index) => (
        <ListItem
          key={neighbor.uuid}
          sx={{
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
            bgcolor: isOverlap(neighbor.uuid) ? 'rgba(76, 175, 80, 0.1)' : 'transparent'
          }}
          onClick={() => onEntitySelect(neighbor.uuid)}
          secondaryAction={
            <Tooltip title="Pop out">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  addFloatingCard(neighbor.uuid);
                }}
                sx={{ p: 0.5 }}
              >
                <PopoutIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          }
        >
          <ListItemAvatar>
            <Avatar
              src={neighbor.image_url || undefined}
              sx={{ width: 32, height: 32, fontSize: '0.75rem' }}
            >
              {index + 1}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                  {neighbor.name}
                </Typography>
                {isOverlap(neighbor.uuid) && (
                  <OverlapIcon sx={{ fontSize: 16, color: 'success.main' }} />
                )}
              </Box>
            }
            secondary={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', color: 'primary.main' }}
                >
                  {neighbor.uht_code}
                </Typography>
                {type === 'embedding' && neighbor.similarity !== undefined && (
                  <Chip
                    label={`${(neighbor.similarity * 100).toFixed(1)}%`}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                )}
                {type === 'hamming' && neighbor.hamming_distance !== undefined && (
                  <Chip
                    label={`d=${neighbor.hamming_distance}`}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                )}
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 2 }}>
      {/* Search */}
      <Paper sx={{ p: 2 }}>
        <Autocomplete
          freeSolo
          options={searchResults}
          getOptionLabel={(option) =>
            typeof option === 'string' ? option : option.name
          }
          loading={searchLoading}
          onInputChange={(_, value) => {
            setSearchQuery(value);
            handleSearch(value);
          }}
          onChange={(_, value) => {
            if (value && typeof value !== 'string') {
              onEntitySelect(value.uuid);
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search entity"
              placeholder="Enter entity name..."
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
              size="small"
            />
          )}
          renderOption={(props, option) => (
            <li {...props} key={option.uuid}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar
                  src={option.image_url || undefined}
                  sx={{ width: 24, height: 24 }}
                />
                <Box>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace' }}>
                    {option.uht_code}
                  </Typography>
                </Box>
              </Box>
            </li>
          )}
        />

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Number of neighbors (K): {k}
          </Typography>
          <Slider
            value={k}
            onChange={(_, v) => setK(v as number)}
            min={5}
            max={50}
            step={5}
            marks={[
              { value: 5, label: '5' },
              { value: 20, label: '20' },
              { value: 50, label: '50' }
            ]}
            size="small"
          />
        </Box>
      </Paper>

      {/* Comparison */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !comparison && !error && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Search for an entity or click one in the projection view to compare neighbors
          </Typography>
        </Paper>
      )}

      {comparison && (
        <>
          {/* Selected entity header */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>
              {comparison.entity_name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`${comparison.overlap_count} / ${k} overlap`}
                color={comparison.overlap_count > k / 2 ? 'success' : 'warning'}
                size="small"
              />
              <Chip
                label={`Jaccard: ${(comparison.jaccard_similarity * 100).toFixed(1)}%`}
                size="small"
                variant="outlined"
              />
            </Box>
          </Paper>

          {/* Side-by-side lists */}
          <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, overflow: 'hidden' }}>
            {/* Embedding neighbors */}
            <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(0, 229, 255, 0.2)' }}>
                <Typography variant="subtitle2" color="primary">
                  Embedding Neighbors
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  By cosine similarity
                </Typography>
              </Box>
              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                {renderNeighborList(comparison.embedding_neighbors, 'embedding')}
              </Box>
            </Paper>

            {/* Hamming neighbors */}
            <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(0, 229, 255, 0.2)' }}>
                <Typography variant="subtitle2" color="primary">
                  UHT Neighbors
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  By Hamming distance
                </Typography>
              </Box>
              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                {renderNeighborList(comparison.hamming_neighbors, 'hamming')}
              </Box>
            </Paper>
          </Box>

          {/* Legend */}
          <Paper sx={{ p: 1.5, display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <OverlapIcon sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography variant="caption">In both lists</Typography>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
