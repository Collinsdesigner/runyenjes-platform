// RUNYENJES-SETUP-V1
// Color gallery for the setup wizard. Grouped by hue family so a non-technical
// installer can pick something close to their real colors without a hex code.
// Light "secondary" colors are soft tints rather than pure white so they stay
// visible on white pages.

export interface ColorPreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
}

export interface ColorGroup {
  title: string;
  presets: ColorPreset[];
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    title: 'Greens',
    presets: [
      { id: 'forest-maroon', name: 'Forest Green & Maroon', primary: '#0B7A2B', secondary: '#5C0F00' },
      { id: 'pine-gold', name: 'Pine & Gold', primary: '#1B4D3E', secondary: '#C9A227' },
      { id: 'teal-charcoal', name: 'Teal & Charcoal', primary: '#0F766E', secondary: '#374151' },
      { id: 'emerald-white', name: 'Emerald & White', primary: '#059669', secondary: '#F1F5F9' },
      { id: 'olive-brown', name: 'Olive & Brown', primary: '#556B2F', secondary: '#5C4033' },
    ],
  },
  {
    title: 'Blues',
    presets: [
      { id: 'navy-gold', name: 'Navy & Gold', primary: '#0A2342', secondary: '#D4A017' },
      { id: 'royal-silver', name: 'Royal Blue & Silver', primary: '#1D4ED8', secondary: '#C0C8D0' },
      { id: 'sky-white', name: 'Sky Blue & White', primary: '#0284C7', secondary: '#F1F5F9' },
      { id: 'cyan-slate', name: 'Cyan & Slate', primary: '#0891B2', secondary: '#475569' },
      { id: 'blue-red', name: 'Blue & Red', primary: '#1D4ED8', secondary: '#DC2626' },
    ],
  },
  {
    title: 'Reds & Maroons',
    presets: [
      { id: 'burgundy-cream', name: 'Burgundy & Cream', primary: '#800020', secondary: '#F5E6C8' },
      { id: 'crimson-black', name: 'Crimson & Black', primary: '#DC143C', secondary: '#111827' },
      { id: 'brick-grey', name: 'Brick Red & Grey', primary: '#A13D2D', secondary: '#6B7280' },
      { id: 'wine-gold', name: 'Wine & Gold', primary: '#722F37', secondary: '#C9A227' },
    ],
  },
  {
    title: 'Purples',
    presets: [
      { id: 'violet-amber', name: 'Violet & Amber', primary: '#6D28D9', secondary: '#F59E0B' },
      { id: 'purple-grey', name: 'Deep Purple & Light Grey', primary: '#4C1D95', secondary: '#D1D5DB' },
      { id: 'magenta-black', name: 'Magenta & Black', primary: '#C026D3', secondary: '#111827' },
    ],
  },
  {
    title: 'Neutrals & multi-tone',
    presets: [
      { id: 'black-gold', name: 'Black & Gold', primary: '#111827', secondary: '#C9A227' },
      { id: 'charcoal-orange', name: 'Charcoal & Orange', primary: '#374151', secondary: '#EA580C' },
      { id: 'brown-cream', name: 'Brown & Cream', primary: '#5C4033', secondary: '#F5E6C8' },
      { id: 'deepblue-orange', name: 'Deep Blue & Orange', primary: '#1E3A8A', secondary: '#F97316' },
    ],
  },
];
