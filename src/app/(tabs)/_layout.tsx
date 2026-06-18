import { Tabs } from 'expo-router';

import { AnimatedTabIcon } from '@/components/animated-tab-icon';
import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/lib/i18n';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: Brand.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_catalog'),
          tabBarIcon: (p) => <AnimatedTabIcon name="search" {...p} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t('tab_pricelist'),
          tabBarIcon: (p) => <AnimatedTabIcon name="pricetags-outline" {...p} />,
        }}
      />
      <Tabs.Screen
        name="quote"
        options={{
          title: t('tab_quote'),
          tabBarIcon: (p) => <AnimatedTabIcon name="calculator-outline" {...p} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tab_orders'),
          tabBarIcon: (p) => <AnimatedTabIcon name="receipt-outline" {...p} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('tab_account'),
          tabBarIcon: (p) => <AnimatedTabIcon name="person-circle-outline" {...p} />,
        }}
      />
    </Tabs>
  );
}
