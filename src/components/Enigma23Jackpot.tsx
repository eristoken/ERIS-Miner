import { useState, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
// @ts-expect-error - Audio file import
import fanfareSound from './main-library-super-fanfare-276484.mp3';

interface Enigma23JackpotProps {
  reward: string;
  onClose: () => void;
}

const SYMBOLS = ['🎰', '💎', '⭐', '💰', '🎁', '🏆', '👑', '💫'];
const SPIN_DURATION = 3000; // 3 seconds

// Function to play jackpot fanfare sound effect
function playJackpotSound() {
  try {
    const audio = new Audio(fanfareSound);
    audio.volume = 0.7; // Set volume (0.0 to 1.0)
    audio.play().catch((error) => {
      // Silently fail if audio playback is not allowed
      console.debug('Audio playback not available:', error);
    });
  } catch (error) {
    // Silently fail if audio creation fails
    console.debug('Audio playback not available:', error);
  }
}

export default function Enigma23Jackpot({ reward, onClose }: Enigma23JackpotProps) {
  const [reels, setReels] = useState<string[]>(['🎰', '🎰', '🎰']);
  const [spinning, setSpinning] = useState(true);

  // Play sound effect when component opens
  useEffect(() => {
    playJackpotSound();
  }, []);

  useEffect(() => {
    // Slot machine spinning animation
    const spinInterval = setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
    }, 100);

    // Stop spinning after duration
    const stopTimer = setTimeout(() => {
      clearInterval(spinInterval);
      // Set final winning combination
      setReels(['🎰', '🎰', '🎰']);
      setSpinning(false);
    }, SPIN_DURATION);

    return () => {
      clearInterval(spinInterval);
      clearTimeout(stopTimer);
    };
  }, []);


  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
        overflow: 'hidden',
      }}
    >
      {/* Animated confetti effect using CSS */}
      {[...Array(50)].map((_, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: 10,
            height: 10,
            background: ['#FFD700', '#FFA500', '#FF6347', '#FF1493', '#00CED1'][i % 5],
            borderRadius: '50%',
            left: `${Math.random() * 100}%`,
            top: '-10px',
            animation: `fall ${2 + Math.random() * 3}s linear forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
            '@keyframes fall': {
              to: {
                transform: `translateY(${window.innerHeight + 100}px) rotate(${360 * (Math.random() > 0.5 ? 1 : -1)}deg)`,
                opacity: 0,
              },
            },
          }}
        />
      ))}

      {/* Animated background glow */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '200%',
          height: '200%',
          background: 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)',
          animation: 'pulse 2s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.5, transform: 'translate(-50%, -50%) scale(1)' },
            '50%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1.2)' },
          },
        }}
      />

      {/* Main Content */}
      <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        {/* Title */}
        <Typography
          variant="h2"
          sx={{
            fontSize: { xs: '2.5rem', md: '4rem' },
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #FFD700, #FFA500, #FFD700)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
            mb: 2,
            animation: 'glow 1.5s ease-in-out infinite alternate',
            '@keyframes glow': {
              from: { filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))' },
              to: { filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.8))' },
            },
          }}
        >
          🎰 ENIGMA23 JACKPOT! 🎰
        </Typography>

        {/* Slot Machine Reels */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
            my: 4,
            perspective: '1000px',
          }}
        >
          {reels.map((symbol, index) => (
            <Box
              key={index}
              sx={{
                width: { xs: 80, md: 120 },
                height: { xs: 120, md: 180 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: { xs: '4rem', md: '6rem' },
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                border: '4px solid gold',
                borderRadius: 2,
                boxShadow: spinning
                  ? '0 0 20px rgba(255, 215, 0, 0.8)'
                  : '0 0 40px rgba(255, 215, 0, 1)',
                transform: spinning ? 'rotateY(360deg)' : 'rotateY(0deg)',
                transition: spinning ? 'none' : 'transform 0.5s ease-out, box-shadow 0.5s ease-out',
                animation: spinning
                  ? 'spin 0.1s linear infinite'
                  : 'win 0.5s ease-out',
                '@keyframes spin': {
                  '0%': { transform: 'rotateY(0deg)' },
                  '100%': { transform: 'rotateY(360deg)' },
                },
                '@keyframes win': {
                  '0%': { transform: 'scale(1) rotateY(0deg)' },
                  '50%': { transform: 'scale(1.2) rotateY(180deg)' },
                  '100%': { transform: 'scale(1) rotateY(360deg)' },
                },
              }}
            >
              {symbol}
            </Box>
          ))}
        </Box>

        {/* Reward Display */}
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '1.5rem', md: '2.5rem' },
            fontWeight: 'bold',
            color: 'gold',
            mb: 2,
            textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
            animation: 'bounce 1s ease-in-out infinite',
            '@keyframes bounce': {
              '0%, 100%': { transform: 'translateY(0)' },
              '50%': { transform: 'translateY(-10px)' },
            },
          }}
        >
          🎉 {reward} TOKENS AWARDED! 🎉
        </Typography>

        <Typography
          variant="h6"
          sx={{
            color: 'rgba(255, 255, 255, 0.9)',
            mb: 4,
            fontStyle: 'italic',
          }}
        >
          Congratulations! You've hit the ultimate jackpot!
        </Typography>

        {/* Close Button */}
        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            mt: 2,
            px: 4,
            py: 1.5,
            fontSize: '1.2rem',
            background: 'linear-gradient(45deg, #FFD700, #FFA500)',
            color: '#000',
            fontWeight: 'bold',
            '&:hover': {
              background: 'linear-gradient(45deg, #FFA500, #FFD700)',
              transform: 'scale(1.05)',
            },
            transition: 'all 0.3s ease',
          }}
        >
          Continue! 🎁
        </Button>
      </Box>
    </Box>
  );
}

