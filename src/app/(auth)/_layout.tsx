import { Stack } from 'expo-router';
import { useAppTheme } from '../../contexts/ThemeContext';

export default function AuthLayout() {
  const { Colors } = useAppTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: Colors.bg } }} />
  );
}
