export const colors = {
  // Premium Neumorphism colors
  background: '#E8F5F0', // Mint cream background
  cardBackground: '#F5F0E8', // Cream card background
  
  // Accent colors
  mint: '#10b981', // Mint green
  roseGold: '#f43f5e', // Rose gold
  cream: '#fef3c7', // Cream
  lavender: '#e9d5ff', // Lavender
  
  // Text colors
  textPrimary: '#4A5568', // Dark gray
  textSecondary: '#718096', // Medium gray
  
  // Gradient colors for patient numbers
  gradients: {
    blue: ['#93C5FD', '#C4B5FD'], // Blue to purple
    cyan: ['#67E8F9', '#A5F3FC'], // Cyan to light cyan
    pink: ['#FDA4AF', '#FCA5A5'], // Pink to rose
    purple: ['#C4B5FD', '#DDD6FE'], // Purple to light purple
  },
  
  // Clinic colors
  clinic1: '#10b981', // Mint
  clinic2: '#06b6d4', // Cyan
  clinic3: '#8b5cf6', // Purple
  clinic4: '#f59e0b', // Amber
  clinic5: '#ec4899', // Pink
  
  // Treatment colors (pastel)
  pain: '#FED7D7', // Light red
  swelling: '#E9D5FF', // Light purple
  filling: '#FED7AA', // Light orange
  extraction: '#E9D5FF', // Light purple
  scaling: '#A7F3D0', // Light mint
  
  // Status colors
  iconGray: '#9CA3AF',
  white: '#FFFFFF',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

export const shadows = {
  neumorphic: {
    shadowColor: '#8B95A5',
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  neumorphicInset: {
    shadowColor: '#fff',
    shadowOffset: { width: -6, height: -6 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  card: {
    shadowColor: '#8B95A5',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 8,
  },
  fab: {
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 12,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};
