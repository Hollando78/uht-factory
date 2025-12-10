import { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  TextField,
  Box,
  Typography,
  Tooltip,
  Chip
} from '@mui/material';
import {
  PlaylistAdd as AddIcon,
  FolderSpecial as CollectionIcon,
  Add as CreateIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { useCollections } from '../../context/CollectionContext';

interface AddToCollectionButtonProps {
  entityUuid: string;
  entityName?: string;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

export default function AddToCollectionButton({
  entityUuid,
  entityName,
  size = 'small',
  showLabel = false
}: AddToCollectionButtonProps) {
  const { state, createCollection, addEntity, isEntityInCollection } = useCollections();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setShowCreateInput(false);
    setNewCollectionName('');
  };

  const handleAddToCollection = async (collectionId: string) => {
    await addEntity(collectionId, entityUuid);
    handleClose();
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;

    const collection = await createCollection(newCollectionName.trim());
    if (collection) {
      await addEntity(collection.id, entityUuid);
    }
    handleClose();
  };

  const collectionsForEntity = state.collections.filter(c =>
    c.entityUuids.includes(entityUuid)
  );

  return (
    <>
      <Tooltip title={showLabel ? '' : `Add to collection${collectionsForEntity.length > 0 ? ` (in ${collectionsForEntity.length})` : ''}`}>
        <IconButton
          size={size}
          onClick={handleClick}
          sx={{
            color: collectionsForEntity.length > 0 ? 'primary.main' : 'inherit'
          }}
        >
          <AddIcon fontSize={size} />
          {showLabel && (
            <Typography variant="caption" sx={{ ml: 0.5 }}>
              Collection
            </Typography>
          )}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 220, maxHeight: 400 }
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Add to Collection
          </Typography>
          {entityName && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {entityName}
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Existing collections */}
        {state.collections.length > 0 ? (
          state.collections.map((collection) => {
            const isInCollection = isEntityInCollection(collection.id, entityUuid);
            return (
              <MenuItem
                key={collection.id}
                onClick={() => !isInCollection && handleAddToCollection(collection.id)}
                disabled={isInCollection}
              >
                <ListItemIcon>
                  {isInCollection ? (
                    <CheckIcon sx={{ color: 'success.main' }} />
                  ) : (
                    <CollectionIcon />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={collection.name}
                  secondary={`${collection.entityUuids.length} entities`}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                {isInCollection && (
                  <Chip label="Added" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                )}
              </MenuItem>
            );
          })
        ) : (
          <MenuItem disabled>
            <ListItemText
              primary="No collections yet"
              primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
            />
          </MenuItem>
        )}

        <Divider />

        {/* Create new collection */}
        {showCreateInput ? (
          <Box sx={{ px: 2, py: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateCollection();
                } else if (e.key === 'Escape') {
                  setShowCreateInput(false);
                }
              }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                  >
                    <CreateIcon fontSize="small" />
                  </IconButton>
                )
              }}
            />
          </Box>
        ) : (
          <MenuItem onClick={() => setShowCreateInput(true)}>
            <ListItemIcon>
              <CreateIcon />
            </ListItemIcon>
            <ListItemText primary="Create new collection" primaryTypographyProps={{ variant: 'body2' }} />
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
