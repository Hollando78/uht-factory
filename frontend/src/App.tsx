import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, Drawer } from '@mui/material';
import { HelmetProvider } from 'react-helmet-async';
import { AppProvider } from './context/AppContext';
import { MobileProvider, useMobile } from './context/MobileContext';
import { CollectionProvider } from './context/CollectionContext';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import TraitsView from './components/Traits/TraitsView';
import MetaClassesView from './components/MetaClasses/MetaClassesView';
import ClassificationView from './components/Classification/ClassificationView';
import GraphView from './components/Graph/GraphView';
import ComparisonView from './components/Comparison/ComparisonView';
import BuildACodeView from './components/BuildACode/BuildACodeView';
import CollectionsView from './components/Collections/CollectionsView';
import ListView from './components/ListView/ListView';
import GalleryView from './components/Gallery/GalleryView';
import EntityDetails from './components/Entity/EntityDetails';
import TraitAnalytics from './components/Analytics/TraitAnalytics';
import VerifyEmailPage from './components/Auth/VerifyEmailPage';
import HowItWorksView from './components/HowItWorks/HowItWorksView';

// Dark theme optimized for graph visualization with responsive typography
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E5FF', // Cyan
    },
    secondary: {
      main: '#FF6B35', // Orange
    },
    background: {
      default: '#0A0A0A',
      paper: '#1A1A1A',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B0B0B0',
    },
  },
  typography: {
    fontFamily: '"Roboto Mono", "Monaco", monospace',
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
      color: '#00E5FF',
      '@media (max-width:600px)': {
        fontSize: '1.5rem',
      },
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
      '@media (max-width:600px)': {
        fontSize: '1.25rem',
      },
    },
    h3: {
      '@media (max-width:600px)': {
        fontSize: '1.1rem',
      },
    },
    h4: {
      '@media (max-width:600px)': {
        fontSize: '1rem',
      },
    },
    h5: {
      '@media (max-width:600px)': {
        fontSize: '0.95rem',
      },
    },
    h6: {
      '@media (max-width:600px)': {
        fontSize: '0.9rem',
      },
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          minHeight: 44, // Touch-friendly
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(26, 26, 26, 0.9)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          borderRadius: 12,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            minHeight: 48, // Touch-friendly input
          },
        },
      },
    },
  },
});

const SIDEBAR_WIDTH = 240;

// Inner app component that uses mobile context
function AppContent() {
  const { isMobile, isTablet, drawerOpen, closeDrawer } = useMobile();
  const showDrawer = isMobile || isTablet;

  return (
    <Box sx={{
      display: 'flex',
      height: '100dvh', // Use dynamic viewport height for mobile
      overflow: 'hidden'
    }}>
      {/* Desktop Sidebar - always visible */}
      {!showDrawer && <Sidebar />}

      {/* Mobile/Tablet Drawer */}
      {showDrawer && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={closeDrawer}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              backgroundColor: 'background.paper',
            },
          }}
        >
          <Sidebar onNavigate={closeDrawer} />
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        width: showDrawer ? '100%' : `calc(100% - ${SIDEBAR_WIDTH}px)`,
      }}>
        {/* Header */}
        <Header />

        {/* Main Content */}
        <Box sx={{
          flexGrow: 1,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0
        }}>
          <Routes>
            <Route path="/" element={<GalleryView />} />
            <Route path="/traits" element={<TraitsView />} />
            <Route path="/how-it-works" element={<HowItWorksView />} />
            <Route path="/meta-classes" element={<MetaClassesView />} />
            <Route path="/classify" element={<ClassificationView />} />
            <Route path="/graph" element={<GraphView />} />
            <Route path="/comparison" element={<ComparisonView />} />
            <Route path="/build" element={<BuildACodeView />} />
            <Route path="/collections" element={<CollectionsView />} />
            <Route path="/collections/:id" element={<CollectionsView />} />
            <Route path="/list" element={<ListView />} />
            <Route path="/gallery" element={<GalleryView />} />
            <Route path="/entity/:uuid" element={<EntityDetails />} />
            <Route path="/analytics" element={<TraitAnalytics />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <AuthProvider>
          <AppProvider>
            <CollectionProvider>
              <Router>
                <MobileProvider>
                  <AppContent />
                </MobileProvider>
              </Router>
            </CollectionProvider>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
