import React from 'react';
import { motion } from 'framer-motion';

export type AIOrbState = 'idle' | 'listening' | 'processing' | 'executing' | 'completed';

export interface AIOrbProps {
  size?: 'sm' | 'md' | 'lg' | number;
  isListening?: boolean;
  isProcessing?: boolean;
  /** Overrides the two booleans when given; adds executing / completed visuals. */
  state?: AIOrbState;
  onClick?: () => void;
  className?: string;
  showStatusGlow?: boolean;
}

export const AIOrb: React.FC<AIOrbProps> = ({
  size = 'lg',
  isListening: listeningProp = false,
  isProcessing: processingProp = false,
  state,
  onClick,
  className = '',
  showStatusGlow = true,
}) => {
  const isListening = state ? state === 'listening' : listeningProp;
  const isProcessing = state ? state === 'processing' || state === 'executing' : processingProp;
  const isExecuting = state === 'executing';
  const isCompleted = state === 'completed';

  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 38
      : size === 'md'
      ? 80
      : 155;

  const isInteractive = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center select-none ${
        isInteractive ? 'cursor-pointer active:scale-95 transition-transform' : ''
      } ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      aria-label="3D Iridescent KAI Assistant Orb"
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {/* ── Volumetric Ambient Ethereal Glow (Smooth Pulsing Corona) ── */}
      {showStatusGlow && (
        <>
          {/* Deep Ambient Plasma Aura */}
          <motion.div
            className="absolute rounded-full pointer-events-none blur-3xl"
            style={{
              width: pixelSize * 1.55,
              height: pixelSize * 1.55,
              background: isListening
                ? 'radial-gradient(circle, rgba(168, 85, 247, 0.7) 0%, rgba(236, 72, 153, 0.45) 45%, rgba(56, 189, 248, 0.3) 70%, transparent 100%)'
                : 'radial-gradient(circle, rgba(192, 132, 252, 0.45) 0%, rgba(244, 114, 182, 0.3) 45%, rgba(129, 140, 248, 0.2) 75%, transparent 100%)',
            }}
            animate={
              isListening
                ? {
                    scale: [1, 1.18, 0.98, 1.15, 1],
                    opacity: [0.75, 1, 0.7, 0.95, 0.75],
                    rotate: [0, 90, 180, 270, 360],
                  }
                : isProcessing
                ? {
                    scale: [1, 1.12, 1],
                    opacity: [0.5, 0.85, 0.5],
                    rotate: [0, 180, 360],
                  }
                : {
                    scale: [1, 1.08, 0.96, 1],
                    opacity: [0.45, 0.65, 0.45],
                    rotate: [0, 45, 0],
                  }
            }
            transition={{
              duration: isListening ? 3 : isProcessing ? 2.5 : 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Secondary Soft Radial Halo Ring (Soft light bloom when listening) */}
          {isListening && (
            <motion.div
              className="absolute rounded-full pointer-events-none blur-xl"
              style={{
                width: pixelSize * 1.25,
                height: pixelSize * 1.25,
                background:
                  'radial-gradient(circle, rgba(236, 72, 153, 0.5) 0%, rgba(168, 85, 247, 0.4) 50%, transparent 80%)',
              }}
              animate={{
                scale: [0.95, 1.12, 0.95],
                opacity: [0.6, 0.9, 0.6],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </>
      )}

      {/* ── 3D Floating & Tactile Core Sphere ── */}
      <motion.div
        className="relative w-full h-full rounded-full shadow-2xl overflow-hidden flex items-center justify-center"
        style={{
          boxShadow: isListening
            ? '0 24px 60px -10px rgba(147, 51, 234, 0.55), 0 0 30px rgba(236, 72, 153, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.4)'
            : '0 18px 45px -8px rgba(147, 51, 234, 0.35), 0 0 20px rgba(129, 140, 248, 0.25), inset 0 0 15px rgba(255, 255, 255, 0.3)',
        }}
        animate={
          isListening
            ? {
                scale: [1, 1.05, 0.98, 1.04, 1],
                y: [0, -3, 1, -2, 0],
              }
            : isProcessing
            ? {
                scale: [1, 1.04, 0.98, 1],
                y: [0, -2, 2, 0],
              }
            : {
                scale: [1, 1.03, 0.98, 1],
                y: [0, -4, 2, 0],
              }
        }
        whileTap={{ scale: 0.92 }}
        transition={{
          duration: isListening ? 1.6 : 5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full transform transition-transform duration-700"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* 1. Base Iridescent Glass Pearl Gradient */}
            <radialGradient id="pearlBase" cx="35%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
              <stop offset="16%" stopColor="#F5D0FE" stopOpacity="0.95" />
              <stop offset="38%" stopColor="#C084FC" stopOpacity="0.9" />
              <stop offset="62%" stopColor="#E879F9" stopOpacity="0.85" />
              <stop offset="84%" stopColor="#6366F1" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.98" />
            </radialGradient>

            {/* 2. Primary Chromatic Swirl Gradient */}
            <linearGradient id="liquidSwirlPrimary" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.95" />
              <stop offset="28%" stopColor="#EC4899" stopOpacity="0.85" />
              <stop offset="55%" stopColor="#A855F7" stopOpacity="0.8" />
              <stop offset="82%" stopColor="#38BDF8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#818CF8" stopOpacity="0.95" />
            </linearGradient>

            {/* 3. Secondary Flow Gradient (Turquoise / Violet / Apricot) */}
            <radialGradient id="liquidSwirlSecondary" cx="68%" cy="75%" r="65%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.9" />
              <stop offset="42%" stopColor="#818CF8" stopOpacity="0.8" />
              <stop offset="78%" stopColor="#F472B6" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#FDE047" stopOpacity="0.5" />
            </radialGradient>

            {/* 4. Specular Top Glass Sheen */}
            <linearGradient id="specularGlint" x1="20%" y1="5%" x2="65%" y2="85%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.3" />
              <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>

            {/* 5. Rim Fresnel Light */}
            <radialGradient id="rimFresnel" cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="94%" stopColor="#FDF4FF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
            </radialGradient>

            {/* Clip path for internal waves */}
            <clipPath id="orbClip">
              <circle cx="100" cy="100" r="96" />
            </clipPath>
          </defs>

          {/* ── Base Sphere ── */}
          <circle cx="100" cy="100" r="96" fill="url(#pearlBase)" />

          {/* ── Internal Living Fluid Waves (Clipped) ── */}
          <g clipPath="url(#orbClip)">
            {/* Wave Layer 1: Lower Swirling Fluid */}
            <motion.path
              d="M 5 115 C 38 65, 80 148, 128 92 C 162 52, 185 88, 196 118 C 172 185, 75 198, 5 115 Z"
              fill="url(#liquidSwirlPrimary)"
              opacity="0.88"
              animate={
                isListening
                  ? {
                      d: [
                        'M 5 115 C 38 65, 80 148, 128 92 C 162 52, 185 88, 196 118 C 172 185, 75 198, 5 115 Z',
                        'M 5 105 C 45 80, 88 125, 138 78 C 170 42, 188 100, 196 125 C 165 192, 65 190, 5 105 Z',
                        'M 5 120 C 35 55, 75 155, 122 98 C 158 58, 182 82, 196 112 C 175 180, 82 196, 5 120 Z',
                        'M 5 115 C 38 65, 80 148, 128 92 C 162 52, 185 88, 196 118 C 172 185, 75 198, 5 115 Z',
                      ],
                    }
                  : {
                      // Same keyframe count as the listening variant — framer
                      // interpolates between the two arrays index-by-index and
                      // logs an invalid "undefined" path when they differ.
                      d: [
                        'M 5 115 C 38 65, 80 148, 128 92 C 162 52, 185 88, 196 118 C 172 185, 75 198, 5 115 Z',
                        'M 5 110 C 42 72, 84 138, 132 86 C 165 48, 186 92, 196 120 C 170 188, 72 195, 5 110 Z',
                        'M 5 112 C 40 68, 82 143, 130 89 C 163 50, 185 90, 196 119 C 171 186, 73 196, 5 112 Z',
                        'M 5 115 C 38 65, 80 148, 128 92 C 162 52, 185 88, 196 118 C 172 185, 75 198, 5 115 Z',
                      ],
                    }
              }
              transition={{
                duration: isListening ? 2.5 : 7,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Wave Layer 2: Counter-Flowing Wave (Turquoise & Rose) */}
            <motion.path
              d="M 28 142 C 68 98, 122 152, 172 128 C 185 152, 150 186, 100 193 C 54 191, 30 172, 28 142 Z"
              fill="url(#liquidSwirlSecondary)"
              opacity="0.82"
              animate={
                isListening
                  ? {
                      d: [
                        'M 28 142 C 68 98, 122 152, 172 128 C 185 152, 150 186, 100 193 C 54 191, 30 172, 28 142 Z',
                        'M 25 132 C 75 110, 118 138, 168 118 C 188 145, 155 190, 95 195 C 50 192, 28 165, 25 132 Z',
                        'M 28 142 C 68 98, 122 152, 172 128 C 185 152, 150 186, 100 193 C 54 191, 30 172, 28 142 Z',
                      ],
                    }
                  : {
                      d: [
                        'M 28 142 C 68 98, 122 152, 172 128 C 185 152, 150 186, 100 193 C 54 191, 30 172, 28 142 Z',
                        'M 30 148 C 64 92, 126 156, 175 132 C 182 155, 148 184, 102 192 C 58 190, 32 175, 30 148 Z',
                        'M 28 142 C 68 98, 122 152, 172 128 C 185 152, 150 186, 100 193 C 54 191, 30 172, 28 142 Z',
                      ],
                    }
              }
              transition={{
                duration: isListening ? 2.2 : 6.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            {/* Wave Layer 3: Central Translucent Shimmer Ribbon */}
            <motion.path
              d="M 22 92 C 62 132, 138 68, 188 108 C 162 142, 112 162, 48 148 Z"
              fill="url(#liquidSwirlPrimary)"
              opacity="0.65"
              style={{ mixBlendMode: 'overlay' }}
              animate={{
                opacity: isListening ? [0.6, 0.95, 0.6] : [0.55, 0.75, 0.55],
              }}
              transition={{
                duration: isListening ? 1.4 : 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </g>

          {/* ── Glass Specular Reflection Highlight (Upper Left Dome) ── */}
          <ellipse
            cx="75"
            cy="52"
            rx="56"
            ry="32"
            transform="rotate(-26 75 52)"
            fill="url(#specularGlint)"
          />

          {/* Secondary Tiny Bright Glass Glint */}
          <ellipse
            cx="58"
            cy="40"
            rx="15"
            ry="8"
            transform="rotate(-26 58 40)"
            fill="#FFFFFF"
            opacity="0.9"
          />

          {/* Edge Fresnel Glow Rim (Volumetric 3D Glass Boundary) */}
          <circle cx="100" cy="100" r="96" fill="url(#rimFresnel)" />
        </svg>
      </motion.div>

      {/* Executing: a rotating emerald ring means "saving into Kanaku" */}
      {isExecuting && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: pixelSize * 1.12,
            height: pixelSize * 1.12,
            border: `${Math.max(2, pixelSize * 0.03)}px solid transparent`,
            borderTopColor: '#10B981',
            borderRightColor: 'rgba(16, 185, 129, 0.35)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        />
      )}

      {/* Completed: one soft check pulse */}
      {isCompleted && (
        <motion.div
          className="absolute rounded-full pointer-events-none flex items-center justify-center"
          style={{
            width: pixelSize * 1.12,
            height: pixelSize * 1.12,
            boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.55)',
          }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: [0.85, 1.06, 1], opacity: [0, 1, 0.9] }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            style={{ width: pixelSize * 0.26, height: pixelSize * 0.26 }}
            fill="none"
            stroke="#059669"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      )}
    </div>
  );
};

export default AIOrb;
