import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { AppProvider } from './context/AppContext';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import TraitsView from './components/Traits/TraitsView';
import ClassificationView from './components/Classification/ClassificationView';
import GraphView from './components/Graph/GraphView';
import ComparisonView from './components/Comparison/ComparisonView';
import ListView from './components/ListView/ListView';
import GalleryView from './components/Gallery/GalleryView';
import EntityDetails from './components/Entity/EntityDetails';

// Dark theme optimized for graph visualization
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
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
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
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AppProvider>
        <Router>
          <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* Sidebar */}
            <Sidebar />
            
            {/* Main Content Area */}
            <Box sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minWidth: 0
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
                  <Route path="/" element={<ClassificationView />} />
                  <Route path="/traits" element={<TraitsView />} />
                  <Route path="/classify" element={<ClassificationView />} />
                  <Route path="/graph" element={<GraphView />} />
                  <Route path="/comparison" element={<ComparisonView />} />
                  <Route path="/list" element={<ListView />} />
                  <Route path="/gallery" element={<GalleryView />} />
                  <Route path="/entity/:uuid" element={<EntityDetails />} />
                </Routes>
              </Box>
            </Box>
          </Box>
        </Router>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
