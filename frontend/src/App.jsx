import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Box, 
  Typography, 
  Button, 
  Grid, 
  IconButton, 
  Paper 
} from '@mui/material';
import { 
  PlayArrow, 
  Pause, 
  Refresh,
  SportsBasketball,
  SportsCricket,
  GpsFixed,
  SwapHoriz,
  Warning,
  Timer,
  PersonAdd,
  Edit,
  Add,
  Remove
} from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import useSound from 'use-sound';

function App() {
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [playBuzzer] = useSound('/sounds/buzzer.mp3');
  const [playScore] = useSound('/sounds/score.mp3');

  const fetchGameState = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/game');
      setGameState(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching game state:', error);
      setError('Failed to connect to backend');
    }
  };

  const updateScore = async (team, points) => {
    try {
      await axios.post('http://localhost:8000/api/score', { team, points });
      if (points > 0) {
        playScore();
        const newPossession = team === 'home_team' ? 'away_team' : 'home_team';
        await handlePossessionChange(newPossession);
      }
      fetchGameState();
    } catch (error) {
      setError('Failed to update score');
    }
  };

  const handleClock = async (action) => {
    try {
      await axios.post('http://localhost:8000/api/clock', { action });
      fetchGameState();
    } catch (error) {
      setError('Failed to control clock');
    }
  };

  const handleFoul = async (team) => {
    try {
      await axios.post('http://localhost:8000/api/foul', { team });
      fetchGameState();
    } catch (error) {
      setError('Failed to add foul');
    }
  };

  const handleTechnicalFoul = async (team) => {
    try {
      await axios.post('http://localhost:8000/api/technical-foul', { team });
      fetchGameState();
    } catch (error) {
      setError('Failed to add technical foul');
    }
  };

  const handleTimeout = async (team) => {
    try {
      await axios.post('http://localhost:8000/api/timeout', { team });
      fetchGameState();
    } catch (error) {
      setError('Failed to call timeout');
    }
  };

  const handleShotClock = async (action, type = 'full') => {
    try {
      if (gameState.shot_clock.time === 0 && !gameState.shot_clock.violation) {
        playBuzzer();
        await handleClock('stop');
        await axios.post('http://localhost:8000/api/shot-clock', { 
          action: 'violation' 
        });
      } else {
        await axios.post('http://localhost:8000/api/shot-clock', { 
          action, 
          type 
        });
      }
      fetchGameState();
    } catch (error) {
      setError('Failed to control shot clock');
    }
  };

  const togglePossession = async () => {
    try {
      const newPossession = gameState.possession === 'home_team' ? 'away_team' : 'home_team';
      await axios.post('http://localhost:8000/api/possession', { team: newPossession });
      fetchGameState();
    } catch (error) {
      setError('Failed to update possession');
    }
  };

  const handlePossessionChange = async (newTeam) => {
    try {
      await axios.post('http://localhost:8000/api/possession', { team: newTeam });
      await handleShotClock('reset', 'full');
      await handleShotClock('stop');
      fetchGameState();
    } catch (error) {
      setError('Failed to update possession');
    }
  };

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (gameState?.shot_clock?.time === 0 && !gameState?.shot_clock?.violation) {
        handleShotClock('violation');
      }
    }, 100);

    return () => clearInterval(interval);
  }, [gameState?.shot_clock?.time]);

  const TeamScore = ({ team, teamData }) => (
    <Paper sx={{ p: 2, bgcolor: '#2d2d2d', height: '100%' }}>
      <Typography variant="h4" color="white" align="center">
        {teamData.name}
      </Typography>
      
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Typography color="error.light">
          Fouls: {teamData.fouls}
          {teamData.in_bonus && " (BONUS)"}
        </Typography>
        <Typography color="warning.light">
          T.Fouls: {teamData.technical_fouls}
        </Typography>
        <Typography color="info.light">
          Timeouts: {teamData.timeouts_left}
        </Typography>
      </Box>

      <Typography variant="h2" color="white" align="center" sx={{ my: 3 }}>
        {teamData.score}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ScoreButton team={team} points={1} />
        <ScoreButton team={team} points={2} />
        <ScoreButton team={team} points={3} />
        <ScoreButton team={team} points={-1} isDeduct />
      </Box>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
        <Button 
          variant="contained" 
          color="error" 
          onClick={() => handleFoul(team)}
          startIcon={<Add />}
        >
          Foul
        </Button>
        <Button 
          variant="contained" 
          color="warning" 
          onClick={() => handleTechnicalFoul(team)}
        >
          T.Foul
        </Button>
        <Button 
          variant="contained" 
          color="info" 
          onClick={() => handleTimeout(team)}
          startIcon={<Timer />}
        >
          Timeout
        </Button>
      </Box>
    </Paper>
  );

  const PlayerStatsDialog = ({ open, handleClose, team, teamData }) => {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Player Stats - {teamData.name}</DialogTitle>
        <DialogContent>
          <List>
            {Object.entries(teamData.players).map(([number, player]) => (
              <ListItem key={number} divider>
                <ListItemText
                  primary={`#${number} - ${player.name}`}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                      <Typography variant="body2">
                        Points: {player.points}
                      </Typography>
                      <Typography variant="body2">
                        Fouls: {player.fouls}
                      </Typography>
                      <Typography variant="body2">
                        Assists: {player.assists}
                      </Typography>
                      <Typography variant="body2">
                        Rebounds: {player.rebounds}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      size="small" 
                      onClick={() => handlePlayerStats(team, number, 'assists')}
                    >
                      A+
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => handlePlayerStats(team, number, 'rebounds')}
                    >
                      R+
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => handlePlayerStats(team, number, 'steals')}
                    >
                      S+
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => handlePlayerStats(team, number, 'blocks')}
                    >
                      B+
                    </Button>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  };

  const ScoreButton = ({ team, points, isDeduct = false }) => {
    const getIcon = () => {
      if (isDeduct) return <Remove />;
      switch(points) {
        case 1:
          return <SportsBasketball sx={{ fontSize: '1.5rem' }} />;
        case 2:
          return <SportsCricket sx={{ fontSize: '1.5rem', transform: 'rotate(-45deg)' }} />;
        case 3:
          return <GpsFixed sx={{ fontSize: '1.5rem' }} />;
        default:
          return null;
      }
    };

    return (
      <Button
        variant="contained"
        onClick={() => updateScore(team, points)}
        sx={{
          height: '60px',
          minWidth: '60px',
          bgcolor: isDeduct ? 'grey.700' : 'error.main',
          '&:hover': { bgcolor: isDeduct ? 'grey.800' : 'error.dark' },
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5
        }}
      >
        {getIcon()}
        <Typography variant="caption">
          {isDeduct ? '-1' : `${points} PT`}
        </Typography>
      </Button>
    );
  };

  const ClockControls = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
      <IconButton 
        onClick={() => handleClock('start')}
        sx={{ 
          bgcolor: 'success.main',
          '&:hover': { bgcolor: 'success.dark' }
        }}
      >
        <PlayArrow sx={{ color: 'white' }} />
      </IconButton>
      <IconButton 
        onClick={() => handleClock('stop')}
        sx={{ 
          bgcolor: 'error.main',
          '&:hover': { bgcolor: 'error.dark' }
        }}
      >
        <Pause sx={{ color: 'white' }} />
      </IconButton>
      <IconButton 
        onClick={() => handleClock('reset')}
        sx={{ 
          bgcolor: 'primary.main',
          '&:hover': { bgcolor: 'primary.dark' }
        }}
      >
        <Refresh sx={{ color: 'white' }} />
      </IconButton>
    </Box>
  );

  const ShotClock = () => (
    <Box sx={{ 
      mt: 3, 
      p: 2, 
      bgcolor: '#1a1a1a',
      borderRadius: 1,
      border: 2,
      borderColor: gameState.shot_clock.violation ? 'error.main' : 'primary.main',
      transition: 'all 0.3s ease',
      animation: gameState.shot_clock.time <= 5 ? 'pulse 1s infinite' : 'none'
    }}>
      <Typography variant="h6" color="white" align="center">
        Shot Clock
      </Typography>
      <Typography 
        variant="h2"
        color={gameState.shot_clock.violation ? 'error.main' : 'error.light'}
        sx={{ 
          fontWeight: 'bold',
          textShadow: gameState.shot_clock.time <= 5 ? '0 0 8px red' : 'none',
          my: 1,
          textAlign: 'center'
        }}
      >
        {gameState.shot_clock.time}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1 }}>
        <IconButton 
          onClick={() => handleShotClock('start')}
          sx={{ 
            bgcolor: 'success.main',
            '&:hover': { bgcolor: 'success.dark' }
          }}
          disabled={gameState.shot_clock.violation}
        >
          <PlayArrow sx={{ color: 'white' }} />
        </IconButton>
        <IconButton 
          onClick={() => handleShotClock('stop')}
          sx={{ 
            bgcolor: 'error.main',
            '&:hover': { bgcolor: 'error.dark' }
          }}
        >
          <Pause sx={{ color: 'white' }} />
        </IconButton>
        <Button 
          onClick={() => handleShotClock('reset', 'full')}
          variant="contained"
          sx={{ minWidth: '50px', bgcolor: 'primary.dark' }}
        >
          24
        </Button>
        <Button 
          onClick={() => handleShotClock('reset', 'partial')}
          variant="contained"
          sx={{ minWidth: '50px', bgcolor: 'primary.dark' }}
        >
          14
        </Button>
      </Box>
    </Box>
  );

  const PossessionIndicator = () => {
    const isHomePossession = gameState.possession === 'home_team';
    
    return (
      <Box sx={{ 
        mt: 2, 
        textAlign: 'center',
        transition: 'all 0.3s ease'
      }}>
        <Button
          variant="contained"
          onClick={() => handlePossessionChange(
            isHomePossession ? 'away_team' : 'home_team'
          )}
          sx={{
            bgcolor: isHomePossession ? 'primary.main' : 'secondary.main',
            '&:hover': { 
              bgcolor: isHomePossession ? 'primary.dark' : 'secondary.dark' 
            },
            minWidth: '200px',
            position: 'relative',
            py: 1.5,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: isHomePossession ? -20 : 'auto',
              right: isHomePossession ? 'auto' : -20,
              width: 0,
              height: 0,
              borderTop: '10px solid transparent',
              borderBottom: '10px solid transparent',
              borderLeft: isHomePossession ? '10px solid white' : 'none',
              borderRight: isHomePossession ? 'none' : '10px solid white',
            }
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            color: 'white',
          }}>
            {!isHomePossession && <SwapHoriz />}
            {isHomePossession ? 'Home Possession' : 'Away Possession'}
            {isHomePossession && <SwapHoriz />}
          </Box>
        </Button>
      </Box>
    );
  };

  if (error) return <Typography color="error">{error}</Typography>;
  if (!gameState) return <Typography>Loading...</Typography>;

  return (
    <Box sx={{ p: 3, bgcolor: '#1a1a1a', minHeight: '100vh' }}>
      <Grid container spacing={3}>
        {/* Home Team */}
        <Grid item xs={12} md={4}>
          <TeamScore team="home_team" teamData={gameState.home_team} />
        </Grid>

        {/* Clock and Controls */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, bgcolor: '#2d2d2d' }}>
            <Typography variant="h6" color="white" align="center">
              Quarter {gameState.game_clock.quarter}
            </Typography>
            <Typography variant="h2" color="white" align="center">
              {gameState.game_clock.time}
            </Typography>
            <ClockControls />
            <ShotClock />
            <PossessionIndicator />
          </Paper>
        </Grid>

        {/* Away Team */}
        <Grid item xs={12} md={4}>
          <TeamScore team="away_team" teamData={gameState.away_team} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default App;
