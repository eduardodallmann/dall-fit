import { Button } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';

import { themeToggleStyles } from '~/core/components/theme-toggle/styles';
import { useTheme } from '~/core/theme/theme-context';

const iconStyles = themeToggleStyles();

export function ThemeToggle() {
  const { isSaving, theme, toggleTheme } = useTheme();
  const activatesLightTheme = theme === 'dark';
  const label = activatesLightTheme
    ? 'Ativar tema claro'
    : 'Ativar tema escuro';
  const Icon = activatesLightTheme ? Sun : Moon;

  return (
    <Button
      aria-label={label}
      isIconOnly
      isPending={isSaving}
      onPress={toggleTheme}
      variant="secondary"
    >
      <Icon aria-hidden="true" className={iconStyles} focusable="false" />
    </Button>
  );
}
