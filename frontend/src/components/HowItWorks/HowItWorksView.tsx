import { Box, Typography, Paper, Button, Divider } from '@mui/material';
import { School as SchoolIcon, Explore, Category } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import SEO from '../common/SEO';
import BinaryToHexDiagram from './BinaryToHexDiagram';
import LayerBreakdownDiagram from './LayerBreakdownDiagram';
import ClassificationFlowDiagram from './ClassificationFlowDiagram';
import ExampleEntityWalkthrough from './ExampleEntityWalkthrough';

const HowItWorksView = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEO
        title="How UHT Works - Universal Hex Taxonomy Explained"
        description="Learn how the Universal Hex Taxonomy classifies concepts using 32 traits, binary encoding, and hexadecimal codes. Simple explanations with visual diagrams."
        keywords="UHT explained, universal hex taxonomy, binary to hex, entity classification"
        url="https://factory.universalhex.org/how-it-works"
      />

      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Fixed Header */}
        <Paper sx={{ p: 2, flexShrink: 0, borderBottom: '1px solid rgba(0, 229, 255, 0.3)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SchoolIcon color="primary" />
            <Typography variant="h6">How UHT Works</Typography>
          </Box>
        </Paper>

        {/* Scrollable Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
          {/* Hero Introduction */}
          <Box sx={{ textAlign: 'center', mb: 6, maxWidth: 800, mx: 'auto' }}>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 'bold',
                mb: 2,
                fontSize: { xs: '28px', md: '36px' },
                background: 'linear-gradient(45deg, #00E5FF, #9C27B0)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Understanding the Universal Hex Taxonomy
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              A simple way to classify anything in the universe
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Think of UHT like a barcode for concepts. Just as products have unique barcodes,
              every entity in our system gets a unique 8-character code based on its properties.
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 1: The Big Picture */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              The Big Picture
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              The Universal Hex Taxonomy (UHT) is a classification system that gives everything
              a unique fingerprint. Whether it's a smartphone, a concept like democracy, or an emotion
              like happiness - each gets classified using 32 simple yes/no questions.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              The answers to these questions create a pattern, which we turn into an 8-character code.
              This code is like a DNA sequence - it tells you exactly what makes that thing unique.
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 2: Step 1 - Classification Flow */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              Step 1: How We Classify
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
              Here's the journey from an entity to its UHT code:
            </Typography>
            <Paper
              elevation={3}
              sx={{
                backgroundColor: 'rgba(26, 26, 26, 0.5)',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <ClassificationFlowDiagram />
            </Paper>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
              We ask 32 yes/no questions, get 32 binary answers (1s and 0s), and convert them to hex.
              It's that simple!
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 3: Step 2 - The 4 Layers */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              Step 2: The 4 Layers
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
              We organize the 32 questions into 4 categories, like chapters in a book:
            </Typography>
            <Box sx={{ pl: { xs: 2, md: 4 }, mb: 3 }}>
              <Typography variant="body1" paragraph>
                <strong style={{ color: '#FF6B35' }}>Physical:</strong> What is it made of? Can you touch it?
              </Typography>
              <Typography variant="body1" paragraph>
                <strong style={{ color: '#00E5FF' }}>Functional:</strong> What does it do? How does it work?
              </Typography>
              <Typography variant="body1" paragraph>
                <strong style={{ color: '#9C27B0' }}>Abstract:</strong> What ideas does it represent?
              </Typography>
              <Typography variant="body1" paragraph>
                <strong style={{ color: '#4CAF50' }}>Social:</strong> How do people use it together?
              </Typography>
            </Box>
            <Paper
              elevation={3}
              sx={{
                backgroundColor: 'rgba(26, 26, 26, 0.5)',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <LayerBreakdownDiagram />
            </Paper>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
              Each layer covers 8 traits (questions) and produces 2 hex characters.
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 4: Step 3 - Binary to Hex */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              Step 3: Binary to Hex Conversion
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
              Instead of writing out 32 ones and zeros, we group them into sets of 4.
              Each group of 4 bits becomes a single letter or number (0-9, A-F).
              This makes '11111111' become just 'FF' - much easier to remember!
            </Typography>
            <Paper
              elevation={3}
              sx={{
                backgroundColor: 'rgba(26, 26, 26, 0.5)',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <BinaryToHexDiagram />
            </Paper>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
              Hover over any group to see how binary converts to hexadecimal.
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 5: Step 4 - Complete Example */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              Step 4: Complete Example
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
              Let's walk through a real example: classifying a smartphone.
              Click each layer to see which traits apply and how we build the final code.
            </Typography>
            <Paper
              elevation={3}
              sx={{
                backgroundColor: 'rgba(26, 26, 26, 0.5)',
                borderRadius: 2,
                overflow: 'hidden'
              }}
            >
              <ExampleEntityWalkthrough />
            </Paper>
          </Box>

          <Divider sx={{ my: 4 }} />

          {/* Section 6: Try It Yourself */}
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: 'primary.main' }}>
              Try It Yourself
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 3 }}>
              Now that you understand how UHT works, explore the system yourself!
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<Explore />}
                onClick={() => navigate('/gallery')}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '16px'
                }}
              >
                Browse Gallery
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<Category />}
                onClick={() => navigate('/traits')}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '16px'
                }}
              >
                View All Traits
            </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default HowItWorksView;
