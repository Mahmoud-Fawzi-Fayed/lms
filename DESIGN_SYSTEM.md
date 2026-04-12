# 🎨 EduSphere Design System & Style Guide

## Brand Identity

### Logo
**Name:** EduSphere  
**Icon:** Modern "E" in gradient cyan-to-blue  
**Font:** Bold, modern sans-serif  
**Tagline:** "تعلّم ذكي، حقّق المزيد" (Smart Learning, Achieve More)

---

## Color Palette

### Primary Colors (Main CTA & Interactions)
```
primary-50:   #f0f9ff
primary-100:  #e0f2fe
primary-200:  #bae6fd
primary-300:  #7dd3fc
primary-400:  #38bdf8
primary-500:  #0ea5e9  ← Main CTA buttons
primary-600:  #0284c7  ← Button hover
primary-700:  #0369a1  ← Pressed state
primary-800:  #075985
primary-900:  #0c4a6e
primary-950:  #082f49
```

**Usage:**
- Primary action buttons
- Links and hover states
- Active navigation items
- Progress bars
- Primary text accents

### Accent Colors (Body & Structure)
```
accent-50:    #f8fafc
accent-100:   #f1f5f9
accent-200:   #e2e8f0  ← Border color
accent-300:   #cbd5e1
accent-400:   #94a3b8  ← Muted text
accent-500:   #64748b
accent-600:   #475569  ← Secondary text
accent-700:   #334155  ← Body text
accent-800:   #1e293b  ← Dark text
accent-900:   #0f172a  ← Footer background
```

**Usage:**
- Body text
- Backgrounds
- Borders
- Secondary text
- Footer and sidebar backgrounds

### Status Colors
```
success-600: #16a34a (Enrollment, payments)
red-600:     #dc2626 (Errors, destructive actions)
yellow-500:  #eab308 (Ratings)
```

---

## Typography

### Heading Hierarchy
```
h1 (text-4xl): 36px - Page titles, hero
h2 (text-3xl): 28px - Section titles
h3 (text-2xl): 24px - Subsection titles
Body (text-base): 16px - Standard text
Small (text-sm): 14px - Secondary text
xs (text-xs): 12px - Labels, badges
```

### Font Family
- **Font:** Cairo (Arabic) / System UI (Fallback)
- **Weight:** Normal (400), Semibold (600), Bold (700)
- **Line Height:** 1.5x for body, 1.25x for headings

---

## Spacing System

### Base Unit: 4px
```
p-1:  4px    (minimal)
p-2:  8px    (small)
p-3:  12px   (standard)
p-4:  16px   (medium)
p-5:  20px   (large)
p-6:  24px   (xlarge)
p-8:  32px   (2xlarge)
p-10: 40px   (3xlarge)
```

### Common Patterns
- **Form inputs:** `px-4 py-3` (16px horizontal, 12px vertical)
- **Buttons:** `px-6 py-3` (24px horizontal, 12px vertical)
- **Cards:** `p-6` to `p-8` (24-32px padding)
- **Sections:** `py-24` to `py-28` (96-112px padding)

---

## Button Styles

### Primary Button
```tsx
className="px-6 py-3 bg-primary-500 text-white font-bold 
           rounded-lg hover:bg-primary-600 shadow-soft 
           transition-colors"
```
- **Usage:** Main CTAs, form submission
- **Color:** primary-500 / primary-600 (hover)
- **Size:** 24px horizontal, 12px vertical
- **Radius:** 8px

### Secondary Button
```tsx
className="px-6 py-3 bg-accent-100 text-accent-700 font-bold 
           rounded-lg hover:bg-accent-200 transition-colors"
```
- **Usage:** Alternative actions
- **Color:** accent-100 / accent-200 (hover)
- **Size:** Same as primary

### Outlined Button
```tsx
className="px-6 py-3 border-2 border-primary-500 text-primary-500 
           font-bold rounded-lg hover:bg-primary-50"
```
- **Usage:** Secondary CTAs
- **Color:** border-primary-500, text-primary-500

---

## Component Patterns

### Card Component
```tsx
className="bg-white rounded-xl shadow-soft border border-accent-200 
           hover:shadow-medium hover:border-primary-300 transition-all"
```
- **Background:** White (bg-white)
- **Border:** accent-200
- **Shadow:** Soft (2px blur)
- **Hover:** Medium shadow + primary border
- **Radius:** 8px

### Form Input
```tsx
className="w-full px-4 py-3 border border-accent-200 rounded-lg 
           focus:ring-2 focus:ring-primary-500 focus:border-transparent 
           outline-none transition-all bg-white"
```
- **Background:** White
- **Border:** accent-200
- **Focus Ring:** primary-500 (2px)
- **Padding:** 16px horizontal, 12px vertical
- **Radius:** 8px

### Badge/Label
```tsx
className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg 
           text-xs font-semibold"
```
- **Background:** Primary light (50)
- **Text:** Primary dark (700)
- **Size:** Small
- **Radius:** 8px

---

## Shadow System

### Soft Shadow
```css
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)
```
- **Usage:** Cards, inputs, subtle elevation

### Medium Shadow
```css
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1)
```
- **Usage:** Card hover, buttons

### Large Shadow
```css
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12)
```
- **Usage:** Modals, important elements

---

## Animation & Transitions

### Fade In
```css
animation: fadeIn 0.2s ease-in
```
- **Duration:** 200ms
- **Easing:** Smooth ease-in
- **Usage:** Menu appears, dropdowns

### Slide Down
```css
animation: slideDown 0.3s ease-out
```
- **Duration:** 300ms
- **Easing:** Ease-out bounce
- **Usage:** Modals, notifications

### Transitions
```css
transition: all 0.2s ease-in-out
```
- **Usage:** Hover effects, color changes

---

## Layout Grid

### Container
```tsx
className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
```
- **Max Width:** 1280px
- **Padding:** Responsive (16-32px)

### Grid Columns
```
Mobile: 1 column
Tablet (md:): 2 columns
Desktop (lg:): 3 columns
```

---

## Responsive Breakpoints

```
sm:  640px   (small devices)
md:  768px   (tablets)
lg:  1024px  (large screens)
xl:  1280px  (extra large)
```

---

## Page Layouts

### Hero Section
- **Background:** Gradient accent-900 to primary-900
- **Padding:** 96-160px vertical
- **Typography:** Display font sizes
- **Elements:** Gradient text, CTA buttons, stats

### Features Grid
- **Layout:** 3 columns (lg), 2 (md), 1 (sm)
- **Gap:** 32px between cards
- **Cards:** White background, soft shadow

### Form Pages
- **Max Width:** 448px (max-w-md)
- **Background:** Gradient accent-50 to primary-50
- **Components:** Clean inputs, clear labels

---

## Accessibility

### Color Contrast
- **Text on primary:** White on primary-500 (AA compliant)
- **Text on white:** accent-700 on white (AAA compliant)
- **Links:** primary-600 (distinguishable from text)

### Focus States
- **Ring:** 2px primary-500 focus ring
- **Outline:** None (using ring instead)
- **Visible:** High contrast focus indicator

### Semantic HTML
- Proper heading hierarchy (h1 → h2 → h3)
- Form labels associated with inputs
- Alt text for images
- ARIA labels where needed

---

## Dark Mode (Optional Future)

```css
.dark {
  --background: 15 23 42;
  --foreground: 248 250 252;
  --card: 30 41 59;
  --card-foreground: 248 250 252;
}
```

---

## Quick Reference

### Common Classes
```tsx
// Text
text-accent-900       // Heading text
text-accent-700       // Body text
text-accent-600       // Secondary text
text-accent-500       // Muted text

// Backgrounds
bg-white              // Cards, inputs
bg-accent-50          // Light backgrounds
bg-accent-900         // Dark backgrounds (footer)

// Borders
border-accent-200     // Normal borders
border-accent-300     // Lighter borders

// Shadows
shadow-soft           // Subtle elevation
shadow-medium         // Card hover
shadow-lg             // Modals

// Radius
rounded-lg            // 8px (standard)
rounded-xl            // 12px (large elements)
rounded-full          // Circle (avatars)

// States
hover:bg-primary-600  // Button hover
hover:shadow-medium   // Card elevation
focus:ring-2          // Focus indicator
disabled:opacity-50   // Disabled state
```

---

**Version:** 1.0  
**Last Updated:** 2024  
**Status:** ✅ Production Ready
