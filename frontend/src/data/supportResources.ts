import type { SupportResourceType } from './resourceSections';

export type SupportResourceEntry = {
  id: string;
  label: string;
  icon: string;
  resource: SupportResourceType;
  title: string;
};

export const SUPPORT_PORTAL_RESOURCES: SupportResourceEntry[] = [
  {
    id: 'system',
    label: 'System Basics',
    icon: 'book',
    resource: 'system-basics',
    title: 'System Basics',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: 'shield-checkmark',
    resource: 'privacy',
    title: 'Privacy',
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: 'help-circle',
    resource: 'faq',
    title: 'FAQ',
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: 'card',
    resource: 'billing',
    title: 'Billing & Subscriptions',
  },
];
