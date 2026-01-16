# Verity Protect Design System

A premium, calm, and elder-friendly design system optimized for high trust and low cognitive load.

## Design Philosophy

- **Calm & Minimal**: Avoiding cluttered SaaS layouts. Generous whitespace to prevent overwhelming users.
- **High Contrast**: Ensuring all text is readable for older eyes across both light and dark themes.
- **Tactile Reliability**: Softly rounded corners (24px–32px) and high-quality shadows to give UI elements a physical, "safe" presence.
- **Non-Distractive Motion**: Subtle fades and pulses used only to guide attention, never to distract.

---

## 1. Color Palette

### Dark Theme (Default)
| Token | Value | Description |
| :--- | :--- | :--- |
| `bg` | `#0b111b` | Deep navy base |
| `surface` | `#121a26` | Primary card background |
| `surface-alt` | `#1a2333` | Secondary inputs/controls |
| `text` | `#f5f7fb` | High-contrast off-white |
| `text-muted` | `#94a3b8` | Supporting information |
| `text-dim` | `#64748b` | Captions and inactive states |
| `accent` | `#2d6df6` | Trust Blue (Primary action) |
| `success` | `#16a34a` | Affirmative/Safe actions |
| `danger` | `#e11d48` | Destructive/Alert actions |

### Light Theme (High Contrast)
| Token | Value | Description |
| :--- | :--- | :--- |
| `bg` | `#f8fafc` | Clean slate white |
| `surface` | `#ffffff` | Pure white cards |
| `surface-alt` | `#f1f5f9` | Light grey controls |
| `text` | `#0f172a` | Deep ink blue/black |
| `accent` | `#2d6df6` | Consistent brand blue |

---

## 2. Typography

We use a system font stack for maximum reliability and performance.

| Type Class | Size | Weight | Line Height | Case |
| :--- | :--- | :--- | :--- | :--- |
| `Title` | 34px | 700 (Bold) | 1.1 | Normal |
| `Subtitle` | 18px | 600 (Semi) | 1.4 | Normal |
| `Body Strong` | 16px | 600 (Semi) | 1.5 | Normal |
| `Body` | 16px | 400 (Reg) | 1.5 | Normal |
| `Caption Strong`| 10px | 900 (Black)| 1.8 | ALL CAPS |
| `Caption` | 13px | 400 (Reg) | 1.4 | Normal |

---

## 3. Component Specifications

### Buttons
- **Height**: 60px (Standard Touch Target)
- **Radius**: 24px
- **Primary**: Solid Accent background with white text and soft blue shadow.
- **Secondary**: Surface-Alt background with 1px border.
- **Destructive**: `bg-danger-subtle` with `text-danger`, no border (prevents "white ring" effect in dark mode).

### Inputs
- **Height**: 60px
- **Radius**: 24px
- **Active State**: 1px Accent border with 4px `ring-accent/5` subtle glow.
- **Text**: Bold, 16px to ensure high legibility.

### Segments & Indicators
- **Onboarding Header**: 10-segment dynamic progress bar.
- **Active Segment**: 12px width, Accent blue.
- **Pending Segment**: 6px width, 10% opacity Accent blue.

---

## 4. Visual Styles

### Shadows
- **App Bottom**: `0 -12px 40px rgba(0,0,0,0.5)` - Creates depth for fixed footer actions.
- **Card Shadow**: `0 12px 48px rgba(0,0,0,0.5)` - Deep elevation for high-priority modals/trays.

### Borders
- Generic borders use `rgba(255, 255, 255, 0.05)` in dark mode to remain almost invisible until focused.
- Explicitly avoiding "white outlines" on destructive elements by using `border-none`.

---

## 5. Interactions

- **Pulse**: Used on "Active Scanning" states to show system life.
- **Shake**: Used for PIN mismatch errors (0.4s duration).
- **Cubic-Bezier**: All transitions use `cubic-bezier(0.32, 1, 0.2, 1)` for a smooth "Apple-like" feel.
