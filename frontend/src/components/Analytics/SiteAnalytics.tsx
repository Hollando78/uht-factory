/**
 * Site Analytics Dashboard
 *
 * Displays visitor statistics, page views, and traffic sources.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Visibility as VisibilityIcon,
  Language as LanguageIcon,
  AccessTime as TimeIcon,
  Devices as DevicesIcon
} from '@mui/icons-material';

interface AnalyticsStats {
  total_pageviews: number;
  unique_visitors_today: number;
  unique_visitors_week: number;
  top_pages: Array<{ path: string; views: number }>;
  top_referrers: Array<{ domain: string; count: number }>;
  daily_views: Record<string, number>;
  hourly_views: Record<string, number>;
  browsers: Record<string, number>;
  recent_views: Array<{
    path: string;
    time: string;
    browser: string;
    device: string;
  }>;
}

function StatCard({
  title,
  value,
  icon,
  subtitle
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h4" sx={{ my: 0.5 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ color: 'primary.main', opacity: 0.7 }}>{icon}</Box>
      </Box>
    </Paper>
  );
}

function formatTimeAgo(isoTime: string): string {
  const date = new Date(isoTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function SiteAnalytics() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/analytics/stats');
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!stats) return null;

  // Calculate max views for progress bars
  const maxPageViews = Math.max(...stats.top_pages.map(p => p.views), 1);
  const maxBrowserCount = Math.max(...Object.values(stats.browsers), 1);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Site Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Privacy-friendly visitor tracking
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchStats} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Page Views"
            value={stats.total_pageviews}
            icon={<VisibilityIcon fontSize="large" />}
            subtitle="All time"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Visitors Today"
            value={stats.unique_visitors_today}
            icon={<PeopleIcon fontSize="large" />}
            subtitle="Unique visitors"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Visitors This Week"
            value={stats.unique_visitors_week}
            icon={<TrendingUpIcon fontSize="large" />}
            subtitle="Last 7 days"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Top Referrers"
            value={stats.top_referrers.length}
            icon={<LanguageIcon fontSize="large" />}
            subtitle="External sources"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Top Pages */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Top Pages
            </Typography>
            {stats.top_pages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No data yet
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {stats.top_pages.map((page, i) => (
                  <Box key={page.path}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {page.path || '/'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {page.views.toLocaleString()}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(page.views / maxPageViews) * 100}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        bgcolor: 'rgba(0,229,255,0.1)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: i === 0 ? 'primary.main' : 'primary.dark'
                        }
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Browsers */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              <DevicesIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Browsers
            </Typography>
            {Object.keys(stats.browsers).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No data yet
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(stats.browsers)
                  .sort((a, b) => b[1] - a[1])
                  .map(([browser, count]) => (
                    <Box key={browser}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2">{browser}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {count.toLocaleString()}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={(count / maxBrowserCount) * 100}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,107,53,0.1)',
                          '& .MuiLinearProgress-bar': { bgcolor: 'secondary.main' }
                        }}
                      />
                    </Box>
                  ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Recent Activity */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              <TimeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Recent Activity
            </Typography>
            {stats.recent_views.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No recent activity
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {stats.recent_views.slice(0, 10).map((view, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.5,
                      borderBottom: i < stats.recent_views.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider'
                    }}
                  >
                    <Chip
                      label={view.device}
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 70 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {view.path || '/'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimeAgo(view.time)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Top Referrers */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              <LanguageIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Top Referrers
            </Typography>
            {stats.top_referrers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No external referrers yet
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {stats.top_referrers.map(ref => (
                  <Chip
                    key={ref.domain}
                    label={`${ref.domain} (${ref.count})`}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
