import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Divider,
  Chip
} from '@mui/material';
import {
  Psychology as BrainIcon,
  AccountTree as GraphIcon,
  Compare as CompareIcon,
  PhotoLibrary as GalleryIcon,
  Hub as NodeIcon,
  Category as TraitsIcon,
  TableChart as ListIcon,
  Analytics as AnalyticsIcon,
  AutoAwesome as MetaClassIcon,
  Build as BuildIcon,
  FolderSpecial as CollectionIcon,
  School as SchoolIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useMobile } from '../../context/MobileContext';

const SIDEBAR_WIDTH = 240;

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactElement;
  description: string;
  hideOnMobile?: boolean;
  hidden?: boolean;
}

const navItems: NavItem[] = [
  {
    path: '/traits',
    label: 'Canonical Traits',
    icon: <TraitsIcon />,
    description: 'View the 32 fundamental traits'
  },
  {
    path: '/how-it-works',
    label: 'How UHT Works',
    icon: <SchoolIcon />,
    description: 'Learn about the taxonomy'
  },
  {
    path: '/meta-classes',
    label: 'Meta-Classes',
    icon: <MetaClassIcon />,
    description: 'Emergent trait archetypes'
  },
  {
    path: '/classify',
    label: 'Classification',
    icon: <BrainIcon />,
    description: 'Classify entities with AI'
  },
  {
    path: '/graph',
    label: '3D Graph',
    icon: <GraphIcon />,
    description: 'Explore entity relationships',
    hideOnMobile: true,
    hidden: true  // Non-functional at present
  },
  {
    path: '/comparison',
    label: 'Entity Comparison',
    icon: <CompareIcon />,
    description: 'Compare 2-4 entities side by side'
  },
  {
    path: '/build',
    label: 'Build-a-Code',
    icon: <BuildIcon />,
    description: 'Create patterns & find matches'
  },
  {
    path: '/collections',
    label: 'Collections',
    icon: <CollectionIcon />,
    description: 'Organize entities into groups'
  },
  {
    path: '/list',
    label: 'List View',
    icon: <ListIcon />,
    description: 'Spreadsheet view with filters'
  },
  {
    path: '/gallery',
    label: 'Gallery',
    icon: <GalleryIcon />,
    description: 'Browse entity images'
  },
  {
    path: '/analytics',
    label: 'Trait Analytics',
    icon: <AnalyticsIcon />,
    description: 'Statistics & co-occurrence',
    hideOnMobile: true
  }
];

interface SidebarProps {
  onNavigate?: () => void; // Called when a nav item is clicked (for mobile drawer close)
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useApp();
  const { isMobile } = useMobile();

  // Filter out hidden items and mobile-hidden items when on mobile
  const visibleNavItems = navItems
    .filter(item => !item.hidden)
    .filter(item => !isMobile || !item.hideOnMobile);

  const isSelected = (path: string) => location.pathname === path;

  const handleNavClick = (path: string) => {
    navigate(path);
    onNavigate?.(); // Close drawer on mobile
  };

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        height: '100%',
        backgroundColor: 'rgba(10, 10, 10, 0.95)',
        borderRight: '1px solid rgba(0, 229, 255, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        {/* Header */}
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
            <NodeIcon sx={{ color: 'primary.main', mr: 1, fontSize: 28 }} />
            <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
              UHT Factory
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
            Universal Hex Taxonomy
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
            Classification System
          </Typography>
        </Box>

        <Divider sx={{ borderColor: 'rgba(0, 229, 255, 0.3)' }} />

        {/* Navigation */}
        <List sx={{ px: 1, py: 2 }}>
          {visibleNavItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                selected={isSelected(item.path)}
                onClick={() => handleNavClick(item.path)}
                sx={{
                  borderRadius: 2,
                  minHeight: 48, // Touch-friendly
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(0, 229, 255, 0.15)',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 229, 255, 0.2)',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  },
                }}
              >
                <ListItemIcon sx={{
                  color: isSelected(item.path) ? 'primary.main' : 'text.secondary',
                  minWidth: 40
                }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={item.description}
                  primaryTypographyProps={{
                    fontSize: '0.9rem',
                    fontWeight: isSelected(item.path) ? 600 : 400,
                    color: isSelected(item.path) ? 'primary.main' : 'text.primary'
                  }}
                  secondaryTypographyProps={{
                    fontSize: '0.75rem',
                    color: 'text.secondary'
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ borderColor: 'rgba(0, 229, 255, 0.3)', mx: 2 }} />

        {/* Status Section */}
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 2 }}>
            System Status
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                Graph Nodes
              </Typography>
              <Chip
                label={state.graphData.nodes.length}
                size="small"
                color="primary"
                sx={{ fontSize: '0.7rem' }}
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                Selected Entity
              </Typography>
              <Chip
                label={state.selectedEntity ? '1' : '0'}
                size="small"
                color={state.selectedEntity ? 'secondary' : 'default'}
                sx={{ fontSize: '0.7rem' }}
              />
            </Box>
          </Box>

          {/* Current View Indicator */}
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}>
              Current View
            </Typography>
            <Chip
              label={state.currentView}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }}
            />
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, textAlign: 'center', borderTop: '1px solid rgba(0, 229, 255, 0.1)' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
          Powered by GPT-4o mini
        </Typography>
      </Box>
    </Box>
  );
}
