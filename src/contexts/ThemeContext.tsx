import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { darkColors, lightColors, ThemeColors } from '../constants/colors';
import { Appearance } from 'react-native';

export type ThemeType = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  Colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  Colors: lightColors,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeType>('light');

  useEffect(() => {
    if (user?.theme) {
      setThemeState(user.theme as ThemeType);
    } else {
      setThemeState('light');
    }
  }, [user?.theme]);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.id), { theme: newTheme });
      } catch (e) {
        console.error('Failed to update theme in DB', e);
      }
    }
  };

  const Colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, Colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
