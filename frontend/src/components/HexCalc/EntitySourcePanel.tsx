import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  TextField,
  Tabs,
  Tab,
  Typography,
  CircularProgress,
  InputAdornment,
  Card,
  CardMedia
} from '@mui/material';
import {
  Search as SearchIcon,
  PhotoLibrary as GalleryIcon,
  FolderSpecial as CollectionIcon,
  Calculate as CalcIcon,
  Delete as DeleteIcon,
  OpenInNew as LoadIcon
} from '@mui/icons-material';
import { entityAPI, collectionsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { SelectedEntity, UHTEntity } from '../../types';
import type { CollectionDetail } from '../../services/api';

interface SavedCalculation {
  id: string;
  name: string;
  description?: string;
  hex_code: string;
  source_entity_uuids: string[];
  source_entity_names: string[];
  created_at: string;
  // Saved analysis data
  accepted_name?: string;
  accepted_description?: string;
  llm_analysis?: string; // JSON string
  database_matches?: string; // JSON string
}

export interface LoadCalculationData {
  id: string; // Calculation ID for "Save" (overwrite) functionality
  name: string; // Original save name
  uuids: string[];
  acceptedName?: string;
  acceptedDescription?: string;
  llmAnalysis?: string;
  databaseMatches?: string;
}

interface EntitySourcePanelProps {
  onSelectEntity: (entity: SelectedEntity) => void;
  selectedUuids: string[];
  onLoadCalculation?: (data: LoadCalculationData) => void;
  refreshTrigger?: number; // Increment to trigger refresh of saved calculations
  loadedCalcId?: string | null; // Currently loaded calculation ID for highlighting
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: '100%', overflow: 'auto', display: value === index ? 'block' : 'none' }}
    >
      {value === index && children}
    </Box>
  );
}

interface DraggableEntityCardProps {
  entity: SelectedEntity;
  onSelect: (entity: SelectedEntity) => void;
  isSelected: boolean;
}

function DraggableEntityCard({ entity, onSelect, isSelected }: DraggableEntityCardProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify(entity));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(entity)}
      sx={{
        cursor: isSelected ? 'not-allowed' : 'grab',
        opacity: isSelected ? 0.5 : 1,
        transition: 'all 0.2s ease',
        border: '1px solid rgba(0, 229, 255, 0.2)',
        overflow: 'hidden',
        '&:hover': {
          borderColor: isSelected ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0, 229, 255, 0.5)',
          transform: isSelected ? 'none' : 'scale(1.02)'
        },
        '&:active': {
          cursor: isSelected ? 'not-allowed' : 'grabbing'
        }
      }}
    >
      {entity.image_url && (
        <CardMedia
          component="img"
          height="80"
          image={entity.image_url}
          alt={entity.name}
          sx={{ objectFit: 'cover' }}
        />
      )}
      <Box sx={{ p: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {entity.name}
        </Typography>
        <Typography
          variant="caption"
          color="primary"
          sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}
        >
          {entity.uht_code}
        </Typography>
      </Box>
    </Card>
  );
}

export default function EntitySourcePanel({ onSelectEntity, selectedUuids, onLoadCalculation, refreshTrigger, loadedCalcId }: EntitySourcePanelProps) {
  const { getAccessToken, state: authState } = useAuth();
  const isAuthenticated = authState.isAuthenticated;
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryEntities, setGalleryEntities] = useState<SelectedEntity[]>([]);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionEntities, setCollectionEntities] = useState<SelectedEntity[]>([]);
  const [savedCalculations, setSavedCalculations] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(false);
  const [calcsLoading, setCalcsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SelectedEntity[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load gallery entities on mount
  useEffect(() => {
    const loadGallery = async () => {
      setLoading(true);
      try {
        const entities = await entityAPI.searchEntities({ limit: 100 });
        const mapped = (entities.entities || []).map((e: UHTEntity) => ({
          uuid: e.uuid,
          name: e.name,
          uht_code: e.uht_code,
          image_url: e.image_url
        }));
        setGalleryEntities(mapped);
      } catch (err) {
        console.error('Failed to load gallery:', err);
      } finally {
        setLoading(false);
      }
    };
    loadGallery();
  }, []);

  // Load collections if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const loadCollections = async () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        const result = await collectionsAPI.list(token);
        setCollections(result.collections.map(c => ({ id: c.id, name: c.name })));
      } catch (err) {
        console.error('Failed to load collections:', err);
      }
    };
    loadCollections();
  }, [isAuthenticated, getAccessToken]);

  // Load collection entities when selected
  useEffect(() => {
    const token = getAccessToken();
    if (!selectedCollection || !token) {
      setCollectionEntities([]);
      return;
    }
    const loadCollection = async () => {
      setLoading(true);
      try {
        const detail: CollectionDetail = await collectionsAPI.get(token, selectedCollection);
        const mapped = detail.entities.map(e => ({
          uuid: e.uuid,
          name: e.name,
          uht_code: e.uht_code,
          image_url: undefined // Collection API doesn't return images
        }));
        setCollectionEntities(mapped);
      } catch (err) {
        console.error('Failed to load collection:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCollection();
  }, [selectedCollection, getAccessToken]);

  // Load saved calculations when tab is selected or refreshTrigger changes
  useEffect(() => {
    if (!isAuthenticated) return;
    // Only load when on Saved tab initially, but refresh data whenever refreshTrigger changes
    const isOnSavedTab = tabValue === 2;
    const shouldRefresh = refreshTrigger !== undefined && refreshTrigger > 0;
    if (!isOnSavedTab && !shouldRefresh) return;
    const loadSavedCalcs = async () => {
      const token = getAccessToken();
      if (!token) return;
      setCalcsLoading(true);
      try {
        const response = await fetch('/api/v1/hex-calc/calculations', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSavedCalculations(data.calculations || []);
        }
      } catch (err) {
        console.error('Failed to load saved calculations:', err);
      } finally {
        setCalcsLoading(false);
      }
    };
    loadSavedCalcs();
  }, [tabValue, isAuthenticated, getAccessToken, refreshTrigger]);

  const handleDeleteCalculation = async (calcId: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const response = await fetch(`/api/v1/hex-calc/calculations/${calcId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setSavedCalculations(prev => prev.filter(c => c.id !== calcId));
      }
    } catch (err) {
      console.error('Failed to delete calculation:', err);
    }
  };

  const handleLoadCalculation = (calc: SavedCalculation) => {
    if (onLoadCalculation) {
      onLoadCalculation({
        id: calc.id,
        name: calc.name,
        uuids: calc.source_entity_uuids,
        acceptedName: calc.accepted_name,
        acceptedDescription: calc.accepted_description,
        llmAnalysis: calc.llm_analysis,
        databaseMatches: calc.database_matches
      });
    }
  };

  // Debounced API search when query has 2+ characters
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await entityAPI.searchEntitiesByName(searchQuery.trim(), 50);
        const mapped = results.map((e: UHTEntity) => ({
          uuid: e.uuid,
          name: e.name,
          uht_code: e.uht_code,
          image_url: e.image_url
        }));
        setSearchResults(mapped);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Filter entities by search query (for local filtering when not using API search)
  const filteredGallery = useMemo(() => {
    if (!searchQuery.trim()) return galleryEntities;
    const query = searchQuery.toLowerCase();
    return galleryEntities.filter(
      e => e.name.toLowerCase().includes(query) || e.uht_code.toLowerCase().includes(query)
    );
  }, [galleryEntities, searchQuery]);

  const filteredCollection = useMemo(() => {
    if (!searchQuery.trim()) return collectionEntities;
    const query = searchQuery.toLowerCase();
    return collectionEntities.filter(
      e => e.name.toLowerCase().includes(query) || e.uht_code.toLowerCase().includes(query)
    );
  }, [collectionEntities, searchQuery]);

  const filteredCalculations = useMemo(() => {
    if (!searchQuery.trim()) return savedCalculations;
    const query = searchQuery.toLowerCase();
    return savedCalculations.filter(
      c => c.name.toLowerCase().includes(query) || c.hex_code.toLowerCase().includes(query)
    );
  }, [savedCalculations, searchQuery]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(0, 229, 255, 0.1)' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search all entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
        />
      </Box>

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={(_, val) => setTabValue(val)}
        sx={{
          minHeight: 40,
          borderBottom: '1px solid rgba(0, 229, 255, 0.1)',
          '& .MuiTab-root': { minHeight: 40, py: 0, minWidth: 'auto', px: 1.5 }
        }}
      >
        <Tab
          icon={<GalleryIcon fontSize="small" />}
          iconPosition="start"
          label="Gallery"
          sx={{ fontSize: '0.7rem' }}
        />
        <Tab
          icon={<CollectionIcon fontSize="small" />}
          iconPosition="start"
          label="Collections"
          sx={{ fontSize: '0.7rem' }}
          disabled={!isAuthenticated}
        />
        <Tab
          icon={<CalcIcon fontSize="small" />}
          iconPosition="start"
          label="Saved"
          sx={{ fontSize: '0.7rem' }}
          disabled={!isAuthenticated}
        />
      </Tabs>

      {/* Gallery Tab */}
      <TabPanel value={tabValue} index={0}>
        {loading || searchLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (searchResults !== null ? searchResults : filteredGallery).length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography variant="body2">
              {searchResults !== null ? 'No entities match your search' : 'No entities found'}
            </Typography>
            {searchQuery.trim().length >= 2 && searchResults?.length === 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                Try a different search term
              </Typography>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 1,
              p: 1.5
            }}
          >
            {(searchResults !== null ? searchResults : filteredGallery).map(entity => (
              <DraggableEntityCard
                key={entity.uuid}
                entity={entity}
                onSelect={onSelectEntity}
                isSelected={selectedUuids.includes(entity.uuid)}
              />
            ))}
          </Box>
        )}
      </TabPanel>

      {/* Collections Tab */}
      <TabPanel value={tabValue} index={1}>
        {!isAuthenticated ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography variant="body2">Sign in to access collections</Typography>
          </Box>
        ) : !selectedCollection ? (
          <Box sx={{ p: 1.5 }}>
            {collections.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No collections yet
              </Typography>
            ) : (
              collections.map(col => (
                <Box
                  key={col.id}
                  onClick={() => setSelectedCollection(col.id)}
                  sx={{
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1,
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: 'primary.main',
                      backgroundColor: 'rgba(0, 229, 255, 0.05)'
                    }
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {col.name}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        ) : (
          <Box>
            <Box
              sx={{
                p: 1,
                borderBottom: '1px solid rgba(0, 229, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <Typography
                variant="caption"
                sx={{ cursor: 'pointer', color: 'primary.main' }}
                onClick={() => setSelectedCollection(null)}
              >
                &larr; Back
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {collections.find(c => c.id === selectedCollection)?.name}
              </Typography>
            </Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 1,
                  p: 1.5
                }}
              >
                {filteredCollection.map(entity => (
                  <DraggableEntityCard
                    key={entity.uuid}
                    entity={entity}
                    onSelect={onSelectEntity}
                    isSelected={selectedUuids.includes(entity.uuid)}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}
      </TabPanel>

      {/* Saved Calculations Tab */}
      <TabPanel value={tabValue} index={2}>
        {!isAuthenticated ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Typography variant="body2">Sign in to access saved calculations</Typography>
          </Box>
        ) : calcsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : filteredCalculations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <CalcIcon sx={{ fontSize: 40, opacity: 0.3, mb: 1 }} />
            <Typography variant="body2">No saved calculations yet</Typography>
            <Typography variant="caption" color="text.disabled">
              Save calculations to access them here
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredCalculations.map(calc => {
              const isLoaded = loadedCalcId === calc.id;
              return (
              <Card
                key={calc.id}
                sx={{
                  border: isLoaded ? '2px solid' : '1px solid rgba(76, 175, 80, 0.2)',
                  borderColor: isLoaded ? 'primary.main' : 'rgba(76, 175, 80, 0.2)',
                  backgroundColor: isLoaded ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                  '&:hover': {
                    borderColor: isLoaded ? 'primary.main' : 'rgba(76, 175, 80, 0.5)',
                    backgroundColor: isLoaded ? 'rgba(0, 229, 255, 0.12)' : 'rgba(76, 175, 80, 0.05)'
                  }
                }}
              >
                <Box sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                      {calc.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                      <Box
                        component="button"
                        onClick={() => handleLoadCalculation(calc)}
                        sx={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          p: 0.5,
                          borderRadius: 0.5,
                          color: 'primary.main',
                          '&:hover': { backgroundColor: 'rgba(0, 229, 255, 0.1)' }
                        }}
                        title="Load into calculator"
                      >
                        <LoadIcon sx={{ fontSize: 16 }} />
                      </Box>
                      <Box
                        component="button"
                        onClick={() => handleDeleteCalculation(calc.id)}
                        sx={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          p: 0.5,
                          borderRadius: 0.5,
                          color: 'error.main',
                          '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.1)' }
                        }}
                        title="Delete"
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </Box>
                    </Box>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      color: '#4CAF50',
                      fontSize: '0.7rem',
                      display: 'block',
                      mb: 0.5
                    }}
                  >
                    {calc.hex_code}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {calc.source_entity_names.join(' × ')}
                  </Typography>
                </Box>
              </Card>
              );
            })}
          </Box>
        )}
      </TabPanel>
    </Box>
  );
}
