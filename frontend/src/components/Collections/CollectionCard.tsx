import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  OpenInNew as OpenIcon,
  Compare as CompareIcon,
  Clear as ClearIcon,
  FolderSpecial as FolderIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useCollections } from '../../context/CollectionContext';
import type { Collection } from '../../types';

interface CollectionCardProps {
  collection: Collection;
  entityPreviews?: Array<{ uuid: string; name: string; image_url?: string; uht_code?: string }>;
  onSelect?: () => void;
  isCompact?: boolean;
}

export default function CollectionCard({
  collection,
  entityPreviews = [],
  onSelect,
  isCompact = false
}: CollectionCardProps) {
  const navigate = useNavigate();
  const { renameCollection, deleteCollection, clearCollection, exportCollectionToUrl } = useCollections();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newName, setNewName] = useState(collection.name);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleRename = () => {
    if (newName.trim() && newName !== collection.name) {
      renameCollection(collection.id, newName.trim());
    }
    setRenameDialogOpen(false);
    handleMenuClose();
  };

  const handleDelete = () => {
    deleteCollection(collection.id);
    setDeleteDialogOpen(false);
    handleMenuClose();
  };

  const handleShare = () => {
    const url = exportCollectionToUrl(collection.id);
    navigator.clipboard.writeText(url);
    handleMenuClose();
  };

  const handleCompare = () => {
    const uuids = collection.entityUuids.slice(0, 4).join(',');
    navigate(`/comparison?entities=${uuids}`);
    handleMenuClose();
  };

  const handleClear = () => {
    clearCollection(collection.id);
    handleMenuClose();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Fill preview grid with placeholders if needed
  const previewSlots = [...entityPreviews.slice(0, 4)];
  while (previewSlots.length < 4) {
    previewSlots.push(null as any);
  }

  return (
    <>
      <Card
        sx={{
          cursor: onSelect ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          '&:hover': onSelect ? {
            borderColor: 'primary.main',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 20px rgba(0, 229, 255, 0.15)'
          } : {}
        }}
        onClick={onSelect}
      >
        {/* Image Preview Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            aspectRatio: '1',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {previewSlots.map((entity, index) => (
            <Box
              key={entity?.uuid || `empty-${index}`}
              sx={{
                backgroundColor: 'rgba(0, 229, 255, 0.05)',
                borderRight: index % 2 === 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                borderBottom: index < 2 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}
            >
              {entity?.image_url ? (
                <img
                  src={entity.image_url}
                  alt={entity.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              ) : entity ? (
                <Typography
                  variant="h6"
                  sx={{
                    color: 'rgba(255,255,255,0.3)',
                    fontWeight: 600
                  }}
                >
                  {entity.name?.[0] || '?'}
                </Typography>
              ) : (
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(0,229,255,0.03) 0%, rgba(0,229,255,0.08) 100%)'
                  }}
                />
              )}
            </Box>
          ))}

          {/* Overlay with entity count if more than 4 */}
          {collection.entityUuids.length > 4 && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '50%',
                height: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)'
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  color: 'primary.main',
                  fontWeight: 700
                }}
              >
                +{collection.entityUuids.length - 3}
              </Typography>
            </Box>
          )}

          {/* Empty state */}
          {entityPreviews.length === 0 && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1
              }}
            >
              <FolderIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.2)' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                Empty collection
              </Typography>
            </Box>
          )}
        </Box>

        <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
          {/* Header row with title and menu */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography
              variant={isCompact ? 'body1' : 'subtitle1'}
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                pr: 1
              }}
            >
              {collection.name}
            </Typography>
            <IconButton
              size="small"
              onClick={handleMenuClick}
              sx={{
                mt: -0.5,
                mr: -0.5,
                opacity: 0.7,
                '&:hover': { opacity: 1 }
              }}
            >
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Info row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Chip
              label={`${collection.entityUuids.length} ${collection.entityUuids.length === 1 ? 'entity' : 'entities'}`}
              size="small"
              sx={{
                height: 22,
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                color: 'primary.main',
                fontWeight: 500,
                fontSize: '0.7rem'
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
            >
              {formatDate(collection.updatedAt)}
            </Typography>
          </Box>

          {/* Action icons row */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            <Tooltip title="Open">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
                sx={{
                  backgroundColor: 'rgba(0, 229, 255, 0.1)',
                  '&:hover': { backgroundColor: 'rgba(0, 229, 255, 0.2)' }
                }}
              >
                <OpenIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            {collection.entityUuids.length >= 2 && (
              <Tooltip title="Compare">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); handleCompare(); }}
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                  }}
                >
                  <CompareIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Share">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.1)' }
                }}
              >
                <ShareIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { setRenameDialogOpen(true); handleMenuClose(); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Rename" />
        </MenuItem>
        <MenuItem onClick={handleShare}>
          <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Copy share link" />
        </MenuItem>
        {collection.entityUuids.length >= 2 && (
          <MenuItem onClick={handleCompare}>
            <ListItemIcon><CompareIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Compare entities" />
          </MenuItem>
        )}
        <MenuItem onClick={handleClear} disabled={collection.entityUuids.length === 0}>
          <ListItemIcon><ClearIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Clear all entities" />
        </MenuItem>
        <MenuItem onClick={() => { setDeleteDialogOpen(true); handleMenuClose(); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
          <ListItemText primary="Delete collection" />
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename Collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRename} variant="contained">Rename</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Collection?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{collection.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
