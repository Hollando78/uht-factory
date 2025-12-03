import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Analytics as AnalyticsIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';

const API_BASE_URL = '';

const LAYER_COLORS: Record<string, string> = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
};

interface TraitFrequency {
  bit: number;
  name: string;
  layer: string;
  count: number;
  percentage: number;
  avg_confidence: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
}

interface CooccurrencePair {
  trait1: number;
  name1: string;
  layer1: string;
  trait2: number;
  name2: string;
  layer2: string;
  cooccurrence: number;
}

interface ExclusivityPair {
  trait1: number;
  name1: string;
  layer1: string;
  trait2: number;
  name2: string;
  layer2: string;
  count1: number;
  count2: number;
  both_count: number;
  jaccard: number;
  exclusivity_ratio: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

// Custom tooltip for layer pie chart
const LayerPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const layerColor = data.color || '#757575';

  return (
    <Box sx={{
      backgroundColor: '#1a1a2e',
      border: `2px solid ${layerColor}`,
      borderRadius: 1,
      p: 1.5,
      minWidth: 150,
      boxShadow: `0 4px 12px ${layerColor}40`
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: layerColor
        }} />
        <Typography variant="subtitle2" sx={{ color: layerColor, fontWeight: 'bold' }}>
          {data.name} Layer
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: 'white' }}>
        <strong>{data.value.toLocaleString()}</strong> total trait uses
      </Typography>
    </Box>
  );
};

// Custom tooltip for trait frequency chart
const TraitFrequencyTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const layerColor = LAYER_COLORS[data.layer] || '#757575';

  return (
    <Box sx={{
      backgroundColor: '#1a1a2e',
      border: `2px solid ${layerColor}`,
      borderRadius: 1,
      p: 1.5,
      minWidth: 200,
      boxShadow: `0 4px 12px ${layerColor}40`
    }}>
      <Typography variant="subtitle2" sx={{
        color: layerColor,
        fontWeight: 'bold',
        mb: 1,
        borderBottom: `1px solid ${layerColor}40`,
        pb: 0.5
      }}>
        {data.name}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: layerColor
        }} />
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
          {data.layer} Layer • Bit {data.bit}
        </Typography>
      </Box>

      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" sx={{ color: 'white' }}>
          <strong>{data.count.toLocaleString()}</strong> entities
        </Typography>
        <Typography variant="body2" sx={{ color: layerColor, fontWeight: 'bold' }}>
          {data.percentage}% of dataset
        </Typography>
      </Box>

      {data.avg_confidence && (
        <Typography variant="caption" sx={{
          color: 'rgba(255,255,255,0.5)',
          display: 'block',
          mt: 1,
          pt: 0.5,
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          Avg confidence: {(data.avg_confidence * 100).toFixed(1)}%
        </Typography>
      )}
    </Box>
  );
};

export default function TraitAnalytics() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [frequencyData, setFrequencyData] = useState<{ total_entities: number; traits: TraitFrequency[] } | null>(null);
  const [cooccurrenceData, setCooccurrenceData] = useState<{ matrix: CooccurrencePair[]; strongest_pairs: CooccurrencePair[] } | null>(null);
  const [exclusivityData, setExclusivityData] = useState<{ most_exclusive: ExclusivityPair[]; least_exclusive: ExclusivityPair[] } | null>(null);
  const [layerData, setLayerData] = useState<any>(null);
  const [confidenceData, setConfidenceData] = useState<any>(null);
  const [hexPairsData, setHexPairsData] = useState<any>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [freqRes, coocRes, exclRes, layerRes, confRes, hexRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/frequency`),
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/cooccurrence`),
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/exclusivity`),
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/layers`),
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/confidence`),
        fetch(`${API_BASE_URL}/api/v1/traits/statistics/hex-pairs`)
      ]);

      if (!freqRes.ok) throw new Error('Failed to fetch frequency data');

      setFrequencyData(await freqRes.json());
      setCooccurrenceData(await coocRes.json());
      setExclusivityData(await exclRes.json());
      setLayerData(await layerRes.json());
      setConfidenceData(await confRes.json());
      setHexPairsData(await hexRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // Prepare chart data
  const frequencyChartData = frequencyData?.traits.map(t => ({
    ...t,
    shortName: t.name.length > 22 ? t.name.substring(0, 19) + '...' : t.name
  })) || [];

  const layerPieData = layerData ? Object.entries(layerData.layers).map(([name, data]: [string, any]) => ({
    name,
    value: data.total_usage,
    color: LAYER_COLORS[name]
  })) : [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0, borderBottom: '1px solid rgba(0, 229, 255, 0.3)', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AnalyticsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Trait Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Analyze trait frequency, co-occurrence, and patterns across {frequencyData?.total_entities.toLocaleString() || '...'} entities
            </Typography>
          </Box>
          <Tooltip title="Refresh data">
            <IconButton onClick={fetchAnalytics} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mt: 2 }}>
          <Tab label="Frequency" />
          <Tab label="Co-occurrence" />
          <Tab label="Exclusivity" />
          <Tab label="Layers" />
          <Tab label="Confidence" />
          <Tab label="Hex Pairs" />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Frequency Tab */}
            <TabPanel value={tabValue} index={0}>
              <Typography variant="h6" gutterBottom>Trait Frequency Distribution</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                How often each trait appears across all classified entities
              </Typography>

              <Paper sx={{ p: 2, mb: 3, height: 900, display: 'flex', justifyContent: 'flex-start' }}>
                <ResponsiveContainer width="80%" height="100%">
                  <BarChart
                    data={frequencyChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="rgba(255,255,255,0.5)" />
                    <YAxis
                      dataKey="shortName"
                      type="category"
                      width={150}
                      tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
                    />
                    <RechartsTooltip content={<TraitFrequencyTooltip />} />
                    <Bar dataKey="count" name="Entity Count">
                      {frequencyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={LAYER_COLORS[entry.layer] || '#757575'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Paper>

              {/* Summary Stats */}
              <Grid container spacing={2}>
                {frequencyData?.traits.map(trait => (
                  <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={trait.bit}>
                    <Card sx={{ border: `1px solid ${LAYER_COLORS[trait.layer]}40` }}>
                      <CardContent sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Chip
                            label={trait.bit}
                            size="small"
                            sx={{ backgroundColor: LAYER_COLORS[trait.layer], color: 'white', fontWeight: 'bold' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {trait.layer}
                          </Typography>
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                          {trait.name}
                        </Typography>
                        <Typography variant="h6" sx={{ color: LAYER_COLORS[trait.layer] }}>
                          {trait.percentage}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {trait.count.toLocaleString()} entities
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </TabPanel>

            {/* Co-occurrence Tab */}
            <TabPanel value={tabValue} index={1}>
              <Typography variant="h6" gutterBottom>Trait Co-occurrence</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Traits that frequently appear together
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon color="success" /> Strongest Pairs
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Trait 1</TableCell>
                            <TableCell>Trait 2</TableCell>
                            <TableCell align="right">Co-occur</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cooccurrenceData?.strongest_pairs.slice(0, 15).map((pair, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: LAYER_COLORS[pair.layer1] }} />
                                  <Typography variant="body2">{pair.name1}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: LAYER_COLORS[pair.layer2] }} />
                                  <Typography variant="body2">{pair.name2}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="right">
                                <Chip label={pair.cooccurrence.toLocaleString()} size="small" color="success" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>
                      Co-occurrence Insights
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      The table shows trait pairs that appear together most frequently.
                      High co-occurrence may indicate:
                    </Typography>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li><Typography variant="body2" color="text.secondary">Related concepts that naturally co-exist</Typography></li>
                      <li><Typography variant="body2" color="text.secondary">Potential trait redundancy if always together</Typography></li>
                      <li><Typography variant="body2" color="text.secondary">Common entity archetypes in the dataset</Typography></li>
                    </ul>
                  </Paper>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Exclusivity Tab */}
            <TabPanel value={tabValue} index={2}>
              <Typography variant="h6" gutterBottom>Mutual Exclusivity</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Trait pairs that rarely appear together (low Jaccard index)
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingDownIcon color="error" /> Most Exclusive Pairs
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Trait 1</TableCell>
                            <TableCell>Trait 2</TableCell>
                            <TableCell align="right">Jaccard</TableCell>
                            <TableCell align="right">Both</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {exclusivityData?.most_exclusive.slice(0, 15).map((pair, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: LAYER_COLORS[pair.layer1] }} />
                                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{pair.name1}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: LAYER_COLORS[pair.layer2] }} />
                                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{pair.name2}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="right">
                                <Chip
                                  label={pair.jaccard.toFixed(3)}
                                  size="small"
                                  sx={{
                                    backgroundColor: pair.jaccard < 0.1 ? '#f4433620' : '#ff980020',
                                    color: pair.jaccard < 0.1 ? '#f44336' : '#ff9800'
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {pair.both_count}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>
                      Understanding Exclusivity
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      <strong>Jaccard Index</strong>: Measures overlap between two trait sets.
                      Lower values indicate traits rarely appear together.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Exclusive trait pairs may indicate:
                    </Typography>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li><Typography variant="body2" color="text.secondary">Opposing concepts (e.g., Digital vs Physical Medium)</Typography></li>
                      <li><Typography variant="body2" color="text.secondary">Traits from different domains</Typography></li>
                      <li><Typography variant="body2" color="text.secondary">Well-differentiated trait definitions</Typography></li>
                    </ul>
                  </Paper>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Layers Tab */}
            <TabPanel value={tabValue} index={3}>
              <Typography variant="h6" gutterBottom>Layer Distribution</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Trait usage statistics by layer
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2, height: 350 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>Total Trait Usage by Layer</Typography>
                    <ResponsiveContainer width="100%" height="85%">
                      <PieChart>
                        <Pie
                          data={layerPieData}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                        >
                          {layerPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend />
                        <RechartsTooltip content={<LayerPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>Layer Statistics</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Layer</TableCell>
                            <TableCell align="right">Total Usage</TableCell>
                            <TableCell align="right">Avg per Trait</TableCell>
                            <TableCell align="right">Avg per Entity</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {layerData && Object.entries(layerData.layers).map(([name, data]: [string, any]) => (
                            <TableRow key={name}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: LAYER_COLORS[name] }} />
                                  {name}
                                </Box>
                              </TableCell>
                              <TableCell align="right">{data.total_usage?.toLocaleString()}</TableCell>
                              <TableCell align="right">{data.avg_usage_per_trait}</TableCell>
                              <TableCell align="right">{data.avg_traits_per_entity?.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Confidence Tab */}
            <TabPanel value={tabValue} index={4}>
              <Typography variant="h6" gutterBottom>Confidence Analysis</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                LLM classification confidence per trait
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingDownIcon sx={{ color: '#f44336' }} /> Lowest Confidence Traits
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Traits where the LLM was least confident - may need clearer definitions
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Trait</TableCell>
                            <TableCell>Layer</TableCell>
                            <TableCell align="right">Avg Conf</TableCell>
                            <TableCell align="right">Range</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {confidenceData?.lowest_confidence.map((trait: any) => (
                            <TableRow key={trait.bit}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Chip label={trait.bit} size="small" sx={{ minWidth: 30 }} />
                                  <Typography variant="body2">{trait.name}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={trait.layer}
                                  size="small"
                                  sx={{ backgroundColor: `${LAYER_COLORS[trait.layer]}30`, color: LAYER_COLORS[trait.layer] }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  sx={{ color: trait.avg_confidence < 0.8 ? '#f44336' : trait.avg_confidence < 0.9 ? '#ff9800' : '#4caf50' }}
                                >
                                  {(trait.avg_confidence * 100).toFixed(1)}%
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {(trait.confidence_range * 100).toFixed(1)}%
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon sx={{ color: '#4caf50' }} /> Highest Confidence Traits
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Traits with most consistent, confident classifications
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Trait</TableCell>
                            <TableCell>Layer</TableCell>
                            <TableCell align="right">Avg Conf</TableCell>
                            <TableCell align="right">Entities</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {confidenceData?.highest_confidence.map((trait: any) => (
                            <TableRow key={trait.bit}>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Chip label={trait.bit} size="small" sx={{ minWidth: 30 }} />
                                  <Typography variant="body2">{trait.name}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={trait.layer}
                                  size="small"
                                  sx={{ backgroundColor: `${LAYER_COLORS[trait.layer]}30`, color: LAYER_COLORS[trait.layer] }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ color: '#4caf50' }}>
                                  {(trait.avg_confidence * 100).toFixed(1)}%
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" color="text.secondary">
                                  {trait.entity_count.toLocaleString()}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Hex Pairs Tab */}
            <TabPanel value={tabValue} index={5}>
              <Typography variant="h6" gutterBottom>Hex Pair Frequency by Layer</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Most common byte values (hex pairs) for each layer in UHT codes
              </Typography>

              <Grid container spacing={3}>
                {hexPairsData && ['Physical', 'Functional', 'Abstract', 'Social'].map((layerName) => {
                  const layer = hexPairsData.layers?.[layerName];
                  if (!layer) return null;

                  return (
                    <Grid size={{ xs: 12, md: 6 }} key={layerName}>
                      <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: LAYER_COLORS[layerName] }} />
                          <Typography variant="subtitle1" sx={{ color: LAYER_COLORS[layerName], fontWeight: 600 }}>
                            {layerName} Layer
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                            {layer.unique_pairs} unique values
                          </Typography>
                        </Box>

                        <TableContainer sx={{ maxHeight: 400 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>Hex</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Binary</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>Count</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>%</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {layer.pairs.map((pair: { hex: string; count: number; percentage: number }, i: number) => (
                                <TableRow key={pair.hex} sx={{ backgroundColor: i < 3 ? `${LAYER_COLORS[layerName]}10` : 'transparent' }}>
                                  <TableCell>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontFamily: 'monospace',
                                        fontWeight: i < 3 ? 600 : 400,
                                        color: i < 3 ? LAYER_COLORS[layerName] : 'text.primary'
                                      }}
                                    >
                                      {pair.hex}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                                      {parseInt(pair.hex, 16).toString(2).padStart(8, '0')}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right">
                                    <Typography variant="body2">{pair.count.toLocaleString()}</Typography>
                                  </TableCell>
                                  <TableCell align="right">
                                    <Chip
                                      label={`${pair.percentage}%`}
                                      size="small"
                                      sx={{
                                        height: 20,
                                        fontSize: '0.7rem',
                                        backgroundColor: i < 3 ? `${LAYER_COLORS[layerName]}30` : 'rgba(255,255,255,0.08)',
                                        color: i < 3 ? LAYER_COLORS[layerName] : 'text.secondary'
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>

              {/* Summary Section */}
              {hexPairsData && (
                <Paper sx={{ p: 2, mt: 3 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2 }}>Summary</Typography>
                  <Grid container spacing={2}>
                    {['Physical', 'Functional', 'Abstract', 'Social'].map((layerName) => {
                      const layer = hexPairsData.layers?.[layerName];
                      if (!layer) return null;
                      const topPair = layer.pairs[0];
                      return (
                        <Grid size={{ xs: 6, md: 3 }} key={layerName}>
                          <Box sx={{ textAlign: 'center', p: 1, borderRadius: 1, backgroundColor: `${LAYER_COLORS[layerName]}10` }}>
                            <Typography variant="caption" color="text.secondary">{layerName} Top</Typography>
                            <Typography variant="h5" sx={{ fontFamily: 'monospace', color: LAYER_COLORS[layerName], fontWeight: 700 }}>
                              {topPair?.hex || '--'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {topPair?.percentage || 0}% of entities
                            </Typography>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Paper>
              )}
            </TabPanel>
          </>
        )}
      </Box>
    </Box>
  );
}
