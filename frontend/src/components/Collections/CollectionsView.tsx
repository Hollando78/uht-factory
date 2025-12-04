import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  FolderSpecial as CollectionIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import { useCollections } from '../../context/CollectionContext';
import { entityAPI } from '../../services/api';
import CollectionCard from './CollectionCard';
import CollectionDetails from './CollectionDetails';
import type { UHTEntity } from '../../types';

export default function CollectionsView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { state, createCollection, importCollectionFromUrl } = useCollections();

  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [entityPreviews, setEntityPreviews] = useState<Record<string, Array<{ uuid: string; name: string; image_url?: string; uht_code?: string }>>>({});
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Check for import params on mount
  useEffect(() => {
    const name = searchParams.get('name');
    const entities = searchParams.get('entities');

    if (name && entities) {
      const imported = importCollectionFromUrl(searchParams);
      if (imported) {
        setImportMessage(`Imported collection "${imported.name}" with ${imported.entityUuids.length} entities`);
        // Clear URL params
        navigate('/collections', { replace: true });
      }
    }
  }, []);

  // Load entity previews for collections
  useEffect(() => {
    const loadPreviews = async () => {
      const previews: Record<string, Array<{ uuid: string; name: string; image_url?: string; uht_code?: string }>> = {};

      for (const collection of state.collections) {
        if (collection.entityUuids.length > 0) {
          try {
            // Only load first 4 for preview
            const uuids = collection.entityUuids.slice(0, 4);
            const entities = await Promise.all(
              uuids.map(uuid => entityAPI.getEntity(uuid).catch(() => null))
            );
            previews[collection.id] = entities
              .filter((e): e is UHTEntity => e !== null)
              .map(e => ({ uuid: e.uuid, name: e.name, image_url: e.image_url, uht_code: e.uht_code }));
          } catch {
            previews[collection.id] = [];
          }
        }
      }

      setEntityPreviews(previews);
    };

    loadPreviews();
  }, [state.collections]);

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    createCollection(newCollectionName.trim());
    setNewCollectionName('');
    setCreateDialogOpen(false);
  };

  // Filter collections by search
  const filteredCollections = state.collections.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If a collection is selected, show details view
  if (selectedCollectionId) {
    const collection = state.collections.find(c => c.id === selectedCollectionId);
    if (collection) {
      return (
        <CollectionDetails
          collection={collection}
          onBack={() => setSelectedCollectionId(null)}
          isCompact={isCompact}
        />
      );
    }
  }

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
          <CollectionIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
            Collections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {state.collections.length} collection{state.collections.length !== 1 ? 's' : ''}
          </Typography>

          <Box sx={{ ml: 'auto' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              size={isCompact ? 'small' : 'medium'}
              onClick={() => setCreateDialogOpen(true)}
            >
              New
            </Button>
          </Box>
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search collections..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </Paper>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: isCompact ? 1.5 : 2 }}>
        {importMessage && (
          <Alert
            severity="success"
            onClose={() => setImportMessage(null)}
            sx={{ mb: 2 }}
          >
            {importMessage}
          </Alert>
        )}

        {filteredCollections.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CollectionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchQuery ? 'No matching collections' : 'No Collections Yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {searchQuery
                ? 'Try a different search term'
                : 'Create a collection to organize your entities'}
            </Typography>
            {!searchQuery && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setCreateDialogOpen(true)}
              >
                Create Your First Collection
              </Button>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)'
              },
              gap: 2
            }}
          >
            {filteredCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                entityPreviews={entityPreviews[collection.id]}
                onSelect={() => setSelectedCollectionId(collection.id)}
                isCompact={isCompact}
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New Collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Collection Name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateCollection();
            }}
            placeholder="My Collection"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateCollection}
            variant="contained"
            disabled={!newCollectionName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
