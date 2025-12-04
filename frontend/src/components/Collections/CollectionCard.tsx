import { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  IconButton,
  Tooltip,
  AvatarGroup,
  Avatar,
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
  Clear as ClearIcon
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

  return (
    <>
      <Card
        sx={{
          cursor: onSelect ? 'pointer' : 'default',
          '&:hover': onSelect ? { borderColor: 'primary.main' } : {}
        }}
        onClick={onSelect}
      >
        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography
              variant={isCompact ? 'body1' : 'subtitle1'}
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1
              }}
            >
              {collection.name}
            </Typography>
            <IconButton size="small" onClick={handleMenuClick}>
              <MoreIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Chip
              label={`${collection.entityUuids.length} entities`}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ height: 22 }}
            />
            <Chip
              label={formatDate(collection.updatedAt)}
              size="small"
              sx={{ height: 22 }}
            />
          </Box>

          {/* Entity preview avatars */}
          {entityPreviews.length > 0 && (
            <Box>
              <AvatarGroup
                max={4}
                sx={{
                  justifyContent: 'flex-start',
                  '& .MuiAvatar-root': {
                    width: 28,
                    height: 28,
                    fontSize: '0.75rem',
                    border: '2px solid',
                    borderColor: 'background.paper'
                  }
                }}
              >
                {entityPreviews.map((entity) => (
                  <Tooltip
                    key={entity.uuid}
                    title={
                      <Box>
                        <Typography variant="body2">{entity.name}</Typography>
                        {entity.uht_code && (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.light' }}>
                            {entity.uht_code}
                          </Typography>
                        )}
                      </Box>
                    }
                  >
                    {entity.image_url ? (
                      <Avatar src={entity.image_url} alt={entity.name} />
                    ) : (
                      <Avatar>{entity.name[0]}</Avatar>
                    )}
                  </Tooltip>
                ))}
              </AvatarGroup>
              {/* UHT codes list */}
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {entityPreviews.slice(0, 3).map((entity) => (
                  entity.uht_code && (
                    <Typography
                      key={entity.uuid}
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        color: 'primary.main',
                        fontSize: '0.65rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {entity.uht_code}
                    </Typography>
                  )
                ))}
                {entityPreviews.length > 3 && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    +{entityPreviews.length - 3} more
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </CardContent>

        <CardActions sx={{ pt: 0, px: 2, pb: 1.5 }}>
          <Tooltip title="Open collection">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/collections/${collection.id}`); }}>
              <OpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {collection.entityUuids.length >= 2 && (
            <Tooltip title="Compare entities">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCompare(); }}>
                <CompareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Share collection">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleShare(); }}>
              <ShareIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </CardActions>
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
