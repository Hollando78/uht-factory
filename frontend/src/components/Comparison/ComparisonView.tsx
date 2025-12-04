import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Compare as CompareIcon,
  Clear as ClearIcon,
  Share as ShareIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import { entityAPI } from '../../services/api';
import EntityPicker from '../common/EntityPicker';
import type { UHTEntity, SelectedEntity } from '../../types';
import EntityComparisonCard from './EntityComparisonCard';
import TraitDiffGrid from './TraitDiffGrid';
import BinaryOverlay from './BinaryOverlay';
import ComparisonMetrics from './ComparisonMetrics';

export default function ComparisonView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedEntities, setSelectedEntities] = useState<SelectedEntity[]>([]);
  const [loadedEntities, setLoadedEntities] = useState<UHTEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load entities from URL params on mount
  useEffect(() => {
    const uuidsParam = searchParams.get('entities');
    if (uuidsParam) {
      const uuids = uuidsParam.split(',').filter(Boolean);
      if (uuids.length > 0) {
        loadEntitiesFromUuids(uuids);
      }
    }
  }, []);

  // Load full entity data when selection changes
  useEffect(() => {
    if (selectedEntities.length === 0) {
      setLoadedEntities([]);
      return;
    }

    const loadFullEntities = async () => {
      setLoading(true);
      setError(null);

      try {
        const entities = await Promise.all(
          selectedEntities.map(e => entityAPI.getEntity(e.uuid))
        );
        setLoadedEntities(entities);
      } catch (err) {
        console.error('Failed to load entities:', err);
        setError('Failed to load entity details');
      } finally {
        setLoading(false);
      }
    };

    loadFullEntities();
  }, [selectedEntities]);

  const loadEntitiesFromUuids = async (uuids: string[]) => {
    setLoading(true);
    try {
      const entities = await Promise.all(
        uuids.slice(0, 4).map(uuid => entityAPI.getEntity(uuid))
      );

      const selected: SelectedEntity[] = entities.map(e => ({
        uuid: e.uuid,
        name: e.name,
        uht_code: e.uht_code,
        image_url: e.image_url
      }));

      setSelectedEntities(selected);
      setLoadedEntities(entities);
    } catch (err) {
      console.error('Failed to load entities from URL:', err);
      setError('Failed to load entities from URL');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = useCallback((entity: SelectedEntity) => {
    setSelectedEntities(prev => [...prev, entity]);
  }, []);

  const handleRemove = useCallback((uuid: string) => {
    setSelectedEntities(prev => prev.filter(e => e.uuid !== uuid));
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedEntities([]);
    setSearchParams({});
  }, [setSearchParams]);

  const handleShare = useCallback(() => {
    const uuids = selectedEntities.map(e => e.uuid).join(',');
    const url = `${window.location.origin}/comparison?entities=${uuids}`;
    navigator.clipboard.writeText(url);
    // Could add a toast notification here
  }, [selectedEntities]);

  const hasComparison = loadedEntities.length >= 2;

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <CompareIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
            Entity Comparison
          </Typography>
          <Chip
            label={`${selectedEntities.length} selected`}
            size="small"
            color="primary"
            variant="outlined"
          />

          {selectedEntities.length > 0 && (
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <Tooltip title="Share comparison">
                <IconButton size="small" onClick={handleShare} disabled={selectedEntities.length < 2}>
                  <ShareIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Clear all">
                <IconButton size="small" onClick={handleClearAll}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Entity Picker */}
        <EntityPicker
          selectedEntities={selectedEntities}
          onSelect={handleSelect}
          onRemove={handleRemove}
          maxSelections={4}
          placeholder="Search for entities to compare..."
          label="Add entities"
        />

        {selectedEntities.length === 1 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Add at least one more entity to compare
          </Typography>
        )}
      </Paper>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: isCompact ? 1.5 : 2 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {!loading && selectedEntities.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CompareIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Compare Entities
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Search and select 2-4 entities to compare their UHT classifications side by side.
            </Typography>
          </Box>
        )}

        {!loading && hasComparison && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Entity Cards Row */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: loadedEntities.length === 2 ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)',
                  md: `repeat(${Math.min(loadedEntities.length, 4)}, 1fr)`
                },
                gap: 2
              }}
            >
              {loadedEntities.map((entity, index) => (
                <EntityComparisonCard
                  key={entity.uuid}
                  entity={entity}
                  index={index}
                  onRemove={() => handleRemove(entity.uuid)}
                  isCompact={isCompact}
                />
              ))}
            </Box>

            <Divider />

            {/* Metrics */}
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  Comparison Metrics
                </Typography>
                <ComparisonMetrics entities={loadedEntities} isCompact={isCompact} />
              </CardContent>
            </Card>

            {/* Binary Overlay */}
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  Binary Overlay
                </Typography>
                <BinaryOverlay entities={loadedEntities} isCompact={isCompact} />
              </CardContent>
            </Card>

            {/* Trait Diff Grid */}
            <Card>
              <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  Trait Comparison
                </Typography>
                <TraitDiffGrid entities={loadedEntities} isCompact={isCompact} />
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Box>
  );
}
